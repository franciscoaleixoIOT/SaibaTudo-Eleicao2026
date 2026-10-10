// Segurança: página explicativa (GHS, pictogramas, frases H, boas práticas) com links para fontes oficiais. Não copia fichas de segurança.
import { ORIENTACAO_GERAL } from '../answers.js';
import { buscarCompostos } from '../busca.js';
import { h, icon } from '../dom.js';
import { FRASES_H, GRUPOS_FRASES_H, NOMES_PICTOGRAMA, CODIGOS_PICTOGRAMA, PICTOGRAMAS, urlPictograma } from '../perigos.js';
import { normalizar } from '../texto.js';
import { formulaEl, linkExterno, linkRota } from './componentes.js';
import { comExibicao } from './compostos.js';

const LINKS = [
  ['Fichas Internacionais de Segurança Química (ICSC), OIT/OMS', 'https://chemicalsafety.ilo.org/dyn/icsc/showcard.home', 'Fichas por substância (o aplicativo não copia as fichas: só aponta para elas).'],
  ['PubChem: classificação GHS dos compostos', 'https://pubchem.ncbi.nlm.nih.gov/ghs/', 'Explica a fonte da classificação usada neste aplicativo.'],
  ['UNECE: transporte de mercadorias perigosas e GHS', 'https://unece.org/transport/dangerous-goods', 'Origem do Sistema Globalmente Harmonizado (GHS) da ONU.']
];

export function viewSeguranca({ store }) {
  const filtro = h('input', { id: 'filtro-h', class: 'campo', type: 'search', placeholder: 'Filtrar por código ou palavra (ex.: H314, inflamável)', autocomplete: 'off' });
  const lista = h('ul', { class: 'frases-h', 'aria-label': 'Frases de perigo (H)' });
  const sem = h('p', { class: 'vazio', hidden: true }, 'Nenhuma frase encontrada.');
  const frases = Object.entries(FRASES_H);
  function atualizarH() {
    const q = normalizar(filtro.value);
    const achadas = frases.filter(([c, t]) => !q || normalizar(c).includes(q) || normalizar(t).includes(q));
    lista.replaceChildren(...achadas.map(([c, t]) => h('li', null, h('span', { class: 'cod' }, c), h('span', null, t))));
    sem.hidden = achadas.length > 0;
  }
  filtro.addEventListener('input', atualizarH);
  atualizarH();

  const busca = h('input', { id: 'busca-seg', class: 'campo', type: 'search', placeholder: 'Nome, fórmula ou CAS do composto', autocomplete: 'off' });
  const resultados = h('ul', { class: 'lista-resultados' });
  let seq = 0;
  busca.addEventListener('input', async () => {
    const meu = ++seq;
    const achados = await comExibicao(store, buscarCompostos(store.indice.entradas, busca.value, 8));
    if (meu !== seq) return;
    resultados.replaceChildren(...achados.map((c) => h('li', null, linkRota(`/quimica/composto/${c.cid}#seguranca`, [h('strong', null, c.nome ?? c.nomeIupac, c.formula ? [' — ', formulaEl(c.formula)] : null), h('span', { class: 'sub' }, 'Ver perigos e pictogramas')], { class: 'item-res' }))));
  });

  const no = h('div', null,
    h('h1', { class: 'titulo-pagina', id: 'titulo-pagina', tabindex: '-1' }, 'Segurança química'),
    h('p', { class: 'sub-pagina' }, 'Como ler os avisos de perigo dos produtos químicos. O aplicativo mostra a classificação GHS dos compostos que estão no pacote de dados e leva você às fichas oficiais; ele não ensina a produzir substâncias perigosas.'),
    h('p', { class: 'aviso-caixa' }, icon('shield', 18), 'Por segurança, o aplicativo recusa pedidos de síntese, purificação ou receitas caseiras de explosivos, armas químicas, drogas ilícitas e outros reagentes perigosos. Perguntas sobre perigos, EPI, armazenamento e primeiros socorros são respondidas.'),
    h('section', { class: 'secao' }, h('h2', null, 'Ver os perigos de um composto'),
      h('label', { class: 'sr-only', for: 'busca-seg' }, 'Buscar composto'), busca, resultados),
    h('section', { class: 'secao' }, h('h2', null, 'Pictogramas do GHS'),
      h('p', { class: 'sub-pagina' }, 'O GHS (Sistema Globalmente Harmonizado, da ONU) usa losangos de borda vermelha. Os desenhos abaixo são versões simplificadas, feitas para este aplicativo.'),
      h('ul', { class: 'ghs-pictos' }, CODIGOS_PICTOGRAMA.map((c) => h('li', { class: 'picto grande' },
        h('img', { src: urlPictograma(c), alt: `${c}: ${NOMES_PICTOGRAMA[c]}`, width: '112', height: '112', loading: 'lazy' }),
        h('strong', null, `${c} — ${NOMES_PICTOGRAMA[c]}`), h('span', null, PICTOGRAMAS[c]?.[1] ?? ''))))),
    h('section', { class: 'secao' }, h('h2', null, 'Palavra de sinal'),
      h('p', null, h('span', { class: 'sinal perigo' }, 'Perigo'), ' indica as categorias mais graves; ', h('span', { class: 'sinal atencao' }, 'Atenção'), ' indica as menos graves. Substâncias de menor perigo podem vir sem palavra de sinal.')),
    h('section', { class: 'secao' }, h('h2', null, 'Como ler as frases H'),
      h('p', null, 'Cada frase de perigo tem um código: a letra H e três algarismos. O primeiro algarismo diz o tipo de perigo:'),
      h('ul', { class: 'lista-pontos' }, GRUPOS_FRASES_H.map((g) => h('li', null, h('strong', null, `${g.faixa}: ${g.titulo}`), `, ${g.descricao}`))),
      h('p', { class: 'pequeno mudo' }, 'Códigos somados, como H302+H312, juntam as frases em uma só. Textos: UNECE GHS / ECHA CLP, em português.'),
      h('label', { class: 'rotulo-campo', for: 'filtro-h' }, 'Procurar uma frase'), filtro, lista, sem),
    h('section', { class: 'secao' }, h('h2', null, 'Boas práticas'), h('ul', { class: 'lista-pontos' }, ORIENTACAO_GERAL.map((t) => h('li', null, t)))),
    h('section', { class: 'secao' }, h('h2', null, 'Fontes oficiais (links externos)'),
      h('ul', { class: 'lista-pontos' }, LINKS.map(([nome, url, nota]) => h('li', null, linkExterno(url, nome), ` — ${nota}`)))));
  return { titulo: 'Segurança química', node: no };
}
