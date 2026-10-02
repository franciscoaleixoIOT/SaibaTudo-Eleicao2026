// Formato das respostas da IA (porte da lógica de TextoResposta.kt). Só FORMATA, nunca altera o conteúdo:
// 1ª linha = título; linhas "• " = itens de lista; "Rótulo: valor" = campo (rótulo em negrito); URLs viram links.
// Sem dependência de DOM (testável no Node); a interface monta os elementos em ui/components.js (textoResposta).

const RX_CAMPO = /^([^:•]{2,40}): (.+)$/;
const RX_URL = /https?:\/\/[^\s)]+/g;

/** Divide uma linha em trechos de texto e links (pontuação final não faz parte da URL). */
export function partesComLinks(s) {
  const out = [];
  let inicio = 0;
  for (const m of s.matchAll(RX_URL)) {
    const url = m[0].replace(/[.,;:]+$/, '');
    if (m.index > inicio) out.push({ texto: s.slice(inicio, m.index) });
    out.push({ url });
    inicio = m.index + url.length;
  }
  if (inicio < s.length) out.push({ texto: s.slice(inicio) });
  return out;
}

/**
 * Linhas da resposta, já classificadas:
 *  - tipo 'item'   : começa com "• " (o marcador é removido);
 *  - tipo 'titulo' : 1ª linha (quando não é item);
 *  - tipo 'campo'  : "Rótulo: valor" com rótulo de 2 a 40 caracteres, até 6 palavras e sem "http";
 *  - tipo 'texto'  : demais linhas.
 * Linhas em branco são descartadas.
 * @returns {{tipo:'item'|'titulo'|'campo'|'texto', rotulo:string|null, partes:({texto:string}|{url:string})[]}[]}
 */
export function linhasResposta(texto) {
  const linhas = String(texto ?? '').split('\n').filter((l) => l.trim() !== '');
  return linhas.map((linha, i) => {
    if (linha.startsWith('• ')) return { tipo: 'item', rotulo: null, partes: partesComLinks(linha.slice(2)) };
    if (i === 0) return { tipo: 'titulo', rotulo: null, partes: partesComLinks(linha) };
    const m = RX_CAMPO.exec(linha);
    if (m && !m[1].includes('http') && m[1].trim().split(' ').length <= 6) {
      return { tipo: 'campo', rotulo: m[1], partes: partesComLinks(m[2]) };
    }
    return { tipo: 'texto', rotulo: null, partes: partesComLinks(linha) };
  });
}
