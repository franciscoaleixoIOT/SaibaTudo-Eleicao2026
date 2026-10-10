// Pacote de dados no cliente: manifesto (formato do contrato), verificação SHA-256 + assinatura ECDSA P-256 (WebCrypto), carga sob demanda,
// atualização atômica com anti-rollback. Os testes de atualização usam um pacote sintético assinado com chave de teste, só em memória.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BASE, DADOS, RAIZ, fetchDeDisco, lojaNova } from './support.mjs';
import { DataStore, ErroDados, arquivosDoManifesto, normalizarIndice, validarManifesto, pollIntervalMinutes, askLigado } from '../src/quimica/js/data.js';
import { CHAVE_PUBLICA_B64, derParaRaw, verificarManifesto, sha256Hex } from '../src/quimica/js/verify.js';

const enc = new TextEncoder();
const b64 = (u8) => Buffer.from(u8).toString('base64');

// ------------------------------------------------------------------------------------------------ pacote sintético assinado com chave de teste
async function criarChaveDeTeste() {
  const par = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const spki = new Uint8Array(await webcrypto.subtle.exportKey('spki', par.publicKey));
  return { privada: par.privateKey, publicaB64: b64(spki) };
}
/** r‖s (64 bytes) → DER, o formato do manifest.sig. */
function rawParaDer(raw) {
  const inteiro = (b) => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; let v = b.slice(i); if (v[0] & 0x80) v = Uint8Array.from([0, ...v]); return Uint8Array.from([0x02, v.length, ...v]); };
  const r = inteiro(raw.slice(0, 32)); const s = inteiro(raw.slice(32));
  return Uint8Array.from([0x30, r.length + s.length, ...r, ...s]);
}
async function assinar(chave, bytes) { return b64(rawParaDer(new Uint8Array(await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, chave.privada, bytes)))); }

class Servidor {
  constructor(chave) { this.chave = chave; this.arquivos = new Map(); this.pedidos = []; this.manifest = null; this.sig = null; }
  async publicar({ version, generatedAt, elementos, extras = {}, chaveAssinatura = this.chave }) {
    this.arquivos = new Map([
      ['elementos.json', enc.encode(JSON.stringify(elementos))],
      ['regras.json', enc.encode(JSON.stringify({ versao: 1 }))],
      ...Object.entries(extras).map(([p, o]) => [p, enc.encode(JSON.stringify(o))])
    ]);
    const files = {};
    for (const [p, b] of this.arquivos) files[p] = { bytes: b.length, sha256: createHash('sha256').update(b).digest('hex') };
    this.manifest = enc.encode(JSON.stringify({ version, generatedAt, schemaVersion: 1, files }));
    this.sig = await assinar(chaveAssinatura, this.manifest);
    return this;
  }
  fetchFn() {
    return async (url) => {
      const caminho = String(url).split('?')[0].slice(BASE.length);
      this.pedidos.push(caminho);
      if (caminho === 'manifest.json') return new Response(this.manifest);
      if (caminho === 'manifest.sig') return new Response(this.sig);
      return this.arquivos.has(caminho) ? new Response(this.arquivos.get(caminho)) : new Response('não encontrado', { status: 404 });
    };
  }
}
const el = (z, simbolo, massa) => ({ z, simbolo, nome: simbolo, massaAtomica: massa, grupo: 1, periodo: 1, bloco: 's', categoria: 'nao_metal' });

// ------------------------------------------------------------------------------------------------ manifesto
test('manifesto do contrato (files como objeto) e a forma antiga (lista) viram a mesma lista de arquivos', () => {
  const objeto = { files: { 'a.json': { bytes: 1, sha256: 'a'.repeat(64) }, 'b/c.json': { bytes: 2, sha256: 'b'.repeat(64) } } };
  const lista = { arquivos: [{ path: 'a.json', bytes: 1, sha256: 'a'.repeat(64) }, { path: 'b/c.json', bytes: 2, sha256: 'b'.repeat(64) }] };
  assert.deepEqual(arquivosDoManifesto(objeto), arquivosDoManifesto(lista));
});

