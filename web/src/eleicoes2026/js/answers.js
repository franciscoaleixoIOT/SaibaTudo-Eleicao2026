// Monta a RESPOSTA a partir de uma ParsedQuery usando SOMENTE os dados oficiais carregados (e, para apuração ao vivo,
// o JSON público do TSE). Porte fiel de AnswerBuilder.kt. Nenhum texto gerado por modelo de linguagem é exibido como
// fato: a nuvem ajuda apenas a entender a pergunta.
//
// Formato do texto (directAnswer): 1ª linha = título; linhas "• " = itens; linhas "Rótulo: valor" = campos (ver formato.js).
// Princípios: neutralidade (ordem fixa), fonte e data em toda resposta, sem recomendação/previsão de voto,
// Ficha Limpa = derivação rotulada da situação oficial do registro (não é certidão).
import {
  MENU, ModeloCargo, normalizar, SISTEMAS_OFICIAIS_TSE, URL_AUTOATENDIMENTO_ELEITOR, URL_CALENDARIO_TSE, URL_DADOS_ABERTOS_TSE,
  URL_DIVULGA_CAND_CONTAS, URL_PORTAL_TSE_2026, URL_RESULTADOS_TSE, FICHA_LIMPA, HISTORICO, decimal2, fichaLimpa, fichaLimpaTexto,
  inteiro, moeda, primeiraMaiuscula, resultadoEleito, tituloCargo, tituloPalavras, ufEm, ufPor
} from './model.js';
import { FASES, diasEntre, faseDe, formatarBr } from './phase.js';
import { filtrar, novoFiltro } from './filters.js';

export const ORIGEM_ROTULO = {
  LOCAL: 'IA local • dados oficiais',
  NUVEM: 'IA na nuvem + dados oficiais',
  GENERATIVA: 'IA Generativa (Qwen 7B) • Nuvem',
  AVISO: 'Aviso'
};

/** Sugestões exibidas na tela quando a resposta não traz outras (MainUiState.SUGESTOES_PADRAO). */
export const SUGESTOES_PADRAO = ['Quem disputa a Presidência?', 'Candidatos a Governador', 'Quantos candidatos foram registrados?', 'Pesquisas registradas'];

const n = (v) => inteiro(v);
const plural = (qtd) => (qtd === 1 ? '' : 's');
const fmt1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false });
const dataBr = (iso) => formatarBr(iso);
/** "2026-09-30 16:58:38" -> "30/09/2026" (demais formatos ficam como estão). */
const dataCurta = (s) => (s.length >= 10 && s[4] === '-' ? formatarBr(s.slice(0, 10)) : s);
const localDe = (c) => (c.estadoUf === 'BR' ? '' : ` ${c.estadoUf}`);
/** numero.toIntOrNull() ?: Int.MAX_VALUE */
const ordemNumero = (num) => (/^[+-]?\d+$/.test(String(num)) ? Number(num) : Number.MAX_SAFE_INTEGER);
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const igualSemCaixa = (a, b) => a != null && b != null && a.toLowerCase() === b.toLowerCase();

/** Alterações de filtro sugeridas pela resposta (aplicadas pela interface sobre o filtro atual). */
const filtros = (x = {}) => ({
  cargo: null, estadoUf: null, partido: null, tema: null, buscaTexto: null, apenasDeferidas: null, apenasIndeferidas: null,
  apenasEleitos: null, historico: null, genero: null, resetar: false, ...x
});

const resposta = (x) => ({
  targetRoute: 'menu/home', menuId: MENU.HOME, submenuId: null, intent: 'DESCONHECIDA', filters: filtros(),
  directAnswer: null, suggestedQuestions: [], candidateIds: [], fonte: null, origem: 'LOCAL', resolvida: true,
  abrirResultados: false, abrirSimulador: false, apuracao: null, ...x
});

const rotaCargo = (c) => {
  switch (c) {
    case 'PRESIDENTE': case 'VICE_PRESIDENTE': return 'candidates/presidente';
    case 'GOVERNADOR': case 'VICE_GOVERNADOR': return 'candidates/governador';
    case 'SENADOR': case 'SUPLENTE_1': case 'SUPLENTE_2': return 'candidates/senador';
    case 'DEPUTADO_FEDERAL': return 'candidates/deputado_federal';
    case 'DEPUTADO_ESTADUAL': case 'DEPUTADO_DISTRITAL': return 'candidates/deputado_estadual';
    default: return 'candidates/todos';
  }
};

const menuCargo = (c) => {
  switch (c) {
    case 'PRESIDENTE': case 'VICE_PRESIDENTE': return MENU.PRESIDENTE;
    case 'GOVERNADOR': case 'VICE_GOVERNADOR': return MENU.GOVERNADOR;
    case 'SENADOR': case 'SUPLENTE_1': case 'SUPLENTE_2': return MENU.SENADOR;
    case 'DEPUTADO_FEDERAL': return MENU.DEPUTADO_FEDERAL;
    case 'DEPUTADO_ESTADUAL': case 'DEPUTADO_DISTRITAL': return MENU.DEPUTADO_ESTADUAL;
    default: return MENU.HOME;
  }
};

const tituloCargoDe = (codigo) => {
  switch (codigo) {
    case 'PRESIDENTE': case 'VICE_PRESIDENTE': return 'a Presidência';
    case 'GOVERNADOR': case 'VICE_GOVERNADOR': return 'o Governo';
    case 'SENADOR': case 'SUPLENTE_1': case 'SUPLENTE_2': return 'o Senado';
    default: return tituloCargo(codigo);
  }
};

/** Item de lista padronizado: número primeiro (como na urna), nome, partido e opcionalmente vice/chapa. */
function item(c, mostrarCargo, mostrarUf, chapa = []) {
  let s = `• ${c.numero} — ${c.nomeUrna} (${c.partido})`;
  const extras = [mostrarCargo ? c.cargo : null, mostrarUf && c.estadoUf !== 'BR' ? c.estadoUf : null].filter((x) => x != null);
  if (extras.length > 0) s += ` · ${extras.join(' ')}`;
  if (chapa && chapa.length > 0) {
    const rotulo = c.cargoCodigo === 'SENADOR' ? 'Suplentes' :
      ['PRESIDENTE', 'GOVERNADOR'].includes(c.cargoCodigo) ? 'Vice' :
      ['VICE_PRESIDENTE', 'VICE_GOVERNADOR'].includes(c.cargoCodigo) ? 'Titular' : 'Chapa';
    s += ` · ${rotulo}: ${chapa.map((v) => `${v.nomeUrna} (${v.partido})`).join('; ')}`;
  }
  if (!c.naUrna) s += ' — fora da urna';
  return s;
}

/** Contagem por chave preservando a ordem da 1ª ocorrência (groupingBy/eachCount do Kotlin). */
function contarPor(lista, chave) {
  const m = new Map();
  for (const x of lista) { const k = chave(x); m.set(k, (m.get(k) ?? 0) + 1); }
  return m;
}

/** Ordenação estável decrescente (sortedByDescending). */
const decrescente = (lista, valor) => lista.map((x, i) => ({ x, i })).sort((a, b) => valor(b.x) - valor(a.x) || a.i - b.i).map((e) => e.x);

/** Cargos que dependem do estado: sem UF na pergunta, vale o "Meu estado" do usuário (se ligado). */
const CARGOS_ESTADUAIS = new Set(['GOVERNADOR', 'VICE_GOVERNADOR', 'SENADOR', 'DEPUTADO_FEDERAL', 'DEPUTADO_ESTADUAL', 'DEPUTADO_DISTRITAL']);
const INTENCOES_MEU_ESTADO = new Set(['LISTAR_CANDIDATOS', 'CONTAR', 'ELEGIBILIDADE']);
/** Quem pede "em todo o Brasil" afasta o recorte do "Meu estado" (vale também para interpretações vindas da nuvem). */
const RX_BRASIL_TODO = /\b(todo o brasil|brasil todo|todo brasil|todos os estados|todo o pais|pais todo)\b/;

/**
 * Paridade com o Android: "Meu estado" LIGADO vale implicitamente para LISTAR/CONTAR/ELEGIBILIDADE sobre cargos estaduais
 * feitas SEM UF e sem nome/número de candidato. Cargo nacional (Presidente) e UF explícita na pergunta não são afetados.
 */
export function usaMeuEstado(consulta, ufPadrao) {
  return consulta.uf == null && consulta.nacional !== true && ufPadrao != null && CARGOS_ESTADUAIS.has(consulta.cargo) &&
    consulta.nome == null && consulta.numero == null && INTENCOES_MEU_ESTADO.has(consulta.intent) &&
    !RX_BRASIL_TODO.test(normalizar(consulta.textoOriginal ?? ''));
}

