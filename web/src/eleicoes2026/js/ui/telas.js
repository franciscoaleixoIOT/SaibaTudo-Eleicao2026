// Telas: primeira execução (onboarding), configurações e "Sobre os dados". Porte de OnboardingScreen/SettingsScreen/AboutDataScreen.
import { h, icon, link } from '../dom.js';
import {
  APP_NAME, AVISO_NEUTRALIDADE, FONTE_DADOS, LICENCA_DADOS, NOMES_UF, PERGUNTA_INICIAL_PADRAO, SIGLAS, URL_CODIGO_FONTE,
  URL_DADOS_ABERTOS_TSE, URL_ISSUES, URL_PRIVACIDADE, inteiro
} from '../model.js';
import { MENSAGENS_LOCALIZACAO, PROCURANDO_UF, estadoPermissaoLocalizacao, geolocalizacaoDisponivel, localizarUf } from '../geo.js';
import { formatarBr } from '../phase.js';
import { FONTES, TEMAS } from '../prefs.js';
import { campoAutoAltura, chip, linhaChave, barraTela, rotuloSecao, interruptor } from './components.js';
import { BUILD } from '../build-info.js';
import { NUVEM_TEXTOS } from '../cloud.js';

const ponto = (texto) => h('li', { class: 'ponto' }, icon('checkCircle', 18), h('span', null, texto));

// -------------------------------------------------------------------------------------------- onboarding

/**
 * Primeira execução: neutralidade, estado (opcional; PRÉ-SELECIONADO pela localização aproximada, calculada só no aparelho —
 * ver geo.js) e o modo automático da IA na nuvem (opt-in; sem ele, o app oferece "Perguntar à IA na nuvem" em cada pergunta
 * não entendida). Sem permissão/suporte de localização, a escolha é manual como antes.
 */
export function telaOnboarding({ onConcluir }) {
  let uf = null;
  let iaNuvem = false;
  let toques = 0; // escolhas manuais: uma sugestão que chega depois de o usuário escolher não sobrescreve a escolha
  let procurando = false;
  const chipsUf = h('div', { class: 'chips', role: 'group', 'aria-label': 'Escolha seu estado (opcional)' });
  const statusGeo = h('p', { class: 'mudo pequeno geo-status', role: 'status', 'aria-live': 'polite' });
  const desenharUfs = () => chipsUf.replaceChildren(...SIGLAS.map((s) => chip({
    rotulo: s, selecionado: uf === s, ariaLabel: `${NOMES_UF[s]}`, icone: false,
    onClick: () => { toques++; uf = uf === s ? null : s; statusGeo.textContent = ''; desenharUfs(); }
  })));
  desenharUfs();
  const temGeo = geolocalizacaoDisponivel();
  const btnGeo = temGeo
    ? h('button', { type: 'button', class: 'btn btn-contorno peq', onClick: () => sugerirPelaLocalizacao() }, icon('mapPin', 18), 'Usar minha localização')
    : null;

  async function sugerirPelaLocalizacao() {
    if (procurando) return;
    procurando = true;
    const toquesAntes = toques;
    btnGeo.disabled = true;
    statusGeo.textContent = PROCURANDO_UF;
    const { uf: achada, motivo } = await localizarUf();
    procurando = false;
    btnGeo.disabled = false;
    if (!tela.isConnected) return; // o usuário já concluiu o onboarding
    if (toques !== toquesAntes) { statusGeo.textContent = ''; return; } // escolheu na lista enquanto procurávamos: vale a escolha
    if (!achada) { statusGeo.textContent = MENSAGENS_LOCALIZACAO[motivo] ?? MENSAGENS_LOCALIZACAO.erro; return; }
    uf = achada;
    desenharUfs();
    statusGeo.textContent = `Sugerido pela sua localização aproximada: ${NOMES_UF[achada]}. Toque em outro estado para trocar.`;
  }

  const idIa = 'onb-ia';
  const tela = h('div', { class: 'onboarding' },
    h('header', { class: 'onb-topo' }, h('div', { class: 'onb-topo-in' },
      h('img', { class: 'onb-logo', src: '/brand/svg/eleicoes2026-icon.svg', width: '76', height: '76', alt: 'Logotipo SaibaTudo' }),
      h('h1', { class: 'onb-titulo', tabindex: '-1', id: 'titulo-tela' }, `Bem-vindo ao ${APP_NAME}`),
      h('p', null, 'Consulte candidaturas, pesquisas registradas, regras e resultados com dados abertos do TSE.'))),
    h('div', { class: 'onb-corpo' },
      h('ul', { class: 'pontos' },
        ponto('Dados oficiais: tudo vem dos arquivos abertos do TSE, com fonte e data em cada resposta.'),
        ponto('Independente e apartidário: sem vínculo com o TSE, governo ou partidos.'),
        ponto('Não recomendamos candidatos: a decisão do voto é sua.'),
        ponto('Funciona offline e se atualiza sozinho com dados verificados por assinatura digital.')),
      h('h2', { class: 'onb-h2' }, 'Qual é o seu estado? (opcional)'),
      h('p', { class: 'mudo pequeno' },
        'Usamos só para começar a lista filtrada. Sugerimos o estado pela sua localização aproximada, calculada aqui no aparelho: ' +
        'nada é enviado nem guardado além da sigla do estado. Você pode trocar quando quiser.'),
      btnGeo ? h('div', { class: 'geo-acao' }, btnGeo) : null,
      statusGeo,
      chipsUf,
      h('div', { class: 'linha-chave onb-ia' },
        h('label', { for: idIa, class: 'linha-chave-txt' },
          h('strong', { class: 'onb-h2' }, NUVEM_TEXTOS.chave),
          h('span', { class: 'mudo pequeno' }, `${NUVEM_TEXTOS.descricaoChave} Você pode mudar depois em Configurações.`)),
        interruptor({ ligado: false, rotulo: NUVEM_TEXTOS.chave, id: idIa, onChange: (v) => { iaNuvem = v; } })),
      h('p', { class: 'mudo mini' }, AVISO_NEUTRALIDADE),
      h('button', { type: 'button', class: 'btn btn-primario grande cheio', onClick: () => onConcluir(uf, iaNuvem) }, 'Começar'),
      h('button', { type: 'button', class: 'btn btn-texto centro-btn', onClick: () => onConcluir(null, false) }, 'Pular e usar as configurações padrão')));

  // tentativa automática ao abrir: só se o navegador tem geolocalização e a permissão não foi negada antes
  // (com permissão "prompt", o navegador pergunta; negar ou não responder mantém a escolha manual)
  if (temGeo) {
    estadoPermissaoLocalizacao().then((estado) => {
      if (estado !== 'denied' && tela.isConnected && toques === 0) sugerirPelaLocalizacao();
    });
  }
  return tela;
}

