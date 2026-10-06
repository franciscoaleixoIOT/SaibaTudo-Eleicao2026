// Controlador do PWA: estado, roteamento (History API), carga de dados sob demanda, atualização periódica e renderização
// da tela principal (porte de MainViewModel.kt + MainAppScreen.kt). Sem frameworks.
import { ORIGEM_ROTULO, SUGESTOES_PADRAO } from './answers.js';
import { BUILD } from './build-info.js';
import { NUVEM_TEXTOS, NuvemNlu, enviarRelato, ofereceNuvem, pedirANuvem } from './cloud.js';
import { FilaMelhoria, melhoriaLigada } from './melhoria.js';
import { DataStore, askLigado, pollIntervalMinutes } from './data.js';
import { $, anunciar, h, icon, trocar } from './dom.js';
import { Engine } from './engine.js';
import { filtrar, filtroDaResposta, novoFiltro, ufsNecessarias } from './filters.js';
import { instalar, iniciarInstalacao, aoMudarInstalacao, ehIos, jaInstalado, podeInstalarAgora } from './install.js';
import { ApuracaoClient } from './live.js';
import {
  APP_NAME, AVISO_NEUTRALIDADE, HISTORICO, MACRO_REGIOES, NOMES_UF, PERGUNTA_INICIAL_PADRAO, SIGLAS, TSE_CARGOS, inteiro
} from './model.js';
import { FASES, faseDe, formatarBr, hojeBrasilia, menuPrincipal } from './phase.js';
import { aplicarAparencia, carregar as carregarPrefs, salvar as salvarPrefs, uuid } from './prefs.js';
import { ajustarAltura, campoAutoAltura, cartaoCandidato, chip, interruptor, reajustarCamposAuto, textoResposta } from './ui/components.js';
import { abrirDetalhe, abrirEscolherUf, abrirFontes, abrirInstrucoesInstalacao, abrirPesquisas, abrirRelato } from './ui/dialogs.js';
import { telaConfiguracoes, telaOnboarding, telaSobreDados } from './ui/telas.js';
import { abrirUrna } from './ui/urna.js';

const BASE = '/eleicoes2026/';
const PAGINA = 60;
const CARGO_POR_ROTA = {
  presidente: 'PRESIDENTE', governador: 'GOVERNADOR', senador: 'SENADOR', 'deputado-federal': 'DEPUTADO_FEDERAL', 'deputado-estadual': 'DEPUTADO_ESTADUAL'
};

const S = {
  prefs: null, store: null, engine: null, apuracao: null,
  carregado: false, erro: null,
  fase: FASES.PRE_ELEICAO, hoje: hojeBrasilia(), menu: [],
  filtro: novoFiltro(), lista: [], limite: PAGINA, avancado: false,
  consulta: '', iaProcessando: false, iaMsg: '', resposta: null, perguntaDaResposta: '', sugestoes: SUGESTOES_PADRAO, menuAtivo: null,
  // filtro antes/depois de aplicar a resposta atual (a resposta da nuvem pedida depois parte do filtro anterior à pergunta)
  filtroAntesDaResposta: null, filtroDaResposta: null,
  // pedido explícito "Perguntar à IA na nuvem" da resposta atual: { resposta, estado: 'consultando' | 'falhou' }
  nuvemPedido: null,
  tela: 'principal', dialogo: null, dialogoToken: 0, dialogoEl: null,
  atualizacao: { estado: 'ocioso', mensagem: '' }, cargasAtivas: 0, scrollPrincipal: 0
};

const raiz = () => document.getElementById('app');
const reduzMovimento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------------------------------------------ inicialização

export async function iniciarApp() {
  iniciarInstalacao();
  S.prefs = carregarPrefs();
  historicoPosicao = (S.prefs.historicoPerguntas || []).length;
  historicoRascunho = '';
  aplicarAparencia(S.prefs);
  S.store = new DataStore({ baseUrl: '/data/eleicoes2026/' });
  S.apuracao = new ApuracaoClient(() => S.store.regras?.resultadosTse ?? null);
  const nuvem = new NuvemNlu({ installId: idInstalacao, habilitada: () => S.prefs.iaNuvem });
  // captura opcional das perguntas não entendidas: só com o pacote assinado ligando E a pessoa ligando a opção (melhoria.js)
  S.melhoria = new FilaMelhoria({ habilitada: () => S.prefs.melhoria === true, noPacote: () => melhoriaLigada(S.store.manifest), installId: idInstalacao });
  // "Meu estado" só vale para a IA quando está LIGADO (UF padrão definida + chave ligada), como no Android
  S.engine = new Engine({ store: S.store, ufPadrao: () => (S.prefs.filtrarPorMinhaUf ? S.prefs.ufPadrao : null), apuracao: S.apuracao, nuvem });
  S.store.on(aoEventoDados);
  aoMudarInstalacao(() => { if (S.tela === 'principal') renderBarra(); else if (S.tela === 'configuracoes') render(); });
  window.addEventListener('popstate', sincronizarComUrl);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verificarAoVoltar(); });

  const rota = lerUrl(location.pathname);
  S.tela = rota.tela;
  const dadosProntos = carregarDados(rota);
  if (!S.prefs.onboardingConcluido) {
    renderOnboarding(dadosProntos);
  } else {
    render();
    await dadosProntos;
  }
}

function idInstalacao() {
  if (!S.prefs.idInstalacao) atualizarPrefs((p) => ({ ...p, idInstalacao: uuid() }));
  return S.prefs.idInstalacao;
}

async function carregarDados(rota) {
  try {
    await S.store.iniciar();
  } catch (e) {
    S.erro = e instanceof Error ? e.message : String(e);
    render();
    return;
  }
  const r = S.store.regras;
  S.hoje = hojeBrasilia();
  S.fase = faseDe(S.hoje, r.turno1, r.turno2);
  S.menu = menuPrincipal(r, S.fase, S.hoje);
  S.filtro = filtroInicial(S.prefs);
  if (rota?.cargo) S.filtro = { ...S.filtro, cargo: rota.cargo };
  // renderização rápida: BR + UF do usuário primeiro; as demais UFs só sob demanda
  const ufs = ufsNecessarias(S.filtro);
  const primeiras = ufs.length > 3 ? ['BR', ...(S.prefs.ufPadrao ? [S.prefs.ufPadrao] : [])] : ufs;
  try { await S.store.ensureUfs(primeiras); } catch { /* erros ficam em store.erros ("Sobre os dados") */ }
  S.carregado = true;
  recalcularLista();
  if (S.prefs.onboardingConcluido || S.tela !== 'principal') render();
  if (ufs.length > primeiras.length) garantirFatias(S.filtro);
  if (rota?.dialogo) abrirDialogo(rota.dialogo, { semHistorico: true });
  if (S.prefs.onboardingConcluido && S.prefs.executarPerguntaAoAbrir && S.prefs.perguntaInicial.trim()) perguntar(S.prefs.perguntaInicial);
  agendarAtualizacoes();
}

