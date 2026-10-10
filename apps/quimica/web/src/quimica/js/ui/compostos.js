// Busca de compostos (nome PT, popular, IUPAC, sinônimos, fórmula, CAS, CID) e ficha do composto com estrutura 2D, GHS e fontes.
// O índice do pacote pode trazer só chaves de busca (sem nomes de exibição): nesse caso os resultados são completados com os registros dos lotes, sob demanda.
import { h, icon } from '../dom.js';
import { buscarCompostos } from '../busca.js';
import { formulaUnicode } from '../calc/formula.js';
import { fmt } from '../formato.js';
import { CLASSES_PT } from '../ghs.js';
import { moleculaEl } from '../molecula.js';
import { descreverGhs, urlSegura } from '../perigos.js';
import { formatarValor, tabelaDePropriedades, valorBruto } from '../propriedades.js';
import { capitalizar, listar } from '../texto.js';
import { fonteEl, formulaEl, ghsEl, kvEl, linkExterno, linkRota } from './componentes.js';

/** Resultados de busca com os campos de exibição (nome, fórmula…) vindos dos registros dos lotes quando o índice não os traz. */
export async function comExibicao(store, entradas) {
  if (entradas.every((e) => e.nome != null)) return entradas;
  const registros = new Map((await store.enriquecer(entradas)).map((r) => [Number(r.cid), r]));
  return entradas.map((e) => { const r = registros.get(e.cid); return r ? { ...e, nome: r.nome, nomePopular: r.nomePopular ?? e.nomePopular, nomeIupac: r.nomeIupac, formula: r.formula, cas: r.cas, massaMolar: r.massaMolar } : e; });
}