export class AnswerBuilder {
  /**
   * @param {object} o
   * @param {object} o.data dados ativos: { regras, candidatos, pesquisas, fontes, manifest, origem, porId }
   * @param {import('./gazetteer.js').Gazetteer} o.gaz
   * @param {string} o.hoje data de hoje (ISO, Brasília)
   * @param {string|null} [o.ufPadrao]
   * @param {{obter(cargo:string, uf:string, turno:number):Promise<object|null>}|null} [o.apuracao]
   * @param {'LOCAL'|'NUVEM'|'AVISO'} [o.origem]
   */
  constructor({ data, gaz, hoje, ufPadrao = null, apuracao = null, origem = 'LOCAL' }) {
    this.data = data;
    this.gaz = gaz;
    this.hoje = hoje;
    this.ufPadrao = ufPadrao;
    this.apuracao = apuracao;
    this.origem = origem;
    this.regras = data.regras;
    this.fase = faseDe(hoje, this.regras.turno1, this.regras.turno2);
    this.fonte = 'Fonte: TSE – dados abertos (CC BY)' +
      (this.regras.extracaoTse && this.regras.extracaoTse.trim() ? `, extração ${this.regras.extracaoTse}` : '') +
      '. App independente.';
  }

  async construir(consulta) {
    const meuEstado = usaMeuEstado(consulta, this.ufPadrao);
    const r = await this.responder(meuEstado ? { ...consulta, uf: this.ufPadrao } : consulta);
    return meuEstado && r.directAnswer != null
      ? { ...r, directAnswer: r.directAnswer + `\nFiltrado pelo seu estado (${this.ufPadrao}). Para ver o Brasil todo, peça "em todo o Brasil" ou desligue "Meu estado".` }
      : r;
  }

  async responder(p) {
    switch (p.intent) {
      case 'RECOMENDACAO': return this.recomendacao();
      case 'LISTAR_CANDIDATOS': return this.listar(p);
      case 'PERFIL_CANDIDATO': return this.perfil(p);
      case 'CONTAR': return this.contar(p);
      case 'PESQUISAS': return this.pesquisas(p);
      case 'CALENDARIO': return this.calendario();
      case 'LOCAL_VOTACAO': return this.localVotacao();
      case 'REGRAS_URNA': return this.regrasUrna(p);
      case 'REGRAS_VOTO': return this.regrasVoto(p);
      case 'SENADO_DOIS_VOTOS': return this.senadoDoisVotos();
      case 'ELEGIBILIDADE': return this.elegibilidade(p);
      case 'PLANO_GOVERNO': return this.planoGoverno(p);
      case 'CONTAS_CAMPANHA': return this.contasCampanha(p);
      case 'RESULTADOS': return this.resultados(p);
      case 'SEGUNDO_TURNO': return this.segundoTurno(p);
      case 'PATRIMONIO': return this.patrimonio(p);
      case 'FONTES': return this.fontes(p);
      case 'SOBRE_DADOS': return this.sobreDados();
      case 'SIMULADOR': return this.simulador(p);
      case 'AJUDA': return this.ajuda(p);
      default: return this.desconhecida(p);
    }
  }

  // ------------------------------------------------------------------ listagem e contagem

  listar(p) {
    const cargo = p.cargo ?? null;
    const fi = filtros({
      cargo, estadoUf: p.uf, partido: p.partido, tema: p.tema, apenasDeferidas: p.apenasDeferidas,
      historico: p.historico, genero: p.genero ?? null, resetar: true
    });
    const lista = filtrar(this.data.candidatos, novoFiltro({
      estadoUf: p.uf ?? null, cargo, apenasNaUrna: true, apenasDeferidas: p.apenasDeferidas === true,
      historico: p.historico ?? 'TODOS', partido: p.partido ?? null, tema: p.tema ?? null, genero: p.genero ?? null
    })).filter((c) => cargo != null || p.uf == null || c.estadoUf === p.uf); // sem cargo: só a UF pedida (sem nacionais)
    // Em listas por cargo (sem partido/tema) citamos só os titulares; vices/suplentes aparecem nos cartões
    const citados = cargo != null && p.partido == null && p.tema == null ? lista.filter((c) => c.cargoCodigo === cargo) : lista;
    const titulo = this.montarTitulo(cargo, p);
    let texto = '';
    if (citados.length === 0) {
      texto += `Não encontrei candidaturas na urna ${titulo} nos dados oficiais do TSE.`;
    } else {
      const total = citados.length;
      texto += `O TSE registra ${n(total)} candidatura${plural(total)} na urna ${titulo}`;
      if (total <= 30) {
        texto += ':';
        const variosCargos = new Set(citados.map((c) => c.cargoCodigo)).size > 1;
        const variasUfs = new Set(citados.map((c) => c.estadoUf).filter((u) => u !== 'BR')).size > 1;
        for (const c of citados) {
          const chapa = p.vice ? this.chapa(c) : [];
          texto += '\n' + item(c, variosCargos, variasUfs, chapa);
        }
      } else {
        texto += '.';
        if (cargo == null) {
          if (p.uf != null) {
            const majoritarios = citados.filter((c) => ['GOVERNADOR', 'SENADOR'].includes(c.cargoCodigo));
            const govs = majoritarios.filter((c) => c.cargoCodigo === 'GOVERNADOR');
            const sens = majoritarios.filter((c) => c.cargoCodigo === 'SENADOR');
            if (govs.length > 0 || sens.length > 0) {
              texto += `\n\nPrincipais disputas no estado (${ufEm(p.uf)}):`;
              if (govs.length > 0) {
                texto += '\nGovernador:';
                for (const c of govs) texto += '\n' + item(c, false, false, p.vice ? this.chapa(c) : []);
              }
              if (sens.length > 0) {
                texto += '\nSenador:';
                for (const c of sens) texto += '\n' + item(c, false, false, p.vice ? this.chapa(c) : []);
              }
            }
          } else {
            const pres = citados.filter((c) => c.cargoCodigo === 'PRESIDENTE');
            if (pres.length > 0 && pres.length <= 25) {
              texto += '\n\nCandidaturas à Presidência da República:';
              for (const c of pres) texto += '\n' + item(c, false, false, p.vice ? this.chapa(c) : []);
            }
          }
          texto += '\n\nPor cargo:';
          const porCargo = [...contarPor(citados, (c) => c.cargoCodigo)].sort((a, b) => ModeloCargo.ordem(a[0]) - ModeloCargo.ordem(b[0]));
          for (const [c, qtd] of porCargo) texto += `\n• ${tituloCargo(c)}: ${n(qtd)}`;
        }
        texto += '\nA lista completa está nos cartões abaixo, em ordem fixa por cargo, estado e número.';
      }
      if (p.tema != null) {
        texto += `\nTema "${this.regras.temas?.[p.tema] ?? p.tema}": inclui só candidatos com plano de governo registrado ` +
          `(${n(this.regras.estatisticas.candidatosComPlanoGoverno)} no total) cujo texto cita o tema com frequência.`;
      }
      if (p.apenasDeferidas === true) texto += '\nFicha Limpa: só registros deferidos pela Justiça Eleitoral (sem impedimento reconhecido; não é certidão).';
      if (p.genero != null) texto += '\nGênero conforme declarado ao TSE no registro.';
    }
    const fora = cargo != null
      ? this.data.candidatos.filter((c) => c.cargoCodigo === cargo && !c.naUrna && (p.uf == null || c.estadoUf === p.uf)).length : 0;
    if (fora > 0 && p.partido == null && p.tema == null && p.genero == null) {
      texto += `\nHá ainda ${n(fora)} registro${plural(fora)} fora da urna (renúncia, indeferimento etc.).`;
    }
    return resposta({
      targetRoute: rotaCargo(cargo), menuId: menuCargo(cargo), submenuId: p.uf ? `sub_${p.uf.toLowerCase()}` : null,
      intent: p.intent, filters: fi, directAnswer: texto,
      candidateIds: citados.flatMap((c) => [c, ...(p.vice ? this.chapa(c) : [])]).slice(0, 20).map((c) => c.id),
      suggestedQuestions: this.sugestoesLista(cargo, p.uf), fonte: this.fonte, origem: this.origem
    });
  }

  contar(p) {
    const cargo = p.cargo ?? null;
    const noEscopo = (c) => (cargo == null || c.cargoCodigo === cargo) && (p.uf == null || c.estadoUf === p.uf) &&
      (p.partido == null || igualSemCaixa(c.partido, p.partido));
    const escopo = this.data.candidatos.filter(noEscopo);
    const doGenero = p.genero != null ? escopo.filter((c) => igualSemCaixa(c.genero, p.genero)) : escopo;
    const registros = doGenero.length;
    const naUrna = doGenero.filter((c) => c.naUrna).length;
    const titulo = this.montarTitulo(cargo, { ...p, genero: null });
    let texto;
    if (p.genero != null) {
      const quem = p.genero === 'FEMININO' ? 'mulheres' : 'homens';
      texto = `O TSE registra ${n(registros)} candidaturas de ${quem} ${titulo}, sendo ${n(naUrna)} na urna.`;
      if (escopo.length > 0) {
        texto += `\nParticipação: ${fmt1.format(registros * 100 / escopo.length)}% de ${n(escopo.length)} candidaturas registradas.`;
      }
      texto += '\nGênero conforme declarado ao TSE no registro.';
    } else {
      texto = `O TSE registra ${n(registros)} candidatura${plural(registros)} ${titulo}, sendo ${n(naUrna)} inserida${plural(naUrna)} na urna.`;
      if (cargo == null && p.uf == null && p.partido == null) {
        texto += '\nNa urna, por cargo:';
        for (const [k, v] of decrescente(Object.entries(this.regras.estatisticas.porCargoNaUrna ?? {}), (e) => e[1])) {
          texto += `\n• ${primeiraMaiuscula(k.toLowerCase())}: ${n(v)}`;
        }
      }
    }
    return resposta({
      targetRoute: rotaCargo(cargo), menuId: menuCargo(cargo), intent: p.intent,
      filters: filtros({ cargo, estadoUf: p.uf, partido: p.partido, genero: p.genero ?? null, resetar: true }),
      directAnswer: texto, suggestedQuestions: this.sugestoesLista(cargo, p.uf), fonte: this.fonte, origem: this.origem
    });
  }

