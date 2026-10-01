// Modelo de domínio do SaibaTudo Eleições 2026 (porte fiel de DomainModels.kt / AppConstants.kt).
// Sem dependência de DOM: roda no navegador e no Node (testes).

export const APP_NAME = 'SaibaTudo Eleições 2026';
export const PERGUNTA_INICIAL_PADRAO = 'O que você deseja consultar sobre as Eleições 2026?';
export const AVISO_NEUTRALIDADE =
  'Aplicativo independente, de código aberto e apartidário. Não tem vínculo com o TSE, com o governo ' +
  'ou com partidos. Não recomenda candidatos.';
export const FONTE_DADOS = 'Tribunal Superior Eleitoral - Dados Abertos (dadosabertos.tse.jus.br)';
export const LICENCA_DADOS = 'Creative Commons Atribuição (CC BY)';

export const URL_DIVULGA_CAND_CONTAS = 'https://divulgacandcontas.tse.jus.br/divulga/#/';
export const URL_AUTOATENDIMENTO_ELEITOR = 'https://autoatendimento.tse.jus.br/';
export const URL_RESULTADOS_TSE = 'https://resultados.tse.jus.br/';
export const URL_DADOS_ABERTOS_TSE = 'https://dadosabertos.tse.jus.br/';
export const URL_PORTAL_TSE_2026 = 'https://www.tse.jus.br/eleicoes/eleicoes-2026';
export const URL_CALENDARIO_TSE = 'https://www.tse.jus.br/eleicoes/calendario-eleitoral';
export const URL_CODIGO_FONTE = 'https://github.com/franciscoaleixoIOT/SaibaTudo-Eleicao2026';
export const URL_ISSUES = URL_CODIGO_FONTE + '/issues';
export const URL_PRIVACIDADE = '/privacidade';

export const SISTEMAS_OFICIAIS_TSE = [
  ['DivulgaCandContas (candidaturas e contas)', URL_DIVULGA_CAND_CONTAS],
  ['Autoatendimento do Eleitor (título e local de votação)', URL_AUTOATENDIMENTO_ELEITOR],
  ['Resultados TSE (acompanhamento da apuração)', URL_RESULTADOS_TSE],
  ['Dados Abertos do TSE (bases oficiais)', URL_DADOS_ABERTOS_TSE],
  ['Portal Eleições 2026', URL_PORTAL_TSE_2026]
];

export const treUrl = (uf) => `https://tre-${uf.toLowerCase()}.jus.br/eleicoes`;

// IDs de menu (iguais ao app Android)
export const MENU = {
  PRESIDENTE: 'menu_presidente', GOVERNADOR: 'menu_governador', SENADOR: 'menu_senador',
  DEPUTADO_FEDERAL: 'menu_deputado_federal', DEPUTADO_ESTADUAL: 'menu_deputado_estadual',
  CALENDARIO: 'menu_calendario', PESQUISAS: 'menu_pesquisas', RESULTADOS: 'menu_resultados',
  LOCAIS_VOTACAO: 'menu_locais_votacao', REGRAS_ELEITORAIS: 'menu_regras_eleitorais', HOME: 'menu_home'
};

// ---------------------------------------------------------------------------------------------- geografia

export const MACRO_REGIOES = [
  { id: 'SUDESTE', nome: 'Sudeste', ufs: ['SP', 'RJ', 'MG', 'ES'] },
  { id: 'SUL', nome: 'Sul', ufs: ['PR', 'SC', 'RS'] },
  { id: 'NORDESTE', nome: 'Nordeste', ufs: ['BA', 'PE', 'CE', 'MA', 'PB', 'RN', 'AL', 'SE', 'PI'] },
  { id: 'CENTRO_OESTE', nome: 'Centro-Oeste', ufs: ['DF', 'GO', 'MT', 'MS'] },
  { id: 'NORTE', nome: 'Norte', ufs: ['AM', 'PA', 'AC', 'RO', 'RR', 'AP', 'TO'] }
];

/** Unidades da Federação (ordem fixa, igual ao Android). */
export const NOMES_UF = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
  ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins'
};
export const SIGLAS = Object.keys(NOMES_UF);
export const SIGLAS_SET = new Set(SIGLAS);