export function viewCompostos({ store, query }) {
  const inicial = query.get('q') ?? '';
  const campo = h('input', { id: 'busca-composto', class: 'campo', type: 'search', value: inicial, autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', placeholder: 'Nome, fórmula, CAS ou CID (ex.: aspirina, H2SO4, 64-17-5)' });
  const lista = h('ul', { class: 'lista-resultados' });
  const status = h('p', { class: 'tp-contagem', role: 'status', 'aria-live': 'polite' });
  const todos = store.indice.entradas;
  let sequencia = 0;

  function item(c) {
    const sub = [c.nomePopular && c.nomePopular !== c.nome ? c.nomePopular : null, c.nomeIupac, c.cas ? `CAS ${c.cas}` : null, c.massaMolar != null ? `${fmt(c.massaMolar, { sig: 7 })} g/mol` : null].filter(Boolean).join(' · ');
    return h('li', null, linkRota(`/quimica/composto/${c.cid}`, [
      h('strong', null, c.nome ?? c.nomeIupac ?? `CID ${c.cid}`, c.formula ? [' — ', formulaEl(c.formula)] : null),
      sub ? h('span', { class: 'sub' }, sub) : null
    ], { class: 'item-res' }));
  }

  async function atualizar() {
    const q = campo.value.trim();
    const meu = ++sequencia;
    status.textContent = todos.length ? 'Buscando…' : 'O índice de compostos não está disponível.';
    let achados;
    try {
      if (q) {
        let entradas = buscarCompostos(todos, q, 60);
        if (!entradas.length && /^\d{2,7}-\d{2}-\d$/.test(q)) { // o índice do pacote não traz CAS: procura nos lotes
          const cid = await store.cidPorCas(q);
          if (cid != null) entradas = [{ ...store.indice.porCid.get(cid), pontos: 100, motivo: 'CAS' }];
        }
        achados = await comExibicao(store, entradas);
      }
      else if (store.indice.temNomes) achados = [...todos].sort((a, b) => String(a.nome ?? '').localeCompare(String(b.nome ?? ''), 'pt-BR')).slice(0, 40);
      else achados = await store.compostosIniciais(40);
    } catch (e) {
      if (meu === sequencia) status.textContent = `Não foi possível carregar os compostos (${e instanceof Error ? e.message : String(e)}).`;
      return;
    }
    if (meu !== sequencia) return; // uma busca mais nova já começou
    lista.replaceChildren(...achados.map(item));
    status.textContent = !todos.length ? 'O índice de compostos não está disponível.' : q ? (achados.length ? `${achados.length} resultado${achados.length > 1 ? 's' : ''}` : `Nenhum composto encontrado para "${q}".`) : `${todos.length} compostos no pacote. Mostrando alguns, em ordem alfabética.`;
    try { const qs = q ? `?q=${encodeURIComponent(q)}` : ''; history.replaceState(history.state, '', `${location.pathname}${qs}`); } catch { /* ignorado */ }
  }
  let t = null;
  campo.addEventListener('input', () => { clearTimeout(t); t = setTimeout(atualizar, 150); });

  const no = h('div', null,
    h('h1', { class: 'titulo-pagina', id: 'titulo-pagina', tabindex: '-1' }, 'Compostos'),
    h('p', { class: 'sub-pagina' }, 'Busque por nome em português, nome popular, nome IUPAC, fórmula, número CAS ou CID do PubChem.'),
    h('label', { class: 'sr-only', for: 'busca-composto' }, 'Buscar composto'), campo, status, lista);
  atualizar();
  return { titulo: 'Compostos', node: no };
}

export async function viewComposto({ store, params }) {
  const cid = Number(params.cid);
  const c = Number.isInteger(cid) ? await store.composto(cid) : null;
  if (!c) {
    return { titulo: 'Composto não encontrado', status: 404, node: h('div', null,
      h('h1', { class: 'titulo-pagina', id: 'titulo-pagina', tabindex: '-1' }, 'Composto não encontrado'),
      h('p', { class: 'sub-pagina' }, 'Não há esse composto no pacote de dados.'), linkRota('/quimica/compostos', 'Buscar compostos', { class: 'btn btn-primario' })) };
  }
  const nome = c.nome ?? c.nomeIupac ?? `CID ${c.cid}`;
  const props = tabelaDePropriedades(store.regras).filter((p) => p.alvo === 'composto' && !['formula', 'smiles', 'cid', 'nomeIupac'].includes(p.id));
  const itens = [];
  if (c.nomePopular && c.nomePopular !== c.nome) itens.push({ rotulo: 'Nome popular', valor: c.nomePopular });
  if (c.nomeIupac) itens.push({ rotulo: 'Nome IUPAC', valor: c.nomeIupac });
  if (c.nomePtPendente) itens.push({ rotulo: 'Nome em português', valor: 'pendente: o nome mostrado é o IUPAC' });
  if (c.sinonimos?.length) itens.push({ rotulo: 'Sinônimos', valor: listar(c.sinonimos.slice(0, 12)) });
  if (c.formula) itens.push({ rotulo: 'Fórmula', valor: formulaEl(c.formula) });
  if (c.formulaHill && c.formulaHill !== c.formula) itens.push({ rotulo: 'Fórmula (notação de Hill)', valor: formulaEl(c.formulaHill) });
  for (const p of props) {
    const f = formatarValor(p, valorBruto(p, c), store.ctx);
    if (f) itens.push({ rotulo: capitalizar(p.rotulo), valor: f.texto });
  }
  itens.push({ rotulo: 'CID no PubChem', valor: linkExterno(`https://pubchem.ncbi.nlm.nih.gov/compound/${c.cid}`, String(c.cid)) });
  if (c.smiles) itens.push({ rotulo: 'SMILES', valor: h('code', null, c.smiles) });
  if (c.wikidata) itens.push({ rotulo: 'Wikidata', valor: linkExterno(`https://www.wikidata.org/wiki/${encodeURIComponent(c.wikidata)}`, c.wikidata) });

  const g = descreverGhs(c.ghs, store.regras);
  const icsc = urlSegura(c.icscBuscaUrl ?? store.indice.porCid.get(c.cid)?.icscBuscaUrl);
  const defin = c.definicaoChebi ? (typeof c.definicaoChebi === 'string' ? { texto: c.definicaoChebi } : c.definicaoChebi) : null;
  const definTexto = defin?.texto ?? defin?.definicao ?? null;
  const chebiId = defin?.chebiId ?? defin?.chebi ?? defin?.id ?? null;
  const chebiUrl = urlSegura(defin?.url) ?? (chebiId && /^(?:CHEBI:)?\d+$/i.test(String(chebiId)) ? `https://www.ebi.ac.uk/chebi/searchId.do?chebiId=${/^\d+$/.test(String(chebiId)) ? `CHEBI:${chebiId}` : chebiId}` : 'https://www.ebi.ac.uk/chebi/');
  const fonteFrases = store.fonteFrasesH ? { nome: store.fonteFrasesH.nome, url: store.fonteFrasesH.url, licenca: store.fonteFrasesH.licenca } : { nome: 'Frases de perigo: UNECE GHS / ECHA CLP' };

  const no = h('div', null,
    linkRota('/quimica/compostos', [icon('back', 16), ' Compostos'], { class: 'voltar' }),
    h('div', { class: 'ficha-cab' }, h('div', null,
      h('h1', { class: 'titulo-pagina', id: 'titulo-pagina', tabindex: '-1' }, nome),
      c.formula ? h('p', null, formulaEl(c.formula, { grande: true })) : null,
      c.classes?.length ? h('div', { class: 'tags' }, c.classes.map((x) => h('span', { class: 'tag tag-neutro' }, CLASSES_PT[x] ?? x.replace(/_/g, ' ')))) : null)),
    h('section', { class: 'secao' }, h('h2', null, 'Dados do composto'), kvEl(itens), fonteEl(c.fontes ?? [{ nome: `PubChem CID ${c.cid} (NCBI/NLM)`, url: `https://pubchem.ncbi.nlm.nih.gov/compound/${c.cid}` }])),
    c.smiles ? h('section', { class: 'secao' }, h('h2', null, 'Estrutura 2D'), moleculaEl(c.smiles, nome),
      h('p', { class: 'bloco-fonte' }, 'Desenhada no seu aparelho a partir do SMILES do pacote de dados, com SmilesDrawer (MIT).')) : null,
    h('section', { class: 'secao', id: 'seguranca' }, h('h2', null, 'Segurança'),
      g ? [ghsEl({ ...g, titulo: 'Classificação de perigo (GHS)' }, { grande: true }), fonteEl([c.ghs.fonte ? { nome: c.ghs.fonte } : null, fonteFrases].filter(Boolean))]
        : h('p', { class: 'aviso-caixa' }, icon('info', 18), 'O pacote não traz classificação GHS harmonizada para este composto. Isso não quer dizer que seja inofensivo: consulte a ficha de segurança do produto.'),
      h('div', { class: 'resp-acoes' },
        icsc ? h('a', { class: 'btn btn-contorno peq', href: icsc, target: '_blank', rel: 'noopener noreferrer' }, 'Ficha ICSC no site da OIT', icon('external', 14)) : null,
        linkRota('/quimica/seguranca', 'Como ler pictogramas e frases H', { class: 'btn btn-texto peq' }))),
    definTexto ? h('section', { class: 'secao' }, h('h2', null, 'Definição (ChEBI)'),
      h('blockquote', { class: 'bloco-texto' }, definTexto),
      h('p', { class: 'bloco-fonte' }, 'Definição em inglês. Fonte: ', linkExterno(chebiUrl, chebiId ? `ChEBI (${chebiId})` : 'ChEBI (EMBL-EBI)'), ` — ${defin.licenca ?? 'CC BY 4.0'}.`)) : null,
    h('section', { class: 'secao' }, h('h2', null, 'Calcular'),
      h('div', { class: 'resp-acoes' }, c.formula ? linkRota(`/quimica/calculadoras/massa-molar?f=${encodeURIComponent(c.formula)}`, `Massa molar de ${formulaUnicode(c.formula)}`, { class: 'btn btn-contorno peq' }) : null,
        linkRota(`/quimica/?q=${encodeURIComponent(`Perigos de ${nome.charAt(0).toLowerCase()}${nome.slice(1)}`)}`, 'Perguntar sobre este composto', { class: 'btn btn-contorno peq' }))));
  return { titulo: nome, node: no };
}
