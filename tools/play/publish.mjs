#!/usr/bin/env node
// Publica o app na Google Play pela API oficial (Google Play Developer API v3, biblioteca oficial do Google).
//
//   node tools/play/publish.mjs --check                      # autentica e lista as trilhas (não altera nada)
//   node tools/play/publish.mjs --track internal             # envia o .aab de release para o teste interno
//   node tools/play/publish.mjs --track production --status draft --notes "Correções e Ficha Limpa"
//
// Opções: --aab <arquivo> (padrão app/build/outputs/bundle/release/app-release.aab) · --track internal|alpha|beta|production
//         --status completed|draft|inProgress (padrão completed) · --rollout 0.1 (com inProgress) · --notes "texto pt-BR"
//         --name "nome da versão" · --key <chave.json> (padrão secrets/play-service-account.json ou GOOGLE_APPLICATION_CREDENTIALS)
//         --package <id> (padrão net.saibatudo.eleicoes2026) · --validate (valida sem publicar)
//
// Autenticação: chave JSON de uma CONTA DE SERVIÇO do Google Cloud com a "Google Play Android Developer API" ativada e
// convidada na Play Console (Usuários e permissões). A chave fica em secrets/ (fora do Git). Limitação do Google: o app
// precisa existir na Play Console e o PRIMEIRO .aab deve ser enviado manualmente pelo navegador.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { androidpublisher, auth } from '@googleapis/androidpublisher';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (nome, padrao) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : padrao;
};
const flag = (nome) => args.includes(`--${nome}`);

const pacote = opt('package', 'net.saibatudo.eleicoes2026');
const chave = resolve(RAIZ, opt('key', process.env.GOOGLE_APPLICATION_CREDENTIALS || 'secrets/play-service-account.json'));
const trilha = opt('track', 'internal');
const status = opt('status', 'completed');
const aab = resolve(RAIZ, opt('aab', 'app/build/outputs/bundle/release/app-release.aab'));

function sair(msg) {
  console.error(`ERRO: ${msg}`);
  process.exit(1);
}

if (!existsSync(chave)) {
  sair(`chave da conta de serviço não encontrada: ${chave}\n` +
    '  Crie a conta de serviço e salve a chave JSON em secrets/play-service-account.json (veja docs/PLAY_STORE.md §8).');
}
if (!['internal', 'alpha', 'beta', 'production'].includes(trilha)) sair(`trilha inválida: ${trilha}`);
if (!['completed', 'draft', 'inProgress', 'halted'].includes(status)) sair(`status inválido: ${status}`);

const cliente = new auth.GoogleAuth({ keyFile: chave, scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
const ap = androidpublisher({ version: 'v3', auth: cliente });

function explicar(e) {
  const msg = e?.errors?.[0]?.message || e?.response?.data?.error?.message || e?.message || String(e);
  const dicas = [];
  if (/not found|Package not found/i.test(msg)) dicas.push('o app ainda não existe na Play Console, ou o primeiro .aab ainda não foi enviado manualmente');
  if (/permission|caller does not have|insufficient/i.test(msg)) dicas.push('convide o e-mail da conta de serviço em Play Console › Usuários e permissões, com acesso a este app');
  if (/has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) dicas.push('ative a "Google Play Android Developer API" no projeto do Google Cloud da conta de serviço');
  if (/draft app|Only releases with status draft/i.test(msg)) dicas.push('o app ainda não foi publicado: use --status draft e conclua o envio na Play Console');
  if (/version code.*already been used|versionCode/i.test(msg)) dicas.push('aumente versionCode em app/build.gradle.kts e gere o bundle de novo');
  return `${msg}${dicas.length ? '\n  Dica: ' + dicas.join('; ') : ''}`;
}

const conta = JSON.parse((await import('node:fs')).readFileSync(chave, 'utf8')).client_email;
console.log(`Conta de serviço: ${conta}\nApp: ${pacote}`);

let editId;
try {
  ({ data: { id: editId } } = await ap.edits.insert({ packageName: pacote }));
  if (flag('check')) {
    const { data } = await ap.edits.tracks.list({ packageName: pacote, editId });
    console.log('Autenticação OK. Trilhas:');
    for (const t of data.tracks ?? []) {
      const r = (t.releases ?? []).map((x) => `${x.name ?? '?'} [${x.status}] versionCodes=${(x.versionCodes ?? []).join(',')}`).join(' | ');
      console.log(`  - ${t.track}: ${r || '(sem versões)'}`);
    }
    await ap.edits.delete({ packageName: pacote, editId });
    process.exit(0);
  }

  if (!existsSync(aab)) sair(`bundle não encontrado: ${aab}\n  Gere com: ./gradlew bundleRelease`);
  console.log(`Enviando ${aab} (${(statSync(aab).size / 1e6).toFixed(1)} MB)…`);
  const { data: bundle } = await ap.edits.bundles.upload({
    packageName: pacote, editId,
    media: { mimeType: 'application/octet-stream', body: createReadStream(aab) }
  });
  console.log(`Bundle aceito: versionCode ${bundle.versionCode}`);

  const notas = opt('notes');
  const versao = {
    name: opt('name', String(bundle.versionCode)),
    versionCodes: [String(bundle.versionCode)],
    status,
    ...(status === 'inProgress' ? { userFraction: Number(opt('rollout', '0.1')) } : {}),
    ...(notas ? { releaseNotes: [{ language: 'pt-BR', text: notas }] } : {})
  };
  await ap.edits.tracks.update({ packageName: pacote, editId, track: trilha, requestBody: { track: trilha, releases: [versao] } });

  if (flag('validate')) {
    await ap.edits.validate({ packageName: pacote, editId });
    await ap.edits.delete({ packageName: pacote, editId });
    console.log(`Validação OK (nada foi publicado): trilha ${trilha}, status ${status}.`);
  } else {
    await ap.edits.commit({ packageName: pacote, editId });
    console.log(`Publicado: trilha ${trilha}, status ${status}, versionCode ${bundle.versionCode}.`);
  }
} catch (e) {
  if (editId) await ap.edits.delete({ packageName: pacote, editId }).catch(() => {});
  sair(explicar(e));
}