  // ------------------------------------------------------------------ localizar candidato (nome ou número)

  /** Candidatos citados pela pergunta: por nome (dicionário dos dados) ou pelo número de urna. */
  localizar(p) {
    if (p.nome != null) {
      const achados = this.gaz.buscarPorNome(p.nome, p.vice ? null : (p.cargo ?? null), p.uf ?? null);
      if (achados.length > 0) return achados;
      return p.cargo != null || p.uf != null ? this.gaz.buscarPorNome(p.nome) : [];
    }
    if (p.numero != null) {
      return this.porNumero(p.numero, p.uf ?? (p.nacional ? null : this.ufPadrao))
        .filter((c) => p.cargo == null || ModeloCargo.mesmaFamilia(p.cargo, c.cargoCodigo));
    }
    return [];
  }

  /** Um único candidato quando a correspondência é inequívoca (nome de urna exato ou majoritário com nome único). */
  escolher(achados, termo) {
    if (achados.length === 1) return achados[0];
    if (achados.length === 0) return null;
    const alvo = termo != null ? normalizar(termo) : null;
    const exatos = achados.filter((c) => normalizar(c.nomeUrna) === alvo);
    if (exatos.length === 1) return exatos[0];
    const melhor = achados[0];
    const unico = achados.filter((c) => igualSemCaixa(c.nomeUrna, melhor.nomeUrna)).length === 1;
    return melhor.ehMajoritario && unico && termo != null ? melhor : null;
  }

  /** Número de urna -> cargos possíveis pelo total de dígitos (regra oficial da urna). */
  porNumero(numero, uf) {
    const cargos = { 2: ['PRESIDENTE', 'GOVERNADOR'], 3: ['SENADOR'], 4: ['DEPUTADO_FEDERAL'], 5: ['DEPUTADO_ESTADUAL', 'DEPUTADO_DISTRITAL'] }[numero.length] ?? [];
    const grupos = new Map();
    for (const c of this.data.candidatos) {
      if (c.numero !== numero || !cargos.includes(c.cargoCodigo) || !(c.estadoUf === 'BR' || uf == null || c.estadoUf === uf)) continue;
      const k = `${c.cargoCodigo}|${c.estadoUf}`;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(c);
    }
    // havendo substituição, prefere a candidatura que está na urna
    const lista = [...grupos.values()].flatMap((g) => { const u = g.filter((c) => c.naUrna); return u.length > 0 ? u : g; });
    return lista.sort((a, b) => ModeloCargo.ordem(a.cargoCodigo) - ModeloCargo.ordem(b.cargoCodigo) || cmpStr(a.estadoUf, b.estadoUf));
  }

  /** Vice (Presidente/Governador) ou suplentes (Senador) da mesma chapa, e o titular para vices/suplentes. */
  chapa(c) {
    let par;
    switch (c.cargoCodigo) {
      case 'PRESIDENTE': par = ['VICE_PRESIDENTE']; break;
      case 'VICE_PRESIDENTE': par = ['PRESIDENTE']; break;
      case 'GOVERNADOR': par = ['VICE_GOVERNADOR']; break;
      case 'VICE_GOVERNADOR': par = ['GOVERNADOR']; break;
      case 'SENADOR': par = ['SUPLENTE_1', 'SUPLENTE_2']; break;
      case 'SUPLENTE_1': case 'SUPLENTE_2': par = ['SENADOR', 'SUPLENTE_1', 'SUPLENTE_2'].filter((x) => x !== c.cargoCodigo); break;
      default: return [];
    }
    const grupos = new Map();
    for (const x of this.data.candidatos) {
      if (x.id === c.id || x.numero !== c.numero || x.estadoUf !== c.estadoUf || !par.includes(x.cargoCodigo)) continue;
      if (!grupos.has(x.cargoCodigo)) grupos.set(x.cargoCodigo, []);
      grupos.get(x.cargoCodigo).push(x);
    }
    return [...grupos.values()].flatMap((g) => { const u = g.filter((x) => x.naUrna); return u.length > 0 ? u : g; })
      .sort((a, b) => ModeloCargo.ordem(a.cargoCodigo) - ModeloCargo.ordem(b.cargoCodigo));
  }

  naoEncontrado(p) {
    let texto;
    if (p.numero != null && p.nome == null) {
      const uf = p.uf ?? (p.nacional ? null : this.ufPadrao);
      texto = `Não encontrei candidatura com o número ${p.numero}${uf != null ? ` (${ufEm(uf)} ou nacional)` : ''} nos registros oficiais do TSE.` +
        '\nNúmeros de urna: 2 dígitos = Presidente e Governador; 3 = Senador; 4 = Deputado Federal; 5 = Deputado Estadual/Distrital.';
    } else {
      texto = `Nenhum candidato com nome semelhante a "${p.nome}" nos registros oficiais do TSE (${n(this.data.candidatos.length)} candidaturas).` +
        '\nVerifique a grafia ou pesquise por cargo, estado ou número.';
    }
    return resposta({
      targetRoute: 'candidates/todos', menuId: MENU.HOME, intent: p.intent,
      filters: filtros({ buscaTexto: p.nome ?? p.numero ?? null, resetar: true }),
      directAnswer: texto,
      suggestedQuestions: ['Quem disputa a Presidência?', `Candidatos a Governador em ${this.ufPadrao ?? 'SP'}`],
      fonte: this.fonte, origem: this.origem
    });
  }

  /** Vários candidatos possíveis: lista para o usuário escolher (ordem fixa). */
  ambiguo(p, achados) {
    const rotulo = p.nome != null ? `"${p.nome}"` : `o número ${p.numero}`;
    let texto = `Encontrei ${n(achados.length)} candidaturas com ${rotulo}:`;
    for (const c of achados.slice(0, 10)) texto += '\n' + item(c, true, true);
    if (achados.length > 10) texto += `\n…e outras ${n(achados.length - 10)}.`;
    texto += '\nInforme o cargo ou o estado para refinar.';
    const melhor = achados[0];
    return resposta({
      targetRoute: 'candidates/todos', menuId: MENU.HOME, intent: p.intent,
      filters: filtros({ buscaTexto: p.nome ?? p.numero ?? null, resetar: true }),
      directAnswer: texto, candidateIds: achados.slice(0, 12).map((c) => c.id),
      suggestedQuestions: [`Candidatos a ${melhor.cargo}${melhor.estadoUf !== 'BR' ? ` em ${melhor.estadoUf}` : ''}`, 'Quantos candidatos no total?'],
      fonte: this.fonte, origem: this.origem
    });
  }

  // ------------------------------------------------------------------ perfil

  perfil(p) {
    const achados = this.localizar(p);
    if (achados.length === 0) return this.naoEncontrado(p);
    const c = this.escolher(achados, p.nome);
    if (c == null) return this.ambiguo(p, achados);
    if (p.vice) {
      const chapa = this.chapa(c);
      if (chapa.length > 0 && ['PRESIDENTE', 'GOVERNADOR', 'SENADOR'].includes(c.cargoCodigo)) {
        let texto = `Chapa de ${c.nomeUrna} (${c.cargo}${localDe(c)}, nº ${c.numero}):`;
        for (const v of chapa) texto += `\n• ${v.cargo}: ${v.nomeUrna} (${v.partido}) — ${v.elegibilidade.rotulo.toLowerCase()}`;
        return resposta({
          targetRoute: rotaCargo(c.cargoCodigo), menuId: menuCargo(c.cargoCodigo), intent: p.intent,
          filters: filtros({ buscaTexto: c.nomeUrna, resetar: true }),
          directAnswer: texto, candidateIds: [c, ...chapa].map((x) => x.id),
          suggestedQuestions: [`${c.nomeUrna} é ficha limpa?`, `Simular voto em ${c.nomeUrna} (${c.numero})`],
          fonte: this.fonte, origem: this.origem
        });
      }
    }
    return resposta({
      targetRoute: rotaCargo(c.cargoCodigo), menuId: menuCargo(c.cargoCodigo),
      submenuId: c.estadoUf !== 'BR' ? `sub_${c.estadoUf.toLowerCase()}` : null, intent: 'PERFIL_CANDIDATO',
      filters: filtros({ buscaTexto: c.nomeUrna, resetar: true }),
      directAnswer: this.descricaoPerfil(c), candidateIds: [c, ...this.chapa(c)].map((x) => x.id),
      suggestedQuestions: [
        `Simular voto em ${c.nomeUrna} (${c.numero})`,
        `${c.nomeUrna} é ficha limpa?`,
        c.temPlanoGoverno ? `Plano de governo de ${c.nomeUrna}` : null,
        `Quem disputa ${tituloCargoDe(c.cargoCodigo)}${c.estadoUf !== 'BR' ? ` em ${c.estadoUf}` : ''}?`
      ].filter((x) => x != null),
      fonte: this.fonte, origem: this.origem
    });
  }

