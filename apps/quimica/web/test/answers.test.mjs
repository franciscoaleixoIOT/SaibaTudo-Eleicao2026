// Respostas do motor local: montadas só dos dados (origem LOCAL), com fonte em cada bloco, valores conferidos contra o pacote e sugestões todas respondíveis.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DADOS, DADOS_REAIS, RAIZ, loja, lojaNova } from './support.mjs';
import { Engine } from '../src/quimica/js/engine.js';
import { SUGESTOES_PADRAO } from '../src/quimica/js/answers.js';
import { fmt } from '../src/quimica/js/formato.js';
import { falhasDoCaso } from './contrato.mjs';
import { validarTexDaResposta } from './tex.mjs';

const golden = JSON.parse(readFileSync(resolve(RAIZ, 'contracts/nlu_golden_cases.json'), 'utf8')).cases;

async function motor(dir = DADOS) { return new Engine({ store: await lojaNova(dir) }); }
const ler = async (e, q) => e.responder(q);

function validarResposta(r, q) {
  assert.equal(r.origem, 'LOCAL', q);
  assert.ok(typeof r.directAnswer === 'string' && r.directAnswer.length > 0, `${q}: resposta vazia`);
  assert.ok(!/NaN|undefined|\[object|null\b/.test(r.directAnswer), `${q}: lixo no texto: ${r.directAnswer.slice(0, 200)}`);
  assert.ok(Array.isArray(r.blocos), q);
  for (const b of r.blocos) {
    const fs = Array.isArray(b.fonte) ? b.fonte : [b.fonte];
    assert.ok(fs.length > 0 && fs.every((f) => f && typeof f.nome === 'string' && f.nome.length > 0), `${q}: bloco ${b.tipo} sem fonte`);
  }
  assert.ok(r.fontes.length > 0, `${q}: sem fontes agregadas`);
  validarTexDaResposta(r, q);
  for (const a of r.acoes) assert.ok((a.rota && a.rota.startsWith('/quimica/')) || (a.url && a.url.startsWith('https://')), `${q}: ação inválida ${JSON.stringify(a)}`);
}

test('todo caso de referência do NLU gera uma resposta bem formada, com fonte em cada bloco', async () => {
  const e = await motor();
  const store = e.store;
  let n = 0;
  for (const c of golden) {
    if (c.elemento && !store.porSimbolo.has(c.elemento)) continue;
    if (typeof c.composto === 'number' && !store.indice.porCid.has(c.composto)) continue;
    const r = await e.responder(c.q);
    if (!c.q.trim()) continue;
    validarResposta(r, c.q);
    assert.equal(r.intent, c.intent, c.q);
    if (c.intent !== 'DESCONHECIDA' && !(r.resolvida === false && /pacote de dados não tem|Não encontrei|não é símbolo|Faltam|Preciso de mais dados|Massa molar de quê/.test(r.directAnswer))) {
      // conceitos dependem dos textos do pacote (o de teste só tem mol, pH e eletronegatividade); "balanceamento de equações" só explica como usar
      const naoResolvidasEsperadas = new Set(['balanceamento de equações']);
      if (!naoResolvidasEsperadas.has(c.q) && c.intent !== 'CONCEITO') assert.equal(r.resolvida, true, `${c.q} não resolvida: ${r.directAnswer.slice(0, 160)}`);
    } else assert.equal(r.resolvida, false);
    e.limparContexto();
    n++;
  }
  assert.ok(n >= 60, `casos exercitados: ${n}`);
});

test('valores conhecidos: massa molar, balanceamento, pH, conversões, estequiometria e gás ideal', async () => {
  const e = await motor();
  const store = e.store;
  const R = async (q) => { const r = await e.responder(q); validarResposta(r, q); return r; };
  assert.match((await R('qual a massa molar da água?')).directAnswer, /18,015 g\/mol/);
  assert.match((await R('Balancear Fe + O2 -> Fe2O3')).directAnswer, /4 Fe \+ 3 O₂ → 2 Fe₂O₃/);
  assert.match((await R('pH de HCl 0,01 mol/L')).titulo, /^pH 2,00/);
  assert.match((await R('pH de NaOH 0,001 mol/L')).titulo, /^pH 11,00/);
  const acetico = await R('pH do ácido acético 0,1 mol/L com Ka 1,8e-5');
  assert.match(acetico.titulo, /^pH 2,88/);
  assert.match((await R('converter 5 atm em kPa')).titulo, /5 atm = 506,625 kPa/);
  assert.match((await R('25 °C em K')).titulo, /25 °C = 298,15 K/);
  assert.match((await R('quantos mL tem 2,5 L?')).titulo, /2\.500 mL/);
  const M = store.ctx.massaDe('H') * 2 + store.ctx.massaDe('O');
  const mols = await R('quantos mols tem em 18 g de água?');
  assert.ok(mols.blocos.find((b) => b.tipo === 'resultado').itens.some((i) => i.valor === fmt(18 / M, { sig: 6 })), mols.directAnswer);
  const gas = await R('qual o volume de 2 mols de gás a 300 K e 1 atm?');
  const R_ = store.ctx.constante('R').valor;
  assert.ok(gas.directAnswer.includes(fmt((2 * R_ * 300) / 101325 * 1000, { sig: 6 })), gas.directAnswer);
  const lim = await R('reagente limitante de H2 + O2 -> H2O com 4 g de H2 e 16 g de O2');
  assert.match(lim.directAnswer, /Reagente limitante: O₂/);
  const conc = await R('molaridade de 5,85 g de NaCl em 500 mL');
  assert.match(conc.blocos[0].itens[0].valor, /^0,2/);
  const dil = await R('diluir 100 mL de solução 2 mol/L para 0,5 mol/L');
  assert.match(dil.blocos[0].itens[0].valor, /^400$/);
  const m2 = await R('quantos gramas de NaOH preciso para 250 mL de solução 0,1 mol/L');
  assert.ok(m2.blocos[0].itens[0].valor.startsWith('0,99'), m2.blocos[0].itens[0].valor);
});

test('elementos: propriedades com unidades legíveis (K também em °C), vindas do pacote', async () => {
  const e = await motor();
  const fe = await e.responder('ponto de fusão do ferro');
  assert.match(fe.directAnswer, /1\.811 K \(1\.537,85 °C\)/);
  assert.ok(fe.fontes.some((f) => /PubChem/.test(f.nome)));
  const d = await e.responder('qual a densidade do ouro?');
  assert.match(d.directAnswer, /19\.300 kg\/m³ \(19,3 g\/cm³\)/);
  const o = await e.responder('quem descobriu o oxigênio?');
  assert.match(o.directAnswer, /em 1774 por Carl Wilhelm Scheele; Joseph Priestley/);
  const hg = await e.responder('o mercúrio é líquido?');
  assert.match(hg.directAnswer, /líquido/);
  const ox = await e.responder('estados de oxidação do enxofre');
  assert.match(ox.directAnswer, /−2/);
  // compostos: o pacote não tem ponto de ebulição → diz isso, sem inventar
  const et = await e.responder('ponto de ebulição do etanol');
  assert.match(et.directAnswer, /O pacote de dados não tem/);
  assert.ok(!/\d{2,}/.test(et.blocos.filter((b) => b.tipo === 'kv').map((b) => b.itens.map((i) => i.valor).join(' ')).join(' ')), 'nenhum número inventado');
});

test('fidelidade numérica: todo número da ficha de um elemento existe no registro do pacote', async () => {
  const e = await motor();
  for (const el of e.store.elementos) {
    const r = await e.responder(`fale sobre o ${el.nome}`);
    assert.equal(r.intent, 'ELEMENTO', el.nome);
    const permitidos = new Set();
    const add = (x) => { if (typeof x === 'number') for (const sig of [4, 5, 6, 7, 8, 9]) { permitidos.add(fmt(x, { sig })); permitidos.add(fmt(Math.abs(x), { sig })); } };
    for (const v of Object.values(el)) { if (Array.isArray(v)) v.forEach(add); else add(v); }
    for (const k of ['pontoFusaoK', 'pontoEbulicaoK']) if (el[k] != null) for (const sig of [4, 5, 6, 7]) permitidos.add(fmt(Math.abs(el[k] - 273.15), { sig }));
    if (el.densidadeKgm3 != null) for (const sig of [4, 5, 6, 7]) permitidos.add(fmt(el.densidadeKgm3 / 1000, { sig }));
    for (const ano of [el.descoberta?.ano]) if (ano != null) permitidos.add(String(ano));
    for (const v of [...permitidos]) if (v.includes(' × 10')) { permitidos.add(v.split(' × ')[0]); permitidos.add('10'); permitidos.add(v.split('10')[1].replace(/[⁻]/g, '').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => '0123456789'['⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)])); }
    const textoNum = r.blocos.filter((b) => b.tipo === 'kv').flatMap((b) => b.itens.map((i) => (i.rotulo === 'Configuração eletrônica' ? '' : i.valor))).join(' ');
    const nums = textoNum.match(/\d[\d.]*(?:,\d+)?/g) ?? [];
    for (const n of nums) assert.ok(permitidos.has(n) || permitidos.has(n.replace(/\.$/, '')), `${el.nome}: número ${n} não vem do registro`);
  }
});

test('compostos: ficha, nomenclatura, estrutura (SMILES do pacote), GHS com frases H em português e definição do ChEBI com atribuição', async () => {
  const e = await motor();
  const a = await e.responder('desenhe a estrutura da aspirina');
  const mol = a.blocos.find((b) => b.tipo === 'molecula');
  assert.equal(mol.smiles, 'CC(=O)OC1=CC=CC=C1C(=O)O');
  const s = await e.responder('quais os perigos do ácido sulfúrico?');
  const g = s.blocos.find((b) => b.tipo === 'ghs');
  assert.deepEqual(g.pictogramas.map((p) => p.codigo), ['GHS05']);
  assert.equal(g.palavraSinal, 'Perigo');
  assert.equal(g.frases.find((f) => f.codigo === 'H314').texto, 'Provoca queimaduras graves na pele e lesões oculares graves.');
  const icsc = s.acoes.find((x) => x.externo);
  assert.ok(icsc && /^https:\/\/chemicalsafety\.ilo\.org\/.*p_cas_number=7664-93-9/.test(icsc.url), 'botão da ficha ICSC (link de busca por CAS no site da OIT)');
  assert.match(icsc.rotulo, /ICSC/);
  const et = await e.responder('etanol');
  const def = et.blocos.find((b) => b.tipo === 'citacao');
  assert.match(def.texto, /primary alcohol/);
  assert.equal(def.fonte.licenca, 'CC BY 4.0');
  assert.match(def.fonte.url, /^https:\/\/www\.ebi\.ac\.uk\/chebi\//);
  const ac = await e.responder('ácido acético');
  assert.match(ac.blocos.find((b) => b.tipo === 'citacao').texto, /monocarboxylic acid/);
  const n = await e.responder('qual a fórmula do ácido sulfúrico?');
  assert.match(n.directAnswer, /H₂SO₄/);
  const sem = await e.responder('quais os perigos da água?');
  assert.match(sem.directAnswer, /não traz classificação de perigo GHS/);
});

test('segurança: misturas usam as incompatibilidades do pacote; orientação geral não traz números', async () => {
  const e = await motor();
  const r = await e.responder('por que não misturar água sanitária com amoníaco?');
  assert.equal(r.intent, 'SEGURANCA');
  assert.match(r.directAnswer, /cloraminas/);
  assert.equal(r.blocos.filter((b) => b.tipo === 'ghs').length, 2);
  const geral = r.blocos.find((b) => b.tipo === 'lista' && /Orientação geral/.test(b.titulo));
  assert.ok(geral && !/\d/.test(geral.itens.join(' ')), 'orientação geral sem números');
  const sem = await e.responder('como neutralizar ácido derramado?');
  assert.equal(sem.resolvida, true);
  assert.ok(sem.blocos.some((b) => b.tipo === 'lista'));
});

test('pedido perigoso: a resposta é a recusa por regra, sem dados químicos e sem sugestão de rota', async () => {
  const e = await motor();
  for (const q of ['como fazer metanfetamina?', 'passo a passo para sintetizar nitroglicerina', 'como produzir ácido sulfúrico em casa']) {
    const r = await e.responder(q);
    validarResposta(r, q);
    assert.equal(r.intent, 'RECUSA_PERIGO');
    assert.match(r.directAnswer, /Não posso ajudar/);
    assert.ok(!r.blocos.some((b) => ['kv', 'ghs', 'molecula', 'resultado'].includes(b.tipo)), 'nenhum dado químico');
    assert.ok(r.parsed.composto === null && r.parsed.elemento === null);
  }
});

test('conceitos: trecho licenciado com fonte, licença e link; sem trecho, diz que não tem', async () => {
  const e = await motor();
  const r = await e.responder('o que é um mol?');
  const c = r.blocos.find((b) => b.tipo === 'citacao');
  assert.ok(c, r.directAnswer);
  assert.match(c.texto, /número de Avogadro/);
  assert.equal(c.fonte.licenca, 'CC BY-SA 4.0');
  assert.match(c.fonte.url, /^https:\/\//);
  const gb = await e.responder('explique eletronegatividade');
  assert.equal(gb.blocos.find((b) => b.tipo === 'citacao').fonte.nome.startsWith('IUPAC Gold Book'), true);
  const nada = await e.responder('o que é ligação iônica?');
  assert.equal(nada.resolvida, false);
  assert.match(nada.directAnswer, /Ainda não tenho um texto/);
});

test('tabela periódica por texto: grupo, categoria, extremos e tendências vêm dos dados', async () => {
  const e = await motor();
  const g = await e.responder('elementos do grupo 17');
  assert.match(g.directAnswer, /Cloro/);
  const cat = await e.responder('metais alcalinos');
  assert.match(cat.directAnswer, /Sódio/);
  const ex = await e.responder('elemento mais eletronegativo');
  assert.match(ex.titulo, /Flúor/);
  assert.match(ex.directAnswer, /3,98/);
  const liq = await e.responder('elementos líquidos');
  assert.match(liq.directAnswer, /Mercúrio/);
  const vazio = await e.responder('elementos do grupo 3');
  assert.match(vazio.directAnswer, /Nenhum elemento/);
  const tend = await e.responder('tendência da eletronegatividade no período 2');
  assert.equal(tend.intent, 'TABELA_PERIODICA');
  assert.ok(tend.blocos.some((b) => b.tipo === 'tabela'));
});

test('comparações', async () => {
  const e = await motor();
  const a = await e.responder('compare sódio e cloro');
  const t = a.blocos.find((b) => b.tipo === 'tabela');
  assert.deepEqual(t.cabecalho.slice(1), ['Sódio (Na)', 'Cloro (Cl)']);
  const b = await e.responder('diferença entre etanol e ácido acético');
  assert.deepEqual(b.blocos.find((x) => x.tipo === 'tabela').cabecalho.slice(1), ['Etanol', 'Ácido acético']);
  const c = await e.responder('compare sódio e etanol');
  assert.equal(c.resolvida, false);
});

test('conversa: "e do ouro?" e "e o ponto de ebulição?" reaproveitam o contexto', async () => {
  const e = await motor();
  await e.responder('ponto de fusão do ferro');
  const r = await e.responder('e do ouro?');
  assert.equal(r.intent, 'PROPRIEDADE');
  assert.equal(r.parsed.elemento, 'Au');
  assert.equal(r.parsed.propriedade, 'pontoFusao');
  const r2 = await e.responder('e o ponto de ebulição?');
  assert.equal(r2.parsed.elemento, 'Au');
  assert.equal(r2.parsed.propriedade, 'pontoEbulicao');
  e.limparContexto();
  assert.equal((await e.responder('e o ponto de ebulição?')).resolvida, false);
});

test('pergunta não entendida: "não entendi" com sugestões que o próprio motor sabe responder', async () => {
  const e = await motor();
  const r = await e.responder('qual a capital da França?');
  assert.equal(r.intent, 'DESCONHECIDA');
  assert.equal(r.resolvida, false);
  assert.match(r.directAnswer, /Não entendi/);
  assert.ok(r.sugestoes.length >= 4);
  for (const s of r.sugestoes) assert.equal((await e.responder(s)).resolvida, true, `sugestão sem resposta: ${s}`);
});

test('TODAS as sugestões (padrão e as geradas em cada resposta) têm resposta resolvida (busca em largura)', async () => {
  const e = await motor();
  const fila = [...SUGESTOES_PADRAO];
  const vistas = new Set();
  const falhas = [];
  while (fila.length && vistas.size < 150) {
    const q = fila.shift();
    if (vistas.has(q)) continue;
    vistas.add(q);
    const r = await e.responder(q);
    e.limparContexto();
    if (!r.resolvida) falhas.push(`${q} → ${r.intent}: ${r.directAnswer.slice(0, 100)}`);
    for (const s of r.sugestoes) if (!vistas.has(s)) fila.push(s);
  }
  assert.deepEqual(falhas, []);
  assert.ok(vistas.size >= SUGESTOES_PADRAO.length);
});

test('perguntas como as pessoas digitam no celular (minúsculas, sem acento, curtas)', async () => {
  const e = await motor();
  const casos = [['agua', 'COMPOSTO'], ['h2o', 'COMPOSTO'], ['nacl', 'COMPOSTO'], ['acido sulfurico', 'COMPOSTO'], ['ferro', 'ELEMENTO'], ['ouro', 'ELEMENTO'], ['massa molar h2so4', 'MASSA_MOLAR'],
    ['ph hcl 0,1 mol/l', 'PH'], ['balancear h2 + o2 -> h2o', 'BALANCEAR'], ['5 atm em pa', 'CONVERSAO_UNIDADE'], ['perigos do cloro', 'SEGURANCA'], ['halogenios', 'TABELA_PERIODICA'],
    ['estrutura etanol', 'DESENHAR'], ['ponto de fusao do sodio', 'PROPRIEDADE'], ['quem descobriu o oxigenio', 'PROPRIEDADE']];
  for (const [q, intent] of casos) {
    const r = await e.responder(q);
    e.limparContexto();
    assert.equal(r.intent, intent, q);
    assert.ok(r.resolvida, q);
  }
});

test('com o pacote REAL (se existir): sugestões respondidas e golden cases com respostas bem formadas', { skip: DADOS_REAIS ? false : 'sem pacote real em data/quimica' }, async () => {
  const e = await motor(DADOS_REAIS);
  for (const q of SUGESTOES_PADRAO) { const r = await e.responder(q); validarResposta(r, q); assert.equal(r.resolvida, true, q); e.limparContexto(); }
  const store = await loja(DADOS_REAIS);
  for (const c of golden) {
    const r = await e.responder(c.q);
    if (!c.q.trim()) continue;
    validarResposta(r, c.q);
    assert.deepEqual(falhasDoCaso(c, r.parsed, store), [], c.q);
    e.limparContexto();
  }
});