// -------------------------------------------------------------------------------------------- configurações

function grupoRadio(nome, titulo, opcoes, valor, onChange) {
  return h('fieldset', { class: 'radios' },
    h('legend', null, titulo),
    Object.entries(opcoes).map(([k, rotulo]) => h('label', { class: 'radio' },
      h('input', { type: 'radio', name: nome, value: k, checked: valor === k, onChange: () => onChange(k) }), h('span', null, rotulo))));
}

export function telaConfiguracoes({ prefs, atualizar, onEscolherUf, onSobreDados, onVoltar, instalacao }) {
  const linhaLink = (titulo, detalhe, props) => h('button', { type: 'button', class: 'linha-link', ...props }, h('strong', null, titulo), h('span', { class: 'mudo' }, detalhe));
  // textarea que cresce de 1 a 4 linhas (texto longo fica visível por inteiro); Enter conclui a edição (sem quebra de linha)
  const perguntaInicial = campoAutoAltura({
    maxLinhas: 4, classe: 'campo', id: 'cfg-pergunta', maxlength: '120', value: prefs.perguntaInicial, enterkeyhint: 'done',
    placeholder: PERGUNTA_INICIAL_PADRAO, onEnter: (e) => e.target.blur(),
    onChange: (e) => atualizar((p) => ({ ...p, perguntaInicial: e.target.value.replace(/[\r\n]+/g, ' ').slice(0, 120) }))
  });
  return h('div', { class: 'tela' },
    barraTela('Configurações', onVoltar),
    h('div', { class: 'tela-corpo' },
      rotuloSecao('Aparência'),
      grupoRadio('tema', 'Tema', TEMAS, prefs.tema, (k) => atualizar((p) => ({ ...p, tema: k }))),
      grupoRadio('fonte', 'Tamanho do texto', Object.fromEntries(Object.entries(FONTES).map(([k, v]) => [k, v.rotulo])), prefs.tamanhoFonte, (k) => atualizar((p) => ({ ...p, tamanhoFonte: k }))),

      rotuloSecao('Consulta'),
      linhaLink('Meu estado', prefs.ufPadrao ? `${NOMES_UF[prefs.ufPadrao]} — toque para alterar` : 'Nenhum — toque para escolher ou usar sua localização aproximada', { onClick: onEscolherUf }),
      linhaChave({
        titulo: 'Começar filtrado pelo meu estado', detalhe: 'Mostra seu estado e as candidaturas nacionais ao abrir.',
        ligado: prefs.filtrarPorMinhaUf && prefs.ufPadrao != null, habilitado: prefs.ufPadrao != null,
        onChange: (v) => atualizar((p) => ({ ...p, filtrarPorMinhaUf: v }))
      }),
      linhaChave({
        titulo: 'Mostrar apenas candidaturas na urna', detalhe: 'Oculta renúncias, indeferimentos e outros registros fora da urna.',
        ligado: prefs.mostrarApenasNaUrna, onChange: (v) => atualizar((p) => ({ ...p, mostrarApenasNaUrna: v }))
      }),
      h('label', { for: 'cfg-pergunta', class: 'rotulo-campo' }, 'Pergunta inicial padrão'),
      perguntaInicial,
      linhaChave({
        titulo: 'Fazer essa pergunta ao abrir o app', detalhe: 'A resposta aparece assim que os dados carregam.',
        ligado: prefs.executarPerguntaAoAbrir && prefs.perguntaInicial.trim() !== '', habilitado: prefs.perguntaInicial.trim() !== '',
        onChange: (v) => atualizar((p) => ({ ...p, executarPerguntaAoAbrir: v }))
      }),

      rotuloSecao('Dados e privacidade'),
      linhaChave({
        titulo: 'Economia de dados', detalhe: 'Não verifica atualizações em rede móvel nem baixa fotos pela internet (só as já incluídas no app).',
        ligado: prefs.economiaDeDados, onChange: (v) => atualizar((p) => ({ ...p, economiaDeDados: v }))
      }),
      linhaChave({
        titulo: NUVEM_TEXTOS.chave, detalhe: NUVEM_TEXTOS.descricaoChave,
        ligado: prefs.iaNuvem, onChange: (v) => atualizar((p) => ({ ...p, iaNuvem: v }))
      }),
      linhaLink('Sobre os dados', 'Fontes, versão, atualização e limitações', { onClick: onSobreDados }),
      h('a', { class: 'linha-link', href: URL_PRIVACIDADE }, h('strong', null, 'Política de privacidade'), h('span', { class: 'mudo' }, 'saibatudo.net/privacidade')),

      rotuloSecao('Instalar o app'),
      instalacao,

      rotuloSecao('Sobre o app'),
      h('a', { class: 'linha-link', href: URL_ISSUES, target: '_blank', rel: 'noopener noreferrer' },
        h('strong', null, 'Código-fonte (MIT) e canal de correções'), h('span', { class: 'mudo' }, URL_CODIGO_FONTE)),
      h('p', { class: 'mudo pequeno' }, AVISO_NEUTRALIDADE),
      h('p', { class: 'mudo mini' }, `Dados: TSE – Dados Abertos (${LICENCA_DADOS}). Versão web ${BUILD}.`)));
}

