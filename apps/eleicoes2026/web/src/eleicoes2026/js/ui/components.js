// Componentes compartilhados: chips, interruptores, fotos, etiquetas, cartão de candidatura, texto da resposta e diálogo modal.
import { h, icon, link } from '../dom.js';
import { linhasResposta } from '../formato.js';
import { fichaLimpa, urlFotoRemota } from '../model.js';

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

/**
 * Campo de uma linha lógica que cresce com o texto: <textarea> de 1 até `maxLinhas` linhas (depois rola). Não aceita quebra
 * de linha: Enter chama `onEnter` (se houver) e quebras coladas viram espaço. A altura é ajustada pelo CSSOM (el.style),
 * permitido pela CSP (que só bloqueia estilos inline em atributos/elementos).
 */
export function campoAutoAltura({ maxLinhas = 4, onEnter = null, classe = '', ...props }) {
  const el = h('textarea', { rows: '1', ...props, class: `auto-altura ${classe}`.trim(), 'data-max-linhas': String(maxLinhas) });
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    onEnter?.(e);
  });
  // teclados virtuais que não informam a tecla no keydown
  el.addEventListener('beforeinput', (e) => {
    if (e.inputType !== 'insertLineBreak' && e.inputType !== 'insertParagraph') return;
    e.preventDefault();
    onEnter?.(e);
  });
  el.addEventListener('input', () => {
    if (/[\r\n]/.test(el.value)) {
      const cursor = el.value.slice(0, el.selectionStart ?? el.value.length).replace(/[\r\n]+/g, ' ').length;
      el.value = el.value.replace(/[\r\n]+/g, ' ');
      el.setSelectionRange?.(cursor, cursor);
    }
    ajustarAltura(el);
  });
  ouvirRedimensionamento();
  (globalThis.requestAnimationFrame ?? setTimeout)(() => ajustarAltura(el)); // depois de inserido no documento
  return el;
}

/** Ajusta a altura de um campo criado por campoAutoAltura (chame depois de mudar `value` por código). */
export function ajustarAltura(el) {
  if (!el?.isConnected) return;
  const cs = getComputedStyle(el);
  const px = (v) => parseFloat(v) || 0;
  const linha = px(cs.lineHeight) || px(cs.fontSize) * 1.4;
  const bordas = px(cs.borderTopWidth) + px(cs.borderBottomWidth);
  const maximo = Math.ceil(linha * (Number(el.dataset.maxLinhas) || 4) + px(cs.paddingTop) + px(cs.paddingBottom) + bordas);
  el.style.height = 'auto';
  const alvo = el.scrollHeight + bordas;
  el.style.height = `${Math.min(alvo, maximo)}px`;
  const rola = alvo > maximo + 1;
  el.style.overflowY = rola ? 'auto' : 'hidden';
  // texto maior que o máximo, com o cursor no fim (digitando ou colando): mantém o fim visível
  if (rola && el.ownerDocument?.activeElement === el && el.selectionStart === el.value.length) el.scrollTop = el.scrollHeight;
}

/** Reajusta todos os campos automáticos visíveis (largura da janela ou tamanho do texto mudou). */
export function reajustarCamposAuto(raiz = globalThis.document) {
  for (const el of raiz?.querySelectorAll?.('textarea.auto-altura') ?? []) ajustarAltura(el);
}

let ouvindoJanela = false;
function ouvirRedimensionamento() {
  if (ouvindoJanela || typeof window === 'undefined') return;
  ouvindoJanela = true;
  let pendente = false;
  window.addEventListener('resize', () => {
    if (pendente) return;
    pendente = true;
    requestAnimationFrame(() => { pendente = false; reajustarCamposAuto(); });
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
  // Ficha Limpa derivada da situação oficial (só quando acrescenta informação à etiqueta acima)
  const ficha = fichaLimpa(c);
  if (ficha.name === 'SEM_IMPEDIMENTO' || ficha.impedimento === true) tags.push(etiqueta(ficha.curto, `ficha-${classeFicha(ficha)}`, iconeFicha(ficha)));
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

/** Cores da Ficha Limpa: ok = sem impedimento; imp = inelegibilidade reconhecida; ind = indeferida por outro motivo; neutro = demais. */
export function classeFicha(f) {
  if (f.name === 'SEM_IMPEDIMENTO') return 'ok';
  if (f.impedimento === true) return 'imp';
  if (f.name === 'INDEFERIDA_OUTRO_MOTIVO' || f.name === 'INDEFERIDA_SEM_MOTIVO') return 'ind';
  return 'neutro';
}
export const iconeFicha = (f) => (f.impedimento === false ? 'verified' : f.impedimento === true ? 'shieldX' : 'help');

/**
 * Texto de uma resposta da IA no formato em linhas (ver formato.js): 1ª linha em destaque, itens "• " em lista com
 * recuo, "Rótulo:" em negrito e URLs como links. Tudo via textContent/createElement (sem innerHTML com dados).
 */
export function textoResposta(texto) {
  const box = h('div', { class: 'resp-txt' });
  const conteudo = (partes) => partes.map((x) => (x.url ? link(x.url, x.url) : x.texto));
  let lista = null;
  for (const l of linhasResposta(texto)) {
    if (l.tipo === 'item') {
      if (!lista) { lista = h('ul', { class: 'resp-lista', role: 'list' }); box.append(lista); }
      lista.append(h('li', null, conteudo(l.partes)));
      continue;
    }
    lista = null;
    if (l.tipo === 'titulo') box.append(h('p', { class: 'resp-l1' }, conteudo(l.partes)));
    else if (l.tipo === 'campo') box.append(h('p', null, h('strong', null, `${l.rotulo}: `), conteudo(l.partes)));
    else box.append(h('p', null, conteudo(l.partes)));
  }
  return box;
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
