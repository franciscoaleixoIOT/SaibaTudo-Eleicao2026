// Ficha do elemento: todos os campos do pacote, com unidades legíveis (K também em °C, kg/m³ também em g/cm³) e fontes.
import { tentarFormula } from '../calc/formula.js';
import { h, icon } from '../dom.js';
import { fmt } from '../formato.js';
import { formatarValor, tabelaDePropriedades, valorBruto, categoriaRotulo, estadoRotulo, ROTULO_CATEGORIA } from '../propriedades.js';
import { capitalizar, plural } from '../texto.js';
import { fonteEl, formulaEl, kvEl, linkRota } from './componentes.js';

export function viewElemento({ store, params }) {
  const simbolo = decodeURIComponent(params.simbolo ?? '');
  const e = store.porSimbolo.get(simbolo) ?? store.elementos.find((x) => String(x.z) === simbolo || x.simbolo.toLowerCase() === simbolo.toLowerCase());
  if (!e) {
    return { titulo: 'Elemento não encontrado', status: 404, node: h('div', null,
      h('h1', { class: 'titulo-pagina', id: 'titulo-pagina', tabindex: '-1' }, 'Elemento não encontrado'),
      h('p', { class: 'sub-pagina' }, `Não há "${simbolo}" nos dados.`), linkRota('/quimica/tabela', 'Abrir a tabela periódica', { class: 'btn btn-primario' })) };
  }
  const props = tabelaDePropriedades(store.regras).filter((p) => p.alvo === 'elemento');
  const itens = [];
  if (e.nomeEn) itens.push({ rotulo: 'Nome em inglês', valor: e.nomeEn });
  for (const p of props) {
    if (p.id === 'simbolo') continue;
    const f = formatarValor(p, valorBruto(p, e), store.ctx);
    if (f) itens.push({ rotulo: capitalizar(p.rotulo), valor: f.texto });
  }
  if (e.massaAtomicaIncerteza != null) itens.push({ rotulo: 'Incerteza da massa atômica', valor: fmt(e.massaAtomicaIncerteza, { sig: 3 }) });

  const idx = store.elementos.findIndex((x) => x.z === e.z);
  const ant = store.elementos[idx - 1];
  const prox = store.elementos[idx + 1];

  // compostos do índice que contêm o elemento
  // (só quando o índice traz fórmulas; com o índice do pipeline, que só tem chaves de busca, a busca de compostos faz esse papel)
  const comEle = store.indice.temNomes ? store.indice.entradas.filter((c) => c.formula && tentarFormula(c.formula)?.atomos.has(e.simbolo)).slice(0, 36) : [];

  const no = h('div', null,
    linkRota('/quimica/tabela', [icon('back', 16), ' Tabela periódica'], { class: 'voltar' }),
    h('div', { class: 'ficha-cab' },
      h('div', { class: `el-grande cat-${e.categoria}`, 'aria-hidden': 'true' }, h('span', { class: 'z' }, String(e.z)), h('span', { class: 's' }, e.simbolo), h('span', { class: 'm' }, e.massaAtomica != null ? fmt(e.massaAtomica, { sig: 7 }) : '')),
      h('div', null,
        h('h1', { class: 'titulo-pagina', id: 'titulo-pagina', tabindex: '-1' }, `${e.nome} (${e.simbolo})`),
        h('p', { class: 'sub-pagina' }, `Elemento ${e.z} · ${ROTULO_CATEGORIA[e.categoria] ?? categoriaRotulo(e.categoria)} · ${estadoRotulo(e.estadoPadrao)} nas condições padrão`))),
    h('section', { class: 'secao' }, h('h2', null, 'Propriedades'), kvEl(itens), fonteEl(e.fontes)),
    !comEle.length && store.indice.entradas.length ? h('section', { class: 'secao' }, h('h2', null, `Compostos com ${e.nome}`),
      linkRota(`/quimica/compostos?q=${encodeURIComponent(e.nome.toLowerCase())}`, `Buscar compostos de ${e.nome.toLowerCase()}`, { class: 'btn btn-contorno peq' })) : null,
    comEle.length ? h('section', { class: 'secao' }, h('h2', null, `Compostos com ${e.nome}`),
      h('div', { class: 'lista-links' }, comEle.map((c) => linkRota(`/quimica/composto/${c.cid}`, [c.nome ?? c.nomeIupac, ' ', h('span', { class: 'mudo' }, '('), formulaEl(c.formula), h('span', { class: 'mudo' }, ')')]))),
      store.indice.entradas.length > comEle.length ? h('p', { class: 'pequeno mudo' }, `${plural(comEle.length, 'Mostrando um composto', `Mostrando ${comEle.length} compostos`)} do índice; use a busca de compostos para ver mais.`) : null) : null,
    h('div', { class: 'nav-el' },
      ant ? linkRota(`/quimica/elemento/${encodeURIComponent(ant.simbolo)}`, [icon('back', 16), ` ${ant.nome} (${ant.z})`], { class: 'btn btn-contorno peq' }) : h('span'),
      prox ? linkRota(`/quimica/elemento/${encodeURIComponent(prox.simbolo)}`, [`${prox.nome} (${prox.z}) `, icon('forward', 16)], { class: 'btn btn-contorno peq' }) : h('span')),
    h('section', { class: 'secao' }, h('h2', null, 'Calcular'),
      linkRota(`/quimica/calculadoras/massa-molar?f=${encodeURIComponent(e.simbolo)}`, `Massa molar de ${e.nome}`, { class: 'btn btn-contorno peq' })));
  return { titulo: `${e.nome} (${e.simbolo})`, node: no };
}
