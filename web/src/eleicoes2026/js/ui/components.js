// Componentes compartilhados: chips, interruptores, fotos, etiquetas, cartão de candidatura e diálogo modal.
import { h, icon } from '../dom.js';
import { urlFotoRemota } from '../model.js';

let _seq = 0;
export const novoId = (p = 'id') => `${p}-${++_seq}`;

/** Chip de filtro (botão com aria-pressed). */
export function chip({ rotulo, selecionado = false, onClick, icone = null, classe = '', ariaLabel = null }) {
  return h('button', {
    type: 'button', class: `chip${selecionado ? ' on' : ''} ${classe}`.trim(), 'aria-pressed': selecionado ? 'true' : 'false',
    'aria-label': ariaLabel, onClick
  }, selecionado && icone !== false ? icon('check', 14) : null, rotulo);
}

/** Interruptor acessível (checkbox com role=switch). */
export function interruptor({ ligado, onChange, rotulo, habilitado = true, id = novoId('sw') }) {
  return h('input', {
    type: 'checkbox', role: 'switch', class: 'switch', id, checked: !!ligado, disabled: !habilitado,
    'aria-label': rotulo, onChange: (e) => onChange(e.target.checked)
  });
}

/** Linha de configuração com título, detalhe e interruptor. */
export function linhaChave({ titulo, detalhe, ligado, onChange, habilitado = true }) {
  const id = novoId('sw');
  return h('div', { class: 'linha-chave' },
    h('label', { for: id, class: 'linha-chave-txt' }, h('strong', null, titulo), h('span', { class: 'mudo' }, detalhe)),
    interruptor({ ligado, onChange, rotulo: titulo, habilitado, id }));
}

/** Etiqueta (selo) de status. tipo: ok | no | neutro | ouro | verde */
export const etiqueta = (texto, tipo = 'neutro', icone = null) =>
  h('span', { class: `tag tag-${tipo}` }, icone ? icon(icone, 12) : null, texto);

/** Foto oficial: pacote (majoritários) → CDN do TSE (somente com temFoto) → número do candidato. */
export function fotoCandidato(c, tam, { store, permitirRemota = true } = {}) {
  const caixa = h('span', { class: 'foto' });
  caixa.style.setProperty('--t', `${tam}px`);
  const fontes = [];
  if (c.foto) fontes.push(store.fotoUrl(c));
  const remota = permitirRemota ? urlFotoRemota(c) : null;
  if (remota) fontes.push(remota);
  const numero = () => {
    caixa.classList.add('sem');
    caixa.replaceChildren(h('span', { class: `foto-num${c.numero.length >= 4 ? ' n4' : ''}`, 'aria-hidden': 'true' }, c.numero));
  };
  if (fontes.length === 0) { numero(); return caixa; }
  let i = 0;
  const img = h('img', { alt: `Foto oficial de ${c.nomeUrna}`, loading: 'lazy', decoding: 'async', width: tam, height: tam });
  img.addEventListener('error', () => { i++; if (i < fontes.length) img.src = fontes[i]; else numero(); });
  img.src = fontes[0];
  caixa.append(img);
  return caixa;
}

/** Cartão de candidatura: fatos oficiais com rótulos neutros; nunca ranqueia nem qualifica o candidato. */
export function cartaoCandidato(c, { store, permitirRemota, onAbrir }) {
  const apta = c.elegibilidade.apta;
  const sub = [c.ocupacao ? c.ocupacao.toLowerCase().replace(/^./, (x) => x.toUpperCase()) : null, c.idade != null ? `${c.idade} anos` : null]
    .filter(Boolean).join(' • ');
  const tags = [etiqueta(c.elegibilidade.rotulo, apta === true ? 'verde' : apta === false ? 'no' : 'neutro', 'policy')];
  if (!c.naUrna) tags.push(etiqueta('Fora da urna'));
  if (c.resultado && resultadoEleitoLocal(c.resultado)) tags.push(etiqueta('Eleito', 'ouro', 'trophy'));
  if (c.eleitoMesmoCargo) tags.push(etiqueta('Já eleito para este cargo (histórico TSE)', 'neutro', 'history'));
  else if (c.vezesEleito === 0 && c.eleicoesDisputadas > 0) tags.push(etiqueta('Nunca eleito (histórico TSE)'));
  if (c.temPlanoGoverno) tags.push(etiqueta('Plano de governo registrado', 'verde'));
  return h('article', { class: 'cand', 'data-id': c.id },
    fotoCandidato(c, 54, { store, permitirRemota }),
    h('div', { class: 'cand-corpo' },
      h('div', { class: 'cand-linha' },
        h('h3', { class: 'cand-nome' },
          h('button', { type: 'button', class: 'cand-link', 'aria-label': `Ver detalhes de ${c.nomeUrna}, número ${c.numero}`, onClick: () => onAbrir(c) }, c.nomeUrna)),
        h('span', { class: 'cand-num' }, `Nº ${c.numero}`)),
      h('p', { class: 'cand-meta' }, `${c.cargo} • ${c.partido}${c.estadoUf !== 'BR' ? ` (${c.estadoUf})` : ' (nacional)'}`),
      sub ? h('p', { class: 'cand-sub' }, sub) : null,
      h('div', { class: 'tags' }, tags)));
}

const resultadoEleitoLocal = (r) => {
  const t = [r.situacaoTotalizacao, ...Object.values(r.turnos).map((x) => x.situacao)].filter(Boolean);
  return t.some((s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().startsWith('eleito'));
};

/**
 * Diálogo modal (elemento <dialog> nativo: foco preso, ESC fecha, aria-modal implícito).
 * @returns {HTMLDialogElement}
 */
export function modal({ titulo, cabecalho = null, corpo, rodape = null, classe = '', onFechar = null }) {
  const idTit = novoId('dlg-t');
  const dlg = h('dialog', { class: `modal ${classe}`.trim(), 'aria-labelledby': idTit });
  const fechar = h('button', { type: 'button', class: 'btn-icone modal-x', 'aria-label': 'Fechar', onClick: () => dlg.close() }, icon('x'));
  const cab = cabecalho ?? h('h2', { class: 'modal-titulo' }, titulo);
  const alvo = cab.querySelector?.('[data-titulo]') ?? cab;
  if (!alvo.id) alvo.id = idTit;
  dlg.append(h('header', { class: 'modal-cab' }, cab, fechar), h('div', { class: 'modal-corpo' }, corpo));
  if (rodape) dlg.append(h('footer', { class: 'modal-rodape' }, rodape));
  dlg.addEventListener('close', () => { dlg.remove(); onFechar?.(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('cancel', () => { /* ESC: o evento close faz a limpeza */ });
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

/** Cabeçalho de tela (barra azul-marinho com botão voltar). */
export function barraTela(titulo, onVoltar) {
  return h('header', { class: 'appbar appbar-tela' },
    h('button', { type: 'button', class: 'btn-icone claro', 'aria-label': 'Voltar', onClick: onVoltar }, icon('back', 22)),
    h('h1', { class: 'appbar-titulo-tela', tabindex: '-1', id: 'titulo-tela' }, titulo));
}

export const rotuloSecao = (texto) => h('h2', { class: 'grupo' }, texto);
