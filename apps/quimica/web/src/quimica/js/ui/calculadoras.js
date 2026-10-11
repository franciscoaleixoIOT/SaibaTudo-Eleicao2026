// Calculadoras com passo a passo (KaTeX): massa molar, balanceamento, estequiometria, concentração, pH, gás ideal e unidades.
// Todos os cálculos são determinísticos e rodam no aparelho (js/calc/); os números das constantes e massas vêm do pacote de dados.
import { balancear, lerEquacao } from '../calc/balancear.js';
import { calcularConcentracao, MODOS_CONCENTRACAO } from '../calc/concentracao.js';
import { calcularEstequiometria, converterQuantidade } from '../calc/estequiometria.js';
import { calcularGas } from '../calc/gas.js';
import { formulaUnicode } from '../calc/formula.js';
import { calcularMassaMolar } from '../calc/massa.js';
import { calcularPH, TIPOS_PH } from '../calc/ph.js';
import { converter } from '../calc/unidades.js';
import { buscarCompostos } from '../busca.js';
import { h, icon } from '../dom.js';
import { fmt, lerNumero } from '../formato.js';
import { mathEl } from '../math.js';
import { chip, erroEl, fonteEl, formulaEl, linkRota, passosEl, resultadosEl, tabelaEl } from './componentes.js';

// ------------------------------------------------------------------------------------------------ construtores de campos
let _n = 0;
const nid = (p) => `${p}-${++_n}`;