const filtroInicial = (p) => novoFiltro({ estadoUf: p.filtrarPorMinhaUf ? p.ufPadrao : null, apenasNaUrna: p.mostrarApenasNaUrna });

// ------------------------------------------------------------------------------------------------ dados e atualização

function aoEventoDados(evento) {
  if (evento === 'candidatos' || evento === 'atualizado') {
    recalcularLista();
    if (evento === 'atualizado') {
      S.fase = faseDe(S.hoje, S.store.regras.turno1, S.store.regras.turno2);
      S.menu = menuPrincipal(S.store.regras, S.fase, S.hoje);
      toast('Dados oficiais atualizados.');
    }
    if (S.tela === 'principal' && S.carregado) { renderFase(); renderMenu(); renderFiltros(); renderLista(); }
  }
}

function recalcularLista() { S.lista = filtrar(S.store.candidatos, S.filtro); }

/** Carrega em segundo plano as UFs que o filtro exige (BR + UF primeiro; demais em lotes), atualizando a lista a cada lote. */
async function garantirFatias(filtro) {
  const faltam = ufsNecessarias(filtro).filter((u) => !S.store.shards.has(u));
  if (faltam.length === 0) return;
  const ordem = [...faltam].sort((a, b) => (a === 'BR' ? -1 : b === 'BR' ? 1 : a === S.prefs.ufPadrao ? -1 : b === S.prefs.ufPadrao ? 1 : 0));
  S.cargasAtivas++;
  renderCargaMsg();
  try {
    for (let i = 0; i < ordem.length; i += 4) {
      try { await S.store.ensureUfs(ordem.slice(i, i + 4)); } catch { /* segue com as demais */ }
      renderCargaMsg();
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    S.cargasAtivas--;
    renderCargaMsg();
  }
}

const conexaoMovel = () => { const c = navigator.connection; return !!c && (c.saveData === true || c.type === 'cellular'); };
let temporizador = null;
let ultimaChecagem = 0;

function agendarAtualizacoes() {
  if (temporizador) clearInterval(temporizador);
  const intervalo = pollIntervalMinutes(S.store.manifest) * 60_000;
  temporizador = setInterval(() => verificarAtualizacao(false), intervalo);
  setTimeout(() => verificarAtualizacao(false), 1500); // o boot pode ter usado o manifesto em cache: confirma na rede
  setInterval(atualizarApuracaoSePreciso, 60_000);
}

function verificarAoVoltar() {
  const intervalo = pollIntervalMinutes(S.store.manifest) * 60_000;
  if (S.store.manifest && Date.now() - ultimaChecagem >= intervalo) verificarAtualizacao(false);
  atualizarApuracaoSePreciso();
}

async function verificarAtualizacao(forcar) {
  if (!S.store.manifest) return;
  if (!forcar && S.prefs.economiaDeDados && conexaoMovel()) return; // economia de dados: só em Wi-Fi
  ultimaChecagem = Date.now();
  S.atualizacao = { estado: 'verificando', mensagem: '' };
  if (S.tela === 'sobre') render();
  const r = await S.store.verificarAtualizacao();
  const mensagens = {
    atual: 'Você já tem a versão mais recente.',
    atualizado: `Atualizado: ${r.arquivosBaixados} arquivo(s) baixado(s).`,
    ignorado: `Não verificado: ${r.motivo}.`,
    rejeitado: `Rejeitado: ${r.motivo}.`,
    falha: `Falha: ${r.motivo}`
  };
  S.atualizacao = { estado: 'concluida', mensagem: mensagens[r.tipo] ?? '' };
  if (S.tela === 'sobre') render();
}

/** Durante a apuração, atualiza a resposta de resultados (o cliente respeita o cache de 60 s e o limite do TSE). */
async function atualizarApuracaoSePreciso() {
  if (!S.resposta?.apuracao || document.visibilityState !== 'visible' || S.iaProcessando || S.tela !== 'principal') return;
  try {
    const nova = await S.engine.responder(S.perguntaDaResposta);
    if (nova.apuracao) { S.resposta = { ...nova, filters: S.resposta.filters }; renderResposta(); }
  } catch { /* mantém a resposta atual */ }
}

// ------------------------------------------------------------------------------------------------ preferências

function atualizarPrefs(fn) {
  const antes = S.prefs;
  S.prefs = fn(antes);
  salvarPrefs(S.prefs);
  aplicarAparencia(S.prefs);
  if (antes.melhoria && !S.prefs.melhoria) S.melhoria?.limpar(); // desligou: o que ainda não foi enviado é apagado
  if (antes.tamanhoFonte !== S.prefs.tamanhoFonte) reajustarCamposAuto(); // campos de texto que crescem (altura em px)
  if (antes.historicoPerguntas !== S.prefs.historicoPerguntas) {
    historicoPosicao = (S.prefs.historicoPerguntas || []).length;
    historicoRascunho = '';
    renderCardHistorico();
    if (S.tela === 'configuracoes') render();
  }
  if (S.carregado && (antes.ufPadrao !== S.prefs.ufPadrao || antes.filtrarPorMinhaUf !== S.prefs.filtrarPorMinhaUf || antes.mostrarApenasNaUrna !== S.prefs.mostrarApenasNaUrna)) {
    atualizarFiltro({ ...S.filtro, estadoUf: S.prefs.filtrarPorMinhaUf ? S.prefs.ufPadrao : null, apenasNaUrna: S.prefs.mostrarApenasNaUrna });
  }
}

function concluirOnboarding(uf, iaNuvem, dadosProntos) {
  atualizarPrefs((p) => ({ ...p, onboardingConcluido: true, ufPadrao: uf, filtrarPorMinhaUf: uf != null, iaNuvem }));
  S.tela = 'principal';
  history.replaceState(null, '', BASE);
  render();
  // com os dados prontos, aplica o filtro inicial das preferências recém-escolhidas (UF) e redesenha
  dadosProntos?.then(() => {
    if (!S.carregado) return;
    S.filtro = filtroInicial(S.prefs);
    S.limite = PAGINA;
    recalcularLista();
    render();
    garantirFatias(S.filtro);
  });
}

// ------------------------------------------------------------------------------------------------ roteamento

export function lerUrl(path) {
  const p = path.replace(/^\/eleicoes2026\/?/, '').replace(/\/+$/, '');
  const [a, b] = p.split('/');
  if (a === 'configuracoes') return { tela: 'configuracoes' };
  if (a === 'sobre-os-dados') return { tela: 'sobre' };
  if (a === 'pesquisas') return { tela: 'principal', dialogo: { tipo: 'pesquisas' } };
  if (a === 'fontes') return { tela: 'principal', dialogo: { tipo: 'fontes' } };
  if (a === 'urna') return { tela: 'principal', dialogo: { tipo: 'urna' } };
  if (a === 'candidato' && b) return { tela: 'principal', dialogo: { tipo: 'candidato', id: decodeURIComponent(b) } };
  if (CARGO_POR_ROTA[a]) return { tela: 'principal', cargo: CARGO_POR_ROTA[a] };
  return { tela: 'principal' };
}

const urlDaTela = (t) => (t === 'configuracoes' ? BASE + 'configuracoes' : t === 'sobre' ? BASE + 'sobre-os-dados' : BASE);
const urlDoDialogo = (d) => {
  if (d.tipo === 'candidato') return BASE + 'candidato/' + encodeURIComponent(d.id);
  if (['pesquisas', 'fontes', 'urna'].includes(d.tipo)) return BASE + d.tipo;
  return location.pathname + location.search;
};

function irPara(tela) {
  if (S.tela === 'principal') S.scrollPrincipal = window.scrollY;
  S.tela = tela;
  history.pushState({ t: tela }, '', urlDaTela(tela));
  render();
  window.scrollTo(0, 0);
}

function voltar() {
  if (history.state?.t) { history.back(); return; }
  S.tela = 'principal';
  history.replaceState(null, '', BASE);
  render();
}

function sincronizarComUrl() {
  const rota = lerUrl(location.pathname);
  if (rota.tela !== S.tela) {
    S.tela = rota.tela;
    render();
    if (rota.tela === 'principal') window.scrollTo(0, S.scrollPrincipal);
  }
  if (!rota.dialogo && S.dialogo) { S.dialogo = null; S.dialogoToken++; S.dialogoEl?.close(); } // Voltar fecha o diálogo
  else if (rota.dialogo && !S.dialogo && S.carregado) abrirDialogo(rota.dialogo, { semHistorico: true });
}

// ------------------------------------------------------------------------------------------------ diálogos

/** Abre um diálogo registrando-o no histórico (o botão Voltar do aparelho fecha o diálogo). */
function abrirDialogo(d, { semHistorico = false } = {}) {
  const token = ++S.dialogoToken;
  const havia = S.dialogo != null;
  const antigo = S.dialogoEl;
  S.dialogo = d;
  if (!semHistorico) {
    if (havia) history.replaceState({ d: 1 }, '', urlDoDialogo(d)); else history.pushState({ d: 1 }, '', urlDoDialogo(d));
  }
  const aoFechar = () => {
    if (S.dialogoToken !== token) return; // foi substituído por outro diálogo
    S.dialogo = null;
    S.dialogoEl = null;
    if (history.state?.d) history.back(); else history.replaceState(history.state, '', urlDaTela(S.tela)); // link direto: limpa a URL
  };
  if (antigo?.isConnected) antigo.close();
  S.dialogoEl = construirDialogo(d, aoFechar);
}

function fecharDialogo() { S.dialogoEl?.close(); }

function construirDialogo(d, onFechar) {
  const s = S.store;
  const permitirRemota = !S.prefs.economiaDeDados;
  switch (d.tipo) {
    case 'candidato': {
      const c = d.candidato ?? s.porId.get(d.id);
      if (!c) { // deep link: carrega todas as UFs e tenta de novo
        s.ensureTodas().then(() => { const x = s.porId.get(d.id); if (x && S.dialogo === d) abrirDialogo({ tipo: 'candidato', id: d.id, candidato: x }, { semHistorico: true }); }).catch(() => {});
        return null;
      }
      const dlg = abrirDetalhe(c, { store: s, regras: s.regras, permitirRemota, onSimular: (x) => abrirDialogo({ tipo: 'urna', inicial: x }) });
      dlg.addEventListener('close', onFechar);
      return dlg;
    }
    case 'urna': {
      const dlg = abrirUrna({ store: s, ufInicial: S.prefs.ufPadrao ?? S.filtro.estadoUf, candidatoInicial: d.inicial ?? null, permitirRemota });
      dlg.addEventListener('close', onFechar);
      return dlg;
    }
    case 'pesquisas': {
      const dlg = abrirPesquisas({ store: s });
      dlg.addEventListener('close', onFechar);
      return dlg;
    }
    case 'fontes': {
      const dlg = abrirFontes({ estadoUf: S.filtro.estadoUf ?? S.prefs.ufPadrao, fontes: s.fontes });
      dlg.addEventListener('close', onFechar);
      return dlg;
    }
    case 'uf': return abrirEscolherUf({
      atual: S.prefs.ufPadrao, onFechar,
      onEscolher: (uf, { pelaLocalizacao = false } = {}) => {
        escolherUfPadrao(uf);
        if (pelaLocalizacao && uf) toast(`Seu estado: ${NOMES_UF[uf]} (pela localização aproximada). Você pode trocar quando quiser.`);
      }
    });
    case 'instalar': {
      const dlg = abrirInstrucoesInstalacao();
      dlg.addEventListener('close', onFechar);
      return dlg;
    }
    case 'relato': {
      const dlg = abrirRelato({ pergunta: S.perguntaDaResposta, resposta: S.resposta?.directAnswer ?? '', onEnviar: enviarRelatoAtual });
      dlg.addEventListener('close', onFechar);
      return dlg;
    }
    default: return null;
  }
}

async function enviarRelatoAtual(comentario) {
  const r = S.resposta;
  if (!r) return false;
  return enviarRelato({
    pergunta: S.perguntaDaResposta, resposta: r.directAnswer ?? '', intencao: r.intent, origem: r.origem,
    versaoDados: S.store.manifest?.dataVersion ?? null, versaoApp: `web ${BUILD}`, comentario
  });
}

function escolherUfPadrao(uf) {
  atualizarPrefs((p) => ({ ...p, ufPadrao: uf, filtrarPorMinhaUf: uf != null }));
  if (S.tela === 'configuracoes') render();
}

// ------------------------------------------------------------------------------------------------ filtros e consulta

function atualizarFiltro(novo) {
  S.filtro = novo;
  S.limite = PAGINA;
  recalcularLista();
  if (S.tela === 'principal' && S.carregado) { renderFiltros(); renderLista(); }
  garantirFatias(novo);
}

function alternarMeuEstado(ligado) {
  const uf = S.prefs.ufPadrao;
  if (ligado && uf == null) { abrirDialogo({ tipo: 'uf' }); return; }
  atualizarPrefs((p) => ({ ...p, filtrarPorMinhaUf: ligado }));
  atualizarFiltro({ ...S.filtro, estadoUf: ligado ? uf : null });
}

function limparFiltros() {
  S.engine?.limparContexto?.();
  atualizarFiltro(novoFiltro({ apenasNaUrna: S.prefs.mostrarApenasNaUrna }));
}

function selecionarMenu(item) {
  S.engine?.limparContexto?.();
  if (item.id === 'menu_pesquisas') { S.menuAtivo = item.id; renderMenu(); abrirDialogo({ tipo: 'pesquisas' }); return; }
  if (item.id === 'menu_calendario') { perguntar('Calendário eleitoral 2026'); return; }
  if (item.id === 'menu_resultados') { perguntar('Quem foi eleito presidente?'); return; }
  S.menuAtivo = item.id;
  renderMenu();
  atualizarFiltro({ ...S.filtro, cargo: item.defaultFilters.cargo ?? null, buscaTexto: null });
}

async function perguntar(texto) {
  const pergunta = String(texto).trim();
  if (!pergunta || S.iaProcessando) return;

  const itens = S.prefs?.historicoPerguntas ?? [];
  const novos = itens[itens.length - 1] === pergunta ? itens : [...itens, pergunta].slice(-50);
  if (novos !== itens) {
    atualizarPrefs((p) => ({ ...p, historicoPerguntas: novos }));
  }
  historicoPosicao = novos.length;
  historicoRascunho = '';

  S.iaProcessando = true;
  S.consulta = '';
  if (campo) {
    campo.value = '';
    ajustarAltura(campo);
  }
  S.iaMsg = '';
  renderBusca();
  anunciar('Analisando a pergunta…');
  let resp;
  try {
    resp = await S.engine.responder(pergunta, {
      onEtapa: (etapa) => { S.iaMsg = etapa === 'nuvem' ? 'IA na nuvem analisando a pergunta… (pode levar até ~14 s)' : 'Carregando os dados dos estados…'; renderBusca(); }
    });
  } catch {
    resp = {
      targetRoute: 'menu/home', menuId: 'menu_home', intent: 'DESCONHECIDA', origem: 'LOCAL', resolvida: false, erro: true, candidateIds: [], suggestedQuestions: [],
      filters: { resetar: false }, directAnswer: 'Não foi possível responder agora. Tente novamente ou use os filtros abaixo.', fonte: null, apuracao: null
    };
  }
  S.iaProcessando = false;
  S.iaMsg = '';
  aplicarResposta(resp, pergunta, S.filtro);
  // captura opcional (consentimento próprio): só perguntas que o app NÃO entendeu, nunca as respondidas nem as que deram erro
  if (resp.resolvida === false && resp.erro !== true && S.melhoria.enfileirar(pergunta)) S.melhoria.enviarSePreciso();
}

/** Exibe uma resposta e aplica ao filtro `base` as alterações que ela sugere (mesmo caminho para a resposta local e a da nuvem). */
function aplicarResposta(resp, pergunta, base) {
  const novo = filtroDaResposta(resp.filters, base, S.prefs.mostrarApenasNaUrna);
  S.resposta = resp;
  S.perguntaDaResposta = pergunta;
  S.nuvemPedido = null;
  S.menuAtivo = resp.menuId;
  S.sugestoes = resp.suggestedQuestions.length ? resp.suggestedQuestions : SUGESTOES_PADRAO;
  S.filtroAntesDaResposta = base;
  atualizarFiltro(novo);
  S.filtroDaResposta = S.filtro;
  renderBusca();
  renderResposta();
  renderMenu();
  const el = $('#resposta');
  if (el && !reduzMovimento()) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  anunciar('Resposta pronta.');
  // "Simular voto…": abre o simulador educativo (com o 1º candidato citado, se houver), como no Android
  if (resp.abrirSimulador && S.carregado) {
    const inicial = (resp.candidateIds ?? []).map((id) => S.store.porId.get(id)).find(Boolean) ?? null;
    abrirDialogo({ tipo: 'urna', inicial });
  }
}

/**
 * Toque em "Perguntar à IA na nuvem" (resposta não entendida, modo automático desligado): o toque é o consentimento para
 * enviar SÓ esta pergunta. A página continua utilizável durante a espera; se outra pergunta for feita (ou a resposta fechada)
 * antes de a nuvem responder, o resultado é descartado. Falhas mantêm a resposta original com um aviso.
 */
async function perguntarANuvem() {
  const atual = S.resposta;
  const pergunta = S.perguntaDaResposta;
  if (!atual || !ofereceNuvem(atual, S.prefs.iaNuvem) || (S.nuvemPedido?.resposta === atual && S.nuvemPedido.estado === 'consultando')) return;
  const botao = $('#btn-nuvem');
  const tinhaFoco = botao != null && document.activeElement === botao;
  S.nuvemPedido = { resposta: atual, estado: 'consultando' };
  renderNuvem();
  // texto gerado por modelo só com a IA generativa ligada no pacote assinado; senão, segunda interpretação (dados oficiais)
  const { ok, resposta } = await pedirANuvem({ engine: S.engine, atual, pergunta, generativo: atual.resolvida === true && askLigado(S.store.manifest) });
  if (S.resposta !== atual) return; // nova pergunta ou resposta fechada enquanto esperava
  // o foco estava no botão (que some ou fica desabilitado): leva-o à nova resposta / de volta ao botão, sem roubar outro foco
  const focoLivre = tinhaFoco && (document.activeElement == null || document.activeElement === document.body || document.activeElement === botao);
  if (ok) {
    // a resposta da nuvem se aplica como uma resposta normal; se o usuário não mexeu nos filtros desde a resposta não
    // entendida, parte do filtro anterior à pergunta (descarta a busca pelo texto que o app não entendeu)
    const base = S.filtro === S.filtroDaResposta && S.filtroAntesDaResposta ? S.filtroAntesDaResposta : S.filtro;
    aplicarResposta(resposta, pergunta, base);
    if (focoLivre) { const sec = $('#resposta .resposta'); if (sec) { sec.tabIndex = -1; sec.focus({ preventScroll: true }); } }
    return;
  }
  S.nuvemPedido = { resposta: atual, estado: 'falhou' };
  renderNuvem();
  if (focoLivre) $('#btn-nuvem')?.focus({ preventScroll: true });
}

// ------------------------------------------------------------------------------------------------ renderização

let toastTimer = null;
export function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 6000);
}

