// POST /api/ask — proxy de resposta generativa ancorada no TSE -> Modal (Qwen2.5-7B-Instruct-AWQ).
//
// Entrada : { q: string, context?: string, v: 1, client: "android"|"web", iid: "<uuid>" }
// Saída   : { ok: true, answer: string, model: string, cached: boolean }
//
// Responde com texto fundamentado em regras e dados oficiais do TSE.
// O texto da pergunta nunca é registrado em logs. Segredos (MODAL_KEY/MODAL_SECRET) só nas variáveis da Vercel.

import { toNodeHandler } from './_lib/http.js';
import { createAskHandler } from './_lib/ask-handler.js';

export const handle = createAskHandler();

export default toNodeHandler(handle);

// Duração máxima da função (s): a GPU responde em ~2-5s, mas permitimos até 30s para acomodar partida a frio.
export const config = { maxDuration: 30 };
