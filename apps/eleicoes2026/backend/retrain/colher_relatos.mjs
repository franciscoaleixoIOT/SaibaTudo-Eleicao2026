#!/usr/bin/env node
// Coleta as perguntas dos relatos de usuários (issues públicas com o rótulo `relato-ia`, criadas por
// POST /api/report) e as converte em candidatos a exemplo de treino para backend/retrain/label_extra.mjs.
//
// Por que esta é a melhor fonte externa: são perguntas REAIS que o app/site NÃO entenderam — exatamente
// as que o modelo de nuvem deveria passar a entender. O repositório é público e o conteúdo já foi
// sanitizado pelo proxy (api/_lib/sanitize.js: dados pessoais mascarados, menções neutralizadas).
//
// ATENÇÃO (LGPD / finalidade): docs/PRIVACIDADE.md declara hoje que os relatos ficam públicos "para
// transparência das correções". Usá-los também para melhorar o NLU é uma FINALIDADE NOVA: atualize a
// política (e o texto do diálogo de relato no app e no site) antes de usar isto em produção. Por isso o
// script exige --confirmar-finalidade.
//
// Uso:
//   node backend/retrain/colher_relatos.mjs --confirmar-finalidade \
//        [--repo franciscoaleixoIOT/SaibaTudo-Eleicao2026] [--out backend/retrain/extra/relatos.jsonl]
//
// Saída: JSONL { q, fonte, licenca, coletadoEm } — o rótulo é definido depois, pelo label_extra.mjs
// (nunca pelo relato: a intenção que o usuário viu é justamente a que falhou).

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chaveQ } from './label_extra.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(AQUI, '../..');
export const ROTULO = 'relato-ia';
export const LICENCA = 'primeira parte: relato enviado pelo usuário no app/site (público no repositório)';

export const opt = (argv, nome, padrao = null) => {
  const i = argv.indexOf(`--${nome}`);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : padrao;
};

/** Extrai o conteúdo do bloco de código da seção "### <título>" (cerca de 3+ crases, como codeFence). */
export function secaoEmBloco(corpo, titulo) {
  const linhas = String(corpo ?? '').split('\n');
  const i = linhas.findIndex((l) => l.trim() === `### ${titulo}`);
  if (i < 0) return null;
  let abertura = -1;
  let cerca = '';
  for (let j = i + 1; j < linhas.length; j++) {
    const m = linhas[j].match(/^(`{3,})(\w*)\s*$/);
    if (m) { abertura = j; cerca = m[1]; break; }
    if (linhas[j].startsWith('### ')) return null;
  }
  if (abertura < 0) return null;
  const fim = linhas.findIndex((l, j) => j > abertura && l.trim() === cerca);
  if (fim < 0) return null;
  return linhas.slice(abertura + 1, fim).join('\n').trim();
}

/** Converte uma issue em candidato a exemplo (null se não vier pergunta aproveitável). */
export function perguntaDaIssue(issue) {
  const q = secaoEmBloco(issue.body, 'Pergunta');
  if (!q) return null;
  // O proxy já mascarou dados pessoais; se a marca aparecer, o texto não serve para treino.
  if (/\[(e-mail|documento|telefone|número) removido\]/.test(q)) return null;
  const data = String(issue.created_at ?? '').slice(0, 10);
  return {
    q,
    fonte: `relato-ia#${issue.number}`,
    licenca: LICENCA,
    ...(data ? { coletadoEm: data } : {}),
  };
}

/** Busca as issues rotuladas (API pública; pagina até o fim). */
export async function buscarRelatos(repo, { fetchFn = fetch, maxPaginas = 20 } = {}) {
  const itens = [];
  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const url = `https://api.github.com/repos/${repo}/issues?labels=${ROTULO}&state=all&per_page=100&page=${pagina}`;
    const r = await fetchFn(url, {
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-02', 'User-Agent': 'saibatudo-retrain' },
    });
    if (!r.ok) throw new Error(`GitHub API ${r.status} em ${url}`);
    const lote = await r.json();
    if (!Array.isArray(lote) || lote.length === 0) break;
    // A API de /issues também devolve pull requests: só interessam issues.
    itens.push(...lote.filter((i) => !i.pull_request));
    if (lote.length < 100) break;
  }
  return itens;
}

/** Deduplica por pergunta normalizada (mesma chave do rotulador e do gerador), preservando a ordem. */
export function deduplicar(candidatos) {
  const vistas = new Set();
  const unicas = [];
  for (const c of candidatos) {
    const k = chaveQ(c.q);
    if (!k || vistas.has(k)) continue;
    vistas.add(k);
    unicas.push(c);
  }
  return unicas;
}

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.includes('--confirmar-finalidade')) {
    console.error(
      'Recusado: usar relatos de usuários para treinar o NLU é uma finalidade nova.\n' +
      '  1) Atualize docs/PRIVACIDADE.md (e a página web/src/privacidade, que o build confere) declarando\n' +
      '     que a pergunta relatada pode ser usada para melhorar a interpretação das perguntas;\n' +
      '  2) atualize o texto do diálogo "Relatar problema" no app e no site;\n' +
      '  3) rode de novo com --confirmar-finalidade.'
    );
    process.exit(2);
  }
  const repo = opt(argv, 'repo', 'franciscoaleixoIOT/SaibaTudo-Eleicao2026');
  const caminhoOut = resolve(REPO, opt(argv, 'out', 'backend/retrain/extra/relatos.jsonl'));

  const issues = await buscarRelatos(repo);
  const unicas = deduplicar(issues.map(perguntaDaIssue).filter(Boolean));
  mkdirSync(dirname(caminhoOut), { recursive: true });
  writeFileSync(caminhoOut, unicas.map((c) => JSON.stringify(c)).join('\n') + (unicas.length ? '\n' : ''), 'utf8');
  console.log(JSON.stringify({ repo, issues: issues.length, perguntas: unicas.length, saida: caminhoOut }, null, 1));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
