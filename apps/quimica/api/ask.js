// POST /api/ask — explicação gerada, ancorada nos trechos licenciados e nos dados que o app já exibiu.
// Provedor principal: Space do Hugging Face (ZeroGPU). Reserva: Modal. Operação e variáveis: api/README.md.
//
// Entrada : { q, context?, trechos?: [{id, texto}], v:1, client:"android"|"web", iid:"<uuid>" }
// Saída   : { ok:true, answer, model, fontes:[ids dos trechos citados], cached }   |   422 { ok:false, error:"rejected"|"seguranca" }
//
// O servidor DESCARTA a resposta com número, fórmula ou fonte que não estejam nos dados enviados, ou que viole a segurança química
// (api/_lib/fidelidade.js). O texto da pergunta nunca é registrado. Desligado por padrão (ASK_ENABLED=1 + provedor configurado).

import { toNodeHandler } from './_lib/http.js';
import { createAskHandler } from './_lib/ask-handler.js';
import { MAX_ASK_BODY_BYTES } from './_lib/validate.js';

export const handle = createAskHandler();

export default toNodeHandler(handle, { maxBodyBytes: MAX_ASK_BODY_BYTES });

// Duração máxima da função (s): a GPU responde em ~3-8 s, mas a fila do ZeroGPU e a partida a frio do Modal podem passar de 30 s.
export const config = { maxDuration: 60 };
