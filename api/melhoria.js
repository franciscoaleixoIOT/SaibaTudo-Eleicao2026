// POST /api/melhoria — captura, com consentimento próprio, das perguntas que o app não entendeu (DESLIGADA por padrão).
// Regras, privacidade e como ligar: api/_lib/melhoria-handler.js e docs/OPERACAO.md §7.

import { toNodeHandler } from './_lib/http.js';
import { createMelhoriaHandler } from './_lib/melhoria-handler.js';

export const handle = createMelhoriaHandler();

export default toNodeHandler(handle);

export const config = { maxDuration: 10 };