function render() {
  const r = raiz();
  if (!r) return;
  if (!S.prefs.onboardingConcluido) return; // o onboarding tem renderização própria
  if (S.tela === 'configuracoes') {
    trocar(r, telaConfiguracoes({
      prefs: S.prefs, atualizar: atualizarPrefs, onEscolherUf: () => abrirDialogo({ tipo: 'uf' }), onSobreDados: () => irPara('sobre'), onVoltar: voltar,
      instalacao: blocoInstalacao(), melhoriaDisponivel: melhoriaLigada(S.store.manifest)
    }));
    document.title = `Configurações — ${APP_NAME}`;
    foco('#titulo-tela');
    return;
  }
  if (S.tela === 'sobre') {
    trocar(r, telaSobreDados({ store: S.store, fase: S.fase, atualizacao: S.atualizacao, onAtualizar: () => verificarAtualizacao(true), onVoltar: voltar }));
    document.title = `Sobre os dados — ${APP_NAME}`;
    return;
  }
  document.title = `${APP_NAME} — candidaturas, pesquisas e regras com dados do TSE`;
  trocar(r, esqueletoPrincipal());
  renderBarra();
  if (S.erro && !S.carregado) {
    trocar($('#conteudo'), h('div', { class: 'erro-carga', role: 'alert' },
      h('p', null, h('strong', null, 'Não foi possível carregar os dados oficiais.')), h('p', { class: 'mudo pequeno' }, S.erro),
      h('button', { type: 'button', class: 'btn btn-primario', onClick: () => location.reload() }, 'Tentar novamente')));
    return;
  }
  if (!S.carregado) {
    trocar($('#conteudo'), h('div', { class: 'carregando', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('p', { class: 'mudo' }, 'Carregando dados oficiais do TSE…')));
    return;
  }
  renderPrincipalCompleto();
}

function foco(sel) { requestAnimationFrame(() => $(sel)?.focus({ preventScroll: true })); }

function renderOnboarding(dadosProntos) {
  trocar(raiz(), telaOnboarding({ onConcluir: (uf, ia) => concluirOnboarding(uf, ia, dadosProntos) }));
  document.title = `Bem-vindo — ${APP_NAME}`;
}

function blocoInstalacao() {
  if (jaInstalado()) return h('p', { class: 'mudo pequeno' }, 'O app já está instalado neste aparelho.');
  if (podeInstalarAgora()) {
    return h('div', null, h('button', { type: 'button', class: 'btn btn-primario', onClick: () => instalar() }, icon('download', 18), 'Instalar app'),
      h('p', { class: 'mudo pequeno' }, 'Abre em janela própria e funciona também sem internet.'));
  }
  return h('div', null, h('button', { type: 'button', class: 'btn btn-contorno', onClick: () => abrirDialogo({ tipo: 'instalar' }) }, icon('download', 18), 'Como instalar'),
    h('p', { class: 'mudo pequeno' }, 'No iPhone: Compartilhar → Adicionar à Tela de Início. No Chrome/Edge: botão Instalar na barra de endereço.'));
}

function esqueletoPrincipal() {
  return h('div', { class: 'app' },
    h('header', { class: 'appbar', id: 'barra' }),
    h('div', { id: 'fase', class: 'fase' }),
    h('main', { id: 'conteudo', class: 'conteudo', tabindex: '-1' }));
}

function renderBarra() {
  const b = $('#barra');
  if (!b) return;
  trocar(b,
    h('div', { class: 'appbar-marca' },
      h('img', { src: '/brand/svg/eleicoes2026-icon.svg', width: '34', height: '34', alt: '', class: 'appbar-logo' }),
      h('div', { class: 'appbar-textos' },
        h('h1', { class: 'appbar-titulo' }, 'SaibaTudo'),
        h('p', { class: 'appbar-sub' }, 'Eleições 2026 • dados abertos do TSE'))),
    h('div', { class: 'appbar-acoes' },
      h('button', { type: 'button', class: 'btn-icone ouro', 'aria-label': 'Fontes oficiais', title: 'Fontes oficiais', onClick: () => abrirDialogo({ tipo: 'fontes' }) }, icon('verified', 22)),
      h('button', { type: 'button', class: 'btn-simulador', onClick: () => abrirDialogo({ tipo: 'urna' }) }, icon('ballot', 18), h('span', { class: 'rot-simulador' }, 'Simulador')),
      // Chrome/Edge/Android: prompt nativo; iPhone/iPad (Safari): instruções "Compartilhar → Adicionar à Tela de Início"
      podeInstalarAgora() || (ehIos() && !jaInstalado())
        ? h('button', { type: 'button', class: 'btn-icone claro btn-instalar-barra', 'aria-label': 'Instalar app', title: 'Instalar app', onClick: () => (podeInstalarAgora() ? instalar() : abrirDialogo({ tipo: 'instalar' })) }, icon('download', 22)) : null,
      h('button', { type: 'button', class: 'btn-icone claro', 'aria-label': 'Configurações', title: 'Configurações', onClick: () => irPara('configuracoes') }, icon('settings', 22))));
}

function renderPrincipalCompleto() {
  trocar($('#conteudo'),
    h('div', { class: 'col-lateral' },
      h('section', { class: 'busca', id: 'busca', 'aria-label': 'Pergunte à IA' }),
      h('div', { id: 'resposta', class: 'resposta-caixa', role: 'region', 'aria-label': 'Resposta da IA', 'aria-live': 'polite' }),
      h('section', { id: 'filtros', class: 'filtros', 'aria-label': 'Filtros' }),
      h('section', { id: 'menu', class: 'menu', 'aria-label': 'Navegação eleitoral' })),
    h('div', { class: 'col-lista' },
      h('section', { 'aria-label': 'Candidaturas' },
        h('div', { class: 'lista-cab' }, h('h2', { class: 'lista-tit' }, 'Candidaturas (TSE)'), h('span', { class: 'mudo pequeno', id: 'contagem', role: 'status' })),
        h('p', { class: 'mudo mini', id: 'carga-msg', role: 'status' }),
        h('p', { class: 'mudo mini' }, `Ordem fixa: cargo, estado e número. Fonte: TSE (dados abertos), extração ${S.store.regras.extracaoTse?.trim() || '—'}`),
        h('div', { id: 'lista', class: 'lista' }),
        h('div', { id: 'mais', class: 'centro' })),
      h('p', { class: 'aviso-neutro' }, icon('info', 16), h('span', null, AVISO_NEUTRALIDADE))));
  construirBusca();
  renderFase(); renderBusca(); renderResposta(); renderFiltros(); renderMenu(); renderLista();
}

function renderFase() {
  const el = $('#fase');
  if (!el || !S.store.regras) return;
  const { turno1, turno2 } = S.store.regras;
  const mapa = {
    PRE_ELEICAO: [`1º turno em ${formatarBr(turno1)} • 2º turno em ${formatarBr(turno2)}`, false],
    DIA_1T: ['Hoje é dia de votação (1º turno): 8h às 17h, horário de Brasília. Apuração em tempo real: pergunte "Resultado para Presidente".', true],
    ENTRE_TURNOS: [`2º turno em ${formatarBr(turno2)}. Resultados do 1º turno disponíveis no menu.`, true],
    DIA_2T: ['Hoje é dia de votação (2º turno): 8h às 17h, horário de Brasília.', true],
    POS_ELEICAO: ['Eleições encerradas. Consulte os resultados e eleitos no menu.', true]
  };
  const [texto, destaque] = mapa[S.fase.id];
  el.classList.toggle('destaque', destaque);
  trocar(el, icon('flag', 16), h('span', null, texto));
}

// ---- busca com IA

let campo = null;
let historicoPosicao = 0;
let historicoRascunho = '';

function subirHistorico() {
  const itens = S.prefs?.historicoPerguntas ?? [];
  if (historicoPosicao <= 0 || !itens.length) return;
  if (historicoPosicao === itens.length) {
    historicoRascunho = S.consulta;
  }
  historicoPosicao--;
  const texto = itens[historicoPosicao];
  S.consulta = texto;
  if (campo) {
    campo.value = texto;
    ajustarAltura(campo);
    campo.focus();
    campo.setSelectionRange?.(texto.length, texto.length);
  }
  atualizarBotoesBusca();
  renderCardHistorico();
}

function descerHistorico() {
  const itens = S.prefs?.historicoPerguntas ?? [];
  if (historicoPosicao >= itens.length) return;
  historicoPosicao++;
  const texto = historicoPosicao === itens.length ? historicoRascunho : itens[historicoPosicao];
  S.consulta = texto;
  if (campo) {
    campo.value = texto;
    ajustarAltura(campo);
    campo.focus();
    campo.setSelectionRange?.(texto.length, texto.length);
  }
  atualizarBotoesBusca();
  renderCardHistorico();
}

function cardHistoricoEl() {
  const itens = S.prefs?.historicoPerguntas ?? [];
  const ultima = itens[itens.length - 1];
  if (!ultima) return null;

  const podeSubir = historicoPosicao > 0;
  const podeDescer = historicoPosicao < itens.length;

  return h('div', { class: 'busca-historico', id: 'busca-historico' },
    h('div', { class: 'busca-historico-txt' },
      h('span', { class: 'busca-historico-rotulo' }, 'Última pergunta'),
      h('span', { class: 'busca-historico-pergunta', title: ultima }, ultima)
    ),
    h('div', { class: 'busca-historico-acoes' },
      h('button', {
        type: 'button',
        class: 'busca-historico-btn',
        id: 'hist-subir',
        'aria-label': 'Pergunta anterior',
        title: 'Pergunta anterior',
        disabled: !podeSubir,
        onClick: () => subirHistorico()
      }, icon('chevUp', 18)),
      h('button', {
        type: 'button',
        class: 'busca-historico-btn',
        id: 'hist-descer',
        'aria-label': 'Próxima pergunta ou caixa em branco',
        title: 'Próxima pergunta ou caixa em branco',
        disabled: !podeDescer,
        onClick: () => descerHistorico()
      }, icon('chevDown', 18))
    )
  );
}

function renderCardHistorico() {
  const slot = $('#busca-historico-slot');
  if (!slot) return;
  trocar(slot, cardHistoricoEl());
}

function construirBusca() {
  const sec = $('#busca');
  // textarea que cresce de 1 a 3 linhas com perguntas longas; Enter envia (quebras de linha não entram no texto)
  let form = null;
  campo = campoAutoAltura({
    maxLinhas: 3, classe: 'busca-campo', id: 'campo-busca', maxlength: '300', autocomplete: 'off', enterkeyhint: 'search', spellcheck: 'false',
    'aria-label': 'Pergunte sobre as eleições', 'aria-describedby': 'ia-status', value: S.consulta,
    onEnter: () => { if (form?.requestSubmit) form.requestSubmit(); else perguntar(campo.value); }
  });
  campo.addEventListener('input', () => { S.consulta = campo.value; atualizarBotoesBusca(); });
  campo.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'ArrowUp') {
      const itens = S.prefs?.historicoPerguntas ?? [];
      if (historicoPosicao > 0 && (campo.selectionStart === 0 || !campo.value.includes('\n'))) {
        e.preventDefault();
        subirHistorico();
      }
    } else if (e.key === 'ArrowDown') {
      const itens = S.prefs?.historicoPerguntas ?? [];
      if (historicoPosicao < itens.length && (campo.selectionEnd === campo.value.length || !campo.value.includes('\n'))) {
        e.preventDefault();
        descerHistorico();
      }
    }
  });
  const limpar = h('button', { type: 'button', class: 'btn-icone mini-btn', id: 'busca-limpar', 'aria-label': 'Limpar texto', onClick: () => { S.consulta = ''; campo.value = ''; ajustarAltura(campo); atualizarBotoesBusca(); campo.focus(); } }, icon('x', 18));
  const enviar = h('button', { type: 'submit', class: 'btn-icone mini-btn envia', id: 'busca-envia', 'aria-label': 'Enviar pergunta à IA' }, icon('send', 20));
  const girando = h('span', { class: 'spinner mini', id: 'busca-spin', hidden: true, role: 'img', 'aria-label': 'IA analisando' });
  form = h('form', { class: 'busca-form', role: 'search', onSubmit: (e) => { e.preventDefault(); perguntar(campo.value); } },
    icon('search', 20), campo, limpar, girando, enviar);
  trocar(sec,
    h('p', { class: 'ia-badge', id: 'ia-status', role: 'status', 'aria-live': 'polite' }),
    h('div', { id: 'busca-historico-slot' }),
    form,
    h('div', { class: 'chips sugestoes', id: 'sugestoes', role: 'group', 'aria-label': 'Perguntas sugeridas' }));
}

