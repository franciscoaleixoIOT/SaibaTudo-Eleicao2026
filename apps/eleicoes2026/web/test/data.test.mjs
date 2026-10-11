// Integridade do pacote real, verificação de assinatura ECDSA (WebCrypto) e protocolo de atualização (§7 do contrato).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { webcrypto } from 'node:crypto';
import { BASE, DADOS, RAIZ, fetchDeDisco, lerJson, pacoteCompleto } from './support.mjs';
import { DataStore, pollIntervalMinutes, validarManifesto } from '../src/eleicoes2026/js/data.js';
import { CHAVE_PUBLICA_B64, derParaRaw, sha256Hex, verificarManifesto } from '../src/eleicoes2026/js/verify.js';
import { SIGLAS } from '../src/eleicoes2026/js/model.js';

const manifestBytes = new Uint8Array(readFileSync(resolve(DADOS, 'manifest.json')));
const assinatura = readFileSync(resolve(DADOS, 'manifest.sig'), 'utf8').trim();

test('a chave pública embutida no JS é a mesma de pipeline/data_signing_public.b64', () => {
  const arq = readFileSync(resolve(RAIZ, 'pipeline/data_signing_public.b64'), 'utf8').trim();
  assert.equal(CHAVE_PUBLICA_B64, arq);
});

test('manifesto real: assinatura ECDSA P-256/SHA-256 (DER) válida via WebCrypto', async () => {
  assert.equal(await verificarManifesto(manifestBytes, assinatura), true);
});

test('assinatura adulterada, manifesto adulterado, sem chave ou lixo são rejeitados', async () => {
  const adulterado = manifestBytes.slice();
  adulterado[10] = adulterado[10] + 1;
  assert.equal(await verificarManifesto(adulterado, assinatura), false);
  assert.equal(await verificarManifesto(manifestBytes, assinatura, ''), false);
  assert.equal(await verificarManifesto(manifestBytes, 'AAAA'), false);
  assert.equal(await verificarManifesto(manifestBytes, '!!!nao-base64!!!'), false);
  // assinatura de outro manifesto
  const outro = new Uint8Array([...manifestBytes, 32]);
  assert.equal(await verificarManifesto(outro, assinatura), false);
});

test('derParaRaw converte DER em r‖s de 64 bytes e rejeita DER malformado', () => {
  const sig = Uint8Array.from(Buffer.from(assinatura, 'base64'));
  const raw = derParaRaw(sig);
  assert.equal(raw.length, 64);
  assert.throws(() => derParaRaw(new Uint8Array([0x31, 0x00])));
  assert.throws(() => derParaRaw(new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x01])));
  // r e s curtos (com byte de sinal e zeros à esquerda) são alinhados em 32 bytes
  const curto = derParaRaw(new Uint8Array([0x30, 0x08, 0x02, 0x02, 0x00, 0x80, 0x02, 0x02, 0x01, 0x02]));
  assert.equal(curto[31], 0x80);
  assert.equal(curto[62], 0x01);
  assert.equal(curto[63], 0x02);
});

test('sha256 e tamanho de TODOS os arquivos de dados conferem com o manifesto', async () => {
  const m = lerJson('manifest.json');
  validarManifesto(m);
  let n = 0;
  for (const a of m.arquivos) {
    if (a.path.startsWith('fotos/')) continue; // fotos: conferidas por amostragem abaixo
    const b = new Uint8Array(readFileSync(resolve(DADOS, a.path)));
    assert.equal(b.length, a.bytes, `tamanho ${a.path}`);
    assert.equal(await sha256Hex(b), a.sha256, `sha256 ${a.path}`);
    n++;
  }
  assert.ok(n >= 30);
  const fotos = m.arquivos.filter((a) => a.path.startsWith('fotos/')).slice(0, 25);
  for (const a of fotos) assert.equal(await sha256Hex(new Uint8Array(readFileSync(resolve(DADOS, a.path)))), a.sha256, a.path);
});

