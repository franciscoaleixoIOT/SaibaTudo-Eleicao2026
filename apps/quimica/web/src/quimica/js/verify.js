// Verificação de integridade e autenticidade do pacote de dados (WebCrypto): SHA-256 dos arquivos e assinatura
// ECDSA P-256 / SHA-256 do manifesto. Equivalente a ManifestVerifier.kt. Funciona no navegador e no Node.

/** Chave pública X.509 SubjectPublicKeyInfo (Base64) — espelho de pipeline/data_signing_public.b64. */
export const CHAVE_PUBLICA_B64 =
  'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEWpXzEnAHUMIJTKlbYQrGAj4bMsz6MIc25fqfXKd7YQRMr11Rr7+pt7rBYhzIQMkEq/OVfJk1N+09rSup7hB31w==';

export const subtleDisponivel = () => typeof globalThis.crypto?.subtle?.digest === 'function';

export function base64ParaBytes(b64) {
  const limpo = String(b64).trim().replace(/\s+/g, '');
  const bin = atob(limpo);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256Hex(bytes) {
  const d = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  let s = '';
  for (let i = 0; i < d.length; i++) s += d[i].toString(16).padStart(2, '0');
  return s;
}

/**
 * Converte assinatura ECDSA em DER (SEQUENCE { INTEGER r, INTEGER s }) para o formato r‖s de 64 bytes (P-256)
 * exigido pela WebCrypto. Lança Error se o DER for inválido.
 */
export function derParaRaw(der) {
  let i = 0;
  const le = () => {
    let n = der[i++];
    if (n & 0x80) {
      const k = n & 0x7f;
      if (k < 1 || k > 2) throw new Error('DER inválido (comprimento)');
      n = 0;
      for (let j = 0; j < k; j++) n = (n << 8) | der[i++];
    }
    return n;
  };
  if (der[i++] !== 0x30) throw new Error('DER inválido (sequência)');
  const total = le();
  if (i + total !== der.length) throw new Error('DER inválido (tamanho)');
  const inteiro = () => {
    if (der[i++] !== 0x02) throw new Error('DER inválido (inteiro)');
    const n = le();
    let v = der.slice(i, i + n);
    i += n;
    while (v.length > 0 && v[0] === 0) v = v.slice(1); // remove o byte de sinal
    if (v.length > 32) throw new Error('DER inválido (inteiro grande)');
    const out = new Uint8Array(32);
    out.set(v, 32 - v.length);
    return out;
  };
  const r = inteiro();
  const s = inteiro();
  const raw = new Uint8Array(64);
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
}

let chaveCache = null;
async function importarChave(spkiB64) {
  if (chaveCache && chaveCache.b64 === spkiB64) return chaveCache.key;
  const key = await globalThis.crypto.subtle.importKey(
    'spki', base64ParaBytes(spkiB64), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']
  );
  chaveCache = { b64: spkiB64, key };
  return key;
}

/**
 * Verifica a assinatura do manifesto. Retorna true SOMENTE se a assinatura for válida; qualquer erro => false
 * (nunca lança). Sem WebCrypto (contexto inseguro) => false, e o chamador decide como sinalizar.
 * @param {Uint8Array} manifestBytes bytes exatos de manifest.json
 * @param {string} assinaturaB64 conteúdo de manifest.sig (DER em Base64)
 */
export async function verificarManifesto(manifestBytes, assinaturaB64, chavePublicaB64 = CHAVE_PUBLICA_B64) {
  try {
    if (!subtleDisponivel() || !chavePublicaB64 || !chavePublicaB64.trim()) return false;
    const key = await importarChave(chavePublicaB64.trim());
    const raw = derParaRaw(base64ParaBytes(assinaturaB64));
    return await globalThis.crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, raw, manifestBytes);
  } catch {
    return false;
  }
}