export const regiaoDe = (uf) => MACRO_REGIOES.find((m) => m.ufs.includes(uf))?.nome ?? null;
export const ufsDaRegiao = (nomeRegiao) => MACRO_REGIOES.find((m) => m.nome === nomeRegiao)?.ufs ?? [];

// ---------------------------------------------------------------------------------------------- cargos

/** Cargos com regras oficiais da urna (ordem de exibição dos filtros, igual ao Android). */
export const TSE_CARGOS = [
  { codigo: 'DEPUTADO_FEDERAL', titulo: 'Deputado Federal', digitos: 4, ordemUrna: 1 },
  { codigo: 'DEPUTADO_ESTADUAL', titulo: 'Dep. Estadual / Distrital', digitos: 5, ordemUrna: 2 },
  { codigo: 'SENADOR', titulo: 'Senador', digitos: 3, ordemUrna: 3 },
  { codigo: 'GOVERNADOR', titulo: 'Governador', digitos: 2, ordemUrna: 5 },
  { codigo: 'PRESIDENTE', titulo: 'Presidente da República', digitos: 2, ordemUrna: 6 }
];

export function tituloCargo(codigo) {
  switch (codigo) {
    case 'PRESIDENTE': return 'Presidente da República';
    case 'VICE_PRESIDENTE': return 'Vice-Presidente';
    case 'GOVERNADOR': return 'Governador';
    case 'VICE_GOVERNADOR': return 'Vice-Governador';
    case 'SENADOR': return 'Senador';
    case 'SUPLENTE_1': return '1º Suplente de Senador';
    case 'SUPLENTE_2': return '2º Suplente de Senador';
    case 'DEPUTADO_FEDERAL': return 'Deputado Federal';
    case 'DEPUTADO_ESTADUAL': return 'Deputado Estadual';
    case 'DEPUTADO_DISTRITAL': return 'Deputado Distrital';
    default: return primeiraMaiuscula(String(codigo).replace(/_/g, ' ').toLowerCase());
  }
}

const ORDEM_CARGOS = [
  'PRESIDENTE', 'VICE_PRESIDENTE', 'GOVERNADOR', 'VICE_GOVERNADOR', 'SENADOR', 'SUPLENTE_1', 'SUPLENTE_2',
  'DEPUTADO_FEDERAL', 'DEPUTADO_ESTADUAL', 'DEPUTADO_DISTRITAL'
];

/** Regras sobre cargos (famílias de cargos majoritários/proporcionais), igual a ModeloCargo (Kotlin). */
export const ModeloCargo = {
  ordem(codigo) {
    const i = ORDEM_CARGOS.indexOf(codigo);
    return i < 0 ? ORDEM_CARGOS.length : i;
  },
  /** Um filtro por cargo "SENADOR" inclui suplentes; "DEPUTADO_ESTADUAL" inclui distritais; etc. */
  mesmaFamilia(filtro, codigoCandidato) {
    switch (filtro) {
      case 'DEPUTADO_ESTADUAL': return codigoCandidato === 'DEPUTADO_ESTADUAL' || codigoCandidato === 'DEPUTADO_DISTRITAL';
      case 'PRESIDENTE': return codigoCandidato === 'PRESIDENTE' || codigoCandidato === 'VICE_PRESIDENTE';
      case 'GOVERNADOR': return codigoCandidato === 'GOVERNADOR' || codigoCandidato === 'VICE_GOVERNADOR';
      case 'SENADOR': return codigoCandidato === 'SENADOR' || codigoCandidato.startsWith('SUPLENTE');
      default: return codigoCandidato === filtro;
    }
  }
};

// ---------------------------------------------------------------------------------------------- elegibilidade

/**
 * Situação do julgamento do registro de candidatura (texto oficial do TSE em enumeração estável).
 * NÃO é certidão de "Ficha Limpa": o app exibe a situação oficial e os motivos de indeferimento registrados.
 */
