// Utilitários dos testes (sem rede). Este arquivo não contém testes.
import { Readable } from 'node:stream';

export const IID_V4 = '3f2b8c1e-6a4d-4c3b-9e1f-0a1b2c3d4e5f';
export const IID_V7 = '018f3c2a-7b1e-7c3d-8a2b-1c2d3e4f5a6b';

let contador = 0;
/** UUID v4 válido e único (para não esbarrar nos limites entre testes). */
export function novoIid() {
  contador += 1;
  const hex = contador.toString(16).padStart(12, '0');
  return `3f2b8c1e-6a4d-4c3b-9e1f-${hex}`;
}

export const ENV_BASE = Object.freeze({
  MODAL_ENDPOINT: 'https://exemplo--saibatudo-quimica-nlu-nlu-infer.modal.run',
  MODAL_KEY: 'wk-teste',
  MODAL_SECRET: 'ws-teste',
  MODEL_VERSION: 'teste-1',
  DAILY_BUDGET: '1000',
});

export function mkRequest({ method = 'POST', url = 'https://saibatudo.net/quimica/api/nlu', headers = {}, body, json } = {}) {
  const h = new Headers(headers);
  let corpo = body;
  if (json !== undefined) {
    corpo = JSON.stringify(json);
    if (!h.has('content-type')) h.set('content-type', 'application/json');
  }
  return new Request(url, { method, headers: h, body: method === 'GET' || method === 'HEAD' ? undefined : corpo });
}

export function bodyNlu(q, extra = {}) {
  return { q, v: 1, client: 'android', iid: novoIid(), ...extra };
}

/** Resposta do Modal no formato { ok:true, output:{...} }. */
export function respostaModal(output, status = 200) {
  return new Response(JSON.stringify({ ok: true, output, model: 'x', ms: 10 }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Saída bruta do modelo para "qual a massa atômica do ferro?". */
export const SAIDA_MASSA_FERRO = Object.freeze({ intent: 'PROPRIEDADE', elemento: 'Fe', propriedade: 'massaAtomica' });

export function capturarLog() {
  const eventos = [];
  const log = (e) => eventos.push(e);
  return { log, eventos };
}

/** Relógio falso controlável. */
export function relogio(inicio = Date.UTC(2026, 9, 1, 15, 0, 0)) {
  let t = inicio;
  const now = () => t;
  now.avancar = (ms) => {
    t += ms;
  };
  return now;
}

export function fakeNodeReq({ method = 'POST', url = '/quimica/api/nlu', headers = {}, body } = {}) {
  const partes = body === undefined ? [] : [Buffer.from(body)];
  const req = Readable.from(partes);
  req.method = method;
  req.url = url;
  req.headers = { host: 'saibatudo.net', ...headers };
  return req;
}

export function fakeNodeRes() {
  const res = {
    statusCode: 0,
    headers: {},
    body: undefined,
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    end(b) {
      this.body = b === undefined ? '' : Buffer.from(b).toString('utf8');
    },
  };
  return res;
}
