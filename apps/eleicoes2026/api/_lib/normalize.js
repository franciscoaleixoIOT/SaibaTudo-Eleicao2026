// Normaliza a saída bruta do modelo (formato LEGADO ou formato novo) para o contrato do NLU
// (docs/DATA_CONTRACT.md §9):  { intent, cargo?, uf?, partido?, nome?, tema?, apenasDeferidas?, historico?, turno? }
//
// Princípios:
//  - A nuvem NUNCA fornece fatos. `direct_answer` e `suggested_questions` do modelo legado são IGNORADOS.
//  - Valores fora do vocabulário (cargo, UF, tema, historico, turno) são descartados.
//  - Com `question`, cada entidade só é mantida se houver evidência textual na pergunta (ground.js).
//  - O resultado reproduz as regras do NluValidator do app (CloudNlu.kt): PERFIL_CANDIDATO exige `nome`;
//    LISTAR_CANDIDATOS exige ao menos cargo/uf/partido/tema. O cliente ainda revalida tudo.
//  - JSON inválido/vazio => { ok:false }.

import { CARGOS, HISTORICOS, INTENT_SET, LEGACY_INTENT_SET, TEMAS, UFS } from './vocab.js';
import {
  fold,
  groundCargo,
  groundDeferidas,
  groundHistorico,
  groundNome,
  groundNumero,
  groundPartido,
  groundTema,
  groundUf,
  groundVice,
} from './ground.js';

const ORDEM_CAMPOS = ['cargo', 'uf', 'partido', 'nome', 'tema', 'apenasDeferidas', 'historico', 'turno', 'vice', 'numero'];

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Extrai o objeto JSON de um texto do modelo (tolera lixo antes/depois, como o extrair_json do treino). */
export function parseModelJson(raw) {
  if (isPlainObject(raw)) return raw;
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i === -1 || j <= i) return null;
  try {
    const v = JSON.parse(s.slice(i, j + 1));
    return isPlainObject(v) ? v : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ normalizadores de entidades

function texto(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'none') return null;
  return s;
}

export function normCargo(v) {
  const s = texto(v);
  if (!s) return null;
  const c = fold(s).toUpperCase().replace(/[\s-]+/g, '_');
  return CARGOS.has(c) ? c : null;
}

export function normUf(v) {
  const s = texto(v);
  if (!s) return null;
  const u = s.toUpperCase();
  return UFS.has(u) ? u : null;
}

export function normPartido(v) {
  const s = texto(v);
  if (!s) return null;
  const p = s.replace(/\s+/g, ' ').toUpperCase();
  return /^[\p{L}\p{N} .\-/]{2,14}$/u.test(p) ? p : null;
}

/** Devolve { id, bruto } (id do app + valor bruto sem acento, usado na ancoragem) ou null. */
export function normTema(v) {
  const s = texto(v);
  if (!s) return null;
  const bruto = fold(s).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const id = TEMAS[bruto] ?? null;
  return id ? { id, bruto } : null;
}