function atualizarBotoesBusca() {
  const tem = S.consulta.length > 0;
  const l = $('#busca-limpar');
  const e = $('#busca-envia');
  if (l) l.hidden = !tem;
  if (e) { e.disabled = !(S.consulta.trim().length > 0); e.hidden = S.iaProcessando; }
  const g = $('#busca-spin');
  if (g) g.hidden = !S.iaProcessando;
}

function renderBusca() {
  const st = $('#ia-status');
  if (!st || !campo) return;
  trocar(st, icon('sparkles', 16), S.iaProcessando ? (S.iaMsg || 'IA analisando…') : 'Assistente IA • respostas dos dados oficiais do TSE');
  campo.placeholder = S.prefs.perguntaInicial.trim() || PERGUNTA_INICIAL_PADRAO;
  if (campo.value !== S.consulta) { campo.value = S.consulta; ajustarAltura(campo); }
  campo.disabled = false;
  $('#busca').classList.toggle('ocupado', S.iaProcessando);
  atualizarBotoesBusca();
  renderCardHistorico();
  trocar($('#sugestoes'), S.sugestoes.map((s) => h('button', { type: 'button', class: 'chip sug', disabled: S.iaProcessando, onClick: () => perguntar(s) }, icon('sparkles', 14), s)));
}

