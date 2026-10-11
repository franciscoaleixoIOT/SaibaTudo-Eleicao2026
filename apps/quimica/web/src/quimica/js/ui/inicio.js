// Início: caixa de pergunta (motor local), resposta com fonte em cada bloco, sugestões e atalhos para as telas.
import { SUGESTOES_PADRAO } from '../answers.js';
import { h, icon, anunciar } from '../dom.js';
import { blocoEl, cartaoEl, chip, linkExterno, linkRota } from './componentes.js';

let ultima = null; // { pergunta, resposta } mantida ao navegar entre telas

function acaoEl(a) {
  if (a.externo) return h('a', { class: 'btn btn-contorno peq', href: a.url, target: '_blank', rel: 'noopener noreferrer' }, a.rotulo, icon('external', 14));
  return linkRota(a.rota, a.rotulo, { class: 'btn btn-contorno peq' });
}

export function respostaEl(r, perguntar) {
  const classe = r.intent === 'RECUSA_PERIGO' ? 'recusa' : r.resolvida ? '' : 'nao-resolvida';
  const rotulo = r.intent === 'RECUSA_PERIGO' ? 'Pedido recusado por segurança' : r.resolvida ? 'Resposta montada no seu aparelho, a partir dos dados' : 'Não consegui responder';
  const titulo = h('h2', { class: 'resp-titulo', tabindex: '-1', id: 'resp-titulo' }, r.titulo);
  const el = h('section', { class: `resposta ${classe}`.trim(), 'aria-labelledby': 'resp-titulo' },
    h('div', { class: 'resp-cab' },
      h('span', { class: 'resp-ic' }, icon(r.intent === 'RECUSA_PERIGO' ? 'shield' : r.resolvida ? 'verified' : 'help', 22)),
      h('div', null, h('div', { class: 'resp-rotulo' }, rotulo), titulo)),
    r.blocos.map(blocoEl),
    r.acoes?.length ? h('div', { class: 'resp-acoes' }, r.acoes.map(acaoEl)) : null,
    r.sugestoes?.length ? h('div', { class: 'resp-sugestoes' }, h('div', { class: 'rot' }, 'Você também pode perguntar'),
      h('div', { class: 'chips' }, r.sugestoes.map((s) => chip({ rotulo: s, icone: false, classe: 'sug', onClick: () => perguntar(s) })))) : null,
    r.fontes?.length ? h('details', { class: 'resp-fontes' }, h('summary', null, `Fontes e licenças (${r.fontes.length})`),
      h('ul', null, r.fontes.map((f) => h('li', null, f.url ? linkExterno(f.url, f.nome) : f.nome, f.licenca ? ` — ${f.licenca}` : '')))) : null);
  return el;
}

export function viewInicio({ engine, query }) {
  const regiao = h('div', { id: 'resposta', 'aria-live': 'polite' });
  const campo = h('input', {
    id: 'pergunta', class: 'busca-campo', type: 'search', enterkeyhint: 'search', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', maxlength: '300',
    placeholder: 'Ex.: massa molar da água, Fe + O2 -> Fe2O3, pH de HCl 0,01 mol/L'
  });
  let ocupado = false;

  async function perguntar(texto) {
    const q = String(texto ?? campo.value).trim();
    if (!q || ocupado) return;
    campo.value = q;
    ocupado = true;
    regiao.replaceChildren(h('div', { class: 'carregando', role: 'status' }, h('span', { class: 'spinner mini', 'aria-hidden': 'true' }), h('span', { class: 'mudo' }, 'Pensando…')));
    try {
      const r = await engine.responder(q);
      ultima = { pergunta: q, resposta: r };
      mostrar(r, true);
    } finally { ocupado = false; }
  }

  function mostrar(r, foco) {
    regiao.replaceChildren(respostaEl(r, perguntar));
    if (foco) {
      document.getElementById('resp-titulo')?.focus({ preventScroll: false });
      anunciar(r.resolvida ? `Resposta: ${r.titulo}` : r.titulo);
    }
  }

  const form = h('form', { class: 'busca-form', role: 'search', onSubmit: (e) => { e.preventDefault(); perguntar(); } },
    h('label', { class: 'sr-only', for: 'pergunta' }, 'Pergunte sobre Química'),
    icon('search', 22), campo,
    h('button', { class: 'btn-icone mini-btn envia', type: 'submit', 'aria-label': 'Perguntar' }, icon('send', 22)));

  const no = h('div', null,
    h('section', { class: 'hero' },
      h('h1', { class: 'titulo-pagina', id: 'titulo-pagina', tabindex: '-1' }, 'Pergunte sobre Química'),
      h('p', null, 'Elementos, compostos, cálculos com passo a passo e segurança química. As respostas vêm de dados abertos e de cálculos feitos no seu aparelho.'),
      form,
      h('div', { class: 'chips sugestoes', role: 'group', 'aria-label': 'Exemplos de perguntas' }, SUGESTOES_PADRAO.map((s) => chip({ rotulo: s, icone: false, classe: 'sug', onClick: () => perguntar(s) }))),
      h('span', { class: 'ia-badge' }, icon('shield', 14), 'Nada sai do seu aparelho. A IA na nuvem ainda não está disponível.')),
    regiao,
    h('section', { class: 'secao' },
      h('h2', null, 'Explore'),
      h('div', { class: 'cartoes' },
        cartaoEl('/quimica/tabela', 'table', 'Tabela periódica', 'Cores por categoria, filtros por bloco, período, grupo e estado.'),
        cartaoEl('/quimica/compostos', 'molecule', 'Compostos', 'Busque por nome, fórmula, CAS ou CID e veja a estrutura 2D.'),
        cartaoEl('/quimica/calculadoras', 'calculator', 'Calculadoras', 'Massa molar, balanceamento, estequiometria, concentração, pH, gás ideal e unidades.'),
        cartaoEl('/quimica/seguranca', 'shield', 'Segurança', 'Pictogramas do GHS, frases H e como evitar misturas perigosas.'),
        cartaoEl('/quimica/sobre-os-dados', 'book', 'Sobre os dados', 'Fontes, licenças, datas e verificação da assinatura digital.'))));

  const q0 = query?.get('q');
  if (q0) setTimeout(() => perguntar(q0), 0);
  else if (ultima) { campo.value = ultima.pergunta; mostrar(ultima.resposta, false); }
  return { titulo: 'Início', node: no, foco: '#pergunta' };
}