  descricaoPerfil(c) {
    let s = `${c.nomeUrna} — ${c.cargo}${c.estadoUf === 'BR' ? ' (nacional)' : ` ${ufPor(c.estadoUf)}`}`;
    s += `\nNúmero na urna: ${c.numero} · Partido: ${c.partido}`;
    const chapa = this.chapa(c);
    if (chapa.length > 0) {
      const rotulo = c.cargoCodigo === 'SENADOR' ? 'Suplentes' : ['PRESIDENTE', 'GOVERNADOR'].includes(c.cargoCodigo) ? 'Vice' : 'Chapa';
      s += `\n${rotulo}: ${chapa.map((x) => `${x.nomeUrna} (${x.partido})` + (rotulo === 'Chapa' ? ` – ${x.cargo}` : '')).join('; ')}`;
    }
    s += `\nNome completo: ${tituloPalavras(c.nomeCompleto)}`;
    const pessoais = [c.idade != null ? `${c.idade} anos` : null, c.ocupacao != null ? `ocupação declarada: ${c.ocupacao.toLowerCase()}` : null]
      .filter((x) => x != null);
    if (pessoais.length > 0) s += `\nPerfil: ${pessoais.join(' · ')}`;
    if (c.municipioNascimento != null) s += `\nNaturalidade: ${tituloPalavras(c.municipioNascimento)}${c.ufNascimento != null ? `/${c.ufNascimento}` : ''}`;
    s += `\nSituação no TSE: ${c.elegibilidade.rotulo} — ${c.naUrna ? 'inserida na urna' : 'NÃO está inserida na urna'}`;
    s += `\nFicha Limpa: ${fichaLimpaTexto(c)}`;
    if (c.motivosIndeferimento.length > 0) s += `\nMotivos registrados: ${c.motivosIndeferimento.join('; ')}`;
    if (c.vezesEleito > 0) {
      s += `\nHistórico: eleito ${c.vezesEleito} vez${c.vezesEleito === 1 ? '' : 'es'} em eleições anteriores`;
      if (c.eleitoMesmoCargo) s += ', inclusive para este cargo';
      s += ' (histórico do TSE)';
    }
    if (c.patrimonioDeclarado != null) s += `\nPatrimônio declarado: ${moeda(c.patrimonioDeclarado)} (${c.qtdBens ?? '?'} bens)`;
    else if (c.declaraBens === false) s += '\nPatrimônio declarado: não declarou bens';
    const k = c.contas;
    if (k && (k.receitas > 0 || k.despesasContratadas > 0)) {
      s += `\nContas de campanha (${(k.tipo ?? 'parcial').toLowerCase()}): receitas ${moeda(k.receitas)} · despesas contratadas ${moeda(k.despesasContratadas)}`;
    }
    if (c.temPlanoGoverno) {
      s += '\nPlano de governo: registrado no TSE';
      if (c.temasPlano.length > 0) s += ` (temas mais citados: ${c.temasPlano.slice(0, 5).map((t) => this.regras.temas?.[t] ?? t).join(', ')})`;
    }
    const r = c.resultado;
    if (r && (Object.keys(r.turnos).length > 0 || r.situacaoTotalizacao != null)) {
      s += `\nResultado oficial: ${r.situacaoTotalizacao ?? '—'}`;
      for (const t of Object.keys(r.turnos).map(Number).sort((a, b) => a - b)) {
        const v = r.turnos[t];
        s += `\n• ${t}º turno: ${v.votos != null ? inteiro(v.votos) : '—'} votos`;
        if (v.percentual != null) s += ` (${decimal2(v.percentual)}%)`;
      }
    }
    return s;
  }

  // ------------------------------------------------------------------ pesquisas, calendário, regras, fontes

  pesquisas(p) {
    const filtro = decrescenteTexto((this.data.pesquisas ?? []).filter((x) =>
      (p.uf == null || igualSemCaixa(x.uf ?? '', p.uf)) &&
      (p.cargo == null || (x.cargo ?? '').split(',').some((c) => ModeloCargo.mesmaFamilia(p.cargo, c.trim().toUpperCase().replace(/ /g, '_'))))),
    (x) => x.dataRegistro ?? '');
    const qtd = filtro.length;
    let texto = `O TSE tem ${n(qtd)} pesquisa${plural(qtd)} eleitora${qtd === 1 ? 'l' : 'is'} registrada${plural(qtd)}`;
    if (p.uf != null) texto += ` ${ufEm(p.uf)}`;
    if (p.cargo != null) texto += ` (${tituloCargo(p.cargo)})`;
    texto += '.';
    const primeira = filtro[0];
    if (primeira) {
      texto += `\nRegistro mais recente: ${primeira.empresa ?? 'empresa não informada'}`;
      const det = [
        primeira.dataRegistro != null ? `registrada em ${dataCurta(primeira.dataRegistro)}` : null,
        primeira.dataDivulgacao != null ? `divulgação a partir de ${dataCurta(primeira.dataDivulgacao)}` : null,
        primeira.entrevistados != null ? `${primeira.entrevistados} entrevistados` : null
      ].filter((x) => x != null);
      if (det.length > 0) texto += ` (${det.join('; ')})`;
    }
    const inst = [...new Set(filtro.map((x) => x.empresa).filter((e) => e != null))].slice(0, 6);
    if (inst.length > 0) texto += `\nInstitutos com registros recentes: ${inst.join(', ')}`;
    texto += '\nAtenção: o registro no TSE não traz os resultados da pesquisa; consulte o relatório divulgado pelo instituto.';
    return resposta({
      targetRoute: 'info/pesquisas', menuId: MENU.PESQUISAS, intent: p.intent,
      filters: filtros({ estadoUf: p.uf, cargo: p.cargo }), directAnswer: texto,
      suggestedQuestions: ['Quem disputa a Presidência?', 'Calendário eleitoral 2026'], fonte: this.fonte, origem: this.origem
    });
  }

  calendario() {
    const { turno1, turno2, horarioVotacao } = this.regras;
    const d1 = dataBr(turno1);
    const d2 = dataBr(turno2);
    const dias1 = diasEntre(this.hoje, turno1);
    let situacao;
    switch (this.fase.id) {
      case 'PRE_ELEICAO': situacao = `O 1º turno será em ${d1} (${dias1 === 1 ? 'amanhã' : `daqui a ${dias1} dias`}).`; break;
      case 'DIA_1T': situacao = `Hoje é o 1º turno (${d1}).`; break;
      case 'ENTRE_TURNOS': situacao = `O 1º turno foi em ${d1}; o 2º turno, onde houver, será em ${d2}.`; break;
      case 'DIA_2T': situacao = `Hoje é o 2º turno (${d2}).`; break;
      default: situacao = `As votações ocorreram em ${d1} (1º turno) e ${d2} (2º turno).`;
    }
    const texto = `${situacao}\n` +
      `1º turno: ${d1}\n` +
      `2º turno: ${d2} — só onde houver (Presidente e Governador)\n` +
      `Horário de votação: ${horarioVotacao}\n` +
      'Posse: Presidente em 05/01/2027; Governadores em 06/01/2027 (EC 111/2021)\n' +
      `Demais prazos (prestação de contas, diplomação etc.): calendário oficial do TSE — ${URL_CALENDARIO_TSE}`;
    return resposta({
      targetRoute: 'info/calendario', menuId: MENU.CALENDARIO, intent: 'CALENDARIO', directAnswer: texto,
      suggestedQuestions: ['Onde consultar meu local de votação?', 'Quem disputa a Presidência?'],
      fonte: this.fonte, origem: this.origem
    });
  }

  localVotacao() {
    return resposta({
      targetRoute: 'info/locais', menuId: MENU.LOCAIS_VOTACAO, intent: 'LOCAL_VOTACAO',
      directAnswer: 'Onde votar e situação do título (sistemas oficiais):\n' +
        `• Local de votação e título: Autoatendimento do Eleitor (${URL_AUTOATENDIMENTO_ELEITOR}) ou app e-Título\n` +
        '• Justificar a ausência: app e-Título ou sistema Justifica\n' +
        '• No dia: leve documento oficial com foto (o e-Título com foto também vale)\n' +
        'O app não consulta dados pessoais do eleitor.',
      suggestedQuestions: ['Calendário eleitoral 2026', 'Ordem de votação na urna'], fonte: this.fonte, origem: this.origem
    });
  }

  etapasUrna() {
    return [...(this.regras.ordemVotacaoUrna ?? [])].sort((a, b) => a.ordem - b.ordem);
  }

