// Conversão de unidades. A tabela vem de `regras.json` (prefixos SI e unidades, ver docs/DATA_CONTRACT.md §6); se o pacote não
// trouxer uma tabela utilizável, usa-se a tabela padrão abaixo (definições exatas do SI e de unidades legais) e a resposta diz isso.
import { fmt, fmtTex } from '../formato.js';

/** Prefixos SI (BIPM): símbolo → fator. */
export const PREFIXOS_PADRAO = [
  ['Q', 'quetta', 1e30], ['R', 'ronna', 1e27], ['Y', 'yotta', 1e24], ['Z', 'zetta', 1e21], ['E', 'exa', 1e18], ['P', 'peta', 1e15], ['T', 'tera', 1e12],
  ['G', 'giga', 1e9], ['M', 'mega', 1e6], ['k', 'quilo', 1e3], ['h', 'hecto', 1e2], ['da', 'deca', 1e1], ['d', 'deci', 1e-1], ['c', 'centi', 1e-2],
  ['m', 'mili', 1e-3], ['µ', 'micro', 1e-6], ['n', 'nano', 1e-9], ['p', 'pico', 1e-12], ['f', 'femto', 1e-15], ['a', 'atto', 1e-18],
  ['z', 'zepto', 1e-21], ['y', 'yocto', 1e-24], ['r', 'ronto', 1e-27], ['q', 'quecto', 1e-30]
].map(([simbolo, nome, fator]) => ({ simbolo, nome, fator }));

// [símbolo, fator para a unidade base, nome, prefixável, aliases]
const T = (base, itens) => ({ base, itens: itens.map(([simbolo, fator, nome, prefixavel = false, aliases = [], offset = 0]) => ({ simbolo, fator, nome, prefixavel, aliases, offset })) });

export const UNIDADES_PADRAO = {
  massa: T('kg', [['kg', 1, 'quilograma'], ['g', 1e-3, 'grama', true], ['t', 1e3, 'tonelada'], ['lb', 0.45359237, 'libra'], ['oz', 0.028349523125, 'onça'], ['µg', 1e-9, 'micrograma', false, ['ug', 'mcg']]]),
  volume: T('m3', [['m3', 1, 'metro cúbico', false, ['m³']], ['L', 1e-3, 'litro', true, ['l']], ['cm3', 1e-6, 'centímetro cúbico', false, ['cm³', 'cc']], ['dm3', 1e-3, 'decímetro cúbico', false, ['dm³']], ['µL', 1e-9, 'microlitro', false, ['uL']], ['gal', 0.003785411784, 'galão (EUA)']]),
  comprimento: T('m', [['m', 1, 'metro', true], ['Å', 1e-10, 'ångström', false, ['A°', 'angstrom']], ['in', 0.0254, 'polegada', false, ['pol']], ['ft', 0.3048, 'pé'], ['mi', 1609.344, 'milha']]),
  pressao: T('Pa', [['Pa', 1, 'pascal', true], ['bar', 1e5, 'bar', true], ['atm', 101325, 'atmosfera'], ['mmHg', 101325 / 760, 'milímetro de mercúrio', false, ['torr', 'Torr']], ['psi', 6894.757293168, 'libra-força por polegada quadrada']]),
  energia: T('J', [['J', 1, 'joule', true], ['cal', 4.184, 'caloria termoquímica', true], ['eV', 1.602176634e-19, 'elétron-volt', true], ['kWh', 3.6e6, 'quilowatt-hora']]),
  temperatura: T('K', [['K', 1, 'kelvin'], ['°C', 1, 'grau Celsius', false, ['ºC', 'oC', 'C', '℃'], 273.15], ['°F', 5 / 9, 'grau Fahrenheit', false, ['ºF', 'oF', 'F', '℉'], (459.67 * 5) / 9]]),
  tempo: T('s', [['s', 1, 'segundo', true], ['min', 60, 'minuto'], ['h', 3600, 'hora'], ['d', 86400, 'dia']]),
  quantidade: T('mol', [['mol', 1, 'mol', true]]),
  concentracao: T('mol/m3', [['mol/L', 1000, 'mol por litro', false, ['M', 'mol/l', 'molar', 'mol·L⁻¹', 'mol.L-1']], ['mmol/L', 1, 'milimol por litro', false, ['mM']], ['µmol/L', 1e-3, 'micromol por litro', false, ['uM']]])
};

const norm = (s) => String(s).normalize('NFC').replace(/\s+/g, '').replace(/[ºo˚](?=[CFK]$)/, '°').replace(/μ/g, 'µ');

