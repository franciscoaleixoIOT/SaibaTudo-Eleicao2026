// Sobre os dados: versão e assinatura do pacote, fontes e licenças (exatamente como em fontes.json) e referências externas.
import { h, icon } from '../dom.js';
import { fmt } from '../formato.js';
import { kvEl, linkExterno, toast } from './componentes.js';

/** Referências que o aplicativo apenas indica por link (nenhum conteúdo é copiado). */
export const REFERENCIAS_EXTERNAS = [
  { nome: 'OpenStax Chemistry 2e', url: 'https://openstax.org/details/books/chemistry-2e', licenca: 'somente link', uso: 'Livro didático aberto, com restrições de uso: indicado como leitura; nenhum trecho foi copiado.' },
  { nome: 'ICSC — Fichas Internacionais de Segurança Química (OIT/OMS)', url: 'https://chemicalsafety.ilo.org/dyn/icsc/showcard.home', licenca: 'somente link', uso: 'Fichas por substância; o botão "Ficha ICSC no site da OIT" abre a busca por CAS.' },
  { nome: 'NIST Chemistry WebBook', url: 'https://webbook.nist.gov/chemistry/', licenca: 'somente link', uso: 'Dados termoquímicos e espectros; indicado como referência.' },
  { nome: 'LibreTexts Chemistry', url: 'https://chem.libretexts.org/', licenca: 'somente link', uso: 'Textos de Química abertos; indicados como leitura complementar.' }
];

export const BIBLIOTECAS = [
  { nome: 'KaTeX 0.19.0', licenca: 'MIT', url: 'https://katex.org/', uso: 'Fórmulas e passos de cálculo' },
  { nome: 'SmilesDrawer 2.4.1', licenca: 'MIT', url: 'https://github.com/reymond-group/smilesDrawer', uso: 'Estrutura 2D das moléculas' },
  { nome: 'Poppins', licenca: 'SIL OFL 1.1', url: 'https://fonts.google.com/specimen/Poppins', uso: 'Fonte dos títulos' }
];

const TITULOS = { dados: 'Dados no pacote', textos: 'Textos licenciados (explicações)', link: 'Referências externas (links)', referencia: 'Referências externas (links)' };

export function listaDeFontes(fontes) {
  if (Array.isArray(fontes)) return fontes;
  if (Array.isArray(fontes?.fontes)) return fontes.fontes;
  return [];
}

/** Agrupa as fontes: dados, textos e referências externas (que sempre inclui OpenStax, ICSC, NIST e LibreTexts). */
export function agruparFontes(fontes) {
  const grupos = { dados: [], textos: [], externas: [] };
  for (const f of listaDeFontes(fontes)) {
    if (!f?.nome) continue;
    // `tipo` (nosso) ou `uso: dados | textos | link` (pipeline); as referências "somente link" não são dados do pacote
    const t = String(f.tipo ?? (['dados', 'textos', 'link', 'referencia'].includes(f.uso) ? f.uso : 'dados'));
    if (t === 'link' || t === 'referencia') grupos.externas.push(f);
    else if (t === 'textos') grupos.textos.push(f);
    else grupos.dados.push(f);
  }
  for (const ref of REFERENCIAS_EXTERNAS) {
    const chave = ref.nome.split(/[ —]/)[0].toLowerCase();
    if (!grupos.externas.some((f) => String(f.nome).toLowerCase().includes(chave) || String(f.id ?? '').toLowerCase().includes(chave))) grupos.externas.push(ref);
  }
  return grupos;
}

function fonteItem(f) {
  return h('div', { class: 'fonte-item' },
    h('strong', null, f.url ? linkExterno(f.url, f.nome) : f.nome),
    f.mantenedor ? h('div', { class: 'meta' }, `Mantenedor: ${f.mantenedor}`) : null,
    f.licenca ? h('div', { class: 'meta' }, `Licença: ${f.licenca}`) : null,
    f.acessadoEm ? h('div', { class: 'meta' }, `Acessado em: ${f.acessadoEm}`) : null,
    f.atribuicao ? h('div', { class: 'meta' }, `Atribuição: ${f.atribuicao}`) : null,
    f.uso && !['dados', 'textos', 'link', 'referencia'].includes(f.uso) ? h('div', { class: 'meta' }, `Uso: ${f.uso}`) : null);
}

export function dataLegivel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso ?? '—');
  try { return d.toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }); } catch { return String(iso); }
}

export const ROTULO_ASSINATURA = { verificada: 'verificada (ECDSA P-256 com a chave pública do aplicativo)', invalida: 'NÃO confere: os dados do próprio site continuam em uso, mas não foram autenticados', indisponivel: 'não pôde ser verificada neste navegador (WebCrypto exige HTTPS)' };