  regrasUrna(p) {
    const t = normalizar(p?.textoOriginal ?? '');
    const condutaOuVestimenta = /chinel|sandali|bermud|short|regat|roupa|vestiment|traje|descalc|sem camisa|biquin|sunga|maio|vestir|calcado|celular|telefon|smartphon|camera|fotograf|filmador|grava|foto|colinha|porte de arma|arma\b/.test(t) ||
      /\b(posso|pode|da pra|da para) (ir de|usar|votar de|levar|entrar com)\b/.test(t) ||
      /\bo que (posso|pode) (levar|usar|vestir)\b/.test(t);

    if (condutaOuVestimenta) {
      const texto = 'Vestimenta e conduta no dia da votação (Resolução TSE nº 23.736/2024, arts. 132 e 135):\n' +
        '• O que É PERMITIDO:\n' +
        '  - Votar de chinelo, sandália, bermuda, shorts, regata ou camiseta (não há exigência de roupa formal);\n' +
        '  - Levar "colinha" em papel com os números anotados dos seus candidatos;\n' +
        '  - Manifestação individual e silenciosa da preferência eleitoral (bandeiras, broches, dísticos, adesivos e camisetas).\n' +
        '• O que É PROIBIDO:\n' +
        '  - Celular, smartphone, máquina fotográfica ou filmadora dentro da cabine de votação (devem ser desligados e entregues aos mesários antes de votar — Lei nº 9.504/1997, art. 91-A);\n' +
        '  - Votar em trajes de banho (biquíni, maiô, sunga) ou sem camisa / nudez;\n' +
        '  - Boca de urna, aglomeração ou distribuição de material de campanha no dia da eleição;\n' +
        '  - Porte de armas no local de votação e no raio de 100 metros (salvo forças de segurança em serviço autorizado).';
      return resposta({
        targetRoute: 'urna/simulador', menuId: MENU.REGRAS_ELEITORAIS, intent: 'REGRAS_URNA',
        directAnswer: texto,
        suggestedQuestions: ['Ordem de votação na urna', 'Onde consultar meu local de votação?', 'Simular voto na urna'],
        fonte: 'Fonte: Resolução TSE nº 23.736/2024 (arts. 132 e 135) e Lei nº 9.504/1997 (art. 91-A).',
        origem: this.origem
      });
    }

    const etapas = this.etapasUrna().map((e) => `• ${e.ordem}º) ${e.cargo} — ${e.digitos} dígitos`).join('\n');
    return resposta({
      targetRoute: 'urna/simulador', menuId: MENU.REGRAS_ELEITORAIS, intent: 'REGRAS_URNA',
      directAnswer: `Ordem de votação na urna eletrônica em 2026:\n${etapas}\n` +
        'Como votar: digite o número, confira foto, nome e partido e aperte CONFIRMA (CORRIGE apaga; BRANCO vota em branco).\n' +
        'O simulador do app é educativo: não é a urna oficial e não registra votos.',
      suggestedQuestions: ['Regra dos dois senadores', 'Simular voto na urna'], fonte: this.fonte, origem: this.origem
    });
  }

  regrasVoto(p) {
    const t = normalizar(p?.textoOriginal ?? '');
    const condutaOuVestimenta = /chinel|sandali|bermud|short|regat|roupa|vestiment|traje|descalc|sem camisa|biquin|sunga|maio|vestir|calcado|celular|colinha/.test(t) ||
      /\b(posso|pode|da pra|da para) (ir de|usar|votar de|levar)\b/.test(t);
    if (condutaOuVestimenta) {
      return this.regrasUrna(p);
    }
    const obrigatoriedade = /obrigat|facultativ|multa|nao votar|obrigad/.test(t);
    const brancoNulo = /nul|branco|validos|anular/.test(t) || !obrigatoriedade;
    let texto = '';
    if (brancoNulo) {
      texto += 'Voto em branco e voto nulo (regras oficiais):';
      texto += '\n• Nenhum dos dois conta como voto válido: só contam os votos dados a candidatos e, nas eleições proporcionais, às legendas (Constituição, art. 77, §2º; Lei 9.504/1997, arts. 2º e 5º).';
      texto += '\n• Na urna: para votar em branco, aperte BRANCO e CONFIRMA; voto nulo é digitar um número que não corresponde a candidato nem a partido e confirmar.';
      texto += '\n• Mesmo que a maioria vote nulo, a eleição NÃO é anulada: a anulação do Código Eleitoral (art. 224) trata de votos anulados pela Justiça Eleitoral, por exemplo por fraude, e não do voto nulo do eleitor.';
    }
    if (obrigatoriedade) {
      if (texto.length > 0) texto += '\n';
      texto += 'Quem deve votar (Constituição, art. 14, §1º):';
      texto += '\n• Obrigatório: eleitores de 18 a 70 anos.';
      texto += '\n• Facultativo: jovens de 16 e 17 anos, maiores de 70 anos e analfabetos.';
      texto += '\n• Quem não votar deve justificar no dia da eleição ou em até 60 dias após cada turno (app e-Título ou sistema Justifica); sem justificativa, há multa e restrições até a regularização.';
    }
    return resposta({
      targetRoute: 'info/regras', menuId: MENU.REGRAS_ELEITORAIS, intent: 'REGRAS_VOTO',
      directAnswer: texto, suggestedQuestions: ['Ordem de votação na urna', 'Onde consultar meu local de votação?'],
      fonte: `Fonte: Constituição Federal, Lei 9.504/1997 e Código Eleitoral; orientações do TSE (${URL_PORTAL_TSE_2026}).`,
      origem: this.origem
    });
  }

  senadoDoisVotos() {
    return resposta({
      targetRoute: 'candidates/senador', menuId: MENU.SENADOR, intent: 'SENADO_DOIS_VOTOS',
      filters: filtros({ cargo: 'SENADOR', resetar: true }),
      directAnswer: 'Em 2026 cada eleitor vota em DOIS senadores (renovação de 2/3 do Senado):\n' +
        '• 1ª vaga e 2ª vaga: 3 dígitos cada\n' +
        '• Os dois votos devem ser para candidatos diferentes: se o mesmo número for digitado nas duas vagas, o segundo voto é anulado pela urna.',
      suggestedQuestions: [`Candidatos ao Senado em ${this.ufPadrao ?? 'SP'}`, 'Ordem de votação na urna'],
      fonte: this.fonte, origem: this.origem
    });
  }

  fontes(p) {
    const tre = p.uf ? (this.data.fontes?.tres ?? []).find((t) => t.uf === p.uf) : null;
    let texto = 'Fontes oficiais:';
    for (const [nome, url] of SISTEMAS_OFICIAIS_TSE) texto += `\n• ${nome}: ${url}`;
    if (tre) texto += `\n• ${tre.tribunal}: ${tre.url}`;
    return resposta({
      targetRoute: 'info/fontes', menuId: MENU.REGRAS_ELEITORAIS, intent: 'FONTES', directAnswer: texto,
      suggestedQuestions: ['De onde vêm os dados?'], fonte: this.fonte, origem: this.origem
    });
  }

  sobreDados() {
    const m = this.data.manifest;
    const r = this.regras;
    const texto = 'Sobre os dados do app:\n' +
      `Fonte: arquivos abertos do TSE (${URL_DADOS_ABERTOS_TSE}), licença CC BY\n` +
      `Extração do TSE: ${r.extracaoTse && r.extracaoTse.trim() ? r.extracaoTse : '—'}\n` +
      `Pacote: ${m.dataVersion} (${this.data.origem})\n` +
      `Conteúdo: ${n(r.estatisticas.totalRegistros)} candidaturas · ${n(r.estatisticas.pesquisasRegistradas)} pesquisas registradas\n` +
      'O app verifica atualizações automaticamente e confere a assinatura digital dos dados.';
    return resposta({
      targetRoute: 'info/sobre', menuId: MENU.REGRAS_ELEITORAIS, intent: 'SOBRE_DADOS', directAnswer: texto,
      suggestedQuestions: ['Quem disputa a Presidência?'], fonte: this.fonte, origem: this.origem
    });
  }

  // ------------------------------------------------------------------ Ficha Limpa, plano, contas, patrimônio