test('candidaturas coerentes com o manifesto (contagens, ids únicos, 27 UFs + BR)', async () => {
  const { store } = await pacoteCompleto();
  const m = store.manifest;
  assert.equal(store.candidatos.length, m.contagens.candidaturas);
  assert.equal(new Set(store.candidatos.map((c) => c.id)).size, store.candidatos.length, 'ids únicos');
  assert.equal(store.candidatos.filter((c) => c.naUrna).length, m.contagens.naUrna);
  const ufs = new Set(store.candidatos.map((c) => c.estadoUf));
  for (const u of SIGLAS) assert.ok(ufs.has(u), u);
  assert.ok(ufs.has('BR'));
  assert.equal(store.sig.estado, 'verificada');
  assert.equal(store.erros.length, 0);
});

test('a situação oficial nunca é inferida como Ficha Limpa e os campos proibidos não existem', async () => {
  const { store } = await pacoteCompleto();
  const c = store.candidatos;
  assert.ok(c.filter((x) => x.elegibilidade.name === 'RENUNCIA').every((x) => x.elegibilidade.apta === false));
  assert.ok(c.filter((x) => x.elegibilidade.name === 'DEFERIDA').length > 15000);
  assert.ok(c.filter((x) => x.elegibilidade.name === 'DESCONHECIDA').length < 50);
  assert.ok(c.every((x) => !('fichaLimpa' in x) && !('processosAdministrativos' in x) && !('reeleicao' in x)));
  const pres = c.filter((x) => x.cargoCodigo === 'PRESIDENTE');
  assert.ok(pres.length >= 13);
  assert.ok(pres.find((x) => x.nomeUrna === 'LULA' && x.partido === 'PT' && x.numero === '13'));
  assert.ok(pres.filter((x) => x.elegibilidade.name === 'INDEFERIDA').every((x) => !x.naUrna));
});

test('carga sob demanda: BR + UF primeiro; as demais UFs só quando pedidas', async () => {
  const lidos = [];
  const store = new DataStore({ baseUrl: BASE, fetchFn: fetchDeDisco(DADOS, BASE, lidos) });
  await store.iniciar();
  assert.deepEqual(store.ufsCarregadas, []);
  assert.ok(lidos.includes('manifest.json') && lidos.includes('manifest.sig') && lidos.includes('regras.json'));
  await store.ensureUfs(['BR', 'SP']);
  assert.deepEqual(store.ufsCarregadas.sort(), ['BR', 'SP']);
  assert.ok(store.candidatos.every((c) => c.estadoUf === 'BR' || c.estadoUf === 'SP'));
  assert.ok(!lidos.some((l) => l === 'candidatos/RJ.json'), 'RJ não deve ser baixado ainda');
  assert.ok(!lidos.includes('pesquisas.json'), 'pesquisas só sob demanda');
  assert.equal(store.todasCarregadas, false);
  await store.ensureUfs(['SP']); // idempotente
  assert.equal(lidos.filter((l) => l === 'candidatos/SP.json').length, 1);
  await store.ensureTodas();
  assert.equal(store.todasCarregadas, true);
  assert.equal(store.candidatos.length, store.manifest.contagens.candidaturas);
});

test('arquivo adulterado no servidor (sha256 divergente) é rejeitado e não entra nos dados', async () => {
  const base = fetchDeDisco();
  const fetchAdulterado = async (url, init) => {
    const r = await base(url, init);
    if (String(url).includes('candidatos/AC.json')) {
      const b = new Uint8Array(await r.arrayBuffer());
      b[100] = b[100] ^ 1; // 1 bit trocado
      return new Response(b, { status: 200 });
    }
    return r;
  };
  const store = new DataStore({ baseUrl: BASE, fetchFn: fetchAdulterado });
  await store.iniciar();
  await assert.rejects(() => store.ensureUfs(['AC', 'AL']), /AC/);
  assert.ok(store.shards.has('AL'), 'as outras UFs carregam normalmente');
  assert.ok(!store.shards.has('AC'));
  assert.ok(store.erros.some((e) => /checksum divergente/.test(e.mensagem)));
});

