import { createHash } from 'node:crypto';

// Leitura de configuração a partir de variáveis de ambiente (lida A CADA requisição, para que o
// "kill switch" — esvaziar MODAL_ENDPOINT na Vercel — e os testes funcionem sem reiniciar nada).
// Segredos (MODAL_KEY, MODAL_SECRET, GITHUB_TOKEN) só existem nas variáveis de ambiente da Vercel.

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
  const emProducao = env.VERCEL_ENV === 'production';
  const modalEndpoint = urlSegura(env.MODAL_ENDPOINT);
  // IA generativa (/api/ask): DESLIGADA por padrão. Só liga com ASK_ENABLED=1 E um MODAL_ASK_ENDPOINT explícito.
  // Nunca se deriva a URL do NLU nem se usa URL fixa: o kill switch tem de ser inequívoco (esvaziar a variável, ou ASK_ENABLED≠1).
  const modalAskEndpoint = urlSegura(env.MODAL_ASK_ENDPOINT);
  const askEnabled = (env.ASK_ENABLED ?? '').trim() === '1';
  return {
    // --- NLU e IA Generativa (Qwen 7B)
    modalEndpoint,
    // Canário do NLU: uma versão nova do modelo recebe CANARY_PCT % das instalações (balde estável por iid) antes de ser promovida.
    // Falha do canário => a MESMA pergunta é refeita na produção (o eleitor não percebe). Rollback: apagar canary.json no Modal.
    canaryEndpoint: urlSegura(env.MODAL_CANARY_ENDPOINT),
    canaryPct: inteiro(env.CANARY_PCT, 0, 0, 100),
    canaryModelVersion: (env.CANARY_MODEL_VERSION ?? '').trim() || 'canary',
    modalAskEndpoint,
    askEnabled,
    modalKey: (env.MODAL_KEY ?? '').trim(),
    modalSecret: (env.MODAL_SECRET ?? '').trim(),
    modelVersion: (env.MODEL_VERSION ?? '').trim() || 'dev',
    // Modo mock: SOMENTE fora de produção (nunca responde por um modelo falso em produção).
    mock: env.MOCK_NLU === '1' && !emProducao,
    timeoutMs: inteiro(env.MODAL_TIMEOUT_MS, 12000, 500, 25000),
    askTimeoutMs: inteiro(env.MODAL_ASK_TIMEOUT_MS, 30000, 1000, 60000),
    // --- limites
    // Padrão conservador: 300 chamadas/dia ~ 9 mil/mês, que no pior caso (todas com container frio) fica abaixo do crédito grátis do Modal
    dailyBudget: inteiro(env.DAILY_BUDGET, 300, 0, 1_000_000),
    rateIpPerMin: inteiro(env.RATE_IP_PER_MIN, 20, 1, 10_000),
    rateIidPerDay: inteiro(env.RATE_IID_PER_DAY, 60, 1, 100_000),
    cacheTtlMs: inteiro(env.CACHE_TTL_SECONDS, 3600, 1, 86_400) * 1000,
    cacheMax: inteiro(env.CACHE_MAX_ENTRIES, 500, 10, 5000),
    // --- CORS
    allowedOrigins: parseOrigins(env.ALLOWED_ORIGINS),
    // --- relatos
    githubToken: (env.GITHUB_TOKEN ?? '').trim(),
    githubRepo: (env.GITHUB_REPO ?? '').trim() || 'franciscoaleixoIOT/SaibaTudo-Eleicao2026',
    reportPerHour: inteiro(env.REPORT_PER_HOUR, 5, 1, 1000),
    reportDailyMax: inteiro(env.REPORT_DAILY_MAX, 100, 0, 100_000),
    // --- captura de perguntas não entendidas, com consentimento (api/_lib/melhoria-handler.js): DESLIGADA por padrão
    melhoriaEnabled: (env.MELHORIA_ENABLED ?? '').trim() === '1',
    melhoriaPerHour: inteiro(env.MELHORIA_PER_HOUR, 6, 1, 1000),
    melhoriaPerDay: inteiro(env.MELHORIA_PER_DAY, 20, 1, 10_000),
    // --- saúde
    version: (env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || 'dev',
  };
}

/** O /api/ask está ligado? (mock de desenvolvimento, ou ASK_ENABLED=1 + endpoint explícito + credenciais do Modal). */
export function askAtivo(cfg) {
  return Boolean(cfg.mock || (cfg.askEnabled && cfg.modalAskEndpoint && cfg.modalKey && cfg.modalSecret));
}

/** Balde estável 0..99 de uma instalação: a MESMA instalação cai sempre do mesmo lado do canário. */
export function baldeDoCanario(iid) {
  return createHash('sha256').update(String(iid).toLowerCase(), 'utf8').digest().readUInt32BE(0) % 100;
}

/** 'canary' ou 'prod' para esta instalação. Só há canário com endpoint configurado e CANARY_PCT > 0. */
export function variantePara(cfg, iid) {
  return cfg.canaryEndpoint && cfg.canaryPct > 0 && baldeDoCanario(iid) < cfg.canaryPct ? 'canary' : 'prod';
}
