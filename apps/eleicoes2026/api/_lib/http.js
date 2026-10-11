// Utilitários HTTP: respostas JSON com cabeçalhos de segurança, CORS restrito, IP do cliente,
// leitura segura do corpo e adaptador Node (req/res da Vercel) <-> Request/Response padrão (Web).
// Os handlers (nlu-handler.js, report-handler.js) trabalham só com Request/Response: ficam testáveis sem rede.

export const MAX_BODY_BYTES = 4096;

export const SECURITY_HEADERS = Object.freeze({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'Permissions-Policy': 'interest-cohort=()',
});

/** Resposta JSON com cabeçalhos de segurança (+ extras, ex.: CORS, Retry-After, Allow). */
export function json(status, body, extra = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, ...extra },
  });
}

// ---------------------------------------------------------------- CORS

function escaparRegex(s) {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compila um padrão de origem. `*` casa apenas [a-z0-9-]* (um trecho de hostname, nunca "." nem "/"),
 * ex.: "https://saibatudo-*.vercel.app" casa "https://saibatudo-git-main-fulano.vercel.app" mas NÃO
 * "https://saibatudo-x.evil.com" nem "https://evil.com/.vercel.app".
 */
export function compilarOrigem(padrao) {
  const p = padrao.trim().replace(/\/+$/, '').toLowerCase();
  const rx = escaparRegex(p).replace(/\*/g, '[a-z0-9-]*');
  return new RegExp(`^${rx}$`);
}

export function origemPermitida(origin, allowedOrigins) {
  if (typeof origin !== 'string' || !origin) return false;
  const o = origin.toLowerCase();
  return allowedOrigins.some((p) => compilarOrigem(p).test(o));
}

/**
 * Política CORS:
 *  - sem cabeçalho Origin (app Android, curl, servidor) => permitido, sem cabeçalhos CORS;
 *  - com Origin permitido => ecoa a origem (nunca "*") + Vary: Origin;
 *  - com Origin não permitido => negado (o handler responde 403).
 */
export function avaliarCors(request, allowedOrigins, metodos = 'POST, OPTIONS') {
  const origin = request.headers.get('origin');
  if (origin === null) return { allowed: true, headers: { Vary: 'Origin' } };
  if (!origemPermitida(origin, allowedOrigins)) return { allowed: false, headers: { Vary: 'Origin' } };
  return {
    allowed: true,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': metodos,
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    },
  };
}

// ---------------------------------------------------------------- cliente

/** IP do cliente. Na Vercel, x-forwarded-for/x-real-ip são definidos pela borda (não vêm do cliente). */
export function clientIp(request) {
  const h = request.headers;
  const v = h.get('x-vercel-forwarded-for') || h.get('x-real-ip') || (h.get('x-forwarded-for') || '').split(',')[0];
  return (v || '').trim() || 'desconhecido';
}

// ---------------------------------------------------------------- corpo

/**
 * Lê o corpo como JSON com limite de bytes.
 * @returns {Promise<{ok:true,value:any}|{ok:false,status:number,error:string}>}
 */
export async function readJsonBody(request, maxBytes = MAX_BODY_BYTES) {
  const tipo = (request.headers.get('content-type') || '').toLowerCase();
  if (!/^application\/json(\s*;.*)?$/.test(tipo.trim())) return { ok: false, status: 415, error: 'unsupported_media_type' };

  const declarado = Number(request.headers.get('content-length'));
  if (Number.isFinite(declarado) && declarado > maxBytes) return { ok: false, status: 413, error: 'payload_too_large' };

  let buf;
  try {
    buf = new Uint8Array(await request.arrayBuffer());
  } catch {
    return { ok: false, status: 400, error: 'bad_request' };
  }
  if (buf.length > maxBytes) return { ok: false, status: 413, error: 'payload_too_large' };
  if (buf.length === 0) return { ok: false, status: 400, error: 'bad_request' };
  try {
    return { ok: true, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buf)) };
  } catch {
    return { ok: false, status: 400, error: 'invalid_json' };
  }
}

// ---------------------------------------------------------------- adaptador Node (Vercel)

async function lerStream(req, limite) {
  const partes = [];
  let total = 0;
  for await (const chunk of req) {
    const b = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    total += b.length;
    partes.push(b);
    // Lê no máximo limite+1 bytes: basta para o handler detectar 413 sem bufferizar o excedente.
    if (total > limite) break;
  }
  return Buffer.concat(partes).subarray(0, limite + 1);
}

/**
 * Converte um handler Web `(Request) => Response` na assinatura clássica `(req, res)` da Vercel.
 * Não toca em `req.body` (o helper da Vercel consumiria o stream); lê o stream com limite.
 */
export function toNodeHandler(handle, { maxBodyBytes = MAX_BODY_BYTES } = {}) {
  return async function nodeHandler(req, res) {
    let response;
    try {
      const host = req.headers.host || 'localhost';
      const url = new URL(req.url || '/', `https://${host}`);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (k.startsWith(':')) continue; // pseudo-cabeçalhos HTTP/2 não são nomes válidos em Headers
        if (Array.isArray(v)) for (const x of v) headers.append(k, x);
        else if (v !== undefined) headers.set(k, v);
      }
      const method = (req.method || 'GET').toUpperCase();
      const init = { method, headers };
      if (method !== 'GET' && method !== 'HEAD') init.body = await lerStream(req, maxBodyBytes);
      response = await handle(new Request(url, init));
    } catch {
      // Nunca vaza detalhes (a mensagem de erro poderia conter trechos da pergunta).
      response = json(500, { ok: false, error: 'internal' });
    }
    res.statusCode = response.status;
    response.headers.forEach((valor, nome) => res.setHeader(nome, valor));
    const corpo = Buffer.from(await response.arrayBuffer());
    res.end(req.method === 'HEAD' ? undefined : corpo);
  };
}