  elegibilidade(p) {
    if (p.nome != null || p.numero != null) {
      const achados = this.localizar(p);
      const c = this.escolher(achados, p.nome);
      if (c != null) {
        const f = fichaLimpa(c);
        let texto = `${c.nomeUrna} (${c.cargo}${localDe(c)}, nº ${c.numero}) — Ficha Limpa e situação do registro no TSE`;
        texto += `\nFicha Limpa: ${fichaLimpaTexto(c)}`;
        texto += `\nSituação no TSE: ${c.elegibilidade.rotulo} — ${c.naUrna ? 'inserida na urna' : 'NÃO está inserida na urna'}`;
        texto += `\nO que significa: ${f.explicacao}`;
        if (c.motivosIndeferimento.length > 0) texto += `\nMotivos registrados: ${c.motivosIndeferimento.join('; ')}`;
        texto += '\nAtenção: derivado da situação oficial do registro; não é certidão e pode caber recurso. ' +
          `As certidões criminais do candidato estão no DivulgaCandContas (${URL_DIVULGA_CAND_CONTAS}).`;
        return resposta({
          targetRoute: rotaCargo(c.cargoCodigo), menuId: menuCargo(c.cargoCodigo), intent: p.intent,
          filters: filtros({ buscaTexto: c.nomeUrna, resetar: true }),
          directAnswer: texto, candidateIds: [c.id],
          suggestedQuestions: [`Quem é ${c.nomeUrna}?`, `Ficha Limpa dos candidatos a ${tituloCargo(c.cargoCodigo)}${c.estadoUf !== 'BR' ? ` em ${c.estadoUf}` : ''}`],
          fonte: this.fonte, origem: this.origem
        });
      }
      if (achados.length > 1) return this.ambiguo(p, achados);
    }
    // Visão geral no escopo pedido (cargo/UF/partido/gênero)
    const escopo = this.data.candidatos.filter((c) =>
      (p.cargo == null || c.cargoCodigo === p.cargo) && (p.uf == null || c.estadoUf === p.uf) &&
      (p.partido == null || igualSemCaixa(c.partido, p.partido)) && (p.genero == null || igualSemCaixa(c.genero ?? '', p.genero)));
    const porStatus = contarPor(escopo, (c) => fichaLimpa(c));
    const t0 = this.montarTitulo(p.cargo ?? null, { ...p, historico: null });
    const titulo = t0 === 'em todos os cargos' ? 'todas as candidaturas' : `candidaturas ${t0}`;
    const negativos = escopo.filter((c) => c.elegibilidade.indeferida)
      .sort((a, b) => ModeloCargo.ordem(a.cargoCodigo) - ModeloCargo.ordem(b.cargoCodigo) || cmpStr(a.estadoUf, b.estadoUf) ||
        ordemNumero(a.numero) - ordemNumero(b.numero));
    let texto = `Ficha Limpa — ${titulo} (situação oficial do registro no TSE):`;
    texto += `\n• Sem impedimento reconhecido (registro deferido): ${n(porStatus.get(FICHA_LIMPA.SEM_IMPEDIMENTO) ?? 0)}`;
    for (const [st, rot] of [
      [FICHA_LIMPA.INELEGIVEL_FICHA_LIMPA, 'Inelegibilidade reconhecida (LC 64/90 / Ficha Limpa)'],
      [FICHA_LIMPA.INELEGIVEL_CONSTITUCIONAL, 'Inelegibilidade constitucional'],
      [FICHA_LIMPA.INDEFERIDA_OUTRO_MOTIVO, 'Registro indeferido por outros motivos'],
      [FICHA_LIMPA.INDEFERIDA_SEM_MOTIVO, 'Registro indeferido (motivo não detalhado)'],
      [FICHA_LIMPA.AGUARDANDO, 'Aguardando julgamento'],
      [FICHA_LIMPA.FORA_DA_DISPUTA, 'Fora da disputa (renúncia, cancelamento etc.)']
    ]) {
      const qtd = porStatus.get(st) ?? 0;
      if (qtd > 0) texto += `\n• ${rot}: ${n(qtd)}`;
    }
    if (p.apenasIndeferidas === true) {
      if (negativos.length === 0) {
        texto += '\nNenhum registro indeferido neste recorte.';
      } else if (negativos.length <= 20) {
        texto += '\nRegistros indeferidos:';
        for (const c of negativos) {
          texto += `\n• ${c.numero} — ${c.nomeUrna} (${c.partido})${p.uf == null && c.estadoUf !== 'BR' ? ` · ${c.estadoUf}` : ''}: ${fichaLimpa(c).curto}`;
          if (c.motivosIndeferimento.length > 0) texto += ` — ${c.motivosIndeferimento[0]}`;
        }
      } else {
        texto += `\nOs ${n(negativos.length)} registros indeferidos estão nos cartões abaixo. Motivos mais frequentes:`;
        const motivos = decrescente([...contarPor(negativos.flatMap((c) => c.motivosIndeferimento), (m) => m)], (e) => e[1]).slice(0, 5);
        for (const [m, qtd] of motivos) texto += `\n• ${m}: ${n(qtd)}`;
      }
    }
    texto += '\nComo funciona: a Lei da Ficha Limpa (LC 135/2010) é aplicada pela Justiça Eleitoral no julgamento do registro de cada candidatura. ' +
      '"Sem impedimento" significa registro deferido; ainda pode caber recurso. O app NÃO emite certidão: mostra a situação oficial e os motivos registrados.';
    if (/o que (e|eh|significa|quer dizer)|significad|como funciona|explica/.test(normalizar(p.textoOriginal ?? ''))) {
      texto += '\nO que significa cada situação:';
      texto += '\n• Deferido: registro aprovado pela Justiça Eleitoral.';
      texto += '\n• Deferido com recurso: aprovado, mas ainda há recurso pendente ou prazo para recorrer.';
      texto += '\n• Indeferido: registro negado. Com recurso pendente, o candidato pode continuar na urna (sub judice) até a decisão final (Lei 9.504/1997, art. 16-A).';
      texto += '\n• Renúncia, cancelamento ou falecimento: candidatura fora da disputa.';
    }
    const indeferidas = p.apenasIndeferidas === true;
    const uf = p.uf ?? this.ufPadrao;
    return resposta({
      targetRoute: rotaCargo(p.cargo), menuId: menuCargo(p.cargo), submenuId: p.uf ? `sub_${p.uf.toLowerCase()}` : null,
      intent: p.intent, directAnswer: texto,
      filters: filtros({
        cargo: p.cargo ?? null, estadoUf: p.uf ?? null, partido: p.partido ?? null, resetar: true,
        apenasDeferidas: indeferidas ? null : true, apenasIndeferidas: indeferidas ? true : null
      }),
      candidateIds: indeferidas ? negativos.slice(0, 12).map((c) => c.id) : [],
      suggestedQuestions: [
        `Candidatos inelegíveis${p.cargo != null ? ` a ${tituloCargo(p.cargo)}` : ''}${uf != null ? ` em ${uf}` : ''}`,
        'Quem disputa a Presidência?'
      ],
      fonte: this.fonte, origem: this.origem
    });
  }

  planoGoverno(p) {
    const achados = this.localizar(p);
    const c = this.escolher(achados, p.nome);
    if (c == null && achados.length > 1) return this.ambiguo(p, achados);
    let texto;
    if (c != null) {
      texto = `${c.nomeUrna} (${c.cargo}${localDe(c)}, nº ${c.numero}) — plano de governo`;
      if (c.temPlanoGoverno) {
        texto += '\nPlano de governo: registrado no TSE';
        if (c.temasPlano.length > 0) {
          texto += '\nTemas mais citados (detecção automática por palavras-chave):';
          for (const t of c.temasPlano) texto += `\n• ${this.regras.temas?.[t] ?? t}`;
        }
        texto += `\nO documento completo, com as propostas, está no DivulgaCandContas (${URL_DIVULGA_CAND_CONTAS}).`;
      } else {
        texto += '\nNão há plano de governo registrado nos dados do TSE para esta candidatura. O plano é exigido de candidatos a Presidente e a Governador (Lei 9.504/1997, art. 11, §1º, IX).';
      }
    } else {
      texto = 'Planos de governo registrados no TSE:\n' +
        '• Exigidos de candidatos a Presidente e a Governador (Lei 9.504/1997, art. 11, §1º, IX)\n' +
        `• ${n(this.regras.estatisticas.candidatosComPlanoGoverno)} candidaturas com plano registrado\n` +
        'Pergunte, por exemplo, "Plano de governo de Fulano" ou "Candidatos a governador que citam saúde no plano".';
    }
    return resposta({
      targetRoute: rotaCargo(c?.cargoCodigo), menuId: menuCargo(c?.cargoCodigo), intent: 'PLANO_GOVERNO',
      filters: c != null ? filtros({ buscaTexto: c.nomeUrna, resetar: true }) : filtros(),
      directAnswer: texto, candidateIds: c != null ? [c.id] : [],
      suggestedQuestions: [`Candidatos a Governador em ${this.ufPadrao ?? 'SP'} que citam saúde no plano`, 'Quem disputa a Presidência?'],
      fonte: this.fonte, origem: this.origem
    });
  }

  contasCampanha(p) {
    const achados = this.localizar(p);
    const c = this.escolher(achados, p.nome);
    if (c == null && achados.length > 1) return this.ambiguo(p, achados);
    let texto;
    if (c != null) {
      texto = `${c.nomeUrna} (${c.cargo}${localDe(c)}, nº ${c.numero}) — prestação de contas da campanha`;
      const k = c.contas;
      if (k == null || (k.receitas === 0 && k.despesasContratadas === 0)) {
        texto += '\nAinda não há valores de prestação de contas publicados pelo TSE para esta candidatura.';
      } else {
        texto += `\nReceitas declaradas: ${moeda(k.receitas)}`;
        texto += `\nDespesas contratadas: ${moeda(k.despesasContratadas)}`;
        texto += `\nTipo de prestação: ${(k.tipo ?? 'parcial').toLowerCase()}${k.geradoEm != null ? ` (gerado pelo TSE em ${k.geradoEm})` : ''}`;
        texto += `\nValores podem mudar até a prestação final. Doadores, fornecedores e documentos: DivulgaCandContas (${URL_DIVULGA_CAND_CONTAS}).`;
      }
    } else {
      texto = 'Prestação de contas das campanhas (TSE):\n' +
        '• O app mostra receitas e despesas contratadas declaradas por candidatura (prestação parcial até a final)\n' +
        `• Doadores, fornecedores e documentos: DivulgaCandContas (${URL_DIVULGA_CAND_CONTAS})\n` +
        'Pergunte pelo nome ou número, por exemplo: "Quanto Fulano gastou na campanha?"';
    }
    return resposta({
      targetRoute: rotaCargo(c?.cargoCodigo), menuId: menuCargo(c?.cargoCodigo), intent: 'CONTAS_CAMPANHA',
      filters: c != null ? filtros({ buscaTexto: c.nomeUrna, resetar: true }) : filtros(),
      directAnswer: texto, candidateIds: c != null ? [c.id] : [],
      suggestedQuestions: [c != null ? `Patrimônio de ${c.nomeUrna}` : null, 'Quem disputa a Presidência?'].filter((x) => x != null),
      fonte: this.fonte, origem: this.origem
    });
  }

