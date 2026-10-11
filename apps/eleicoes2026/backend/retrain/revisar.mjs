#!/usr/bin/env node
// Revisão humana da fila (backend/retrain/review/pending.jsonl). A PESSOA decide o rótulo e o texto que pode ser publicado.
//
// Para cada pergunta mostra os dois rótulos (regras e juiz) e aceita:
//   r            aceita o rótulo das REGRAS
//   j            aceita o rótulo do JUIZ (modelo)
//   m {json}     rótulo manual, ex.: m {"intent":"LISTAR_CANDIDATOS","uf":"MG"}   (validado: tem de ser ponto fixo do normalizador)
//   d            DESCONHECIDA de propósito (exemplo negativo: o app deve mesmo não entender)
//   t <texto>    reescreve a pergunta (retira dado pessoal ou opinião) e depois escolhe o rótulo; o rótulo é revalidado no TEXTO NOVO
//   x            rejeita (não será usada nem publicada)
//   s            pula (continua pendente)      q   sai e salva
// Aceitar exige confirmar "sem dado pessoal e sem opinião política identificável": o texto final vai para arquivos PÚBLICOS do repositório.
//
// Saída: backend/retrain/review/decididas.jsonl (git-ignorado). Depois: node backend/retrain/promover.mjs
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { limparMultilinha, redactPii } from '../../api/_lib/sanitize.js';
import { REPO, ehPontoFixo, opt } from './label_extra.mjs';

const MARCAS_PII = ['[e-mail removido]', '[documento removido]', '[telefone removido]', '[número removido]'];

/** O texto pode ser publicado? (limite, dados pessoais mascarados) Devolve { ok, q } com o texto limpo, ou { ok:false, erro }. */
export function textoPublicavel(texto) {
  const q = limparMultilinha(String(texto ?? '')).replace(/\s+/g, ' ').trim();
  if (q.length < 3 || q.length > 300) return { ok: false, erro: 'o texto precisa ter de 3 a 300 caracteres' };
  if (redactPii(q) !== q || MARCAS_PII.some((m) => q.includes(m))) return { ok: false, erro: 'o texto tem dado pessoal (e-mail, CPF, telefone, número longo)' };
  return { ok: true, q };
}

/**
 * Aplica uma decisão a um registro da fila. Função pura (não toca em disco).
 * @param {object} reg registro de pending.jsonl
 * @param {{acao:'regras'|'juiz'|'manual'|'desconhecida'|'rejeitar', alvoManual?:object, qFinal?:string, confirmouSemPii?:boolean, revisor:string, agora?:string}} d
 * @returns {{ok:true, registro:object} | {ok:false, erro:string}}
 */
export function aplicarDecisao(reg, d) {
  const base = { q: reg.q, n: reg.n ?? 1, revisor: d.revisor, revisadoEm: d.agora ?? new Date().toISOString() };
  if (d.acao === 'rejeitar') return { ok: true, registro: { ...base, decisao: 'rejeitada', publicavel: false } };

  if (!d.revisor || !String(d.revisor).trim()) return { ok: false, erro: 'informe o revisor (--revisor)' };
  if (!d.confirmouSemPii) return { ok: false, erro: 'confirme que o texto não tem dado pessoal nem opinião política identificável (ou reescreva com t)' };
  const t = textoPublicavel(d.qFinal ?? reg.q);
  if (!t.ok) return { ok: false, erro: t.erro };

  let alvo;
  if (d.acao === 'regras') alvo = reg.alvo_regras;
  else if (d.acao === 'juiz') alvo = reg.alvo_juiz;
  else if (d.acao === 'desconhecida') alvo = { intent: 'DESCONHECIDA' };
  else if (d.acao === 'manual') alvo = d.alvoManual;
  else return { ok: false, erro: `ação desconhecida: ${d.acao}` };
  if (!alvo || typeof alvo !== 'object' || typeof alvo.intent !== 'string') return { ok: false, erro: 'não há rótulo para aceitar' };

  // o rótulo tem de se sustentar no TEXTO FINAL (que pode ter sido reescrito): vocabulário fechado e entidades ancoradas na pergunta
  if (!ehPontoFixo(t.q, alvo)) return { ok: false, erro: 'o rótulo não se sustenta no texto (entidade fora do vocabulário ou que a pergunta não cita)' };

  return {
    ok: true,
    registro: { ...base, q_final: t.q, alvo, intent: alvo.intent, decisao: d.acao === 'manual' ? 'manual' : d.acao === 'desconhecida' ? 'desconhecida' : d.acao, publicavel: true },
  };
}

