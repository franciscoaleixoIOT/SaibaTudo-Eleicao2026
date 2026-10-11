// POST /api/nlu — proxy do NLU em nuvem (opt-in) -> Modal (llama.cpp, CPU).
// Contrato: docs/DATA_CONTRACT.md §9. Documentação operacional: docs/BACKEND.md.
//
//   Entrada : { q, v:1, client:"android"|"web", iid:<uuid v4/v7> }
//   Saída   : { ok:true, nlu:{intent,cargo?,uf?,partido?,nome?,tema?,apenasDeferidas?,historico?,turno?}, model, cached }
//
// A nuvem devolve só intenção/entidades; os clientes revalidam tudo contra os dados oficiais locais.
// O texto da pergunta nunca é registrado. Segredos (MODAL_KEY/MODAL_SECRET) só nas variáveis da Vercel.

import { toNodeHandler } from './_lib/http.js';
import { createNluHandler } from './_lib/nlu-handler.js';

// Estado em memória (limites, orçamento, cache) vive enquanto a instância estiver quente.
export const handle = createNluHandler();

export default toNodeHandler(handle);

// Duração máxima da função (s): o proxy já limita a chamada ao Modal por MODAL_TIMEOUT_MS (<= 20 s).
export const config = { maxDuration: 30 };