function renderResposta() {
  const box = $('#resposta');
  if (!box) return;
  const r = S.resposta;
  if (!r) { trocar(box); return; }
  const citados = (r.candidateIds ?? []).map((id) => S.store.porId.get(id)).filter(Boolean).slice(0, 6);
  const cartao = h('section', { class: 'resposta', 'aria-label': 'Resposta da IA' },
    h('div', { class: 'resp-cab' },
      h('span', { class: 'resp-ic' }, icon('sparkles', 20)),
      h('div', { class: 'resp-corpo' },
        h('p', { class: 'resp-tit' }, `Resposta da IA • ${ORIGEM_ROTULO[r.origem] ?? ORIGEM_ROTULO.LOCAL}`),
        textoResposta(r.directAnswer ?? ''),
        r.fonte ? h('p', { class: 'resp-fonte' }, r.fonte) : null),
      h('button', { type: 'button', class: 'btn-icone mini-btn', 'aria-label': 'Fechar resposta', onClick: () => { S.resposta = null; renderResposta(); } }, icon('x', 18))),
    ofereceNuvem(r, S.prefs.iaNuvem) ? blocoNuvem(r) : null,
    r.apuracao ? tabelaApuracao(r.apuracao) : null,
    citados.length ? h('div', { class: 'resp-citados' },
      h('p', { class: 'resp-sub' }, 'Candidaturas citadas:'),
      h('div', { class: 'chips' }, citados.map((c) => h('button', { type: 'button', class: 'chip cit', onClick: () => abrirDialogo({ tipo: 'candidato', id: c.id, candidato: c }) }, icon('person', 14), `${c.nomeUrna} (${c.numero})`)))) : null,
    h('div', { class: 'chips resp-acoes' },
      h('button', { type: 'button', class: 'btn btn-ouro peq', onClick: () => abrirDialogo({ tipo: 'urna', inicial: citados[0] ?? null }) }, icon('ballot', 16), 'Simulador educativo'),
      (r.suggestedQuestions ?? []).map((s) => h('button', { type: 'button', class: 'chip sug', onClick: () => perguntar(s) }, s))),
    h('button', { type: 'button', class: 'btn btn-texto peq', onClick: () => abrirDialogo({ tipo: 'relato' }) }, icon('flag', 14), 'Relatar problema nesta resposta'));
  trocar(box, cartao);
}

