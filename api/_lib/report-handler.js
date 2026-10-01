// Núcleo do POST /api/report: cria uma issue PÚBLICA no GitHub com o relato de uma resposta da IA.
// Sem dados pessoais: não guarda IP/iid, não registra o conteúdo em log, mascara e-mail/CPF/telefone,
// neutraliza @menções e #referências e coloca todo texto do usuário em bloco de código.

import { createHash } from 'node:crypto';
import { readConfig } from './config.js';
import { avaliarCors, clientIp, json, readJsonBody } from './http.js';
import { createDailyBudget, createSlidingWindow, JANELAS } from './ratelimit.js';
import { codeFence, sanitizeFreeText } from './sanitize.js';
import { MAX_REPORT_A, MAX_REPORT_NOTE, MAX_REPORT_Q, validateReportBody } from './validate.js';

export const MAX_REPORT_BODY_BYTES = 16 * 1024;
const REPO_RX = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const DEDUP_TTL_MS = JANELAS.HORA;
const DEDUP_MAX = 2000;

export function defaultReportLog(evento) {
  const { evt, status, ms, client, err } = evento;
  console.log(JSON.stringify({ evt, status, ms, client, err }));
}

export function createReportState({ now = Date.now } = {}) {
  return {
    ipWindow: createSlidingWindow({ windowMs: JANELAS.HORA, now }),
    daily: createDailyBudget({ now }),
    /** @type {Map<string, number>} hash do relato -> expira em */
    dedup: new Map(),
  };
}

/** Monta título e corpo (markdown) da issue a partir de campos JÁ validados. */
export function buildIssue(r) {
  const q = sanitizeFreeText(r.q, MAX_REPORT_Q);
  const a = sanitizeFreeText(r.a, MAX_REPORT_A);
  const note = r.note ? sanitizeFreeText(r.note, MAX_REPORT_NOTE) : '';
  const id = createHash('sha256').update(`${r.q}\n${r.a}`).digest('hex').slice(0, 6);

  const partes = [
    '## Relato de resposta da IA',
    '',
    '| Campo | Valor |',
    '| --- | --- |',
    `| Intenção | \`${r.intent}\` |`,
    `| Origem da resposta | \`${r.origem}\` |`,
    `| Versão dos dados | \`${r.dataVersion}\` |`,
    `| App | \`${r.app}\` |`,
    `| Cliente | \`${r.client}\` |`,
    '',
    '### Pergunta',
    codeFence(q),
    '',
    '### Resposta exibida',
    codeFence(a),
  ];
  if (note) partes.push('', '### Observação do usuário', codeFence(note));
  partes.push(
    '',
    '---',
    '_Relato enviado pelo aplicativo, sem dados pessoais (e-mail, CPF e telefones são mascarados). ' +
      'O conteúdo do usuário aparece apenas dentro de blocos de código: links e menções não são ativados._'
  );
  return {
    title: `Relato da IA: ${r.intent} (${r.origem}, ${r.client}) id ${id}`,
    body: partes.join('\n'),
    dedupKey: createHash('sha256').update(`${r.q}\n${r.a}\n${r.note}`.toLowerCase()).digest('hex'),
  };
}

export function createReportHandler(deps = {}) {
  const getEnv = deps.env ?? (() => process.env);
  const now = deps.now ?? (() => Date.now());
  const doFetch = deps.fetch ?? ((...args) => globalThis.fetch(...args));
  const log = deps.log ?? defaultReportLog;
  const state = deps.state ?? createReportState({ now });

  return async function handleReport(request) {
    const t0 = now();
    const cfg = readConfig(getEnv());
    const cors = avaliarCors(request, cfg.allowedOrigins, 'POST, OPTIONS');
    const meta = { client: undefined };

    const responder = (status, corpo, extra = {}) => {
      log({ evt: 'report', status, ms: now() - t0, ...meta });
      return json(status, corpo, { ...cors.headers, ...extra });
    };

    if (!cors.allowed) return responder(403, { ok: false, error: 'origin' });
    if (request.method === 'OPTIONS') return responder(204, null);
    if (request.method !== 'POST') return responder(405, { ok: false, error: 'method_not_allowed' }, { Allow: 'POST, OPTIONS' });

    if (!cfg.githubToken || !REPO_RX.test(cfg.githubRepo)) {
      meta.err = 'disabled';
      return responder(503, { ok: false, error: 'disabled' });
    }

    const corpo = await readJsonBody(request, MAX_REPORT_BODY_BYTES);
    if (!corpo.ok) {
      meta.err = corpo.error;
      return responder(corpo.status, { ok: false, error: corpo.error });
    }
    const v = validateReportBody(corpo.value);
    if (!v.ok) {
      meta.err = `invalid_${v.field ?? 'body'}`;
      return responder(v.status, { ok: false, error: v.error, field: v.field });
    }
    meta.client = v.value.client;

    // --- rate limit: N relatos por hora por IP (em memória, por instância)
    const ip = clientIp(request);
    const lim = state.ipWindow.check(ip, cfg.reportPerHour);
    if (!lim.allowed) {
      meta.err = 'rate_limited';
      return responder(429, { ok: false, error: 'rate_limited' }, { 'Retry-After': String(Math.ceil(lim.retryAfterMs / 1000)) });
    }
    state.ipWindow.record(ip);

    const issue = buildIssue(v.value);

    // --- relato idêntico na última hora: responde ok sem criar issue duplicada
    const t = now();
    for (const [k, expira] of state.dedup) if (expira <= t) state.dedup.delete(k);
    if (state.dedup.has(issue.dedupKey)) {
      meta.err = 'duplicate';
      return responder(200, { ok: true });
    }

    // --- teto diário global de issues (protege a conta do GitHub contra spam distribuído)
    if (!state.daily.consume(cfg.reportDailyMax)) {
      meta.err = 'daily_cap';
      return responder(503, { ok: false, error: 'budget' });
    }

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const resp = await doFetch(`https://api.github.com/repos/${cfg.githubRepo}/issues`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.githubToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
          'User-Agent': 'saibatudo-relatos',
        },
        body: JSON.stringify({ title: issue.title, body: issue.body, labels: ['relato-ia'] }),
        signal: ctl.signal,
      });
      if (resp.status !== 201) {
        meta.err = `github_${resp.status}`;
        return responder(502, { ok: false, error: 'upstream' });
      }
      if (state.dedup.size >= DEDUP_MAX) state.dedup.delete(state.dedup.keys().next().value);
      state.dedup.set(issue.dedupKey, now() + DEDUP_TTL_MS);
      return responder(200, { ok: true });
    } catch (e) {
      meta.err = e && e.name === 'AbortError' ? 'timeout' : 'upstream';
      return responder(meta.err === 'timeout' ? 504 : 502, { ok: false, error: meta.err });
    } finally {
      clearTimeout(timer);
    }
  };
}
