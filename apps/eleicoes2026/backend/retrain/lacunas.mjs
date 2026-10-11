#!/usr/bin/env node
// Relatório de LACUNAS do NLU local: perguntas reais (contracts/nlu_real_cases.json) que o NLU do site NÃO entende, agrupadas por semelhança,
// com os termos que mais distinguem cada grupo e onde mexer. É a ponte entre "uma pessoa revisou perguntas reais" e "as regras locais
// melhoram": o app responde 100 % sem a nuvem, então ensinar a regra rende mais que retreinar o modelo.
//
// O relatório SUGERE; não altera código. Quem escreve a regra é uma pessoa, nos DOIS NLUs (paridade verificada pelo contrato compartilhado):
//   web/src/eleicoes2026/js/nlu.js   e   app/src/main/java/net/saibatudo/eleicoes2026/ai/nlu/LocalNlu.kt
// Proibido (regras de ouro): alias que crie fato, regra que mude o texto de uma resposta, mapear para candidato fora do pacote oficial.
//
// Uso: node backend/retrain/lacunas.mjs [--out docs/LACUNAS_NLU.md] [--json lacunas.json]
// Código de saída: 0 = nenhuma lacuna; 1 = há lacunas (o workflow eleicoes-lacunas-nlu.yml abre um PR rascunho com o relatório).
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { avaliarCasos } from '../../web/test/contrato.mjs';
import { REPO, carregarGazetteer, chaveQ, opt } from './label_extra.mjs';

const PARADAS = new Set(['a', 'o', 'as', 'os', 'de', 'do', 'da', 'dos', 'das', 'e', 'em', 'no', 'na', 'nos', 'nas', 'um', 'uma', 'que', 'qual', 'quais',
  'como', 'para', 'por', 'com', 'se', 'eu', 'me', 'meu', 'minha', 'ao', 'aos', 'ou', 'e', 'ha', 'tem', 'ter', 'pode', 'posso', 'sao', 'ser', 'foi', 'vai',
  'quem', 'quando', 'onde', 'qual', 'sobre', 'mais', 'muito', 'pra', 'pro', 'la', 'aqui', 'isso', 'esse', 'essa', 'este', 'esta']);

export const tokens = (q) => chaveQ(q).split(' ').filter((t) => t.length > 1 && !PARADAS.has(t));

export function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const uniao = A.size + B.size - inter;
  return uniao === 0 ? 0 : inter / uniao;
}

/** Agrupa as falhas por semelhança (guloso: entra no 1º grupo cujo representante tem Jaccard >= limiar) e pela intenção esperada. */
export function agrupar(falhas, limiar = 0.34) {
  const grupos = [];
  for (const f of falhas) {
    const tk = tokens(f.caso.q);
    const g = grupos.find((x) => x.intent === f.caso.intent && jaccard(x.tokens, tk) >= limiar);
    if (g) {
      g.casos.push(f);
      for (const t of tk) if (!g.tokens.includes(t)) g.tokens.push(t);
    } else {
      grupos.push({ intent: f.caso.intent, tokens: [...tk], casos: [f] });
    }
  }
  return grupos.sort((a, b) => b.casos.length - a.casos.length);
}

/**
 * Termos que mais distinguem o grupo: aparecem em mais de uma pergunta do grupo (ou na única, se for 1) e RARAMENTE em casos de outras
 * intenções do contrato (golden + reais). Termo que também aparece em outra intenção seria um falso positivo em potencial: fica de fora.
 */
export function termosDistintivos(grupo, todosOsCasos, maxTermos = 6) {
  const contagem = new Map();
  for (const f of grupo.casos) for (const t of new Set(tokens(f.caso.q))) contagem.set(t, (contagem.get(t) ?? 0) + 1);
  const emOutras = new Map();
  for (const c of todosOsCasos) {
    if (c.intent === grupo.intent) continue;
    for (const t of new Set(tokens(c.q))) emOutras.set(t, (emOutras.get(t) ?? 0) + 1);
  }
  return [...contagem.entries()]
    .map(([termo, n]) => ({ termo, n, outras: emOutras.get(termo) ?? 0 }))
    .filter((x) => x.outras === 0)
    .sort((a, b) => b.n - a.n || b.termo.length - a.termo.length)
    .slice(0, maxTermos);
}

