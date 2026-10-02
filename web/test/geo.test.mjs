// Sugestão do estado pela localização aproximada (js/geo.js): casos de referência compartilhados com o app Android
// (contracts/geo_cases.json, malha real do IBGE em data/geo/ufs.json) e garantias de privacidade (coordenadas nunca saem
// do aparelho: nem em requisições, nem em armazenamento, nem em log).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RAIZ } from './support.mjs';
import {
  DISTANCIA_MAXIMA_KM, MENSAGENS_LOCALIZACAO, URL_CONTORNOS_UF, estadoPermissaoLocalizacao, geolocalizacaoDisponivel, localizarUf,
  sugerirUfPelaLocalizacao, ufPorCoordenada
} from '../src/eleicoes2026/js/geo.js';

const GEO_BYTES = readFileSync(resolve(RAIZ, 'data/geo/ufs.json'));
const GEO = JSON.parse(GEO_BYTES.toString('utf8'));
const CASOS = JSON.parse(readFileSync(resolve(RAIZ, 'contracts/geo_cases.json'), 'utf8'));

const SP = { latitude: -23.5505, longitude: -46.6333 };

/** Geolocalização simulada: responde com `coords` ou com o erro `erro` ({ code }); registra as opções pedidas. */
function geoFalsa({ coords = null, erro = null, nunca = false } = {}) {
  const chamadas = [];
  return {
    chamadas,
    getCurrentPosition(ok, falha, opcoes) {
      chamadas.push(opcoes);
      if (nunca) return;
      setTimeout(() => (erro ? falha(erro) : ok({ coords: { ...coords, accuracy: 3000 }, timestamp: Date.now() })), 1);
    }
  };
}

/** fetch simulado que só serve o contorno das UFs (do disco) e registra TUDO o que recebeu. */
function fetchFalso({ status = 200 } = {}) {
  const chamadas = [];
  const fn = async (...args) => {
    chamadas.push(args);
    return new Response(status === 200 ? GEO_BYTES : 'erro', { status });
  };
  fn.chamadas = chamadas;
  return fn;
}

test('contorno das UFs: 27 UFs, polígonos com anel externo [lon, lat] dentro do Brasil', () => {
  assert.equal(Object.keys(GEO.ufs).length, 27);
  for (const [uf, poligonos] of Object.entries(GEO.ufs)) {
    assert.ok(poligonos.length > 0, uf);
    for (const [externo] of poligonos) {
      assert.ok(externo.length >= 3, `${uf}: anel externo`); // a malha mínima do IBGE tem uma lasca degenerada no PR (3 pontos)
      for (const [lon, lat] of externo) assert.ok(lon > -75 && lon < -28 && lat > -35 && lat < 6, `${uf}: ponto fora do Brasil ${lon},${lat}`);
    }
  }
});

test(`casos de referência (contracts/geo_cases.json): ${CASOS.cases.length} pontos, inclusive ilhas e fora do Brasil`, () => {
  assert.ok(CASOS.cases.length >= 31);
  assert.ok(CASOS.cases.some((c) => c.uf === null), 'há casos fora do Brasil');
  const falhas = CASOS.cases.filter((c) => ufPorCoordenada(c.lat, c.lon, GEO) !== c.uf)
    .map((c) => `${c.nome}: esperado ${c.uf}, veio ${ufPorCoordenada(c.lat, c.lon, GEO)}`);
  assert.deepEqual(falhas, []);
  // as 27 UFs aparecem nos casos (todas as capitais)
  assert.equal(new Set(CASOS.cases.map((c) => c.uf).filter(Boolean)).size, 27);
});