/** Estado do pedido explícito à nuvem para a resposta `r` ('ocioso' se não houve pedido para ela). */
const estadoNuvem = (r) => (S.nuvemPedido?.resposta === r ? S.nuvemPedido.estado : 'ocioso');

/** O botão desta resposta GERA texto por modelo? Só se ela já foi entendida e a IA generativa está ligada no pacote assinado. */
const geraTexto = (r) => r.resolvida === true && askLigado(S.store.manifest);

/** "Perguntar à IA na nuvem": na resposta não entendida (só com o modo automático desligado) e também depois de uma resposta entendida, para conferir (ver ofereceNuvem). */
function blocoNuvem(r) {
  const consultando = estadoNuvem(r) === 'consultando';
  const gera = geraTexto(r);
  return h('div', { class: 'resp-nuvem', id: 'resp-nuvem' },
    h('button', { type: 'button', class: 'btn btn-contorno peq', id: 'btn-nuvem', disabled: consultando, 'aria-describedby': 'resp-nuvem-nota', onClick: perguntarANuvem },
      icon('cloud', 18), gera ? NUVEM_TEXTOS.botaoGerar : NUVEM_TEXTOS.botao),
    h('p', { class: 'resp-nuvem-nota', id: 'resp-nuvem-nota' }, gera ? NUVEM_TEXTOS.notaGerar : (r.resolvida ? NUVEM_TEXTOS.notaConferir : NUVEM_TEXTOS.nota)),
    // região viva criada junto com o cartão (vazia): leitores de tela anunciam "Consultando…" e o aviso de falha
    h('p', { class: `resp-nuvem-status${estadoNuvem(r) === 'falhou' ? ' falhou' : ''}`, id: 'resp-nuvem-status', role: 'status', 'aria-live': 'polite' }, conteudoStatusNuvem(r)));
}