/** Normaliza a seção `regras.unidades` do pacote (vários formatos) para a forma interna. Devolve null se não houver nada utilizável. */
export function normalizarUnidades(regras) {
  const src = regras?.unidades ?? regras?.conversaoUnidades ?? null;
  if (!src || typeof src !== 'object') return null;
  const grupos = {};
  const entradas = Array.isArray(src) ? src.map((g) => [g.grandeza ?? g.id ?? g.nome, g]) : Object.entries(src);
  for (const [nomeGrupo, g] of entradas) {
    if (!g || typeof g !== 'object') continue;
    // formato do pipeline: { nome, base, fatores: {símbolo: fator} } e, para temperatura, afins: {símbolo: {a, b}} com base = a·x + b
    const lista = g.unidades ?? g.itens ?? g.simbolos;
    let pares = [];
    if (g.fatores && typeof g.fatores === 'object') pares.push(...Object.entries(g.fatores));
    if (g.afins && typeof g.afins === 'object') pares.push(...Object.entries(g.afins).map(([s, o]) => [s, { fator: o.a, offset: o.b }]));
    if (!pares.length && lista) pares = Array.isArray(lista) ? lista.map((u) => [u.simbolo ?? u.unidade ?? u.id, u]) : Object.entries(lista);
    if (!pares.length) continue;
    const itens = [];
    const padraoDoGrupo = UNIDADES_PADRAO[String(nomeGrupo)]?.itens ?? [];
    for (const [simbolo, u] of pares) {
      const obj = typeof u === 'number' ? { fator: u } : u;
      const fator = Number(obj?.fator ?? obj?.paraBase ?? obj?.fatorParaBase);
      if (!simbolo || !Number.isFinite(fator) || fator === 0) continue;
      const pad = padraoDoGrupo.find((i) => i.simbolo === String(simbolo));
      itens.push({
        simbolo: String(simbolo), fator, offset: Number(obj.offset ?? obj.deslocamento ?? 0) || 0, nome: obj.nome ?? pad?.nome ?? String(simbolo),
        prefixavel: obj.prefixavel === true || obj.prefixos === true || pad?.prefixavel === true,
        aliases: [...new Set([...(Array.isArray(obj.aliases) ? obj.aliases.map(String) : []), ...(pad?.aliases ?? [])])]
      });
    }
    if (itens.length) grupos[String(nomeGrupo)] = { base: g.base ?? g.unidadeBase ?? itens.find((i) => i.fator === 1 && !i.offset)?.simbolo ?? itens[0].simbolo, itens };
  }
  const brutosPref = regras.prefixosSi ?? regras.prefixosSI ?? regras.prefixos ?? null;
  const prefixos = Array.isArray(brutosPref)
    ? brutosPref.map((p) => ({ simbolo: String(p.simbolo ?? p.prefixo), nome: p.nome ?? p.prefixo, fator: Number(p.fator ?? (p.expoente != null ? 10 ** p.expoente : NaN)) })).filter((p) => p.simbolo && Number.isFinite(p.fator))
    : null;
  // grandezas que o pacote não traz (ex.: concentração) vêm da tabela padrão
  for (const [nome, g] of Object.entries(UNIDADES_PADRAO)) if (!grupos[nome]) grupos[nome] = g;
  return paresDoPacote(grupos, src) ? { grupos, prefixos: prefixos?.length ? prefixos : null } : null;
}

/** Tabela efetiva: a do pacote quando utilizável, senão a padrão. */
export function tabelaDeUnidades(regras) {
  const doPacote = normalizarUnidades(regras);
  if (doPacote) {
    return { ...doPacote, prefixos: doPacote.prefixos ?? PREFIXOS_PADRAO, origem: 'regras.json (pacote de dados assinado)', doPacote: true };
  }
  return { grupos: UNIDADES_PADRAO, prefixos: PREFIXOS_PADRAO, origem: 'tabela padrão do aplicativo (definições do SI)', doPacote: false };
}

function acharItem(grupo, simbolo) {
  const n = norm(simbolo);
  return grupo.itens.find((i) => norm(i.simbolo) === n) ?? grupo.itens.find((i) => i.aliases.some((a) => norm(a) === n))
    ?? grupo.itens.find((i) => norm(i.simbolo).toLowerCase() === n.toLowerCase() && n.length > 1)
    ?? null;
}

/** Procura a unidade em todos os grupos (com prefixos SI). @returns {{grupo: string, item: object, fator: number, offset: number, rotulo: string}[]} */
export function acharUnidade(tabela, simbolo) {
  const achados = [];
  for (const [nome, grupo] of Object.entries(tabela.grupos)) {
    const it = acharItem(grupo, simbolo);
    if (it) { achados.push({ grupo: nome, item: it, fator: it.fator, offset: it.offset ?? 0, rotulo: it.simbolo }); continue; }
    const s = norm(simbolo);
    for (const p of [...tabela.prefixos].sort((a, b) => b.simbolo.length - a.simbolo.length)) {
      if (!s.startsWith(p.simbolo) || s.length === p.simbolo.length) continue;
      const base = acharItem(grupo, s.slice(p.simbolo.length));
      if (base && base.prefixavel && !base.offset) {
        achados.push({ grupo: nome, item: base, fator: base.fator * p.fator, offset: 0, rotulo: s });
        break;
      }
    }
  }
  return achados;
}

