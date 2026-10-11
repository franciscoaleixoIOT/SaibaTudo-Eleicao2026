// Validação do TeX gerado pelo aplicativo com o próprio KaTeX vendorizado (modo estrito: qualquer comando inválido falha o teste).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { RAIZ } from './support.mjs';

export const katex = (() => {
  const mod = { exports: {} };
  vm.runInNewContext(readFileSync(resolve(RAIZ, 'web/src/quimica/vendor/katex/katex.min.js'), 'utf8'), { module: mod, exports: mod.exports, self: {}, globalThis: {} });
  return mod.exports;
})();

export function validarTex(tex, onde) {
  for (const t of Array.isArray(tex) ? tex : [tex]) {
    if (!t) continue;
    assert.ok(!t.includes('\u0008'), `${onde}: caractere de controle (barra invertida perdida) em ${JSON.stringify(t)}`);
    assert.doesNotThrow(() => katex.renderToString(t, { throwOnError: true, strict: 'error', trust: false }), `${onde}: TeX inválido: ${t}`);
  }
}

export function validarPassos(r, onde) {
  assert.ok(Array.isArray(r.passos) && r.passos.length > 0, `${onde}: sem passos`);
  for (const p of r.passos) {
    assert.ok(p.texto && typeof p.texto === 'string', `${onde}: passo sem texto`);
    assert.ok(!/<[a-z]/i.test(p.texto), `${onde}: HTML no texto do passo`);
    validarTex(p.tex, onde);
  }
}

/** Valida todo o TeX dos blocos de uma resposta do motor (passos e equações). */
export function validarTexDaResposta(r, onde) {
  for (const b of r.blocos) {
    if (b.tipo === 'passos') for (const p of b.passos) validarTex(p.tex, `${onde} (passo)`);
    if (b.tipo === 'equacao') validarTex(b.tex, `${onde} (equação)`);
  }
}
