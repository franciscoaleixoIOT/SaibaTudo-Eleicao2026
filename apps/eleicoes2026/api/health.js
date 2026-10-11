// GET /api/health — verificação de saúde (sem segredos e sem chamar o Modal: não gera custo).
//   Saída: { ok:true, version, model, nlu, ask, report, shared:"on"|"off", data, time }
// "nlu":"off" indica que o kill switch está ativo (MODAL_ENDPOINT vazio): os clientes usam só o NLU local.
// `data` descreve o PACOTE DE DADOS publicado (lido do próprio site, mesmo domínio): versão, quando foi gerado, idade em minutos,
// extração do TSE, fase e se há resultados. É o que o alerta de frescor e quem opera olham para saber se os eleitores estão vendo
// dados atuais. `null` se o manifesto não pôde ser lido em 2 s (nunca derruba o health).

import { askAtivo, readConfig } from './_lib/config.js';
import { lerConfigCompartilhado } from './_lib/compartilhado.js';
import { melhoriaAtiva } from './_lib/melhoria-handler.js';
import { json, origemPermitida, toNodeHandler } from './_lib/http.js';

const TIMEOUT_DADOS_MS = 2000;

/** Resumo do manifesto publicado, ou null. Só consulta o PRÓPRIO site (origem permitida): nunca um host escolhido pelo cliente. */
export async function lerDadosPublicados(request, cfg, { fetchFn = (...a) => globalThis.fetch(...a), now = () => Date.now() } = {}) {
  let alvo;
  try {
    const origem = new URL(request.url).origin;
    const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origem);
    if (!local && !origemPermitida(origem, cfg.allowedOrigins)) return null;
    alvo = new URL('/data/eleicoes2026/manifest.json', origem);
  } catch {
    return null;
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_DADOS_MS);
  try {
    const r = await fetchFn(alvo, { signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!r.ok) return null;
    const m = await r.json();
    const gerado = Date.parse(m.generatedAt);
    return {
      version: typeof m.dataVersion === 'string' ? m.dataVersion : null,
      generatedAt: typeof m.generatedAt === 'string' ? m.generatedAt : null,
      packageAgeMinutes: Number.isNaN(gerado) ? null : Math.max(0, Math.round((now() - gerado) / 60000)),
      extracaoTse: typeof m.extracaoTse === 'string' ? m.extracaoTse : null,
      fase: typeof m.faseEleitoral === 'string' ? m.faseEleitoral : null,
      resultados: m.resultadosDisponiveis === true,
      ask: m.cliente?.ask?.enabled === true,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function handleHealth(request, env = process.env, deps = {}) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(405, { ok: false, error: 'method_not_allowed' }, { Allow: 'GET, HEAD' });
  }
  const cfg = readConfig(env);
  const data = deps.semDados ? null : await lerDadosPublicados(request, cfg, deps);
  return json(200, {
    ok: true,
    version: cfg.version,
    model: cfg.modelVersion,
    nlu: cfg.mock || (cfg.modalEndpoint && cfg.modalKey && cfg.modalSecret) ? 'on' : 'off',
    ask: askAtivo(cfg) ? 'on' : 'off',
    report: cfg.githubToken ? 'on' : 'off',
    shared: lerConfigCompartilhado(env).ativo ? 'on' : 'off', // contadores globais de limite entre instâncias (Redis opcional)
    melhoria: melhoriaAtiva(cfg, env) ? 'on' : 'off', // captura de perguntas não entendidas, com consentimento (desligada por padrão)
    data,
    time: new Date().toISOString(),
  });
}

export default toNodeHandler((request) => handleHealth(request), { maxBodyBytes: 0 });

// Duração máxima da função (s).
export const config = { maxDuration: 5 };
