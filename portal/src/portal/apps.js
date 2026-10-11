// Configuração do site SaibaTudo — ÚNICO lugar para: link da Google Play e lista de apps "Em breve".
//
// Como adicionar um novo app à home (ver portal/README.md):
//   1. Se ele já existe, adicione um objeto em APPS (aparece como cartão em "Nossos apps").
//   2. Se ainda é planejado, adicione em EM_BREVE (aparece como cartão "Em breve").
//   Cada app é um projeto independente (por ex.: repositório "SaibaTudo-eleicoesXXXX"), com a própria rota (/eleicoesXXXX/).

/** Link do app na Google Play. Deixe vazio ('') até o app ser publicado: o botão fica desabilitado ("em breve"). */
export const GOOGLE_PLAY_URL = '';

/**
 * Apps disponíveis além do cartão principal (SaibaTudo — Eleições 2026, que é fixo no HTML da home).
 * Formato: { id, nome, descricao, url, playUrl? }
 */
export const APPS = [
  {
    id: 'quimica',
    nome: 'SaibaTudo Química',
    descricao: 'Elementos, compostos, propriedades, segurança química e cálculos de química geral com fontes abertas (PubChem, Wikidata, CODATA, ChEBI, Wikipédia e Wikilivros). ' +
      'Desenha moléculas e fórmulas; todo número vem dos dados, com a fonte citada. Repositório: SaibaTudo (pasta apps/quimica).',
    url: '/quimica/'
  }
];

/**
 * Apps planejados ("Em breve"). Formato: { id, titulo, descricao, repo? }
 * `repo` é só um nome sugerido de repositório (texto), não um link.
 */
export const EM_BREVE = [
  {
    id: 'proximas-eleicoes',
    titulo: 'Próximas eleições',
    descricao: 'Novas edições do SaibaTudo Eleições, no mesmo modelo: dados oficiais, neutralidade e código aberto, uma por eleição.',
    repo: 'SaibaTudo-eleicoesXXXX'
  },
  {
    id: 'outros-temas-civicos',
    titulo: 'Outros temas cívicos',
    descricao: 'Ferramentas independentes para consultar informações públicas oficiais. Sugestões e contribuições são bem-vindas no GitHub.',
    repo: 'SaibaTudo-<tema>'
  }
];