const ENTIDADES = ['cargo', 'uf', 'partido', 'nome', 'tema', 'apenasDeferidas', 'historico', 'turno'];

/** Onde mexer, conforme o que falhou. */
export function dicaDoGrupo(grupo) {
  const entidades = new Set(grupo.casos.flatMap((f) => ENTIDADES.filter((k) => k in f.caso && f.caso[k] !== null)));
  if (entidades.size === 0) {
    return `Intenção **sem entidade** (${grupo.intent}): acrescentar palavras-chave ou um padrão à regra dessa intenção em \`nlu.js\` (\`RX_*\`/lista de gatilhos) e em \`LocalNlu.kt\`.`;
  }
  const lista = [...entidades].join(', ');
  return `Intenção com entidade (${lista}): confira primeiro o **gazetteer** (apelidos de UF, partidos, temas) e o reconhecimento da entidade; só depois a regra da intenção. Alias só para UF, partido ou candidato que EXISTE no pacote oficial.`;
}

export function relatorioMarkdown(grupos, { total, falhas, todos }) {
  const linhas = [];
  linhas.push('# Lacunas do NLU local');
  linhas.push('');
  linhas.push('> Gerado por `backend/retrain/lacunas.mjs` a partir de `contracts/nlu_real_cases.json`. **Sugere, não altera código.** Cada regra nova precisa entrar nos DOIS NLUs');
  linhas.push('> (`web/src/eleicoes2026/js/nlu.js` e `app/src/main/java/net/saibatudo/eleicoes2026/ai/nlu/LocalNlu.kt`); o contrato compartilhado verifica a paridade.');
  linhas.push('> Quando a regra passar, remova `"lacuna": true` do caso em `contracts/nlu_real_cases.json` (o teste cobra).');
  linhas.push('');
  linhas.push(`**${falhas} de ${total}** perguntas reais não são entendidas pelo NLU local, em **${grupos.length}** grupo(s).`);
  linhas.push('');
  grupos.forEach((g, i) => {
    linhas.push(`## ${i + 1}. ${g.intent} — ${g.casos.length} pergunta(s)`);
    linhas.push('');
    linhas.push(dicaDoGrupo(g));
    linhas.push('');
    const termos = termosDistintivos(g, todos);
    linhas.push(termos.length
      ? `Termos que distinguem o grupo e **não aparecem em outras intenções** do contrato: ${termos.map((t) => `\`${t.termo}\` (${t.n}x)`).join(', ')}.`
      : 'Nenhum termo isolado distingue o grupo sem colidir com outras intenções: a regra provavelmente precisa de um **padrão** (combinação de termos), não de uma palavra.');
    linhas.push('');
    for (const f of g.casos) {
      linhas.push(`- "${f.caso.q}" — ${f.falhas.join('; ')}`);
    }
    linhas.push('');
  });
  return linhas.join('\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const real = JSON.parse(readFileSync(resolve(REPO, 'contracts/nlu_real_cases.json'), 'utf8')).cases ?? [];
  const golden = JSON.parse(readFileSync(resolve(REPO, 'contracts/nlu_golden_cases.json'), 'utf8')).cases ?? [];
  const gaz = await carregarGazetteer();
  const falhas = avaliarCasos(real, gaz);
  const grupos = agrupar(falhas);
  const md = relatorioMarkdown(grupos, { total: real.length, falhas: falhas.length, todos: [...golden, ...real] });
  const saida = opt(argv, 'out');
  if (saida) writeFileSync(resolve(REPO, saida), md + '\n', 'utf8');
  const js = opt(argv, 'json');
  if (js) writeFileSync(resolve(REPO, js), JSON.stringify({ total: real.length, falhas: falhas.length, grupos: grupos.map((g) => ({ intent: g.intent, perguntas: g.casos.map((f) => f.caso.q), termos: termosDistintivos(g, [...golden, ...real]) })) }, null, 1) + '\n', 'utf8');
  console.log(falhas.length === 0 ? `Nenhuma lacuna em ${real.length} perguntas reais.` : md);
  process.exit(falhas.length === 0 ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