test('validarManifesto rejeita schema novo, caminhos maliciosos, hashes inválidos e pacote sem elementos', () => {
  const ok = JSON.parse(readFileSync(resolve(DADOS, 'manifest.json'), 'utf8'));
  assert.doesNotThrow(() => validarManifesto(ok));
  const com = (mut) => { const m = structuredClone(ok); mut(m); return m; };
  assert.throws(() => validarManifesto(com((m) => { m.schemaVersion = 2; })), /schema/);
  assert.throws(() => validarManifesto(com((m) => { delete m.version; })), /version/);
  assert.throws(() => validarManifesto(com((m) => { m.files['../fora.json'] = { bytes: 1, sha256: 'a'.repeat(64) }; })), /caminho inválido/);
  assert.throws(() => validarManifesto(com((m) => { m.files['/abs.json'] = { bytes: 1, sha256: 'a'.repeat(64) }; })), /caminho inválido/);
  assert.throws(() => validarManifesto(com((m) => { m.files['x.json'] = { bytes: 1, sha256: 'xyz' }; })), /sha256/);
  assert.throws(() => validarManifesto(com((m) => { delete m.files['elementos.json']; })), /elementos\.json/);
  assert.throws(() => validarManifesto(null), /vazio/);
  assert.equal(pollIntervalMinutes(ok), 10080);
  assert.equal(askLigado(ok), false, 'a IA na nuvem vem desligada');
});

test('índice de compostos: aceita lista com campos de busca, invólucro {compostos} e o mapa {cid → lote} com nomes', () => {
  const lista = normalizarIndice([{ cid: 962, lote: '0001', nome: 'Água', formula: 'H2O' }]);
  assert.equal(lista.porCid.get(962).lote, '0001');
  const inv = normalizarIndice({ compostos: [{ cid: '2244', lote: 'compostos/0003.json', nome: 'Ácido acetilsalicílico', nomePopular: 'Aspirina', icscBuscaUrl: 'https://www.ilo.org/x' }] });
  assert.equal(inv.porCid.get(2244).lote, '0003');
  assert.equal(inv.porCid.get(2244).icscBuscaUrl, 'https://www.ilo.org/x');
  const mapa = normalizarIndice({ porCid: { 962: '0001', 280: '0001' }, nomes: { água: 962, 'dióxido de carbono': 280 } });
  assert.deepEqual([...mapa.porCid.keys()].sort(), [280, 962]);
  assert.ok(mapa.porCid.get(962).chaves.includes('agua'), 'só chaves de busca; o nome de exibição vem do registro');
  // formato do pipeline: porCid + nomes como lista de pares [nome normalizado, cid] + lotes
  const pipe = normalizarIndice({ porCid: { 962: 'lote-001' }, nomes: [['agua', 962], ['h2o', 962], ['oxidane', 962]], lotes: ['lote-001'] });
  assert.equal(pipe.porCid.get(962).lote, 'lote-001');
  assert.deepEqual(pipe.porCid.get(962).chaves, ['agua', 'h2o', 'oxidane']);
  assert.ok(pipe.porCid.get(962).chavesF.includes('h2o'));
  assert.equal(pipe.temNomes, false);
  assert.equal(normalizarIndice({ 962: '0001' }).porCid.get(962).lote, '0001');
  assert.equal(normalizarIndice(null).entradas.length, 0);
  assert.equal(normalizarIndice([{ cid: 'x' }, null, 5]).entradas.length, 0);
});

// ------------------------------------------------------------------------------------------------ pacote de teste (assinado com a chave de produção)
test('o pacote de teste carrega, tem a assinatura VERIFICADA com a chave pública embutida e a chave embutida é a de pipeline/', async () => {
  const pub = readFileSync(resolve(RAIZ, 'pipeline/data_signing_public.b64'), 'utf8').trim();
  assert.equal(CHAVE_PUBLICA_B64, pub, 'verify.js espelha pipeline/data_signing_public.b64');
  const contador = [];
  const store = new DataStore({ baseUrl: BASE, fetchFn: fetchDeDisco(DADOS, BASE, contador) });
  await store.iniciar();
  assert.equal(store.sig.estado, 'verificada');
  assert.match(store.origem, /assinatura digital verificada/);
  assert.ok(store.elementos.length >= 8);
  assert.equal(store.porSimbolo.get('O').nome, 'Oxigênio');
  assert.equal(store.porZ.get(26).simbolo, 'Fe');
  assert.ok(store.indice.entradas.length >= 12);
  assert.equal(store.ctx.constante('R').valor > 8, true);
  assert.ok(!contador.some((p) => p.startsWith('compostos/lote-')), 'lotes de compostos NÃO são baixados na carga inicial');
  assert.ok(contador.includes('ghs_frases.json'), 'as frases H em português do pacote (CLP) são carregadas');
  assert.match(store.fonteFrasesH.nome, /1272\/2008/);
  assert.equal(store.regras.frasesH.H314, 'Provoca queimaduras graves na pele e lesões oculares graves.');
  assert.ok(!contador.some((p) => p.startsWith('textos/')), 'textos só sob demanda');
});

