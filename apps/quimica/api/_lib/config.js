// Leitura de configuração a partir de variáveis de ambiente (lida A CADA requisição, para que o "kill switch" — esvaziar
// MODAL_ENDPOINT ou ASK_ENABLED na Vercel — e os testes funcionem sem reiniciar nada).
// Segredos (MODAL_KEY, MODAL_SECRET, HF_TOKEN, UPSTASH_*) só existem nas variáveis de ambiente da Vercel.

const ORIGENS_PADRAO = ['https://saibatudo.net', 'https://www.saibatudo.net'];

function inteiro(valor, padrao, min, max) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return padrao;
  const n = Number(valor);
  if (!Number.isFinite(n)) return padrao;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** Aceita https:// (e http://localhost/127.0.0.1 para desenvolvimento). Devolve a URL ou ''. */
function urlSegura(valor) {
  const s = (valor ?? '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol === 'https:' || (u.protocol === 'http:' && local)) return u.toString();
  } catch {
    /* inválida */
  }
  return '';
}

export function parseOrigins(valor) {
  const lista = String(valor ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return lista.length ? lista : [...ORIGENS_PADRAO];
}

export function readConfig(env = process.env) {
  return {
    // --- NLU (interpretação) no Modal, CPU. DESLIGADO por padrão: sem MODAL_ENDPOINT o proxy responde 503 `disabled`.
    modalEndpoint: urlSegura(env.MODAL_ENDPOINT),
    modalKey: (env.MODAL_KEY ?? '').trim(),
    modalSecret: (env.MODAL_SECRET ?? '').trim(),
    modelVersion: (env.MODEL_VERSION ?? '').trim() || 'dev',
    timeoutMs: inteiro(env.MODAL_TIMEOUT_MS, 12000, 500, 25000),
    // Padrão conservador: 300 chamadas/dia ~ 9 mil/mês, que no pior caso (todas com container frio) fica abaixo do crédito grátis do Modal
    dailyBudget: inteiro(env.DAILY_BUDGET, 300, 0, 1_000_000),

    // --- Explicação gerada (/api/ask). DESLIGADA por padrão: só liga com ASK_ENABLED=1 E um provedor configurado.
    askEnabled: (env.ASK_ENABLED ?? '').trim() === '1',
    askModelVersion: (env.ASK_MODEL_VERSION ?? '').trim() || (env.MODEL_VERSION ?? '').trim() || 'dev',
    // Provedor PRINCIPAL: Space no ZeroGPU do Hugging Face (a cota diária da conta conta só o tempo de GPU usado).
    hfAskUrl: urlSegura(env.HF_ASK_SPACE_URL),
    hfToken: (env.HF_TOKEN ?? '').trim(),
    askHfDailyBudget: inteiro(env.HF_ASK_DAILY_BUDGET, 400, 0, 100_000),
    askHfTimeoutMs: inteiro(env.HF_ASK_TIMEOUT_MS, 25000, 1000, 60000),
    // RESERVA: endpoint de texto no Modal (GPU cobra o contêiner inteiro), com orçamento diário próprio e baixo.
    modalAskEndpoint: urlSegura(env.MODAL_ASK_ENDPOINT),
    askModalDailyBudget: inteiro(env.MODAL_ASK_DAILY_BUDGET, 15, 0, 100_000),
    askTimeoutMs: inteiro(env.MODAL_ASK_TIMEOUT_MS, 30000, 1000, 60000),

    // --- limites por cliente
    rateIpPerMin: inteiro(env.RATE_IP_PER_MIN, 20, 1, 10_000),
    rateIidPerDay: inteiro(env.RATE_IID_PER_DAY, 60, 1, 100_000),
    cacheTtlMs: inteiro(env.CACHE_TTL_SECONDS, 3600, 1, 86_400) * 1000,
    cacheMax: inteiro(env.CACHE_MAX_ENTRIES, 500, 10, 5000),

    // --- CORS
    allowedOrigins: parseOrigins(env.ALLOWED_ORIGINS),

    // --- saúde
    version: (env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || 'dev',
  };
}

/** O /api/nlu está ligado? (endpoint https explícito + credenciais do Modal) */
export const nluAtivo = (cfg) => Boolean(cfg.modalEndpoint && cfg.modalKey && cfg.modalSecret);

/** Space do Hugging Face configurado (URL https + token)? */
export const askTemHf = (cfg) => Boolean(cfg.hfAskUrl && cfg.hfToken);

/** Endpoint de texto do Modal configurado (URL explícita + credenciais)? */
export const askTemModal = (cfg) => Boolean(cfg.modalAskEndpoint && cfg.modalKey && cfg.modalSecret);

/** O /api/ask está ligado? Nunca se deriva a URL do NLU nem se usa URL fixa: o kill switch tem de ser inequívoco. */
export const askAtivo = (cfg) => Boolean(cfg.askEnabled && (askTemHf(cfg) || askTemModal(cfg)));