export const ELEGIBILIDADE = {
  DEFERIDA: { name: 'DEFERIDA', rotulo: 'Candidatura deferida', apta: true },
  DEFERIDA_COM_RECURSO: { name: 'DEFERIDA_COM_RECURSO', rotulo: 'Deferida (em prazo recursal ou com recurso)', apta: true },
  INDEFERIDA: { name: 'INDEFERIDA', rotulo: 'Candidatura indeferida', apta: false },
  INDEFERIDA_COM_RECURSO: { name: 'INDEFERIDA_COM_RECURSO', rotulo: 'Indeferida (em prazo recursal ou com recurso)', apta: false },
  RENUNCIA: { name: 'RENUNCIA', rotulo: 'Renúncia', apta: false },
  FALECIDO: { name: 'FALECIDO', rotulo: 'Falecimento', apta: false },
  CANCELADA: { name: 'CANCELADA', rotulo: 'Candidatura cancelada', apta: false },
  PENDENTE: { name: 'PENDENTE', rotulo: 'Aguardando julgamento', apta: null },
  NAO_CONHECIDO: { name: 'NAO_CONHECIDO', rotulo: 'Pedido não conhecido', apta: false },
  DESCONHECIDA: { name: 'DESCONHECIDA', rotulo: 'Situação não informada', apta: null }
};
export const elegibilidadeDe = (wire) => ELEGIBILIDADE[wire] ?? ELEGIBILIDADE.DESCONHECIDA;

export const HISTORICO = {
  TODOS: 'Todos',
  NUNCA_ELEITO: 'Nunca eleito (histórico TSE)',
  ELEITO_MESMO_CARGO: 'Já eleito para este cargo',
  ELEITO_2_OU_MAIS: 'Eleito 2+ vezes'
};

// ---------------------------------------------------------------------------------------------- texto e formatação

const ACENTOS = {
  à: 'a', á: 'a', â: 'a', ã: 'a', ä: 'a', å: 'a', è: 'e', é: 'e', ê: 'e', ë: 'e', ì: 'i', í: 'i', î: 'i', ï: 'i',
  ò: 'o', ó: 'o', ô: 'o', õ: 'o', ö: 'o', ù: 'u', ú: 'u', û: 'u', ü: 'u', ç: 'c', ñ: 'n'
};
const RX_ACENTOS = /[àáâãäåèéêëìíîïòóôõöùúûüçñ]/g;

/** Texto.normalizar: minúsculas, sem acentos, espaços colapsados e aparados. */
export function normalizar(s) {
  return String(s).normalize('NFC').toLowerCase().replace(RX_ACENTOS, (c) => ACENTOS[c]).replace(/\s+/g, ' ').trim();
}

export const primeiraMaiuscula = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
/** "NOME DO CANDIDATO" → "Nome Do Candidato" (igual ao Android). */
export const tituloPalavras = (s) => String(s).toLowerCase().split(' ').map(primeiraMaiuscula).join(' ');
export const sentenca = (s) => primeiraMaiuscula(String(s).toLowerCase());

const fmtInteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmt2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const inteiro = (n) => fmtInteiro.format(n);
export const moeda = (n) => fmtMoeda.format(n);
export const decimal2 = (n) => fmt2.format(n);

/** escapa texto para uso em RegExp (equivalente a Regex.escape do Kotlin). */
export const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------------------------------------- candidatura