test('lote de compostos: baixado sob demanda, uma vez, e cada composto vem do lote certo', async () => {
  const contador = [];
  const store = await lojaNova(DADOS, fetchDeDisco(DADOS, BASE, contador));
  const antes = contador.length;
  const c = await store.composto(2244);
  assert.equal(c.nomePopular, 'Aspirina');
  assert.equal(c.smiles, 'CC(=O)OC1=CC=CC=C1C(=O)O');
  const depois = contador.length;
  assert.equal(depois - antes, 1, 'um lote');
  await store.composto(962);
  await store.composto('1118');
  assert.equal(contador.length, depois, 'o lote já carregado não é baixado de novo');
  assert.equal(await store.composto(999999), null);
  assert.equal(await store.composto('abc'), null);
});

test('textos licenciados vêm sob demanda e trazem fonte, licença e URL', async () => {
  const store = await lojaNova();
  const textos = await store.textos();
  assert.ok(textos.length >= 2);
  for (const t of textos) { assert.ok(t.fonte && t.licenca && t.url && t.textoPt, t.id); assert.match(t._path, /^textos\//); }
  assert.ok(textos.some((t) => t._path.startsWith('textos/wikipedia-pt/')) && textos.some((t) => t._path.startsWith('textos/gold-book/')));
  assert.ok(!textos.some((t) => t._path.startsWith('textos/chebi/')), 'definições do ChEBI ficam fora do retrieval de conceitos (já vêm no composto)');
  // com termos, só os arquivos cujo nome combina são baixados
  const contador = [];
  const s2 = await lojaNova(DADOS, fetchDeDisco(DADOS, BASE, contador));
  const so = await s2.textos(['mol']);
  assert.deepEqual(so.map((t) => t._path), ['textos/wikipedia-pt/mol.json']);
  assert.equal(contador.filter((p) => p.startsWith('textos/')).length, 1);
  assert.equal((await s2.textos(['inexistente'])).length, textos.length, 'sem combinação de nome, carrega todos');
});

test('arquivo adulterado: o checksum não confere e a carga falha (nunca usa dado sem verificação)', async () => {
  const bom = fetchDeDisco();
  const adulterado = async (url, o) => {
    const r = await bom(url, o);
    if (String(url).includes('elementos.json')) { const t = (await r.text()).replace('Oxigênio', 'Oxigenio'); return new Response(t); }
    return r;
  };
  await assert.rejects(lojaNova(DADOS, adulterado), (e) => e instanceof ErroDados && /(checksum|tamanho) divergente em elementos\.json/.test(e.message));
});

test('manifesto adulterado: a assinatura NÃO confere (estado "invalida"), mas o app segue com os arquivos verificados por hash', async () => {
  const bom = fetchDeDisco();
  const adulterado = async (url, o) => {
    const r = await bom(url, o);
    if (String(url).includes('manifest.json')) return new Response((await r.text()).replace('"generatedAt": "2026-01-01', '"generatedAt": "2026-02-01'));
    return r;
  };
  const store = await lojaNova(DADOS, adulterado);
  assert.equal(store.sig.estado, 'invalida');
  assert.match(store.sig.detalhe, /não confere/);
  assert.match(store.origem, /NÃO verificada/);
});

test('verificarManifesto: DER inválido, chave errada, texto vazio e bytes alterados → false (nunca lança)', async () => {
  const chave = await criarChaveDeTeste();
  const outra = await criarChaveDeTeste();
  const bytes = enc.encode('{"a":1}');
  const sig = await assinar(chave, bytes);
  assert.equal(await verificarManifesto(bytes, sig, chave.publicaB64), true);
  assert.equal(await verificarManifesto(enc.encode('{"a":2}'), sig, chave.publicaB64), false);
  assert.equal(await verificarManifesto(bytes, sig, outra.publicaB64), false);
  assert.equal(await verificarManifesto(bytes, 'AAAA', chave.publicaB64), false);
  assert.equal(await verificarManifesto(bytes, '', chave.publicaB64), false);
  assert.equal(await verificarManifesto(bytes, sig, ''), false);
  assert.throws(() => derParaRaw(Uint8Array.from([1, 2, 3])), /DER/);
  assert.match(await sha256Hex(bytes), /^[0-9a-f]{64}$/);
});

// ------------------------------------------------------------------------------------------------ atualização
test('atualização: baixa só o que mudou, troca tudo de uma vez, rejeita assinatura inválida e pacote mais antigo (anti-rollback)', async () => {
  const chave = await criarChaveDeTeste();
  const s = await new Servidor(chave).publicar({ version: 'v1', generatedAt: '2026-10-01T00:00:00Z', elementos: [el(1, 'H', 1.008), el(8, 'O', 15.999)] });
  const store = new DataStore({ baseUrl: BASE, fetchFn: s.fetchFn(), chavePublica: chave.publicaB64 });
  await store.iniciar();
  assert.equal(store.sig.estado, 'verificada');
  assert.equal(store.versao, 'v1');
  assert.equal(store.porSimbolo.get('O').massaAtomica, 15.999);
  assert.deepEqual(await store.verificarAtualizacao(), { tipo: 'atual' });

  // nova versão: só elementos.json mudou
  await s.publicar({ version: 'v2', generatedAt: '2026-10-08T00:00:00Z', elementos: [el(1, 'H', 1.0081), el(8, 'O', 15.9994)] });
  s.pedidos.length = 0;
  const r = await store.verificarAtualizacao();
  assert.equal(r.tipo, 'atualizado');
  assert.equal(r.version, 'v2');
  assert.equal(r.arquivosBaixados, 1, 'só o arquivo cujo sha256 mudou (regras.json ficou igual)');
  assert.ok(s.pedidos.includes('elementos.json') && !s.pedidos.includes('regras.json'));
  assert.equal(store.porSimbolo.get('O').massaAtomica, 15.9994);
  assert.equal(store.ctx.massaDe('O'), 15.9994, 'o contexto de cálculo também foi atualizado');
  const rev = store.rev;

  // assinatura de OUTRA chave: rejeitada, e o pacote ativo continua o mesmo
  const intruso = await criarChaveDeTeste();
  await s.publicar({ version: 'v3', generatedAt: '2026-10-09T00:00:00Z', elementos: [el(1, 'H', 9)], chaveAssinatura: intruso });
  const rej = await store.verificarAtualizacao();
  assert.equal(rej.tipo, 'rejeitado');
  assert.equal(store.versao, 'v2');
  assert.equal(store.porSimbolo.get('H').massaAtomica, 1.0081);
  assert.equal(store.rev, rev);

  // pacote assinado, mas MAIS ANTIGO: ignorado
  await s.publicar({ version: 'v0', generatedAt: '2026-09-01T00:00:00Z', elementos: [el(1, 'H', 1)] });
  const velho = await store.verificarAtualizacao();
  assert.equal(velho.tipo, 'ignorado');
  assert.match(velho.motivo, /anti-rollback/);
  assert.equal(store.versao, 'v2');
});

test('atualização com arquivo novo corrompido: nada é trocado (troca atômica) e o erro é reportado', async () => {
  const chave = await criarChaveDeTeste();
  const s = await new Servidor(chave).publicar({ version: 'v1', generatedAt: '2026-10-01T00:00:00Z', elementos: [el(1, 'H', 1.008)] });
  const store = new DataStore({ baseUrl: BASE, fetchFn: s.fetchFn(), chavePublica: chave.publicaB64 });
  await store.iniciar();
  await s.publicar({ version: 'v2', generatedAt: '2026-10-08T00:00:00Z', elementos: [el(1, 'H', 2)] });
  s.arquivos.set('elementos.json', enc.encode('[{"z":1,"simbolo":"H","massaAtomica":999}]')); // não bate com o sha256 do manifesto
  const r = await store.verificarAtualizacao();
  assert.equal(r.tipo, 'falha');
  assert.match(r.motivo, /(checksum|tamanho) divergente/);
  assert.equal(store.versao, 'v1');
  assert.equal(store.porSimbolo.get('H').massaAtomica, 1.008);
});

test('sem rede o pacote não inicia com mensagem clara; fetch com erro HTTP vira ErroDados', async () => {
  const store = new DataStore({ baseUrl: BASE, fetchFn: async () => new Response('x', { status: 503 }) });
  await assert.rejects(store.iniciar(), (e) => e instanceof ErroDados && /HTTP 503/.test(e.message));
});