export function normNome(v) {
  const s = texto(v);
  if (!s) return null;
  const n = s
    .replace(/[^\p{L}\p{N} .'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (n.length < 3 || n.length > 60) return null;
  if ((n.match(/\p{L}/gu) ?? []).length < 3) return null;
  return n;
}

function historicoDeMandatos(m, reeleicao) {
  if (Number.isInteger(m) && m >= 0) {
    if (m === 0) return 'NUNCA_ELEITO';
    if (m === 1) return 'ELEITO_MESMO_CARGO';
    return 'ELEITO_2_OU_MAIS';
  }
  if (reeleicao === true) return 'ELEITO_MESMO_CARGO';
  return null;
}

function normHistorico(v) {
  const s = texto(v);
  if (!s) return null;
  const h = s.toUpperCase();
  return HISTORICOS.has(h) ? h : null;
}

function normTurno(v) {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^[12]$/.test(v.trim()) ? Number(v) : null;
  return n === 1 || n === 2 ? n : null;
}

// ------------------------------------------------------------------ extração por formato

/** Entidades do formato legado: filters{cargo, estado_uf, partido, tema, nome_candidato, apenas_ficha_limpa, mandatos_anteriores}. */
function entidadesLegado(obj) {
  const f = isPlainObject(obj.filters) ? obj.filters : {};
  const tema = normTema(f.tema);
  return {
    cargo: normCargo(f.cargo),
    uf: normUf(f.estado_uf ?? f.uf),
    partido: normPartido(f.partido),
    nome: normNome(f.nome_candidato ?? f.nome),
    tema: tema?.id ?? null,
    temaBruto: tema?.bruto ?? null,
    apenasDeferidas: f.apenas_ficha_limpa === true ? true : null,
    historico: historicoDeMandatos(f.mandatos_anteriores, f.reeleicao),
    turno: null,
    // campos do legado sem equivalente no contrato (digitos_urna, regiao, max_processos_administrativos): ignorados
    brutos: {
      cargo: texto(f.cargo), uf: texto(f.estado_uf ?? f.uf), partido: texto(f.partido),
      nome: texto(f.nome_candidato ?? f.nome), tema: texto(f.tema),
      apenasDeferidas: f.apenas_ficha_limpa === true,
      historico: Number.isInteger(f.mandatos_anteriores) || f.reeleicao === true,
    },
  };
}

/** Entidades do formato novo (no topo do objeto). */
function entidadesNovo(obj) {
  const tema = normTema(obj.tema);
  return {
    cargo: normCargo(obj.cargo),
    uf: normUf(obj.uf),
    partido: normPartido(obj.partido),
    nome: normNome(obj.nome),
    tema: tema?.id ?? null,
    temaBruto: tema?.bruto ?? null,
    apenasDeferidas: obj.apenasDeferidas === true ? true : null,
    historico: normHistorico(obj.historico),
    turno: normTurno(obj.turno),
    vice: obj.vice === true ? true : null,
    brutos: {
      cargo: texto(obj.cargo), uf: texto(obj.uf), partido: texto(obj.partido), nome: texto(obj.nome),
      tema: texto(obj.tema), apenasDeferidas: obj.apenasDeferidas === true,
      historico: texto(obj.historico) !== null, vice: obj.vice === true,
    },
  };
}

/** Descarta entidades sem evidência na pergunta. Devolve a lista de campos descartados (sem valores). */
function ancorar(ent, question, dropped) {
  const drop = (campo) => {
    ent[campo] = null;
    dropped.push(campo);
  };
  if (ent.cargo && !groundCargo(ent.cargo, question)) drop('cargo');
  if (ent.uf && !groundUf(ent.uf, question)) drop('uf');
  if (ent.partido && !groundPartido(ent.partido, question)) drop('partido');
  if (ent.nome && !groundNome(ent.nome, question)) drop('nome');
  if (ent.tema && !groundTema(ent.tema, ent.temaBruto, question)) drop('tema');
  if (ent.apenasDeferidas && !groundDeferidas(question)) drop('apenasDeferidas');
  if (ent.historico && !groundHistorico(question)) drop('historico');
  if (ent.vice && !groundVice(question)) drop('vice');
  // número de urna: sempre e só do texto da pergunta (o modelo não o emite e, se emitisse, não seria aceito)
  ent.numero = question ? groundNumero(question) : null;
  // "candidato 2222": o modelo às vezes devolve a frase com o número como se fosse nome; nome que contém o número de urna não é nome
  if (ent.numero && ent.nome && String(ent.nome).includes(ent.numero)) ent.nome = null;
  if (ent.vice == null && question && groundVice(question) && ent.cargo !== 'VICE_PRESIDENTE' && ent.cargo !== 'VICE_GOVERNADOR') {
    ent.vice = true;
  }
}

function registrarDescartadosPorVocabulario(ent, dropped) {
  const b = ent.brutos;
  if (b.cargo && !ent.cargo) dropped.push('cargo');
  if (b.uf && !ent.uf) dropped.push('uf');
  if (b.partido && !ent.partido) dropped.push('partido');
  if (b.nome && !ent.nome) dropped.push('nome');
  if (b.tema && !ent.tema) dropped.push('tema');
}

// ------------------------------------------------------------------ mapeamento de intenção (legado)

const ROTAS_INFO = {
  'info/estatisticas': 'CONTAR',
  'info/pesquisas': 'PESQUISAS',
  'info/calendario': 'CALENDARIO',
  'info/locais': 'LOCAL_VOTACAO',
};

const temEntidadeDeListagem = (e) => Boolean(e.cargo || e.uf || e.partido || e.tema);

function intencaoDeLegado(intentLegado, rota, e) {
  switch (intentLegado) {
    case 'FILTER_CANDIDATES':
      return temEntidadeDeListagem(e) ? 'LISTAR_CANDIDATOS' : 'DESCONHECIDA';
    case 'CANDIDATE_LOOKUP':
      return e.nome ? 'PERFIL_CANDIDATO' : 'DESCONHECIDA';
    case 'CALENDAR_QUERY':
      return 'CALENDARIO';
    case 'VOTING_LOCATION_QUERY':
      return 'LOCAL_VOTACAO';
    case 'NAVIGATE_MENU':
    case 'EXPLAIN_TOPIC': {
      // Sem rota informativa reconhecida: só vira listagem (NAVIGATE_MENU) se houver entidades.
      const porRota = ROTAS_INFO[fold(rota ?? '').trim()];
      if (porRota) return porRota;
      if (intentLegado === 'NAVIGATE_MENU' && temEntidadeDeListagem(e)) return 'LISTAR_CANDIDATOS';
      return 'DESCONHECIDA';
    }
    default:
      return 'DESCONHECIDA';
  }
}

/** Aplica as regras do NluValidator do app a uma intenção do contrato novo. */
function validarIntencaoNova(intent, e) {
  // "quem é o 13?": a pergunta traz um número de urna explícito e o modelo não soube o que fazer: é perfil pelo número
  if (e.numero && !e.nome && (intent === 'DESCONHECIDA' || intent === 'PERFIL_CANDIDATO')) return 'PERFIL_CANDIDATO';
  if (intent === 'PERFIL_CANDIDATO' && !e.nome) return 'DESCONHECIDA';
  if (intent === 'LISTAR_CANDIDATOS' && !temEntidadeDeListagem(e)) return 'DESCONHECIDA';
  return intent;
}

function montar(intent, e) {
  const nlu = { intent };
  if (intent === 'DESCONHECIDA' || intent === 'RECOMENDACAO') return nlu;
  const valores = {
    cargo: e.cargo, uf: e.uf, partido: e.partido, nome: e.nome, tema: e.tema,
    apenasDeferidas: e.apenasDeferidas, historico: e.historico, turno: e.turno, vice: e.vice,
    // só faz sentido no perfil pelo número; nas demais intenções o número da pergunta não é filtro
    numero: intent === 'PERFIL_CANDIDATO' && !e.nome ? e.numero : null,
  };
  for (const k of ORDEM_CAMPOS) if (valores[k] !== null && valores[k] !== undefined) nlu[k] = valores[k];
  // O contrato permite o turno derivado da própria intenção
  if (intent === 'SEGUNDO_TURNO' && nlu.turno === undefined) nlu.turno = 2;
  return nlu;
}

/**
 * @param {string|object} raw  saída do modelo (texto com JSON ou objeto já parseado)
 * @param {{question?: string}} [opts]  com `question`, as entidades são ancoradas no texto da pergunta
 * @returns {{ok:true, nlu:object, dropped:string[], format:'legacy'|'v2'|'unknown'} | {ok:false, error:string}}
 */
export function normalizeModelOutput(raw, opts = {}) {
  const obj = parseModelJson(raw);
  if (!obj) return { ok: false, error: 'invalid_json' };
  if (typeof obj.intent !== 'string' || !obj.intent.trim()) return { ok: false, error: 'invalid_shape' };

  const intentBruto = obj.intent.trim().toUpperCase();
  const question = typeof opts.question === 'string' ? opts.question : null;
  const dropped = [];

  let format;
  let ent;
  if (INTENT_SET.has(intentBruto)) {
    format = 'v2';
    ent = entidadesNovo(obj);
  } else if (LEGACY_INTENT_SET.has(intentBruto)) {
    format = 'legacy';
    ent = entidadesLegado(obj);
  } else {
    // Intenção fora do vocabulário (alucinação): nada aproveitável.
    return { ok: true, nlu: { intent: 'DESCONHECIDA' }, dropped: ['intent'], format: 'unknown' };
  }

  registrarDescartadosPorVocabulario(ent, dropped);
  if (question !== null) ancorar(ent, question, dropped);

  let intent;
  if (format === 'v2') {
    intent = validarIntencaoNova(intentBruto, ent);
  } else {
    intent = intencaoDeLegado(intentBruto, obj.target_route, ent);
  }
  return { ok: true, nlu: montar(intent, ent), dropped, format };
}