  patrimonio(p) {
    const achados = this.localizar(p);
    const c = this.escolher(achados, p.nome);
    if (c != null) {
      const v = c.patrimonioDeclarado;
      const texto = `${c.nomeUrna} (${c.cargo}${localDe(c)}, nº ${c.numero}) — bens declarados ao TSE\n` + (
        v != null ? `Patrimônio declarado: ${moeda(v)} (${c.qtdBens ?? '?'} bens)\nValor informado pelo próprio candidato no registro de candidatura.`
          : c.declaraBens === false ? 'O candidato informou não possuir bens a declarar.'
            : 'Não há bens declarados disponíveis nos dados do TSE para esta candidatura.');
      return resposta({
        targetRoute: rotaCargo(c.cargoCodigo), menuId: menuCargo(c.cargoCodigo), intent: p.intent,
        filters: filtros({ buscaTexto: c.nomeUrna, resetar: true }),
        directAnswer: texto, candidateIds: [c.id],
        suggestedQuestions: [`Quanto ${c.nomeUrna} gastou na campanha?`, `${c.nomeUrna} é ficha limpa?`],
        fonte: this.fonte, origem: this.origem
      });
    }
    if (achados.length > 1) return this.ambiguo(p, achados);

    // Consulta de bens/patrimônio sem nome de candidato (ex.: "dos governadores quem tem o maior valor de bens declarado")
    const cargo = p.cargo ?? null;
    const noEscopo = (cand) =>
      (cargo == null || cand.cargoCodigo === cargo) &&
      (p.uf == null || cand.estadoUf === p.uf) &&
      cand.naUrna &&
      typeof cand.patrimonioDeclarado === 'number' &&
      cand.patrimonioDeclarado > 0;
    const comBens = this.data.candidatos.filter(noEscopo);

    if (comBens.length > 0) {
      const ordenados = [...comBens].sort((a, b) => b.patrimonioDeclarado - a.patrimonioDeclarado);
      const top = ordenados[0];
      const outros = ordenados.slice(1, 5);
      const tituloEscopo = cargo != null
        ? `${tituloCargo(cargo)}${p.uf ? ` ${ufEm(p.uf)}` : ''}`
        : (p.uf ? `no ${p.uf}` : 'nas eleições 2026');

      let texto = `Patrimônio declarado ao TSE — ${tituloEscopo}:`;
      texto += `\nO maior valor declarado é de ${top.nomeUrna} (${top.partido}${top.estadoUf !== 'BR' ? `/${top.estadoUf}` : ''}): ${moeda(top.patrimonioDeclarado)} (${top.cargo}, nº ${top.numero}).`;
      if (outros.length > 0) {
        texto += '\n\nOutros maiores valores declarados no cargo:';
        for (const o of outros) {
          texto += `\n• ${o.numero} — ${o.nomeUrna} (${o.partido}${o.estadoUf !== 'BR' ? `/${o.estadoUf}` : ''}): ${moeda(o.patrimonioDeclarado)}`;
        }
      }
      texto += '\n\nValores oficiais informados pelos próprios candidatos à Justiça Eleitoral no registro de candidatura.';
      texto += '\nPergunte pelo nome (ex.: "Qual o patrimônio declarado de Fulano?") para ver os dados individuais.';
      return resposta({
        targetRoute: rotaCargo(cargo), menuId: menuCargo(cargo), intent: p.intent,
        filters: filtros({ cargo, estadoUf: p.uf, resetar: true }),
        directAnswer: texto,
        candidateIds: ordenados.slice(0, 10).map((cand) => cand.id),
        suggestedQuestions: [
          cargo != null ? `Candidatos a ${tituloCargo(cargo)}` : 'Quem disputa a Presidência?',
          `Quanto ${top.nomeUrna} gastou na campanha?`
        ],
        fonte: this.fonte, origem: this.origem
      });
    }

    return resposta({
      targetRoute: 'candidates/todos', menuId: MENU.HOME, intent: p.intent,
      directAnswer: 'Patrimônio declarado ao TSE:\n' +
        '• É o total de bens que cada candidato informou no registro de candidatura\n' +
        '• Divulgado oficialmente pelo TSE no DivulgaCandContas\n' +
        'Pergunte pelo nome (ex.: "Qual o patrimônio declarado de Fulano?") ou por cargo (ex.: "Patrimônio dos governadores").',
      suggestedQuestions: ['Quem disputa a Presidência?'], fonte: this.fonte, origem: this.origem
    });
  }

  // ------------------------------------------------------------------ resultados

  async resultados(p) {
    const cargo = p.cargo ?? null;
    const abrir = filtros({ cargo, estadoUf: p.uf, resetar: true });
    if (!this.fase.mostraResultados) {
      return resposta({
        targetRoute: 'info/resultados', menuId: MENU.RESULTADOS, intent: p.intent, filters: abrir,
        directAnswer: 'A votação ainda não ocorreu.\n' +
          `1º turno: ${dataBr(this.regras.turno1)}, das 8h às 17h (Brasília)\n` +
          `Os resultados oficiais são divulgados pelo TSE em ${URL_RESULTADOS_TSE} e aparecerão aqui durante a apuração.`,
        suggestedQuestions: ['Calendário eleitoral 2026', 'Quem disputa a Presidência?'], fonte: this.fonte, origem: this.origem
      });
    }
    if (cargo == null || !['PRESIDENTE', 'GOVERNADOR', 'SENADOR'].includes(cargo)) {
      return resposta({
        targetRoute: 'info/resultados', menuId: MENU.RESULTADOS, intent: p.intent, filters: abrir, abrirResultados: true,
        directAnswer: 'De qual cargo você quer ver os resultados?\n' +
          '• Presidente, Governador e Senador: apuração aqui no app (informe o estado para Governador e Senador)\n' +
          `• Deputados: resultados oficiais completos em ${URL_RESULTADOS_TSE}`,
        suggestedQuestions: ['Resultado para Presidente', `Resultado para Governador em ${this.ufPadrao ?? 'SP'}`, `Resultado para Senador em ${this.ufPadrao ?? 'SP'}`],
        fonte: this.fonte, origem: this.origem
      });
    }
    const uf = cargo === 'PRESIDENTE' ? 'BR' : (p.uf ?? this.ufPadrao);
    if (uf == null) {
      return resposta({
        targetRoute: 'info/resultados', menuId: MENU.RESULTADOS, intent: p.intent, filters: abrir,
        directAnswer: `De qual estado? Informe a UF (ex.: "Resultado para ${tituloCargo(cargo)} em SP").`,
        suggestedQuestions: [`Resultado para ${tituloCargo(cargo)} em SP`], fonte: this.fonte, origem: this.origem
      });
    }
    const turno = p.turno ?? (['ENTRE_TURNOS', 'DIA_2T', 'POS_ELEICAO'].includes(this.fase.id) ? 2 : 1);
    let ap = await this.obterApuracao(cargo, uf, turno);
    if (!ap && turno === 2) ap = await this.obterApuracao(cargo, uf, 1);
    return ap && apTemVotos(ap) ? this.respostaApuracao(p, ap, abrir) : this.respostaResultadosCsv(p, cargo, uf, turno, abrir);
  }

  async obterApuracao(cargo, uf, turno) {
    try { return (await this.apuracao?.obter(cargo, uf, turno)) ?? null; } catch { return null; }
  }

  respostaApuracao(p, ap, fi) {
    const ordenadas = decrescente(ap.linhas, (l) => l.votos);
    const max = ap.cargo === 'PRESIDENTE' || ap.linhas.length <= 12 ? ordenadas.length : 10;
    const andamento = ap.totalizacaoFinal ? 'Totalização final.'
      : 'Apuração em andamento' + (ap.secoesTotalizadasPct != null ? ` (${ap.secoesTotalizadasPct}% das seções totalizadas)` : '') + '.';
    let texto = `${tituloCargo(ap.cargo)}${ap.uf !== 'BR' ? ` — ${ap.uf}` : ''}, ${ap.turno}º turno. ${andamento}`;
    for (const l of ordenadas.slice(0, max)) {
      texto += `\n• ${l.numero} — ${l.nome} (${l.partido}): ${inteiro(l.votos)} votos`;
      if (l.percentual != null) texto += ` (${l.percentual}%)`;
      if (l.eleito) texto += ' — ELEITO';
    }
    if (ordenadas.length > max) texto += `\n…e outros ${ordenadas.length - max}.`;
    texto += `\nDados divulgados pelo TSE em ${ap.geradoEm}; números exibidos como publicados (${URL_RESULTADOS_TSE}).`;
    return resposta({
      targetRoute: 'info/resultados', menuId: MENU.RESULTADOS, intent: p.intent, filters: fi, directAnswer: texto,
      abrirResultados: true, apuracao: ap,
      candidateIds: ordenadas.slice(0, 6).map((l) => l.sqCandidato).filter((id) => id != null && this.data.porId.has(id)),
      suggestedQuestions: [`Quem foi eleito Governador em ${ap.uf !== 'BR' ? ap.uf : (this.ufPadrao ?? 'SP')}?`, 'Candidatos ao segundo turno'],
      fonte: 'Fonte: TSE – resultados.tse.jus.br (ao vivo), consultado agora.', origem: this.origem
    });
  }

