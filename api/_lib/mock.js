// Modelo FALSO para testes locais (MOCK_NLU=1, desativado em produção — ver config.js).
// Gera saída no formato LEGADO do modelo real, para exercitar toda a cadeia (normalização, cache, limites)
// sem Modal. NÃO é um NLU de verdade.

import { fold, ufsMencionadas } from './ground.js';

const CARGOS_MOCK = [
  [/\bvice[ -]?president/, 'VICE_PRESIDENTE'],
  [/\bpresident|\bplanalto/, 'PRESIDENTE'],
  [/\bgovern/, 'GOVERNADOR'],
  [/\bsenad/, 'SENADOR'],
  [/\bdeput\w* federa|\bfederais/, 'DEPUTADO_FEDERAL'],
  [/\bdeput\w* estadua|\bestaduais/, 'DEPUTADO_ESTADUAL'],
  [/\bdeput\w* distrita|\bdistritais/, 'DEPUTADO_DISTRITAL'],
];

export function mockModelOutput(q) {
  const t = fold(q);
  const cargo = CARGOS_MOCK.find(([rx]) => rx.test(t))?.[1] ?? null;
  const uf = [...ufsMencionadas(q)][0] ?? null;
  const filtros = {
    cargo, digitos_urna: null, estado_uf: uf, regiao: null, partido: null, tema: null,
    nome_candidato: null, apenas_ficha_limpa: /ficha limpa/.test(t) ? true : null,
    max_processos_administrativos: null, mandatos_anteriores: null,
  };
  let intent = 'NAVIGATE_MENU';
  let rota = 'candidates/todos';
  const nome = /\bquem e ([a-z ]{3,40})$/.exec(t.replace(/[?!.]+$/, '').trim());
  if (/\bquando\b|\bcalendario\b/.test(t)) {
    intent = 'CALENDAR_QUERY';
    rota = 'info/calendario';
  } else if (/\bonde (eu )?voto\b/.test(t)) {
    intent = 'VOTING_LOCATION_QUERY';
    rota = 'info/locais';
  } else if (nome) {
    intent = 'CANDIDATE_LOOKUP';
    filtros.nome_candidato = nome[1].trim().toUpperCase();
  } else if (cargo || uf) {
    intent = 'FILTER_CANDIDATES';
  }
  return {
    intent,
    target_route: rota,
    menu_id: 'menu_home',
    submenu_id: null,
    filters: filtros,
    direct_answer: '(mock)',
    suggested_questions: [],
  };
}