function campo({ rotulo, valor = '', placeholder = '', ajuda = '', inputmode = 'text', tipo = 'text' }) {
  const id = nid('c');
  const input = h('input', { id, class: 'campo', type: tipo, value: valor, placeholder, inputmode, autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', 'aria-describedby': ajuda ? `${id}-aj` : null });
  const raiz = h('div', null, h('label', { class: 'rotulo-campo', for: id }, rotulo), input, ajuda ? h('div', { class: 'ajuda-campo', id: `${id}-aj` }, ajuda) : null);
  return { raiz, input, valor: () => input.value.trim(), numero: () => lerNumero(input.value) };
}

function selecao({ rotulo, opcoes, valor }) {
  const id = nid('s');
  const sel = h('select', { id, class: 'campo' }, opcoes.map(([v, r]) => h('option', { value: v, selected: String(v) === String(valor) }, r)));
  const raiz = h('div', null, h('label', { class: 'rotulo-campo', for: id }, rotulo), sel);
  return { raiz, select: sel, valor: () => sel.value };
}

/** Campo numérico + seletor de unidade lado a lado. */
function valorUnidade({ rotulo, unidades, padrao, valor = '', ajuda = '' }) {
  const idV = nid('v');
  const idU = nid('u');
  const input = h('input', { id: idV, class: 'campo', type: 'text', inputmode: 'decimal', value: valor, autocomplete: 'off', 'aria-describedby': ajuda ? `${idV}-aj` : null });
  const sel = h('select', { id: idU, class: 'campo', 'aria-label': `Unidade de ${rotulo.toLowerCase()}` }, unidades.map((u) => h('option', { value: u, selected: u === padrao }, u)));
  const raiz = h('div', null, h('label', { class: 'rotulo-campo', for: idV }, rotulo), h('div', { class: 'campos-linha' }, input, sel), ajuda ? h('div', { class: 'ajuda-campo', id: `${idV}-aj` }, ajuda) : null);
  return { raiz, input, select: sel, numero: () => lerNumero(input.value), vazio: () => input.value.trim() === '', unidade: () => sel.value, dado: () => ({ valor: lerNumero(input.value), unidade: sel.value }) };
}

function unidadesDe(ctx, grupo, preferidas) {
  const todas = (ctx.unidades.grupos[grupo]?.itens ?? []).map((i) => i.simbolo);
  const certas = preferidas.filter((u) => todas.includes(u) || u === 'g/L');
  return certas.length ? certas : todas;
}

function exemplos(lista, aoEscolher) {
  return h('div', { class: 'chips exemplos', role: 'group', 'aria-label': 'Exemplos' }, lista.map((e) => chip({ rotulo: e, icone: false, onClick: () => aoEscolher(e) })));
}

// ------------------------------------------------------------------------------------------------ resultado
function resultadoEl(r, topo = null) {
  if (!r.ok) return erroEl(r.erro);
  return h('section', { class: 'res-calc', tabindex: '-1', 'aria-label': 'Resultado' },
    topo,
    r.resultados?.length ? resultadosEl(r.resultados) : null,
    r.tabela && r.tabela.length ? tabelaEstequio(r) : null,
    r.passos?.length ? h('details', { open: true }, h('summary', { class: 'bloco-tit' }, 'Passo a passo'), passosEl(r.passos)) : null,
    r.notas?.length ? h('ul', { class: 'notas lista-pontos' }, r.notas.map((n) => h('li', null, n))) : null,
    r.fontes?.length ? fonteEl(r.fontes.map((f) => (typeof f === 'string' ? { nome: f } : f))) : null);
}

function tabelaEstequio(r) {
  const fm = (x) => (x == null ? '—' : fmt(x, { sig: 6 }));
  return h('details', { open: true }, h('summary', { class: 'bloco-tit' }, 'Quantidades de cada substância'), tabelaEl({
    legenda: 'Reagentes: quantidades iniciais, consumidas e restantes; produtos: formados',
    cabecalho: ['Substância', 'Papel', 'Coef.', 'M (g/mol)', 'Mol', 'Massa (g)', 'Partículas', 'Volume CNTP (L)'],
    linhas: r.tabela.map((t) => [formulaUnicode(t.formula), t.lado === 'produto' ? 'produto' : t.limitante ? 'reagente limitante' : 'reagente', String(t.coef), fm(t.massaMolar),
      fm(t.lado === 'produto' ? t.formadoMol : t.inicialMol ?? t.necessarioMol), fm(t.lado === 'produto' ? t.formadoG : (t.inicialMol != null ? t.inicialMol * t.massaMolar : t.necessarioG)),
      t.lado === 'produto' ? fm(t.particulas) : '—', t.lado === 'produto' ? fm(t.volumeL) : '—'])
  }));
}

// ------------------------------------------------------------------------------------------------ definição das calculadoras
function calcMassaMolar({ ctx, store, query, mostrar }) {
  const f = campo({ rotulo: 'Fórmula química', valor: query.get('f') ?? '', placeholder: 'Ex.: Ca(OH)2, CuSO4·5H2O, Fe2(SO4)3', ajuda: 'Parênteses, hidratos com "·" (ou "."), cargas no fim: Fe3+, SO4^2-.' });
  const executar = async () => {
    const r = calcularMassaMolar(f.valor(), ctx);
    let topo = null;
    if (r.ok) {
      const comp = buscarCompostos(store.indice.entradas, r.formula, 3).find((c) => c.motivo === 'fórmula');
      const reg = comp ? await store.composto(comp.cid).catch(() => null) : null;
      topo = h('p', null, formulaEl(r.formula, { grande: true }), comp ? [' — ', linkRota(`/quimica/composto/${comp.cid}`, `ficha de ${reg?.nome ?? comp.nome ?? reg?.nomeIupac ?? `CID ${comp.cid}`}`)] : null);
    }
    mostrar(resultadoEl(r, topo));
  };
  const form = h('form', { class: 'form-calc', onSubmit: (e) => { e.preventDefault(); executar(); } }, f.raiz,
    exemplos(['H2O', 'Ca(OH)2', 'CuSO4·5H2O', 'C6H12O6', 'Fe2(SO4)3'], (e) => { f.input.value = e; executar(); }),
    h('div', { class: 'form-acoes' }, h('button', { class: 'btn btn-primario', type: 'submit' }, 'Calcular massa molar')));
  return { form, autoexecutar: !!f.valor(), executar };
}

function calcBalanceamento({ ctx, query, mostrar }) {
  const eq = campo({ rotulo: 'Equação química', valor: query.get('eq') ?? '', placeholder: 'Ex.: Fe + O2 -> Fe2O3', ajuda: 'Separe as substâncias com "+" e use "->" ou "→". Íons valem: Zn + Cu2+ -> Zn2+ + Cu. Estados (s), (l), (g), (aq) são ignorados.' });
  const executar = () => {
    const r = balancear(eq.valor(), { simbolos: ctx.simbolos });
    if (!r.ok) { mostrar(erroEl(r.erro)); return; }
    mostrar(h('section', { class: 'res-calc', tabindex: '-1', 'aria-label': 'Resultado' },
      h('div', { class: 'equacao-final' }, mathEl(r.equacaoTex), h('span', { class: 'sr-only' }, r.equacao)),
      h('details', { open: true }, h('summary', { class: 'bloco-tit' }, 'Passo a passo'), passosEl(r.passos.slice(0, -1))),
      h('div', { class: 'tabela-rolagem' }, tabelaEl({ legenda: 'Conferência: átomos de cada elemento (e carga) nos dois lados', cabecalho: ['Elemento', 'Reagentes', 'Produtos', 'Igual?'], linhas: r.verificacao.map((v) => [v.elemento === 'carga' ? 'carga' : v.elemento, String(v.esquerda), String(v.direita), v.ok ? 'sim' : 'não']) })),
      r.digitouCoeficientes ? h('p', { class: 'notas' }, 'Os coeficientes digitados foram ignorados: o aplicativo balanceia a equação inteira.') : null));
  };
  const form = h('form', { class: 'form-calc', onSubmit: (e) => { e.preventDefault(); executar(); } }, eq.raiz,
    exemplos(['Fe + O2 -> Fe2O3', 'C8H18 + O2 -> CO2 + H2O', 'Al + HCl -> AlCl3 + H2', 'Zn + Cu2+ -> Zn2+ + Cu', 'KMnO4 + HCl -> KCl + MnCl2 + H2O + Cl2'], (e) => { eq.input.value = e; executar(); }),
    h('div', { class: 'form-acoes' }, h('button', { class: 'btn btn-primario', type: 'submit' }, 'Balancear')));
  return { form, autoexecutar: !!eq.valor(), executar };
}

function calcEstequiometria({ ctx, query, mostrar }) {
  const UNID_QTD = ['g', 'mg', 'kg', 'mol', 'mmol', 'L', 'mL', 'partículas'];
  const modo = selecao({ rotulo: 'O que você quer fazer?', opcoes: [['conv', 'Converter massa, mol, partículas e volume (CNTP) de uma substância'], ['reacao', 'Reação: reagente limitante e quantidade de produtos']], valor: query.get('eq') ? 'reacao' : 'conv' });
  const area = h('div');
  let estadoLinhas = new Map();

  function montarConv() {
    const f = campo({ rotulo: 'Substância (fórmula)', valor: query.get('f') ?? '', placeholder: 'Ex.: H2O, CO2, NaCl' });
    const q = valorUnidade({ rotulo: 'Quantidade', unidades: UNID_QTD, padrao: UNID_QTD.includes(query.get('u')) ? query.get('u') : 'g', valor: query.get('v') ?? '', ajuda: 'L e mL = volume de um gás ideal nas CNTP (0 °C e 1 atm). "partículas" = moléculas, átomos ou íons.' });
    area.replaceChildren(f.raiz, q.raiz);
    return () => {
      let unidade = q.unidade();
      if (unidade === 'partículas') unidade = 'particulas';
      mostrar(resultadoEl(converterQuantidade({ formula: f.valor(), valor: q.numero(), unidade }, ctx)));
    };
  }

  function montarReacao() {
    const eq = campo({ rotulo: 'Equação química', valor: query.get('eq') ?? '', placeholder: 'Ex.: H2 + O2 -> H2O', ajuda: 'O aplicativo balanceia a equação. Informe a quantidade de pelo menos uma substância.' });
    const linhas = h('div', { class: 'grade-campos' });
    const rend = campo({ rotulo: 'Rendimento (%)', valor: '100', inputmode: 'decimal', ajuda: 'Opcional. 100 % = rendimento teórico.' });
    let especies = [];
    function atualizarLinhas() {
      let lidas = [];
      try { const e = lerEquacao(eq.valor(), { simbolos: ctx.simbolos }); lidas = [...e.reagentes, ...e.produtos].filter((s) => !s.eletron); } catch { lidas = []; }
      especies = lidas.map((s) => ({ formula: s.corpo, vu: estadoLinhas.get(s.corpo) ?? valorUnidade({ rotulo: `Quantidade de ${formulaUnicode(s.corpo)}`, unidades: UNID_QTD, padrao: 'g' }) }));
      for (const s of especies) estadoLinhas.set(s.formula, s.vu);
      linhas.replaceChildren(...especies.map((s) => s.vu.raiz));
    }
    eq.input.addEventListener('input', atualizarLinhas);
    area.replaceChildren(eq.raiz, linhas, rend.raiz);
    atualizarLinhas();
    return () => {
      const dados = especies.filter((s) => !s.vu.vazio()).map((s) => ({ especie: s.formula, valor: s.vu.numero(), unidade: s.vu.unidade() === 'partículas' ? 'particulas' : s.vu.unidade() }));
      const rr = rend.valor() === '' ? 100 : lerNumero(rend.valor());
      mostrar(resultadoEl(calcularEstequiometria({ equacao: eq.valor(), dados, rendimento: rr }, ctx), null));
    };
  }

  let executarAtual = null;
  function trocar() { estadoLinhas = new Map(); executarAtual = modo.valor() === 'reacao' ? montarReacao() : montarConv(); mostrar(null); }
  modo.select.addEventListener('change', trocar);
  trocar();
  const form = h('form', { class: 'form-calc', onSubmit: (e) => { e.preventDefault(); executarAtual(); } }, modo.raiz, area,
    h('div', { class: 'form-acoes' }, h('button', { class: 'btn btn-primario', type: 'submit' }, 'Calcular')));
  return { form, autoexecutar: !!(query.get('f') && query.get('v')), executar: () => executarAtual() };
}

function calcConcentracao({ ctx, mostrar }) {
  const MASSA = unidadesDe(ctx, 'massa', ['g', 'mg', 'kg']);
  const VOL = unidadesDe(ctx, 'volume', ['L', 'mL']);
  const modo = selecao({ rotulo: 'Tipo de cálculo', opcoes: MODOS_CONCENTRACAO.map((m) => [m.id, m.rotulo]), valor: 'molaridade' });
  const area = h('div');
  let leitura = () => ({});
  function montar() {
    const m = modo.valor();
    if (m === 'molaridade') {
      const f = campo({ rotulo: 'Soluto (fórmula)', placeholder: 'Ex.: NaCl' }); const ms = valorUnidade({ rotulo: 'Massa do soluto', unidades: MASSA, padrao: 'g' }); const v = valorUnidade({ rotulo: 'Volume da solução', unidades: VOL, padrao: 'mL' });
      area.replaceChildren(h('div', { class: 'grade-campos' }, f.raiz, ms.raiz, v.raiz)); leitura = () => ({ modo: m, formula: f.valor(), massa: ms.dado(), volume: v.dado() });
    } else if (m === 'massa') {
      const f = campo({ rotulo: 'Soluto (fórmula)', placeholder: 'Ex.: NaOH' }); const c = valorUnidade({ rotulo: 'Concentração desejada', unidades: ['mol/L', 'mmol/L', 'g/L'], padrao: 'mol/L' }); const v = valorUnidade({ rotulo: 'Volume da solução', unidades: VOL, padrao: 'mL' });
      area.replaceChildren(h('div', { class: 'grade-campos' }, f.raiz, c.raiz, v.raiz)); leitura = () => ({ modo: m, formula: f.valor(), concentracao: c.dado(), volume: v.dado() });
    } else if (m === 'gl-mol') {
      const f = campo({ rotulo: 'Soluto (fórmula)', placeholder: 'Ex.: NaCl' }); const c = campo({ rotulo: 'Valor da concentração', inputmode: 'decimal' }); const d = selecao({ rotulo: 'Converter', opcoes: [['g/L', 'g/L → mol/L'], ['mol/L', 'mol/L → g/L']], valor: 'g/L' });
      area.replaceChildren(h('div', { class: 'grade-campos' }, f.raiz, c.raiz, d.raiz)); leitura = () => ({ modo: m, formula: f.valor(), valor: c.numero(), de: d.valor() });
    } else if (m === 'percentual-mm') {
      const a = valorUnidade({ rotulo: 'Massa do soluto', unidades: MASSA, padrao: 'g' }); const b = valorUnidade({ rotulo: 'Massa da solução', unidades: MASSA, padrao: 'g' });
      area.replaceChildren(h('div', { class: 'grade-campos' }, a.raiz, b.raiz)); leitura = () => ({ modo: m, soluto: a.dado(), solucao: b.dado() });
    } else if (m === 'percentual-mv') {
      const a = valorUnidade({ rotulo: 'Massa do soluto', unidades: MASSA, padrao: 'g' }); const v = valorUnidade({ rotulo: 'Volume da solução', unidades: VOL, padrao: 'mL' });
      area.replaceChildren(h('div', { class: 'grade-campos' }, a.raiz, v.raiz)); leitura = () => ({ modo: m, soluto: a.dado(), volume: v.dado() });
    } else {
      const uc = selecao({ rotulo: 'Unidade de concentração', opcoes: [['mol/L', 'mol/L'], ['mmol/L', 'mmol/L'], ['g/L', 'g/L'], ['%', '%']], valor: 'mol/L' }); const uv = selecao({ rotulo: 'Unidade de volume', opcoes: VOL.map((u) => [u, u]), valor: 'mL' });
      const c1 = campo({ rotulo: 'C₁ (concentração inicial)', inputmode: 'decimal' }); const v1 = campo({ rotulo: 'V₁ (volume inicial)', inputmode: 'decimal' });
      const c2 = campo({ rotulo: 'C₂ (concentração final)', inputmode: 'decimal' }); const v2 = campo({ rotulo: 'V₂ (volume final)', inputmode: 'decimal' });
      area.replaceChildren(h('p', { class: 'ajuda-campo' }, 'Deixe em branco o campo que você quer calcular.'), h('div', { class: 'grade-campos' }, uc.raiz, uv.raiz, c1.raiz, v1.raiz, c2.raiz, v2.raiz));
      const val = (x) => (x.valor() === '' ? null : x.numero());
      leitura = () => ({ modo: 'diluicao', C1: val(c1), V1: val(v1), C2: val(c2), V2: val(v2), unidadeC: uc.valor(), unidadeV: uv.valor() });
    }
    mostrar(null);
  }
  modo.select.addEventListener('change', montar);
  montar();
  const form = h('form', { class: 'form-calc', onSubmit: (e) => { e.preventDefault(); mostrar(resultadoEl(calcularConcentracao(leitura(), ctx))); } }, modo.raiz, area,
    h('div', { class: 'form-acoes' }, h('button', { class: 'btn btn-primario', type: 'submit' }, 'Calcular')));
  return { form, autoexecutar: false };
}

function calcPH({ ctx, mostrar }) {
  const tipo = selecao({ rotulo: 'Tipo de solução', opcoes: TIPOS_PH.map((t) => [t.id, t.rotulo]), valor: 'acido-forte' });
  const area = h('div');
  let leitura = () => ({});
  function montar() {
    const t = tipo.valor();
    if (t === 'acido-forte' || t === 'base-forte') {
      const c = campo({ rotulo: 'Concentração (mol/L)', inputmode: 'decimal', placeholder: 'Ex.: 0,01' }); const n = campo({ rotulo: t === 'acido-forte' ? 'H⁺ liberados por fórmula' : 'OH⁻ liberados por fórmula', valor: '1', inputmode: 'numeric', ajuda: 'HCl = 1; H₂SO₄ = 2 (modelo escolar); NaOH = 1; Ca(OH)₂ = 2.' });
      area.replaceChildren(h('div', { class: 'grade-campos' }, c.raiz, n.raiz)); leitura = () => ({ tipo: t, C: c.numero(), n: n.numero() });
    } else if (t === 'acido-fraco' || t === 'base-fraca') {
      const ac = t === 'acido-fraco';
      const c = campo({ rotulo: 'Concentração (mol/L)', inputmode: 'decimal', placeholder: 'Ex.: 0,1' });
      const k = campo({ rotulo: ac ? 'Ka ou pKa' : 'Kb ou pKb', inputmode: 'decimal', placeholder: ac ? 'Ex.: 1,8e-5' : 'Ex.: 1,8e-5', ajuda: 'Notação científica: 1,8e-5 ou 1,8 x 10^-5.' });
      const s = selecao({ rotulo: 'O valor informado é', opcoes: ac ? [['K', 'Ka'], ['pK', 'pKa']] : [['K', 'Kb'], ['pK', 'pKb']], valor: 'K' });
      area.replaceChildren(h('div', { class: 'grade-campos' }, c.raiz, k.raiz, s.raiz));
      leitura = () => { const v = k.numero(); const e = { tipo: t, C: c.numero() }; if (s.valor() === 'K') e[ac ? 'Ka' : 'Kb'] = v; else e[ac ? 'pKa' : 'pKb'] = v; return e; };
    } else {
      const q = selecao({ rotulo: 'Valor conhecido', opcoes: [['pH', 'pH'], ['pOH', 'pOH'], ['H', '[H⁺] (mol/L)'], ['OH', '[OH⁻] (mol/L)']], valor: 'pH' }); const v = campo({ rotulo: 'Valor', inputmode: 'decimal' });
      area.replaceChildren(h('div', { class: 'grade-campos' }, q.raiz, v.raiz)); leitura = () => ({ tipo: 'converter', [q.valor()]: v.numero() });
    }
    mostrar(null);
  }
  tipo.select.addEventListener('change', montar);
  montar();
  const form = h('form', { class: 'form-calc', onSubmit: (e) => { e.preventDefault(); mostrar(resultadoEl(calcularPH(leitura(), ctx))); } }, tipo.raiz, area,
    h('div', { class: 'form-acoes' }, h('button', { class: 'btn btn-primario', type: 'submit' }, 'Calcular pH')));
  return { form, autoexecutar: false };
}

function calcGas({ ctx, mostrar }) {
  const alvo = selecao({ rotulo: 'Calcular', opcoes: [['V', 'Volume (V)'], ['P', 'Pressão (P)'], ['n', 'Quantidade de matéria (n)'], ['T', 'Temperatura (T)']], valor: 'V' });
  const P = valorUnidade({ rotulo: 'Pressão (P)', unidades: unidadesDe(ctx, 'pressao', ['atm', 'kPa', 'Pa', 'bar', 'mmHg']), padrao: 'atm' });
  const V = valorUnidade({ rotulo: 'Volume (V)', unidades: unidadesDe(ctx, 'volume', ['L', 'mL', 'm3', 'cm3']), padrao: 'L' });
  const N = valorUnidade({ rotulo: 'Quantidade de matéria (n)', unidades: unidadesDe(ctx, 'quantidade', ['mol', 'mmol']), padrao: 'mol' });
  const T = valorUnidade({ rotulo: 'Temperatura (T)', unidades: unidadesDe(ctx, 'temperatura', ['K', '°C', '°F']), padrao: 'K' });
  const usarMassa = h('input', { type: 'checkbox', id: 'usar-massa' });
  const f = campo({ rotulo: 'Fórmula do gás', placeholder: 'Ex.: CO2' });
  const m = valorUnidade({ rotulo: 'Massa do gás', unidades: unidadesDe(ctx, 'massa', ['g', 'mg', 'kg']), padrao: 'g' });
  const blocoMassa = h('div', { class: 'grade-campos', hidden: true }, f.raiz, m.raiz);
  const campos = { P, V, n: N, T };
  const nBloco = h('div', null, N.raiz);
  function atualizar() {
    const a = alvo.valor();
    for (const [k, c] of Object.entries(campos)) { c.input.disabled = k === a; c.select.disabled = k === a; if (k === a) c.input.value = ''; }
    const massa = usarMassa.checked && a !== 'n';
    blocoMassa.hidden = !massa;
    nBloco.hidden = massa;
    mostrar(null);
  }
  alvo.select.addEventListener('change', atualizar);
  usarMassa.addEventListener('change', atualizar);
  const executar = () => {
    const a = alvo.valor();
    const entrada = { resolver: a };
    for (const [k, c] of Object.entries(campos)) if (k !== a && !(k === 'n' && usarMassa.checked)) entrada[k] = c.dado();
    if (usarMassa.checked && a !== 'n') { entrada.massa = m.dado(); entrada.formula = f.valor(); }
    entrada.saida = campos[a].unidade();
    mostrar(resultadoEl(calcularGas(entrada, ctx), h('div', { class: 'equacao-final' }, mathEl('PV = nRT'))));
  };
  const form = h('form', { class: 'form-calc', onSubmit: (e) => { e.preventDefault(); executar(); } }, alvo.raiz,
    h('div', { class: 'grade-campos' }, P.raiz, V.raiz, nBloco, T.raiz),
    h('div', { class: 'radio-linha' }, h('label', { class: 'radio', for: 'usar-massa' }, usarMassa, h('span', null, 'Informar massa e fórmula do gás em vez de n'))),
    blocoMassa,
    h('div', { class: 'form-acoes' }, h('button', { class: 'btn btn-primario', type: 'submit' }, 'Calcular')));
  atualizar();
  return { form, autoexecutar: false };
}

function calcUnidades({ ctx, mostrar }) {
  const grupos = Object.entries(ctx.unidades.grupos).filter(([, g]) => g.itens.length > 1);
  const grandeza = selecao({ rotulo: 'Grandeza', opcoes: grupos.map(([g]) => [g, ROTULO_GRANDEZA[g] ?? g]), valor: grupos.some(([g]) => g === 'pressao') ? 'pressao' : grupos[0]?.[0] });
  const valor = campo({ rotulo: 'Valor', inputmode: 'decimal', placeholder: 'Ex.: 5', valor: '1' });
  const de = h('select', { id: 'u-de', class: 'campo' });
  const para = h('select', { id: 'u-para', class: 'campo' });
  function opcoes() {
    const g = ctx.unidades.grupos[grandeza.valor()];
    const itens = g?.itens ?? [];
    for (const [sel, pad] of [[de, 0], [para, 1]]) sel.replaceChildren(...itens.map((i, k) => h('option', { value: i.simbolo, selected: k === Math.min(pad, itens.length - 1) }, `${i.simbolo} — ${i.nome}`)));
    mostrar(null);
  }
  grandeza.select.addEventListener('change', opcoes);
  opcoes();
  const executar = () => {
    const r = converter(valor.numero(), de.value, para.value, ctx.unidades, grandeza.valor());
    if (!r.ok) { mostrar(erroEl(r.erro)); return; }
    mostrar(resultadoEl({ ok: true, resultados: [{ rotulo: `${fmt(r.valor, { sig: 10 })} ${r.de} equivale a`, valor: fmt(r.resultado, { sig: 10 }), unidade: r.para, destaque: true }], passos: r.passos, notas: [], fontes: [{ nome: `Tabela de unidades: ${r.origem}` }] }));
  };
  const form = h('form', { class: 'form-calc', onSubmit: (e) => { e.preventDefault(); executar(); } }, grandeza.raiz,
    h('div', { class: 'grade-campos' }, valor.raiz, h('div', null, h('label', { class: 'rotulo-campo', for: 'u-de' }, 'De'), de), h('div', null, h('label', { class: 'rotulo-campo', for: 'u-para' }, 'Para'), para)),
    h('div', { class: 'form-acoes' },
      h('button', { class: 'btn btn-primario', type: 'submit' }, 'Converter'),
      h('button', { class: 'btn btn-contorno', type: 'button', onClick: () => { const a = de.value; de.value = para.value; para.value = a; executar(); } }, icon('swap', 16), 'Inverter')));
  return { form, autoexecutar: false };
}

const ROTULO_GRANDEZA = { massa: 'Massa', volume: 'Volume', comprimento: 'Comprimento', pressao: 'Pressão', energia: 'Energia', temperatura: 'Temperatura', tempo: 'Tempo', quantidade: 'Quantidade de matéria', concentracao: 'Concentração' };

export const CALCULADORAS = [
  { id: 'massa-molar', titulo: 'Massa molar', descricao: 'Soma das massas atômicas do pacote de dados, com composição percentual.', icone: 'flask', montar: calcMassaMolar },
  { id: 'balanceamento', titulo: 'Balanceamento de equações', descricao: 'Álgebra linear exata, com íons e passos.', icone: 'swap', montar: calcBalanceamento },
  { id: 'estequiometria', titulo: 'Estequiometria', descricao: 'Massa, mol, partículas e volume (CNTP); reagente limitante.', icone: 'calculator', montar: calcEstequiometria },
  { id: 'concentracao', titulo: 'Concentração e diluição', descricao: 'Molaridade, g/L, percentuais e C₁V₁ = C₂V₂.', icone: 'molecule', montar: calcConcentracao },
  { id: 'ph', titulo: 'pH', descricao: 'Ácidos e bases fortes, fracos (com Ka ou Kb) e conversões.', icone: 'info', montar: calcPH },
  { id: 'gas-ideal', titulo: 'Gás ideal', descricao: 'PV = nRT com a constante R do pacote (CODATA).', icone: 'sparkles', montar: calcGas },
  { id: 'unidades', titulo: 'Conversão de unidades', descricao: 'Pressão, volume, massa, temperatura, energia e mais.', icone: 'refresh', montar: calcUnidades }
];

export function viewCalculadoras({ store, params, query }) {
  const def = CALCULADORAS.find((c) => c.id === params.id);
  if (!params.id) {
    return { titulo: 'Calculadoras', node: h('div', null,
      h('h1', { class: 'titulo-pagina', id: 'titulo-pagina', tabindex: '-1' }, 'Calculadoras'),
      h('p', { class: 'sub-pagina' }, 'Cada resultado mostra os passos e as fórmulas. Tudo é calculado no seu aparelho; massas atômicas e constantes vêm do pacote de dados assinado.'),
      h('div', { class: 'cartoes' }, CALCULADORAS.map((c) => h('a', { class: 'cartao', href: `/quimica/calculadoras/${c.id}` }, icon(c.icone, 24), h('strong', null, c.titulo), h('span', null, c.descricao))))) };
  }
  if (!def) {
    return { titulo: 'Calculadora não encontrada', status: 404, node: h('div', null, h('h1', { class: 'titulo-pagina', id: 'titulo-pagina', tabindex: '-1' }, 'Calculadora não encontrada'), linkRota('/quimica/calculadoras', 'Ver todas as calculadoras', { class: 'btn btn-primario' })) };
  }
  const saida = h('div', { id: 'resultado', 'aria-live': 'polite' });
  const mostrar = (no) => { saida.replaceChildren(...(no ? [no] : [])); if (no?.tagName === 'SECTION') no.focus({ preventScroll: false }); };
  const { form, autoexecutar, executar } = def.montar({ ctx: store.ctx, store, query, mostrar });
  const no = h('div', null,
    linkRota('/quimica/calculadoras', [icon('back', 16), ' Calculadoras'], { class: 'voltar' }),
    h('h1', { class: 'titulo-pagina', id: 'titulo-pagina', tabindex: '-1' }, def.titulo),
    h('p', { class: 'sub-pagina' }, def.descricao),
    form, saida);
  if (autoexecutar && executar) setTimeout(executar, 0);
  return { titulo: def.titulo, node: no };
}