function conteudoStatusNuvem(r) {
  const e = estadoNuvem(r);
  if (e === 'consultando') return [h('span', { class: 'spinner mini', 'aria-hidden': 'true' }), h('span', null, NUVEM_TEXTOS.consultando)];
  if (e === 'falhou') return [icon('info', 16), h('span', null, r.resolvida && !geraTexto(r) ? NUVEM_TEXTOS.falhouConferir : NUVEM_TEXTOS.falhou)];
  return [];
}

/** Atualiza só o botão e a região de status (sem recriar o cartão: o foco e a leitura da resposta não se perdem). */
function renderNuvem() {
  const r = S.resposta;
  const botao = $('#btn-nuvem');
  const st = $('#resp-nuvem-status');
  if (!r || !botao || !st) return;
  botao.disabled = estadoNuvem(r) === 'consultando';
  st.classList.toggle('falhou', estadoNuvem(r) === 'falhou');
  trocar(st, conteudoStatusNuvem(r));
}

/** Apuração exatamente como publicada pelo TSE (valores não são alterados). */
function tabelaApuracao(ap) {
  const linhas = [...ap.linhas].sort((a, b) => b.votos - a.votos);
  return h('div', { class: 'apuracao' },
    h('table', null,
      h('caption', null, `Apuração oficial do TSE — ${ap.totalizacaoFinal ? 'totalização final' : `em andamento${ap.secoesTotalizadasPct != null ? ` (${ap.secoesTotalizadasPct}% das seções)` : ''}`}; dados de ${ap.geradoEm}`),
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Candidato'), h('th', { scope: 'col', class: 'num' }, 'Votos'), h('th', { scope: 'col', class: 'num' }, '%'))),
      h('tbody', null, linhas.slice(0, ap.cargo === 'PRESIDENTE' || linhas.length <= 12 ? linhas.length : 10).map((l) => h('tr', null,
        h('th', { scope: 'row' }, `${l.nome} `, h('span', { class: 'mudo' }, `(${l.partido}, nº ${l.numero})`), l.eleito ? h('span', { class: 'tag tag-ouro' }, 'ELEITO') : null),
        h('td', { class: 'num' }, inteiro(l.votos)), h('td', { class: 'num' }, l.percentual ?? '—'))))));
}

// ---- filtros