// -------------------------------------------------------------------------------------------- sobre os dados

const rotuloGlossario = (k) => ({
  elegibilidade: 'Situação da candidatura', naUrna: 'Na urna', eleitoMesmoCargo: 'Já eleito para o cargo',
  temasPlano: 'Temas do plano de governo', patrimonioDeclarado: 'Patrimônio declarado'
}[k] ?? k);

const item = (rotulo, valor) => h('p', { class: 'kv' }, h('strong', null, `${rotulo}: `), h('span', { class: 'mudo' }, valor));

export function telaSobreDados({ store, fase, atualizacao, onAtualizar, onVoltar }) {
  const corpo = [];
  const m = store.manifest;
  const r = store.regras;
  if (!m || !r) {
    corpo.push(h('p', null, 'Dados ainda não carregados.'));
  } else {
    const sig = store.sig;
    corpo.push(rotuloSecao('Versão dos dados'));
    corpo.push(item('Pacote', m.dataVersion ?? '—'));
    corpo.push(item('Origem em uso', store.origem));
    corpo.push(item('Assinatura digital do manifesto',
      sig.estado === 'verificada' ? 'verificada (ECDSA P-256 / SHA-256)' : `NÃO verificada. ${sig.detalhe}`));
    corpo.push(item('Extração do TSE', r.extracaoTse?.trim() ? r.extracaoTse : '—'));
    corpo.push(item('Gerado em (UTC)', m.generatedAt ?? '—'));
    corpo.push(item('Fase do calendário', fase.rotulo));
    corpo.push(item('Candidaturas', `${inteiro(r.estatisticas.totalRegistros)} (${inteiro(r.estatisticas.totalNaUrna)} na urna)`));
    corpo.push(item('Neste aparelho', `${store.ufsCarregadas.length} de ${store._ufsDoManifesto().length} fatias de candidaturas (BR + estados) carregadas; as demais são baixadas quando necessário.`));
    corpo.push(item('Pesquisas registradas', inteiro(r.estatisticas.pesquisasRegistradas)));
    corpo.push(item('Eleição', `1º turno ${formatarBr(r.turno1)} • 2º turno ${formatarBr(r.turno2)}`));
    if (store.ultimaVerificacao > 0) corpo.push(item('Última verificação', new Date(store.ultimaVerificacao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })));
    if (store.erros.length > 0) {
      corpo.push(h('div', { class: 'aviso-caixa discreto', role: 'status' }, icon('info', 16),
        h('span', null, 'Aviso de verificação: ', store.erros.map((e) => e.mensagem).join('; '))));
    }
    corpo.push(h('div', { class: 'linha-acao' },
      h('button', { type: 'button', class: 'btn btn-primario', id: 'btn-atualizar', disabled: atualizacao.estado === 'verificando', onClick: onAtualizar },
        icon('refresh', 18), atualizacao.estado === 'verificando' ? 'Verificando…' : 'Atualizar agora'),
      h('span', { class: 'mudo pequeno', role: 'status', 'aria-live': 'polite' }, atualizacao.mensagem ?? '')));
    corpo.push(h('p', { class: 'mudo mini' },
      'O app confere atualizações automaticamente (a cada poucas horas; com mais frequência nos dias de votação) enquanto está aberto e ao voltar o foco. ' +
      'Cada pacote só é aceito se a assinatura digital e os checksums forem válidos; a troca é atômica (se algo falhar, os dados atuais permanecem).'));

    corpo.push(rotuloSecao('Fontes e licença'));
    corpo.push(h('p', { class: 'mudo pequeno' }, m.atribuicao ?? FONTE_DADOS));
    for (const f of m.fontes ?? []) {
      corpo.push(h('div', { class: 'fonte-item' },
        h('strong', null, f.descricao ?? f.id ?? ''),
        h('span', { class: 'url' }, f.url ?? ''),
        h('span', { class: 'mudo mini' }, [f.lastModified ? `Modificado no TSE: ${f.lastModified}` : null, f.coletadoEm ? `coletado em ${f.coletadoEm}` : null, f.etag ? `ETag ${f.etag}` : null].filter(Boolean).join(' • '))));
    }
    corpo.push(h('p', null, link(URL_DADOS_ABERTOS_TSE, 'Abrir o Portal de Dados Abertos do TSE')));

    corpo.push(rotuloSecao('Metodologia e limitações'));
    corpo.push(h('ul', { class: 'lista-pontos' },
      Object.entries(r.glossario ?? {}).map(([k, t]) => h('li', null, h('strong', null, `${rotuloGlossario(k)}: `), t)),
      h('li', null, 'Fotos: as de Presidente, Governador e Senador acompanham o app; as demais vêm do CDN oficial do TSE quando há conexão (e só quando a foto existe).'),
      h('li', null, 'Planos de governo: o TSE registra o documento principalmente para Presidente e Governador; os temas exibidos são detectados automaticamente.'),
      h('li', null, 'Resultados: durante a apuração, o app mostra os números do TSE (resultados.tse.jus.br) exatamente como publicados; resultados definitivos vêm dos arquivos abertos do TSE após a totalização.'),
      h('li', null, 'Não há avaliação, ranking ou recomendação de candidatos. A ordem das listas é fixa (cargo, estado e número).'),
      h('li', null, 'Em caso de divergência, vale sempre o site oficial do TSE. Encontrou um erro? Use o botão "Relatar" na resposta da IA ou abra uma issue no GitHub.')));
  }
  return h('div', { class: 'tela' }, barraTela('Sobre os dados', onVoltar), h('div', { class: 'tela-corpo' }, corpo));
}
