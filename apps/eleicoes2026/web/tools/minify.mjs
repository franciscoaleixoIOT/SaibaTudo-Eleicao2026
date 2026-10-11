// Minificador conservador de JS e CSS (sem dependências), usado por build.mjs para reduzir o tamanho do bundle.
// JS: remove comentários, indentação e espaços desnecessários; PRESERVA quebras de linha que importam para a inserção
// automática de ponto e vírgula (ASI), strings, templates e literais de regex. Não renomeia variáveis.
// CSS: remove comentários e espaços ao redor de { } ; , >.
// A correção é verificada em web/test/build.test.mjs (os módulos minificados passam nos casos de referência do NLU).

const KEYWORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'instanceof', 'new', 'void', 'delete', 'throw', 'yield', 'await', 'of']);
const isId = (c) => /[A-Za-z0-9_$]/.test(c) || c > '\x7f';

export function minifyJs(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let ws = 0; // 0 nenhum · 1 espaço · 2 quebra de linha
  let prevSig = '';
  let prevWord = '';

  const skipString = (k) => {
    const q = src[k];
    k++;
    while (k < n && src[k] !== q) { if (src[k] === '\\') k++; k++; }
    return k + 1;
  };
  const skipTemplate = (k) => {
    k++; // `
    while (k < n && src[k] !== '`') {
      if (src[k] === '\\') { k += 2; continue; }
      if (src[k] === '$' && src[k + 1] === '{') {
        k += 2;
        let prof = 1;
        while (k < n && prof > 0) {
          const c = src[k];
          if (c === '"' || c === "'") { k = skipString(k); continue; }
          if (c === '`') { k = skipTemplate(k); continue; }
          if (c === '{') prof++;
          else if (c === '}') prof--;
          k++;
        }
        continue;
      }
      k++;
    }
    return k + 1;
  };
  const regexPermitido = () => {
    if (!out) return true;
    if (isId(prevSig)) return KEYWORDS.has(prevWord);
    return ![')', ']', '}', '"', 'v'].includes(prevSig);
  };
  const skipRegex = (k) => {
    k++;
    let classe = false;
    while (k < n) {
      const c = src[k];
      if (c === '\\') { k += 2; continue; }
      if (c === '[') classe = true;
      else if (c === ']') classe = false;
      else if (c === '/' && !classe) { k++; break; }
      k++;
    }
    while (k < n && /[a-z]/.test(src[k])) k++; // flags
    return k;
  };
  const emitir = (tok) => {
    if (ws && out) {
      const a = out[out.length - 1];
      const b = tok[0];
      if (ws === 2) {
        if (!'{([,;'.includes(a) && !'})],;.?:'.includes(b)) out += '\n';
      } else if ((isId(a) && isId(b)) || (a === '+' && b === '+') || (a === '-' && b === '-') || (a === '/' && b === '/')) {
        out += ' ';
      }
    }
    out += tok;
    ws = 0;
  };

  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { ws = Math.max(ws, c === '\n' ? 2 : 1); i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const fim = src.indexOf('*/', i + 2);
      if (fim < 0) throw new Error('comentário de bloco sem fim');
      ws = Math.max(ws, src.slice(i, fim).includes('\n') ? 2 : 1);
      i = fim + 2;
      continue;
    }
    if (c === '"' || c === "'") { const j = skipString(i); emitir(src.slice(i, j)); prevSig = '"'; prevWord = ''; i = j; continue; }
    if (c === '`') { const j = skipTemplate(i); emitir(src.slice(i, j)); prevSig = '"'; prevWord = ''; i = j; continue; }
    if (c === '/') {
      if (regexPermitido()) { const j = skipRegex(i); emitir(src.slice(i, j)); prevSig = 'v'; prevWord = ''; i = j; continue; }
      emitir('/'); prevSig = '/'; prevWord = ''; i++; continue;
    }
    if (isId(c)) {
      let j = i;
      while (j < n && isId(src[j])) j++;
      const palavra = src.slice(i, j);
      emitir(palavra);
      prevSig = palavra[palavra.length - 1];
      prevWord = palavra;
      i = j;
      continue;
    }
    emitir(c);
    prevSig = c;
    prevWord = '';
    i++;
  }
  return out + '\n';
}

export function minifyCss(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let espaco = false;
  const soltos = '{};,>';
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') { const fim = src.indexOf('*/', i + 2); i = fim < 0 ? n : fim + 2; espaco = true; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++; }
      if (espaco && out && !soltos.includes(out[out.length - 1])) out += ' ';
      espaco = false;
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (/\s/.test(c)) { espaco = true; i++; continue; }
    if (espaco && out && !soltos.includes(out[out.length - 1]) && !soltos.includes(c)) out += ' ';
    espaco = false;
    if (c === '}' && out.endsWith(';')) out = out.slice(0, -1);
    out += c;
    i++;
  }
  return out + '\n';
}
