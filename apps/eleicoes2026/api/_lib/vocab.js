// Vocabulários do contrato do NLU (docs/DATA_CONTRACT.md §9). Espelham o app Android
// (ai/model/AiModels.kt, ai/nlu/CloudNlu.kt, ai/nlu/LocalNlu.kt) e o domínio (Ufs).
// Qualquer valor fora destes conjuntos é descartado: a nuvem nunca fornece fatos.

/** Intenções do contrato novo (enum Intent do app). */
export const INTENTS = Object.freeze([
  'LISTAR_CANDIDATOS',
  'PERFIL_CANDIDATO',
  'CONTAR',
  'PESQUISAS',
  'CALENDARIO',
  'LOCAL_VOTACAO',
  'REGRAS_URNA',
  'REGRAS_VOTO', // voto branco/nulo, obrigatoriedade, justificativa
  'SENADO_DOIS_VOTOS',
  'ELEGIBILIDADE', // situação do registro e Ficha Limpa
  'PLANO_GOVERNO',
  'CONTAS_CAMPANHA',
  'RESULTADOS',
  'SEGUNDO_TURNO',
  'PATRIMONIO',
  'FONTES',
  'SOBRE_DADOS',
  'SIMULADOR', // abre o simulador educativo da urna
  'AJUDA', // saudações, agradecimentos e "o que você faz"
  'RECOMENDACAO',
  'DESCONHECIDA',
]);
export const INTENT_SET = new Set(INTENTS);

/** Intenções do formato LEGADO (modelo treinado antes do contrato novo). */
export const LEGACY_INTENTS = Object.freeze([
  'NAVIGATE_MENU',
  'FILTER_CANDIDATES',
  'EXPLAIN_TOPIC',
  'CALENDAR_QUERY',
  'VOTING_LOCATION_QUERY',
  'CANDIDATE_LOOKUP',
]);
export const LEGACY_INTENT_SET = new Set(LEGACY_INTENTS);

/** Mesmo conjunto de CARGOS_VALIDOS do NluValidator (CloudNlu.kt). */
export const CARGOS = new Set([
  'PRESIDENTE',
  'VICE_PRESIDENTE',
  'GOVERNADOR',
  'VICE_GOVERNADOR',
  'SENADOR',
  'DEPUTADO_FEDERAL',
  'DEPUTADO_ESTADUAL',
  'DEPUTADO_DISTRITAL',
]);

export const HISTORICOS = new Set(['NUNCA_ELEITO', 'ELEITO_MESMO_CARGO', 'ELEITO_2_OU_MAIS']);

/** Ufs.NOMES do app (sigla -> nome). "BR" NÃO é UF válida para o NLU. */
export const UF_NOMES = Object.freeze({
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia',
  CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
  RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo',
  SE: 'Sergipe', TO: 'Tocantins',
});
export const UFS = new Set(Object.keys(UF_NOMES));

/**
 * Temas: texto (sem acento, minúsculo, espaços) -> id usado pelo app (LocalNlu.TEMAS).
 * O modelo legado foi treinado com "saúde", "educação", "meio ambiente", "emprego", "agricultura"...
 */
export const TEMAS = Object.freeze({
  saude: 'saude',
  educacao: 'educacao',
  escola: 'educacao',
  seguranca: 'seguranca',
  'seguranca publica': 'seguranca',
  economia: 'economia',
  emprego: 'economia',
  'meio ambiente': 'meio_ambiente',
  ambiente: 'meio_ambiente',
  transporte: 'transporte',
  mobilidade: 'transporte',
  moradia: 'moradia',
  habitacao: 'moradia',
  agro: 'agro',
  agropecuaria: 'agro',
  agricultura: 'agro',
  cultura: 'cultura',
  esporte: 'esporte',
  tecnologia: 'tecnologia',
  inovacao: 'tecnologia',
  ciencia: 'tecnologia',
  'assistencia social': 'assistencia',
  assistencia: 'assistencia',
  saneamento: 'saneamento',
  energia: 'energia',
  infraestrutura: 'infraestrutura',
  transparencia: 'transparencia',
  corrupcao: 'transparencia',
  mulheres: 'mulheres',
  juventude: 'juventude',
  jovens: 'juventude',
  idosos: 'idosos',
  turismo: 'turismo',
  'pessoa com deficiencia': 'pcd',
  acessibilidade: 'pcd',
  pcd: 'pcd',
});

/** Origem da resposta exibida no app (enum OrigemResposta). */
export const ORIGENS = new Set(['LOCAL', 'NUVEM', 'AVISO']);

export const CLIENTS = new Set(['android', 'web']);