function renderFiltros() {
  const box = $('#filtros');
  if (!box) return;
  const f = S.filtro;
  const uf = S.prefs.ufPadrao;
  const ligado = f.estadoUf != null && f.estadoUf === uf;
  const set = (parcial) => atualizarFiltro({ ...f, ...parcial });
  const idSw = 'sw-meu-estado';
  const partidos = Object.keys(S.store.regras.estatisticas.porPartido ?? {}).sort();
  const temas = S.store.regras.temas ?? {};

  const meuEstado = h('div', { class: `meu-estado${ligado ? ' on' : ''}` },
    icon(ligado ? 'mapPin' : 'mapOff', 20),
    h('div', { class: 'meu-estado-txt' },
      h('strong', null, f.estadoUf != null ? `Estado: ${NOMES_UF[f.estadoUf] ?? f.estadoUf}` : 'Brasil: todos os estados'),
      h('span', { class: 'mudo mini' }, uf == null ? 'Escolha seu estado para começar já filtrado' : ligado ? 'Seu estado e candidaturas nacionais' : `Ligue para ver só o seu estado (${uf})`)),
    h('button', { type: 'button', class: 'btn btn-texto peq', onClick: () => abrirDialogo({ tipo: 'uf' }) }, uf == null ? 'Escolher' : 'Alterar'),
    h('label', { for: idSw, class: 'sr-only' }, 'Filtrar pelo meu estado'),
    interruptor({ ligado, onChange: alternarMeuEstado, rotulo: 'Filtrar pelo meu estado', id: idSw }));

  const cab = h('div', { class: 'filtros-cab' },
    icon('filter', 18), h('h2', { class: 'filtros-tit' }, 'Filtros'), h('span', { class: 'grow' }),
    h('button', { type: 'button', class: 'btn btn-texto peq', 'aria-expanded': S.avancado ? 'true' : 'false', 'aria-controls': 'filtros-avancados', onClick: () => { S.avancado = !S.avancado; renderFiltros(); } },
      icon(S.avancado ? 'chevUp' : 'settings', 16), S.avancado ? 'Menos' : 'Mais filtros'),
    h('button', { type: 'button', class: 'btn btn-texto peq perigo', onClick: limparFiltros }, 'Limpar'));

  const cargos = h('div', { class: 'chips cargos', role: 'group', 'aria-label': 'Cargo' },
    TSE_CARGOS.map((c) => chip({ rotulo: `${c.titulo} (${c.digitos} dígitos)`, selecionado: f.cargo === c.codigo, onClick: () => set({ cargo: f.cargo === c.codigo ? null : c.codigo }) })));

  const grupo = (titulo, chips, nota) => h('div', { class: 'grupo-filtro' }, h('p', { class: 'rotulo-filtro' }, titulo), h('div', { class: 'chips', role: 'group', 'aria-label': titulo }, chips), nota ? h('p', { class: 'mudo mini' }, nota) : null);
  const avancado = h('div', { class: 'avancado', id: 'filtros-avancados', hidden: !S.avancado },
    grupo('Ficha Limpa e situação da candidatura', [
      chip({ rotulo: 'Ficha Limpa: registro deferido', selecionado: f.apenasDeferidas, onClick: () => set({ apenasDeferidas: !f.apenasDeferidas, apenasIndeferidas: false }) }),
      chip({ rotulo: 'Indeferidos / inelegíveis', selecionado: !!f.apenasIndeferidas, onClick: () => set({ apenasIndeferidas: !f.apenasIndeferidas, apenasDeferidas: false }) }),
      chip({ rotulo: 'Apenas na urna', selecionado: f.apenasNaUrna, onClick: () => set({ apenasNaUrna: !f.apenasNaUrna }) }),
      S.fase.mostraResultados ? chip({ rotulo: 'Apenas eleitos', selecionado: f.apenasEleitos, onClick: () => set({ apenasEleitos: !f.apenasEleitos }) }) : null
    ], 'Ficha Limpa derivada do julgamento oficial do registro: deferido = sem impedimento reconhecido (pode caber recurso; não é certidão).'),
    grupo('Gênero (declarado ao TSE)', [['FEMININO', 'Mulheres'], ['MASCULINO', 'Homens']].map(([g, rot]) =>
      chip({ rotulo: rot, selecionado: f.genero === g, onClick: () => set({ genero: f.genero === g ? null : g }) }))),
    grupo('Histórico no TSE', Object.entries(HISTORICO).map(([k, rot]) => chip({ rotulo: rot, selecionado: f.historico === k, onClick: () => set({ historico: k }) }))),
    grupo('Região', MACRO_REGIOES.map((m) => chip({ rotulo: m.nome, selecionado: f.regiao === m.nome, onClick: () => set({ regiao: f.regiao === m.nome ? null : m.nome }) }))),
    partidos.length ? grupo('Partido', partidos.map((p) => chip({ rotulo: p, selecionado: (f.partido ?? '').toLowerCase() === p.toLowerCase(), onClick: () => set({ partido: (f.partido ?? '').toLowerCase() === p.toLowerCase() ? null : p }) }))) : null,
    Object.keys(temas).length ? grupo('Tema citado no plano de governo', Object.entries(temas).map(([id, rot]) => chip({ rotulo: rot, selecionado: f.tema === id, onClick: () => set({ tema: f.tema === id ? null : id }) })),
      'Só candidatos com plano de governo registrado (principalmente Presidente e Governador). Detecção automática por palavras-chave.') : null);
  trocar(box, meuEstado, cab, cargos, avancado);
}

// ---- menu

function renderMenu() {
  const box = $('#menu');
  if (!box) return;
  trocar(box, h('h2', { class: 'menu-tit' }, 'Navegação Eleitoral'),
    h('div', { class: 'menu-grade' }, S.menu.map((m) => h('button', {
      type: 'button', class: `menu-card${m.id === S.menuAtivo ? ' on' : ''}`, 'aria-pressed': m.id === S.menuAtivo ? 'true' : 'false', onClick: () => selecionarMenu(m)
    }, h('span', { class: 'menu-ic' }, icon(m.icon, 24)), h('strong', { class: 'menu-t' }, m.title), h('span', { class: 'menu-d' }, m.description)))));
}

// ---- lista

function renderCargaMsg() {
  const el = $('#carga-msg');
  if (!el) return;
  const total = S.store._ufsDoManifesto().length;
  el.textContent = S.cargasAtivas > 0 ? `Carregando mais estados… (${S.store.ufsCarregadas.length} de ${total}). A lista completa aparece conforme os dados chegam.` : '';
}

function renderLista() {
  const lista = $('#lista');
  if (!lista) return;
  const total = S.lista.length;
  const c = $('#contagem');
  if (c) c.textContent = `${inteiro(total)} encontradas`;
  renderCargaMsg();
  const permitirRemota = !S.prefs.economiaDeDados;
  if (total === 0) {
    trocar(lista, h('p', { class: 'vazio mudo' }, S.cargasAtivas > 0 ? 'Carregando candidaturas…' : 'Nenhuma candidatura encontrada com os filtros selecionados.'));
    trocar($('#mais'));
    return;
  }
  trocar(lista, S.lista.slice(0, S.limite).map((c) => cartaoCandidato(c, {
    store: S.store, permitirRemota, onAbrir: (x) => abrirDialogo({ tipo: 'candidato', id: x.id, candidato: x })
  })));
  trocar($('#mais'), total > S.limite ? [h('p', { class: 'mudo pequeno' }, `Exibindo ${inteiro(S.limite)} de ${inteiro(total)}.`),
    h('button', { type: 'button', class: 'btn btn-contorno', onClick: () => { S.limite += PAGINA; renderLista(); } }, 'Mostrar mais')] : null);
}

// ---- utilidades para testes/diagnóstico
export const _estado = S;
export { SIGLAS };
