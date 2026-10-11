// Guarda do CONGELAMENTO em torno do 2º turno (docs/OPERACAO.md).
//
// Entre 24/10 e 26/10/2026 (Brasília, inclusive) não se mexe no que decide o que o eleitor lê: modelo, NLU, respostas, API,
// pipeline, contratos e workflows. Dados (data/), documentação e testes de dados podem mudar. O objetivo não é burocracia: é não
// descobrir um bug de NLU na noite da apuração. Exceção consciente: `[congelamento-ok]` na mensagem do commit (ou da PR) ou a
// variável do repositório FREEZE_OVERRIDE=1, ambas visíveis no histórico.
//
// Uso (CI):  node tools/congelamento.mjs --base <sha-antes> --head <sha-depois>
// Código de saída: 0 = liberado; 1 = bloqueado pelo congelamento.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const INICIO = '2026-10-24';
export const FIM = '2026-10-26';

/** Caminhos que NÃO podem mudar durante o congelamento (prefixos ou arquivos exatos). */
export const PROTEGIDOS = [
  'backend/', 'ai_model/', 'api/_lib/', 'api/ask.js', 'api/nlu.js', 'api/report.js', 'api/health.js',
  'pipeline/', 'contracts/', '.github/workflows/', 'vercel.json',
  'web/src/eleicoes2026/js/', 'web/build.mjs',
  'app/src/main/java/', 'app/build.gradle.kts', 'gradle/libs.versions.toml',
];
/** Dentro de um caminho protegido, o que continua livre. */
export const LIBERADOS = ['data/', 'docs/', 'eval/', 'store/', 'README.md', 'SECURITY.md', 'web/test/', 'api/test/', 'app/src/test/'];

export const hojeBrasilia = (agora = Date.now()) => new Date(agora - 3 * 3600 * 1000).toISOString().slice(0, 10);
export const emCongelamento = (dia) => dia >= INICIO && dia <= FIM;

const comecaCom = (arq, lista) => lista.some((p) => arq === p || arq.startsWith(p));

/**
 * @param {{dia: string, arquivos: string[], mensagem?: string, override?: boolean}} o
 * @returns {{liberado: boolean, motivo: string, bloqueados: string[]}}
 */
export function avaliar({ dia, arquivos, mensagem = '', override = false }) {
  if (!emCongelamento(dia)) return { liberado: true, motivo: `fora do congelamento (${dia})`, bloqueados: [] };
  if (override || /\[congelamento-ok\]/i.test(mensagem)) return { liberado: true, motivo: 'exceção explícita ([congelamento-ok] ou FREEZE_OVERRIDE)', bloqueados: [] };
  const bloqueados = arquivos.filter((a) => comecaCom(a, PROTEGIDOS) && !comecaCom(a, LIBERADOS));
  return bloqueados.length
    ? { liberado: false, motivo: `congelamento do 2º turno (${INICIO} a ${FIM}): ${bloqueados.length} arquivo(s) protegido(s) alterado(s)`, bloqueados }
    : { liberado: true, motivo: 'só arquivos liberados', bloqueados: [] };
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = (nome, padrao = '') => {
    const i = process.argv.indexOf(nome);
    return i >= 0 ? process.argv[i + 1] : padrao;
  };
  const base = arg('--base');
  const head = arg('--head', 'HEAD');
  const vazio = /^0+$/.test(base);
  const intervalo = !base || vazio ? [`${head}~1`, head] : [base, head];
  let arquivos = [];
  let mensagem = '';
  try {
    arquivos = git(['diff', '--name-only', ...intervalo]).split('\n').filter(Boolean);
    mensagem = git(['log', '--format=%B', `${intervalo[0]}..${intervalo[1]}`]);
  } catch (e) {
    console.log(`::warning::não foi possível calcular o diff (${e.message}); guarda do congelamento ignorada`);
    process.exit(0);
  }
  const r = avaliar({ dia: arg('--dia', hojeBrasilia()), arquivos, mensagem, override: process.env.FREEZE_OVERRIDE === '1' });
  console.log(r.liberado ? `OK: ${r.motivo}` : `BLOQUEADO: ${r.motivo}`);
  for (const b of r.bloqueados) console.log(`  - ${b}`);
  if (!r.liberado) console.log('Se for uma correção realmente urgente, inclua [congelamento-ok] na mensagem do commit e explique o motivo.');
  process.exit(r.liberado ? 0 : 1);
}
