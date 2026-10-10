// POST /api/nlu — interpretação em nuvem (opt-in) -> Modal (llama.cpp, CPU). Contrato: docs/DATA_CONTRACT.md §8; operação: api/README.md.
//
//   Entrada : { q, v:1, client:"android"|"web", iid:<uuid v4/v7> }
//   Saída   : { ok:true, nlu:{intent, elemento?, composto?, propriedade?, quantidades?, equacao?, nivel?, unidadeDestino?}, model, cached }
//
// A nuvem devolve só intenção/entidades (cada uma ancorada no texto da pergunta); os clientes revalidam tudo contra o pacote de
// dados assinado. Pedidos perigosos são recusados por regra ANTES do modelo (intent RECUSA_PERIGO). O texto da pergunta nunca é
// registrado. Desligado por padrão: sem MODAL_ENDPOINT/MODAL_KEY/MODAL_SECRET responde 503 `disabled`.

import { toNodeHandler } from './_lib/http.js';
import { createNluHandler } from './_lib/nlu-handler.js';

// Estado em memória (limites, orçamento, cache) vive enquanto a instância estiver quente.
export const handle = createNluHandler();

export default toNodeHandler(handle);

// Duração máxima da função (s): o proxy já limita a chamada ao Modal por MODAL_TIMEOUT_MS (<= 25 s).
export const config = { maxDuration: 30 };
