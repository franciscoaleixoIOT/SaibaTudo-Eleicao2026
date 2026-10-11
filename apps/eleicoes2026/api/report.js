// POST /api/report — cria uma issue pública (rótulo "relato-ia") com o relato de uma resposta da IA.
// Contrato: docs/DATA_CONTRACT.md §9. Segredo: GITHUB_TOKEN (permissão apenas issues:write), só na Vercel.
//
//   Entrada : { q, a, intent, origem, dataVersion, app, note, client }
//   Saída   : { ok:true }

import { toNodeHandler } from './_lib/http.js';
import { MAX_REPORT_BODY_BYTES, createReportHandler } from './_lib/report-handler.js';

export const handle = createReportHandler();

export default toNodeHandler(handle, { maxBodyBytes: MAX_REPORT_BODY_BYTES });

// Duração máxima da função (s): a chamada ao GitHub tem timeout de 8 s.
export const config = { maxDuration: 15 };
