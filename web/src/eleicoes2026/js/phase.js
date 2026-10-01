// Fase do calendário eleitoral e utilidades de data (porte de Fase.kt e MenuFactory.kt).
import { MENU, TSE_CARGOS } from './model.js';

export const FASES = {
  PRE_ELEICAO: { id: 'PRE_ELEICAO', rotulo: 'Pré-eleição', mostraResultados: false },
  DIA_1T: { id: 'DIA_1T', rotulo: 'Dia da votação (1º turno)', mostraResultados: true },
  ENTRE_TURNOS: { id: 'ENTRE_TURNOS', rotulo: 'Entre os turnos', mostraResultados: true },
  DIA_2T: { id: 'DIA_2T', rotulo: 'Dia da votação (2º turno)', mostraResultados: true },
  POS_ELEICAO: { id: 'POS_ELEICAO', rotulo: 'Pós-eleição', mostraResultados: true }
};

/** Datas em ISO (yyyy-MM-dd): a comparação lexicográfica equivale à cronológica. */
export function faseDe(hoje, turno1, turno2) {
  if (hoje < turno1) return FASES.PRE_ELEICAO;
  if (hoje === turno1) return FASES.DIA_1T;
  if (hoje < turno2) return FASES.ENTRE_TURNOS;
  if (hoje === turno2) return FASES.DIA_2T;
  return FASES.POS_ELEICAO;
}

const fmtBrasilia = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
});

/** Data de hoje em Brasília (America/Sao_Paulo), em ISO yyyy-MM-dd. */
export const hojeBrasilia = (agoraMs = Date.now()) => fmtBrasilia.format(agoraMs);

const diaEpoca = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};
export const diasEntre = (deIso, ateIso) => diaEpoca(ateIso) - diaEpoca(deIso);
/** "2026-10-04" -> "04/10/2026" */
export const formatarBr = (iso) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

/** Menu principal a partir dos dados oficiais e da fase do calendário (muda após a eleição). */
export function menuPrincipal(regras, fase, hoje) {
  const st = regras.estatisticas;
  const n = (cargo) => (st.porCargoNaUrna?.[cargo] != null ? String(st.porCargoNaUrna[cargo]) : '—');
  const itens = [];
  if (fase.mostraResultados) {
    itens.push({
      id: MENU.RESULTADOS, title: 'Resultados e apuração',
      description: fase.id === 'POS_ELEICAO' ? 'Resultados oficiais e eleitos' : 'Apuração oficial do TSE',
      icon: 'trophy', route: 'info/resultados', defaultFilters: {}
    });
  }
  const dig = (cod) => TSE_CARGOS.find((c) => c.codigo === cod).digitos;
  itens.push(
    { id: MENU.PRESIDENTE, title: `Presidente (${dig('PRESIDENTE')} dígitos)`, description: `${n('PRESIDENTE')} candidaturas na urna • nacional`, icon: 'landmark', route: 'candidates/presidente', defaultFilters: { cargo: 'PRESIDENTE' } },
    { id: MENU.GOVERNADOR, title: `Governador (${dig('GOVERNADOR')} dígitos)`, description: `${n('GOVERNADOR')} candidaturas • 27 UFs`, icon: 'city', route: 'candidates/governador', defaultFilters: { cargo: 'GOVERNADOR' } },
    { id: MENU.SENADOR, title: `Senador (${dig('SENADOR')} dígitos)`, description: `${n('SENADOR')} candidaturas • 2 vagas por UF`, icon: 'scale', route: 'candidates/senador', defaultFilters: { cargo: 'SENADOR' } },
    { id: MENU.DEPUTADO_FEDERAL, title: `Deputado Federal (${dig('DEPUTADO_FEDERAL')} dígitos)`, description: `${n('DEPUTADO FEDERAL')} candidaturas • 513 vagas`, icon: 'users', route: 'candidates/deputado_federal', defaultFilters: { cargo: 'DEPUTADO_FEDERAL' } },
    {
      id: MENU.DEPUTADO_ESTADUAL, title: `Dep. Estadual/Distrital (${dig('DEPUTADO_ESTADUAL')} dígitos)`,
      description: `${(st.porCargoNaUrna?.['DEPUTADO ESTADUAL'] ?? 0) + (st.porCargoNaUrna?.['DEPUTADO DISTRITAL'] ?? 0)} candidaturas`,
      icon: 'users', route: 'candidates/deputado_estadual', defaultFilters: { cargo: 'DEPUTADO_ESTADUAL' }
    },
    { id: MENU.PESQUISAS, title: 'Pesquisas registradas', description: `${st.pesquisasRegistradas} registros no TSE`, icon: 'chart', route: 'info/pesquisas', defaultFilters: {} },
    { id: MENU.CALENDARIO, title: 'Calendário e prazos', description: calendarioResumo(regras, fase), icon: 'calendar', route: 'info/calendario', defaultFilters: {} }
  );
  return itens;
}

function calendarioResumo(r, fase) {
  switch (fase.id) {
    case 'PRE_ELEICAO': return `1º turno ${formatarBr(r.turno1)} • 2º turno ${formatarBr(r.turno2)}`;
    case 'DIA_1T': return 'Hoje: 1º turno • votação 8h às 17h';
    case 'ENTRE_TURNOS': return `2º turno em ${formatarBr(r.turno2)}`;
    case 'DIA_2T': return 'Hoje: 2º turno • votação 8h às 17h';
    default: return `Eleições realizadas em ${formatarBr(r.turno1)} e ${formatarBr(r.turno2)}`;
  }
}