function lerJsonl(caminho) {
  if (!existsSync(caminho)) return [];
  return readFileSync(caminho, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

async function main() {
  const argv = process.argv.slice(2);
  const pasta = resolve(REPO, opt(argv, 'dir', 'backend/retrain/review'));
  const revisor = opt(argv, 'revisor', process.env.USERNAME ?? process.env.USER ?? '');
  const pendentes = lerJsonl(resolve(pasta, 'pending.jsonl'));
  if (!pendentes.length) { console.log('Nada pendente.'); return; }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const decididas = resolve(pasta, 'decididas.jsonl');
  const restantes = [];
  let feitas = 0;
  console.log(`${pendentes.length} pendentes (mais frequentes primeiro). Revisor: ${revisor || '(não informado)'}\n`);
  for (let i = 0; i < pendentes.length; i++) {
    const reg = pendentes[i];
    console.log(`[${i + 1}/${pendentes.length}] (${reg.n}x) ${reg.q}`);
    console.log(`  regras: ${JSON.stringify(reg.alvo_regras)}\n  juiz:   ${JSON.stringify(reg.alvo_juiz)}\n  motivos: ${reg.motivos.join(', ')}   destino: ${reg.destino}`);
    let qFinal = reg.q;
    let resolvido = false;
    while (!resolvido) {
      const entrada = (await rl.question('> [r]egras [j]uiz [m]anual {json} [d]esconhecida [t]exto novo [x] rejeitar [s]kip [q]uit: ')).trim();
      const [cmd, ...resto] = entrada.split(/\s+/);
      const arg = resto.join(' ');
      if (cmd === 'q') { restantes.push(...pendentes.slice(i)); resolvido = true; i = pendentes.length; break; }
      if (cmd === 's' || cmd === '') { restantes.push(reg); resolvido = true; break; }
      if (cmd === 't') { qFinal = arg; console.log(`  texto agora: ${qFinal}`); continue; }
      const acao = { r: 'regras', j: 'juiz', m: 'manual', d: 'desconhecida', x: 'rejeitar' }[cmd];
      if (!acao) { console.log('  comando inválido'); continue; }
      let alvoManual;
      if (acao === 'manual') {
        try { alvoManual = JSON.parse(arg); } catch { console.log('  JSON inválido'); continue; }
      }
      let confirmou = acao === 'rejeitar';
      if (!confirmou) confirmou = (await rl.question('  o texto está sem dado pessoal e sem opinião política identificável? [s/N] ')).trim().toLowerCase() === 's';
      const r = aplicarDecisao(reg, { acao, alvoManual, qFinal, confirmouSemPii: confirmou, revisor });
      if (!r.ok) { console.log(`  ✗ ${r.erro}`); continue; }
      appendFileSync(decididas, JSON.stringify(r.registro) + '\n', 'utf8');
      feitas++;
      console.log(`  ✓ ${r.registro.decisao}`);
      resolvido = true;
    }
  }
  writeFileSync(resolve(pasta, 'pending.jsonl'), restantes.map((r) => JSON.stringify(r)).join('\n') + (restantes.length ? '\n' : ''), 'utf8');
  rl.close();
  console.log(`\n${feitas} decididas, ${restantes.length} pendentes. Próximo passo: node backend/retrain/promover.mjs`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