/**
 * Converte um valor entre duas unidades da mesma grandeza.
 * @returns {{ok: true, valor: number, de: string, para: string, resultado: number, grupo: string, passos: object[], origem: string} | {ok: false, erro: string}}
 */
export function converter(valor, de, para, tabela, grandeza = null) {
  if (!Number.isFinite(valor)) return { ok: false, erro: 'Informe um número para converter.' };
  const A = acharUnidade(tabela, de).filter((x) => !grandeza || x.grupo === grandeza);
  const B = acharUnidade(tabela, para).filter((x) => !grandeza || x.grupo === grandeza);
  if (A.length === 0) return { ok: false, erro: `Não conheço a unidade "${de}".` };
  if (B.length === 0) return { ok: false, erro: `Não conheço a unidade "${para}".` };
  const comum = A.find((a) => B.some((b) => b.grupo === a.grupo));
  if (!comum) {
    return { ok: false, erro: `"${de}" (${A[0].grupo}) e "${para}" (${B[0].grupo}) são grandezas diferentes: não dá para converter uma na outra.` };
  }
  const a = comum;
  const b = B.find((x) => x.grupo === a.grupo);
  const emBase = valor * a.fator + a.offset;
  const resultado = (emBase - b.offset) / b.fator;
  const unid = (u) => `\\mathrm{${u.replace(/°/g, '^{\\circ}').replace(/µ/g, '\\mu ').replace(/Å/g, '\\text{Å}').replace(/(\d)/g, '_$1').replace(/\//g, '/')}}`;
  const baseNome = tabela.grupos[a.grupo].base;
  const passos = [];
  if (a.offset || b.offset) {
    passos.push({ texto: `Converta para a unidade base da grandeza (${baseNome}): valor × fator + deslocamento.`, tex: `${fmtTex(valor)}\\,${unid(a.rotulo)} \\times ${fmtTex(a.fator)} + ${fmtTex(a.offset)} = ${fmtTex(emBase)}\\,${unid(baseNome)}` });
    passos.push({ texto: `Converta da unidade base para ${para}: (valor − deslocamento) ÷ fator.`, tex: `\\dfrac{${fmtTex(emBase)} - ${fmtTex(b.offset)}}{${fmtTex(b.fator)}} = ${fmtTex(resultado)}\\,${unid(b.rotulo)}` });
  } else {
    passos.push({ texto: `1 ${a.rotulo} equivale a ${fmt(a.fator)} ${baseNome} e 1 ${b.rotulo} equivale a ${fmt(b.fator)} ${baseNome}.`, tex: `1\\,${unid(a.rotulo)} = ${fmtTex(a.fator)}\\,${unid(baseNome)} \\qquad 1\\,${unid(b.rotulo)} = ${fmtTex(b.fator)}\\,${unid(baseNome)}` });
    passos.push({ texto: 'Multiplique pelo fator de conversão (razão entre as unidades):', tex: `${fmtTex(valor)}\\,${unid(a.rotulo)} \\times \\dfrac{${fmtTex(a.fator)}}{${fmtTex(b.fator)}} = ${fmtTex(resultado)}\\,${unid(b.rotulo)}` });
  }
  return { ok: true, valor, de: a.rotulo, para: b.rotulo, resultado, grupo: a.grupo, passos, origem: tabela.origem };
}

/** Lista [{grupo, unidades:[símbolos]}] para montar os seletores. */
export function listarUnidades(tabela) {
  return Object.entries(tabela.grupos).map(([grupo, g]) => ({ grupo, base: g.base, unidades: g.itens.map((i) => ({ simbolo: i.simbolo, nome: i.nome })) }));
}

/** Fator de uma unidade em relação à base do grupo (para as demais calculadoras). */
export function paraBase(tabela, simbolo, grupo, valor) {
  const u = acharUnidade(tabela, simbolo).find((x) => x.grupo === grupo);
  if (!u) throw new Error(`Unidade desconhecida: ${simbolo}`);
  return valor * u.fator + u.offset;
}
export function deBase(tabela, simbolo, grupo, valorBase) {
  const u = acharUnidade(tabela, simbolo).find((x) => x.grupo === grupo);
  if (!u) throw new Error(`Unidade desconhecida: ${simbolo}`);
  return (valorBase - u.offset) / u.fator;
}

/** O pacote trouxe pelo menos uma grandeza utilizável (além das complementadas pela tabela padrão)? */
function paresDoPacote(grupos, src) {
  const nomes = Array.isArray(src) ? src.map((g) => g.grandeza ?? g.id ?? g.nome) : Object.keys(src);
  return nomes.some((n) => grupos[String(n)] && grupos[String(n)] !== UNIDADES_PADRAO[String(n)]);
}