test('ufPorCoordenada: aceita o JSON inteiro ou só o mapa de UFs; entradas inválidas dão null', () => {
  assert.equal(ufPorCoordenada(SP.latitude, SP.longitude, GEO.ufs), 'SP');
  for (const [lat, lon] of [[NaN, -46], [-23, Infinity], [95, -46], [-23, 200], ['-23', -46]]) assert.equal(ufPorCoordenada(lat, lon, GEO), null);
  assert.equal(ufPorCoordenada(SP.latitude, SP.longitude, null), null);
  assert.equal(ufPorCoordenada(SP.latitude, SP.longitude, {}), null);
});

test(`ufPorCoordenada: fora dos contornos vale a UF mais próxima só até ${DISTANCIA_MAXIMA_KM} km (litoral) — além disso, null`, () => {
  // quadrado sintético 1°×1° em torno do Equador: a 0,2° (~22 km) da borda ainda conta; a 0,5° (~55 km), não
  const quadrado = { XX: [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]] };
  assert.equal(ufPorCoordenada(0.5, 0.5, quadrado), 'XX');
  assert.equal(ufPorCoordenada(0.5, 1.2, quadrado), 'XX');
  assert.equal(ufPorCoordenada(0.5, 1.5, quadrado), null);
  // buraco: ponto dentro do buraco não pertence ao polígono (e cai na UF do buraco, se houver)
  const comBuraco = {
    AA: [[[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]]],
    BB: [[[[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]]]
  };
  assert.equal(ufPorCoordenada(2, 2, comBuraco), 'BB');
  assert.equal(ufPorCoordenada(0.5, 0.5, comBuraco), 'AA');
});

test('localizarUf: posição aproximada (sem alta precisão, cache de 30 min, timeout ~10 s) → UF calculada no aparelho', async () => {
  const geo = geoFalsa({ coords: SP });
  const fetchFn = fetchFalso();
  assert.deepEqual(await localizarUf({ geolocation: geo, fetchFn }), { uf: 'SP', motivo: 'ok' });
  assert.deepEqual(geo.chamadas, [{ enableHighAccuracy: false, maximumAge: 30 * 60 * 1000, timeout: 10_000 }]);
  assert.equal(await sugerirUfPelaLocalizacao({ geolocation: geoFalsa({ coords: { latitude: -3.119, longitude: -60.0217 } }), fetchFn }), 'AM');
});