  respostaResultadosCsv(p, cargo, uf, turno, fi) {
    const daqui = this.data.candidatos.filter((c) => c.cargoCodigo === cargo && c.estadoUf === uf && c.resultado != null);
    const eleitos = daqui.filter((c) => resultadoEleito(c.resultado));
    const onde = uf !== 'BR' ? ` ${ufEm(uf)}` : '';
    let texto;
    if (eleitos.length > 0) {
      texto = `Eleito${eleitos.length > 1 ? 's' : ''} para ${tituloCargo(cargo)}${onde} segundo o TSE:` +
        eleitos.map((c) => `\n• ${c.numero} — ${c.nomeUrna} (${c.partido})`).join('');
    } else if (daqui.length > 0) {
      texto = `O TSE já publicou a situação de totalização, mas ainda não há eleito definido para ${tituloCargo(cargo)}${onde}:` +
        daqui.filter((c) => c.resultado?.situacaoTotalizacao != null).slice(0, 6)
          .map((c) => `\n• ${c.nomeUrna}: ${c.resultado.situacaoTotalizacao}`).join('');
    } else {
      texto = `Ainda não há resultado oficial publicado para ${tituloCargo(cargo)}${onde} (${turno}º turno).\n` +
        `A apuração do TSE é divulgada em ${URL_RESULTADOS_TSE}; assim que estiver disponível, aparece aqui.`;
    }
    return resposta({
      targetRoute: 'info/resultados', menuId: MENU.RESULTADOS, intent: p.intent, filters: fi, abrirResultados: true,
      directAnswer: texto, candidateIds: eleitos.slice(0, 6).map((c) => c.id),
      suggestedQuestions: ['Calendário eleitoral 2026', 'Quem disputa a Presidência?'], fonte: this.fonte, origem: this.origem
    });
  }

  async segundoTurno(p) {
    if (this.fase === FASES.PRE_ELEICAO || this.fase === FASES.DIA_1T) {
      return resposta({
        targetRoute: 'info/calendario', menuId: MENU.CALENDARIO, intent: p.intent,
        directAnswer: `Segundo turno: ${dataBr(this.regras.turno2)}\n` +
          '• Só para Presidente e Governador, quando nenhum candidato alcança mais de 50% dos votos válidos no 1º turno\n' +
          `• Os candidatos do 2º turno só são conhecidos após a apuração de ${dataBr(this.regras.turno1)}`,
        suggestedQuestions: ['Calendário eleitoral 2026'], fonte: this.fonte, origem: this.origem
      });
    }
    const r = await this.resultados({ ...p, intent: 'RESULTADOS', turno: p.turno ?? 1 });
    return { ...r, intent: 'SEGUNDO_TURNO' };
  }

  // ------------------------------------------------------------------ simulador, ajuda, recomendação, desconhecida

  simulador(p) {
    const c = p.nome != null || p.numero != null ? this.escolher(this.localizar(p), p.nome) : null;
    const etapas = this.etapasUrna().map((e) => `${e.cargo} (${e.digitos})`).join(' → ');
    return resposta({
      targetRoute: 'urna/simulador', menuId: MENU.HOME, intent: 'SIMULADOR', abrirSimulador: true,
      directAnswer: `Abrindo o simulador educativo da urna${c != null ? ` com ${c.nomeUrna} (${c.numero})` : ''}.\n` +
        `Ordem na urna: ${etapas}\n` +
        'O simulador não é a urna oficial e não registra votos.',
      candidateIds: c != null ? [c.id] : [],
      suggestedQuestions: ['Ordem de votação na urna', 'Regra dos dois senadores'], fonte: this.fonte, origem: this.origem
    });
  }

  ajuda(p) {
    const agradecimento = /obrigad|valeu|vlw|brigad/.test(normalizar(p.textoOriginal ?? ''));
    const uf = this.ufPadrao ?? 'SP';
    const texto = (agradecimento ? 'De nada! Quando quiser, é só perguntar.\n'
      : 'Olá! Sou o assistente do SaibaTudo Eleições 2026 e respondo só com dados oficiais do TSE.\n') +
      'Você pode perguntar, por exemplo:\n' +
      `• "Candidatos a governador em ${uf}"\n` +
      '• "Quem é o 13?" ou "Quem é Tarcísio?"\n' +
      '• "Lula é ficha limpa?"\n' +
      '• "Patrimônio do Haddad" · "Plano de governo do Lula"\n' +
      '• "Quando é a eleição?" · "Voto nulo anula a eleição?"\n' +
      '• "Simular voto na urna"\n' +
      'Não recomendo nem comparo candidatos: a decisão do voto é sua.';
    return resposta({
      targetRoute: 'menu/home', menuId: MENU.HOME, intent: 'AJUDA', directAnswer: texto,
      suggestedQuestions: ['Quem disputa a Presidência?', `Candidatos a Governador em ${uf}`, 'Simular voto na urna'],
      fonte: this.fonte, origem: this.origem
    });
  }

  recomendacao() {
    return resposta({
      targetRoute: 'menu/home', menuId: MENU.HOME, intent: 'RECOMENDACAO', origem: 'AVISO',
      directAnswer: 'Não indico, recomendo, comparo nem prevejo candidatos: a decisão do voto é sua.\n' +
        'Com dados oficiais do TSE, posso mostrar:\n' +
        '• quem disputa cada cargo e o número na urna\n' +
        '• perfil, Ficha Limpa e situação da candidatura\n' +
        '• bens declarados, contas de campanha e plano de governo registrado\n' +
        '• pesquisas registradas e resultados oficiais',
      suggestedQuestions: ['Quem disputa a Presidência?', `Candidatos a Governador em ${this.ufPadrao ?? 'SP'}`, 'Pesquisas registradas'],
      fonte: this.fonte
    });
  }

  desconhecida(p) {
    const txt = p.textoOriginal ?? '';
    const uf = this.ufPadrao ?? 'SP';
    return resposta({
      targetRoute: 'menu/home', menuId: MENU.HOME, intent: 'DESCONHECIDA', resolvida: false, origem: this.origem,
      filters: filtros({ buscaTexto: txt.length >= 3 && txt.length <= 60 ? txt : null, resetar: true }),
      directAnswer: 'Não entendi bem a pergunta.\n' +
        'Experimente citar um cargo, um estado, um partido, o nome ou o número de um candidato:\n' +
        `• "Candidatos a governador em ${uf}"\n` +
        '• "Quem é o 13?"\n' +
        '• "Lula é ficha limpa?"\n' +
        `Há ${n(this.regras.estatisticas.totalNaUrna)} candidaturas na urna nos dados oficiais do TSE.`,
      suggestedQuestions: ['Quem disputa a Presidência?', `Candidatos a Governador em ${uf}`, 'Quantos candidatos foram registrados?', 'Calendário eleitoral 2026'],
      fonte: this.fonte
    });
  }

  // ------------------------------------------------------------------ helpers

  montarTitulo(cargo, p) {
    let s = cargo != null ? `a ${tituloCargo(cargo)}` : 'em todos os cargos';
    if (p.vice) s += ' (com respectivos vices/suplentes da chapa)';
    if (p.partido != null) s += ` do partido ${p.partido}`;
    if (p.uf != null) s += ` ${ufEm(p.uf)}`;
    if (p.genero != null) s += p.genero === 'FEMININO' ? ' (mulheres)' : ' (homens)';
    if (p.historico != null && p.historico !== 'TODOS') s += ` (${HISTORICO[p.historico].toLowerCase()})`;
    return s;
  }

  sugestoesLista(cargo, uf) {
    return [
      `Quantos candidatos ${cargo != null ? `a ${tituloCargo(cargo)}` : 'no total'}${uf != null ? ` em ${uf}` : ''}?`,
      cargo != null ? `Ficha Limpa dos candidatos a ${tituloCargo(cargo)}${uf != null ? ` em ${uf}` : ''}` : null,
      'Simular voto na urna',
      `Pesquisas registradas${uf != null ? ` em ${uf}` : ''}`
    ].filter((x) => x != null);
  }
}

/** Ordenação estável decrescente por texto (sortedByDescending { it.orEmpty() }). */
function decrescenteTexto(lista, chave) {
  return lista.map((x, i) => ({ x, i, k: chave(x) })).sort((a, b) => cmpStr(b.k, a.k) || a.i - b.i).map((e) => e.x);
}

export const apTemVotos = (ap) => ap.linhas.some((l) => l.votos > 0);