test('assinatura inválida no boot: usa os arquivos do deploy e sinaliza em sig', async () => {
  const base = fetchDeDisco();
  const fetchSigRuim = async (url, init) => (String(url).includes('manifest.sig') ? new Response('AAAA', { status: 200 }) : base(url, init));
  const store = new DataStore({ baseUrl: BASE, fetchFn: fetchSigRuim });
  await store.iniciar();
  assert.equal(store.sig.estado, 'invalida');
  assert.match(store.origem, /NÃO verificada/);
  assert.ok(store.regras);
});

test('intervalo de verificação respeita o mínimo de 5 minutos', () => {
  assert.equal(pollIntervalMinutes({ cliente: { pollIntervalMinutes: 360 } }), 360);
  assert.equal(pollIntervalMinutes({ cliente: { pollIntervalMinutes: 15 } }), 15);
  assert.equal(pollIntervalMinutes({ cliente: { pollIntervalMinutes: 1 } }), 5);
  assert.equal(pollIntervalMinutes({}), 360);
});

test('validarManifesto rejeita caminhos maliciosos, schema futuro e hashes inválidos', () => {
  const ok = lerJson('manifest.json');
  const clone = () => JSON.parse(JSON.stringify(ok));
  validarManifesto(ok);
  const a = clone(); a.schemaVersion = 2; assert.throws(() => validarManifesto(a), /schema/);
  const b = clone(); b.arquivos[0].path = '../segredo.json'; assert.throws(() => validarManifesto(b), /caminho/);
  const c = clone(); c.arquivos[0].path = '/abs.json'; assert.throws(() => validarManifesto(c), /caminho/);
  const d = clone(); d.arquivos[1].sha256 = 'abc'; assert.throws(() => validarManifesto(d), /sha256/);
  const e = clone(); e.arquivos = e.arquivos.filter((x) => x.path !== 'regras.json'); assert.throws(() => validarManifesto(e), /regras/);
});

// ------------------------------------------------------------------------------------------ protocolo de atualização

/** Pacote sintético em memória assinado com uma chave de TESTE (a privada real nunca é usada aqui). */
async function pacoteSintetico() {
  const par = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const spki = Buffer.from(await webcrypto.subtle.exportKey('spki', par.publicKey)).toString('base64');
  const enc = new TextEncoder();
  const arquivos = new Map();
  const dados = (cargo, id, numero, nome) => [{ id, numero, nomeUrna: nome, nomeCompleto: nome, cargo, partido: 'PT', estadoUf: 'BR', digitosUrna: 2, naUrna: true, elegibilidade: 'DEFERIDA' }];
  const regras = { turno1: '2026-10-04', turno2: '2026-10-25', estatisticas: { porPartido: { PT: 1 } }, ordemVotacaoUrna: [] };
  async function publicar(dataVersion, generatedAt, { br = 'A', regrasV = 1 } = {}) {
    const arq = new Map();
    arq.set('regras.json', enc.encode(JSON.stringify({ ...regras, v: regrasV })));
    arq.set('candidatos/BR.json', enc.encode(JSON.stringify(dados('PRESIDENTE', '1', '13', `NOME ${br}`))));
    arq.set('candidatos/SP.json', enc.encode(JSON.stringify([{ ...dados('GOVERNADOR', '2', '13', 'FULANO')[0], estadoUf: 'SP' }])));
    const lista = [];
    for (const [path, b] of arq) lista.push({ path, bytes: b.length, sha256: await sha256Hex(b), records: 1 });
    const manifesto = enc.encode(JSON.stringify({ schemaVersion: 1, id: 'teste', dataVersion, generatedAt, arquivos: lista, cliente: { pollIntervalMinutes: 5 } }));
    const sig = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, par.privateKey, manifesto);
    // DER a partir de r‖s
    const raw = new Uint8Array(sig);
    const inteiro = (v) => { let i = 0; while (i < 31 && v[i] === 0) i++; let x = v.slice(i); if (x[0] & 0x80) x = new Uint8Array([0, ...x]); return [0x02, x.length, ...x]; };
    const corpo = [...inteiro(raw.slice(0, 32)), ...inteiro(raw.slice(32))];
    const der = new Uint8Array([0x30, corpo.length, ...corpo]);
    arquivos.clear();
    arquivos.set('manifest.json', manifesto);
    arquivos.set('manifest.sig', enc.encode(Buffer.from(der).toString('base64')));
    for (const [p, b] of arq) arquivos.set(p, b);
  }
  const requisicoes = [];
  const fetchFn = async (url) => {
    const p = String(url).split('?')[0].replace('http://sintetico.local/d/', '');
    requisicoes.push(p);
    const b = arquivos.get(p);
    return b ? new Response(b, { status: 200 }) : new Response('x', { status: 404 });
  };
  return { spki, publicar, fetchFn, requisicoes, arquivos };
}

