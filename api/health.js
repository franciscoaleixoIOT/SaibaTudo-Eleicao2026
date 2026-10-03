// GET /api/health — verificação de saúde (sem segredos e sem chamar o Modal: não gera custo).
//   Saída: { ok:true, version, model, nlu:"on"|"off", report:"on"|"off", time }
// "nlu":"off" indica que o kill switch está ativo (MODAL_ENDPOINT vazio): os clientes usam só o NLU local.

import { readConfig } from './_lib/config.js';
import { json, toNodeHandler } from './_lib/http.js';

export function handleHealth(request, env = process.env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(405, { ok: false, error: 'method_not_allowed' }, { Allow: 'GET, HEAD' });
  }
  const cfg = readConfig(env);
  return json(200, {
    ok: true,
    version: cfg.version,
    model: cfg.modelVersion,
    nlu: cfg.mock || (cfg.modalEndpoint && cfg.modalKey && cfg.modalSecret) ? 'on' : 'off',
    ask: cfg.mock || (cfg.modalAskEndpoint && cfg.modalKey && cfg.modalSecret) ? 'on' : 'off',
    report: cfg.githubToken ? 'on' : 'off',
    time: new Date().toISOString(),
  });
}

export default toNodeHandler((request) => handleHealth(request), { maxBodyBytes: 0 });

// Duração máxima da função (s).
export const config = { maxDuration: 5 };
