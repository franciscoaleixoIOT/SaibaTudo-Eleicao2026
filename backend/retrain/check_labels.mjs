// Confere que cada rótulo do dataset de treino é um PONTO FIXO do normalizador do proxy (api/_lib/normalize.js):
// passando (pergunta, rótulo) pelo normalizador real — com ancoragem na pergunta — o resultado precisa ser idêntico
// ao rótulo, sem entidades descartadas. Assim o que se treina é exatamente o que o proxy entrega ao app.
//
// Entrada (stdin): JSON [{ "q": "...", "label": "{\"intent\": ...}" }, ...]. Saída: resumo; exit 1 se houver divergência.
import { normalizeModelOutput } from '../../api/_lib/normalize.js';

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const itens = JSON.parse(Buffer.concat(chunks).toString('utf8'));

const divergentes = [];
for (const { q, label } of itens) {
  const esperado = JSON.parse(label);
  const r = normalizeModelOutput(label, { question: q });
  const igual = r.ok && JSON.stringify(r.nlu) === JSON.stringify(esperado) && r.dropped.length === 0;
  if (!igual) divergentes.push({ q, label: esperado, obtido: r.ok ? r.nlu : r.error, descartados: r.dropped ?? null });
}

console.log(JSON.stringify({ verificados: itens.length, divergentes: divergentes.length, exemplos: divergentes.slice(0, 15) }, null, 1));
process.exit(divergentes.length === 0 ? 0 : 1);