/** Converte o JSON do pacote (CandidateDto) em candidatura. Sem padrões "convenientes": ausência permanece ausência. */
export function mapCandidate(d) {
  if (d == null || d.id == null || d.cargo == null || d.estadoUf == null) return null;
  const nomeUrna = d.nomeUrna ?? '';
  const nomeCompleto = d.nomeCompleto ?? '';
  const partido = d.partido ?? '';
  const c = {
    id: String(d.id),
    numero: d.numero ?? '',
    nomeUrna,
    nomeCompleto,
    cargoCodigo: d.cargo,
    cargo: tituloCargo(d.cargo),
    partido,
    nomePartido: d.nomePartido ?? null,
    coligacao: d.coligacao ?? null,
    federacao: d.federacao ?? d.siglaFederacao ?? null,
    estadoUf: d.estadoUf,
    regiao: d.regiao ?? regiaoDe(d.estadoUf) ?? 'Nacional',
    digitosUrna: d.digitosUrna ?? 0,
    ordemVotacao: d.ordemVotacao ?? 0,
    foto: d.foto ?? null,
    temFoto: d.temFoto === true || d.foto != null,
    situacao: d.situacao ?? null,
    elegibilidade: elegibilidadeDe(d.elegibilidade),
    naUrna: d.naUrna ?? true,
    motivosIndeferimento: d.motivosIndeferimento ?? [],
    vezesEleito: d.vezesEleito ?? 0,
    eleicoesDisputadas: d.eleicoesDisputadas ?? 0,
    eleitoMesmoCargo: d.eleitoMesmoCargo ?? false,
    redesSociais: d.redesSociais ?? [],
    temPlanoGoverno: d.temPlanoGoverno ?? false,
    temasPlano: d.temasPlano ?? [],
    patrimonioDeclarado: d.patrimonioDeclarado ?? null,
    qtdBens: d.qtdBens ?? null,
    declaraBens: d.declaraBens ?? null,
    prestouContas: d.prestouContas ?? null,
    /** prestação de contas da campanha (valores mudam até a prestação final); sem dado = null */
    contas: d.contas && typeof d.contas === 'object'
      ? { receitas: d.contas.receitas ?? 0, despesasContratadas: d.contas.despesasContratadas ?? 0, tipo: d.contas.tipo ?? null, geradoEm: d.contas.geradoEm ?? null }
      : null,
    substituido: d.substituido ?? false,
    idade: d.idade ?? null,
    genero: d.genero ?? null,
    corRaca: d.corRaca ?? null,
    grauInstrucao: d.grauInstrucao ?? null,
    estadoCivil: d.estadoCivil ?? null,
    ocupacao: d.ocupacao ?? null,
    municipioNascimento: d.municipioNascimento ?? null,
    ufNascimento: d.ufNascimento ?? null,
    resultado: null,
    // derivados para busca/filtros rápidos
    chaveBusca: normalizar(`${nomeUrna} ${nomeCompleto}`),
    partidoNorm: normalizar(partido),
    municipioNorm: d.municipioNascimento ? normalizar(d.municipioNascimento) : null,
    ehMajoritario: ['PRESIDENTE', 'VICE_PRESIDENTE', 'GOVERNADOR', 'VICE_GOVERNADOR', 'SENADOR'].includes(d.cargo)
  };
  return c;
}

/** resultados/<UF>.json → mapa id → ResultadoCandidato. */
export function mapResultados(obj) {
  const out = new Map();
  if (!obj || typeof obj !== 'object') return out;
  for (const [sq, v] of Object.entries(obj)) {
    if (!v || typeof v !== 'object') continue;
    const turnos = {};
    for (const [k, t] of Object.entries(v)) {
      if (k === 'situacaoTotalizacao') continue;
      const n = Number.parseInt(k, 10);
      if (!Number.isInteger(n) || !t || typeof t !== 'object') continue;
      turnos[n] = { votos: t.votos ?? null, percentual: t.percentual ?? null, situacao: t.situacao ?? null };
    }
    out.set(sq, { situacaoTotalizacao: v.situacaoTotalizacao ?? null, turnos });
  }
  return out;
}

/** Eleito conforme a totalização oficial (qualquer turno); comparação sem acento/caixa. */
export function resultadoEleito(r) {
  if (!r) return false;
  const textos = [r.situacaoTotalizacao, ...Object.values(r.turnos).map((t) => t.situacao)].filter((x) => x != null);
  return textos.some((t) => normalizar(t).startsWith('eleito'));
}

/** Código da eleição no sistema de divulgação do TSE: 6257 = federal (Presidente); 6259 = estadual. */
export const codigoEleicaoFoto = (c) => (c.estadoUf === 'BR' ? 6257 : 6259);

/** Foto oficial publicada pelo TSE (somente quando há foto cadastrada, para evitar 404 em massa). */
export const urlFotoRemota = (c) =>
  c.temFoto ? `https://resultados.tse.jus.br/oficial/ele2026/${codigoEleicaoFoto(c)}/fotos/${c.estadoUf.toLowerCase()}/${c.id}.jpeg` : null;