test('privacidade: o único pedido de rede é /data/geo/ufs.json (mesma origem), sem coordenadas; nada é gravado nem registrado', async () => {
  const fetchFn = fetchFalso();
  const gravados = [];
  const logados = [];
  const armazenamento = { setItem: (...a) => gravados.push(a), getItem: () => null, removeItem: () => {}, clear: () => {} };
  // descritores (não os valores): ler globalThis.localStorage no Node 22+ dispara um aviso experimental
  const antes = Object.fromEntries(['localStorage', 'sessionStorage'].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const consoleOriginal = {};
  try {
    Object.defineProperty(globalThis, 'localStorage', { value: armazenamento, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'sessionStorage', { value: armazenamento, configurable: true, writable: true });
    for (const m of ['log', 'info', 'warn', 'error', 'debug']) { consoleOriginal[m] = console[m]; console[m] = (...a) => logados.push(a); }
    const r = await localizarUf({ geolocation: geoFalsa({ coords: SP }), fetchFn });
    assert.equal(r.uf, 'SP');
  } finally {
    for (const [m, f] of Object.entries(consoleOriginal)) console[m] = f;
    for (const [k, d] of Object.entries(antes)) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  }
  assert.equal(URL_CONTORNOS_UF, '/data/geo/ufs.json');
  assert.deepEqual(fetchFn.chamadas, [['/data/geo/ufs.json']], 'uma única requisição, só com a URL pública (sem query, corpo ou cabeçalhos)');
  const tudo = JSON.stringify(fetchFn.chamadas);
  assert.ok(!/23[.,]55|46[.,]63/.test(tudo), 'coordenadas não podem aparecer na requisição');
  assert.deepEqual(gravados, [], 'nada gravado em localStorage/sessionStorage');
  assert.deepEqual(logados, [], 'nada registrado no console');
  // e o código-fonte não tem caminho para armazenamento, log ou envio
  const fonte = readFileSync(resolve(RAIZ, 'web/src/eleicoes2026/js/geo.js'), 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
  for (const proibido of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'console.', 'sendBeacon', 'XMLHttpRequest', 'caches.', 'method:', 'body:']) {
    assert.ok(!fonte.includes(proibido), `geo.js não pode usar ${proibido}`);
  }
});

test('localizarUf: permissão negada, indisponível, tempo esgotado e navegador sem geolocalização não baixam nada e não quebram', async () => {
  for (const [code, motivo] of [[1, 'negada'], [2, 'indisponivel'], [3, 'tempo']]) {
    const fetchFn = fetchFalso();
    assert.deepEqual(await localizarUf({ geolocation: geoFalsa({ erro: { code } }), fetchFn }), { uf: null, motivo });
    assert.equal(fetchFn.chamadas.length, 0, `${motivo}: sem download do contorno`);
    assert.ok(MENSAGENS_LOCALIZACAO[motivo]);
  }
  const fetchFn = fetchFalso();
  assert.deepEqual(await localizarUf({ geolocation: undefined, fetchFn }), { uf: null, motivo: 'indisponivel' });
  assert.deepEqual(await localizarUf({ geolocation: {}, fetchFn }), { uf: null, motivo: 'indisponivel' });
  assert.equal(fetchFn.chamadas.length, 0);
  assert.equal(await sugerirUfPelaLocalizacao({ geolocation: geoFalsa({ erro: { code: 1 } }), fetchFn }), null);
  // navegador que nunca chama de volta: o limite total encerra a espera
  assert.deepEqual(await localizarUf({ geolocation: geoFalsa({ nunca: true }), fetchFn, limiteMs: 20 }), { uf: null, motivo: 'tempo' });
  // getCurrentPosition que lança exceção
  assert.deepEqual(await localizarUf({ geolocation: { getCurrentPosition() { throw new Error('x'); } }, fetchFn }), { uf: null, motivo: 'erro' });
});

test('localizarUf: fora do Brasil → motivo "fora"; falha ao baixar o contorno → "erro"', async () => {
  assert.deepEqual(await localizarUf({ geolocation: geoFalsa({ coords: { latitude: 38.7223, longitude: -9.1393 } }), fetchFn: fetchFalso() }), { uf: null, motivo: 'fora' });
  assert.deepEqual(await localizarUf({ geolocation: geoFalsa({ coords: SP }), fetchFn: fetchFalso({ status: 404 }) }), { uf: null, motivo: 'erro' });
  assert.deepEqual(await localizarUf({ geolocation: geoFalsa({ coords: SP }), fetchFn: async () => { throw new TypeError('offline'); } }), { uf: null, motivo: 'erro' });
  for (const m of ['fora', 'erro']) assert.ok(MENSAGENS_LOCALIZACAO[m]);
});

test('estadoPermissaoLocalizacao e geolocalizacaoDisponivel (a tentativa automática só ocorre se não estiver "denied")', async () => {
  const perms = (state) => ({ query: async ({ name }) => { assert.equal(name, 'geolocation'); return { state }; } });
  assert.equal(await estadoPermissaoLocalizacao(perms('denied')), 'denied');
  assert.equal(await estadoPermissaoLocalizacao(perms('prompt')), 'prompt');
  assert.equal(await estadoPermissaoLocalizacao(undefined), null, 'sem Permissions API: desconhecido (não bloqueia a tentativa)');
  assert.equal(await estadoPermissaoLocalizacao({ query: async () => { throw new TypeError('nome não suportado'); } }), null);
  assert.equal(geolocalizacaoDisponivel(undefined), false);
  assert.equal(geolocalizacaoDisponivel({ getCurrentPosition() {} }), true);
});