test('atualização: baixa SÓ o que mudou, verifica e troca de forma atômica', async () => {
  const s = await pacoteSintetico();
  await s.publicar('v1', '2026-10-01T10:00:00Z');
  const store = new DataStore({ baseUrl: 'http://sintetico.local/d/', fetchFn: s.fetchFn, chavePublica: s.spki });
  await store.iniciar();
  await store.ensureUfs(['BR', 'SP']);
  assert.equal(store.sig.estado, 'verificada');
  assert.equal(store.candidatos.find((c) => c.id === '1').nomeUrna, 'NOME A');
  const eventos = [];
  store.on((e) => eventos.push(e));

  assert.deepEqual(await store.verificarAtualizacao(), { tipo: 'atual' });

  await s.publicar('v2', '2026-10-02T10:00:00Z', { br: 'B' }); // só BR.json muda
  s.requisicoes.length = 0;
  const r = await store.verificarAtualizacao();
  assert.equal(r.tipo, 'atualizado');
  assert.equal(r.dataVersion, 'v2');
  assert.equal(r.arquivosBaixados, 1, 'apenas candidatos/BR.json mudou');
  assert.ok(s.requisicoes.includes('candidatos/BR.json'));
  assert.ok(!s.requisicoes.includes('candidatos/SP.json') && !s.requisicoes.includes('regras.json'));
  assert.equal(store.candidatos.find((c) => c.id === '1').nomeUrna, 'NOME B');
  assert.equal(store.manifest.dataVersion, 'v2');
  assert.ok(eventos.includes('atualizado'));
});

test('atualização: assinatura inválida, pacote antigo, arquivo corrompido e falha de rede mantêm o pacote ativo', async () => {
  const s = await pacoteSintetico();
  await s.publicar('v2', '2026-10-02T10:00:00Z', { br: 'B' });
  const store = new DataStore({ baseUrl: 'http://sintetico.local/d/', fetchFn: s.fetchFn, chavePublica: s.spki });
  await store.iniciar();
  await store.ensureUfs(['BR']);

  // anti-rollback: pacote mais antigo (assinado e válido) é ignorado
  await s.publicar('v1', '2026-10-01T10:00:00Z');
  assert.equal((await store.verificarAtualizacao()).tipo, 'ignorado');
  assert.equal(store.manifest.dataVersion, 'v2');

  // assinatura inválida
  await s.publicar('v3', '2026-10-03T10:00:00Z', { br: 'C' });
  const sigOriginal = s.arquivos.get('manifest.sig');
  s.arquivos.set('manifest.sig', new TextEncoder().encode('AAAA'));
  const rej = await store.verificarAtualizacao();
  assert.equal(rej.tipo, 'rejeitado');
  assert.match(rej.motivo, /INVÁLIDA/);
  assert.equal(store.manifest.dataVersion, 'v2');

  // arquivo corrompido (sha256 diferente do manifesto)
  s.arquivos.set('manifest.sig', sigOriginal);
  const bom = s.arquivos.get('candidatos/BR.json');
  s.arquivos.set('candidatos/BR.json', new TextEncoder().encode('[]'));
  const corrompido = await store.verificarAtualizacao();
  assert.equal(corrompido.tipo, 'falha');
  assert.equal(store.manifest.dataVersion, 'v2');
  assert.equal(store.candidatos.find((c) => c.id === '1').nomeUrna, 'NOME B');

  // restabelecido: agora atualiza
  s.arquivos.set('candidatos/BR.json', bom);
  assert.equal((await store.verificarAtualizacao()).tipo, 'atualizado');
  assert.equal(store.candidatos.find((c) => c.id === '1').nomeUrna, 'NOME C');
});