export function botaoAtualizacao(store) {
  const msg = h('p', { class: 'pequeno mudo', role: 'status', 'aria-live': 'polite' });
  const botao = h('button', { class: 'btn btn-contorno peq', type: 'button', onClick: async () => {
    botao.disabled = true;
    msg.textContent = 'Verificando…';
    const r = await store.verificarAtualizacao();
    botao.disabled = false;
    msg.textContent = { atual: 'Os dados já estão na versão mais recente.', atualizado: `Dados atualizados para a versão ${r.version}.`, ignorado: `Nada a fazer: ${r.motivo}`, rejeitado: r.motivo, falha: `Não foi possível verificar agora (${r.motivo}).` }[r.tipo] ?? r.tipo;
    if (r.tipo === 'atualizado') toast('Dados atualizados. Recarregue a página para usar a versão nova em todas as telas.');
  } }, icon('refresh', 16), 'Verificar atualização dos dados');
  return h('div', null, botao, msg);
}

export function viewSobreDados({ store }) {
  const m = store.manifest;
  const g = agruparFontes(store.fontes);
  const arqs = [...store.arquivos.values()];
  const bytes = arqs.reduce((a, b) => a + (b.bytes ?? 0), 0);
  const licencas = Array.isArray(m?.licencas) ? m.licencas : [];
  const secao = (titulo, lista) => (lista.length ? h('section', { class: 'secao' }, h('h2', null, titulo), lista.map(fonteItem)) : null);

  const no = h('div', null,
    h('h1', { class: 'titulo-pagina', id: 'titulo-pagina', tabindex: '-1' }, 'Sobre os dados'),
    h('p', { class: 'sub-pagina' }, 'Todo número mostrado vem do pacote de dados assinado ou de um cálculo feito no seu aparelho. Texto gerado por IA nunca fornece números (e a IA na nuvem ainda não está disponível).'),
    h('section', { class: 'secao' }, h('h2', null, 'Pacote de dados'),
      kvEl([
        { rotulo: 'Versão', valor: String(store.versao) },
        { rotulo: 'Gerado em', valor: dataLegivel(m?.generatedAt) },
        { rotulo: 'Assinatura digital', valor: ROTULO_ASSINATURA[store.sig.estado] },
        { rotulo: 'Origem', valor: store.origem },
        { rotulo: 'Arquivos', valor: `${arqs.length} (${fmt(bytes / 1024, { sig: 4 })} KB no total)` },
        { rotulo: 'Elementos', valor: String(store.elementos.length) },
        { rotulo: 'Compostos no índice', valor: String(store.indice.entradas.length) },
        ...(store.ultimaVerificacao ? [{ rotulo: 'Última verificação', valor: new Date(store.ultimaVerificacao).toLocaleString('pt-BR') }] : [])
      ]),
      store.sig.detalhe ? h('p', { class: 'aviso-caixa' }, icon('warning', 18), store.sig.detalhe) : null,
      botaoAtualizacao(store),
      store.erros.length ? h('p', { class: 'pequeno mudo' }, `Avisos de carga: ${store.erros.map((e) => e.mensagem).join('; ')}`) : null),
    secao('Dados no pacote', g.dados),
    secao('Textos licenciados (explicações)', g.textos),
    secao(TITULOS.link, g.externas),
    licencas.length ? h('section', { class: 'secao' }, h('h2', null, 'Licenças listadas no manifesto'), h('ul', { class: 'lista-pontos' }, licencas.map((l) => h('li', null, typeof l === 'string' ? l : l.nome ?? l.id)))) : null,
    h('section', { class: 'secao' }, h('h2', null, 'Como os valores são obtidos'),
      h('ul', { class: 'lista-pontos' },
        h('li', null, 'Elementos, compostos, constantes e regras: arquivos JSON versionados, com SHA-256 conferido e manifesto assinado.'),
        h('li', null, 'Massa molar, balanceamento, estequiometria, concentração, pH, gás ideal e unidades: código determinístico testado, no seu aparelho.'),
        h('li', null, 'Estrutura 2D: desenhada a partir do SMILES do pacote. Pictogramas do GHS: desenhos simplificados deste aplicativo.'),
        h('li', null, 'Trechos de explicação: citados com fonte e licença; traduções automáticas são avisadas como tais.'))),
    h('section', { class: 'secao' }, h('h2', null, 'Bibliotecas de código aberto'), BIBLIOTECAS.map(fonteItem)),
    h('p', { class: 'pequeno mudo' }, 'O SaibaTudo é independente e de código aberto (MIT). ', h('a', { href: '/quimica/privacidade' }, 'Política de privacidade'), '.'));
  return { titulo: 'Sobre os dados', node: no };
}
