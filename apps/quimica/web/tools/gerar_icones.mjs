#!/usr/bin/env node
// Gera a marca do SaibaTudo Química a partir de UMA descrição geométrica (sem dependências): brand/quimica-icon.svg e os PNGs
// em brand/png/ (ícones do PWA "any" e "maskable", apple-touch 180, favicons 32/48 e imagem social 1200).
// O PNG é rasterizado aqui mesmo (preenchimento de polígonos com 4×4 amostras por pixel) e codificado com zlib.
//
//   node web/tools/gerar_icones.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BRAND = join(RAIZ, 'brand');
const PNG = join(BRAND, 'png');
mkdirSync(PNG, { recursive: true });

// ---- geometria (coordenadas de projeto 0..108, centro em 54,54; mesma escala do ícone das Eleições: translate(256 256) scale(5.5) translate(-54 -54))
const COR = { navy: '#0C2340', navy2: '#143A66', branco: '#FFFFFF', verde: '#22C55E', ouro: '#FFB81C' };
const FRASCO = [[44, 26], [64, 26], [64, 44], [79, 70], [76, 79], [32, 79], [29, 70], [44, 44]];
const BORDA = [[41, 21], [67, 21], [67, 27], [41, 27]];
const LIQUIDO = [[35.9, 58], [72.1, 58], [79, 70], [76, 79], [32, 79], [29, 70]];
const BOLHAS = [[48, 68, 3.4], [58, 64, 2.4], [63.5, 72, 3]];
const FUNDO_DIAGONAL = [[0, 372], [512, 196], [512, 512], [0, 512]]; // em coordenadas de 512

const pts = (l) => l.map((p) => p.join(',')).join(' ');
const transf = (esc) => `translate(256 256) scale(${esc}) translate(-54 -54)`;

function svg(esc = 5.5) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-labelledby="t d"><title id="t">SaibaTudo Química</title><desc id="d">Ícone do app: frasco de laboratório com líquido verde e bolhas douradas</desc><clipPath id="b"><rect width="512" height="512" rx="112"/></clipPath>
<g clip-path="url(#b)"><rect width="512" height="512" fill="${COR.navy}"/>
<polygon points="${pts(FUNDO_DIAGONAL)}" fill="${COR.navy2}"/><g transform="${transf(esc)}">
<polygon fill="${COR.branco}" points="${pts(FRASCO)}"/>
<polygon fill="${COR.branco}" points="${pts(BORDA)}"/>
<polygon fill="${COR.verde}" points="${pts(LIQUIDO)}"/>
${BOLHAS.map(([x, y, r]) => `<circle fill="${COR.ouro}" cx="${x}" cy="${y}" r="${r}"/>`).join('\n')}</g></g></svg>
`;
}
writeFileSync(join(BRAND, 'quimica-icon.svg'), svg());

// ---- rasterização
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function dentroPoligono(x, y, poly) {
  let d = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
}
const dentroRetanguloArredondado = (x, y, w, h, r) => {
  if (x < 0 || y < 0 || x > w || y > h) return false;
  const cx = x < r ? r : x > w - r ? w - r : x;
  const cy = y < r ? r : y > h - r ? h - r : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

/** @param {number} tam lado em pixels @param {{arredondado: boolean, escala: number}} o */
function rasterizar(tam, { arredondado = true, escala = 5.5 } = {}) {
  const k = tam / 512;
  const A = 4;
  const pixels = Buffer.alloc(tam * tam * 4);
  const para512 = (p) => [256 + escala * (p[0] - 54), 256 + escala * (p[1] - 54)];
  const frasco = FRASCO.map(para512); const borda = BORDA.map(para512); const liquido = LIQUIDO.map(para512);
  const bolhas = BOLHAS.map(([x, y, r]) => [...para512([x, y]), r * escala]);
  const cores = { navy: hex(COR.navy), navy2: hex(COR.navy2), branco: hex(COR.branco), verde: hex(COR.verde), ouro: hex(COR.ouro) };
  for (let py = 0; py < tam; py++) {
    for (let px = 0; px < tam; px++) {
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (let sy = 0; sy < A; sy++) {
        for (let sx = 0; sx < A; sx++) {
          const x = (px + (sx + 0.5) / A) / k; const y = (py + (sy + 0.5) / A) / k; // coordenadas de 512
          if (arredondado && !dentroRetanguloArredondado(x, y, 512, 512, 112)) continue;
          let c = cores.navy;
          if (dentroPoligono(x, y, FUNDO_DIAGONAL)) c = cores.navy2;
          if (dentroPoligono(x, y, frasco) || dentroPoligono(x, y, borda)) c = cores.branco;
          if (dentroPoligono(x, y, liquido)) c = cores.verde;
          for (const [bx, by, br] of bolhas) if ((x - bx) ** 2 + (y - by) ** 2 <= br * br) c = cores.ouro;
          r += c[0]; g += c[1]; b += c[2]; a += 255;
        }
      }
      const n = A * A;
      const i = (py * tam + px) * 4;
      const cobertura = a / (255 * n);
      pixels[i] = cobertura ? Math.round(r / (cobertura * n)) : 0;
      pixels[i + 1] = cobertura ? Math.round(g / (cobertura * n)) : 0;
      pixels[i + 2] = cobertura ? Math.round(b / (cobertura * n)) : 0;
      pixels[i + 3] = Math.round(a / n);
    }
  }
  return pixels;
}

// ---- codificação PNG (RGBA 8 bits)
const TABELA_CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(tipo, dados) {
  const t = Buffer.from(tipo, 'latin1');
  const len = Buffer.alloc(4); len.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, dados])));
  return Buffer.concat([len, t, dados, crc]);
}
function png(tam, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tam, 0); ihdr.writeUInt32BE(tam, 4); ihdr[8] = 8; ihdr[9] = 6; // RGBA
  const linhas = Buffer.alloc(tam * (tam * 4 + 1));
  for (let y = 0; y < tam; y++) { linhas[y * (tam * 4 + 1)] = 0; pixels.copy(linhas, y * (tam * 4 + 1) + 1, y * tam * 4, (y + 1) * tam * 4); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(linhas, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const SAIDAS = [
  ['pwa-quimica-192.png', 192, { arredondado: true }], ['pwa-quimica-512.png', 512, { arredondado: true }],
  ['pwa-quimica-maskable-192.png', 192, { arredondado: false, escala: 4.3 }], ['pwa-quimica-maskable-512.png', 512, { arredondado: false, escala: 4.3 }],
  ['apple-touch-icon-180.png', 180, { arredondado: false, escala: 5 }], ['favicon-32.png', 32, { arredondado: true }], ['favicon-48.png', 48, { arredondado: true }],
  ['og-quimica-1200.png', 1200, { arredondado: false, escala: 5 }], ['play-icon-512.png', 512, { arredondado: false, escala: 5 }]
];
for (const [nome, tam, op] of SAIDAS) {
  writeFileSync(join(PNG, nome), png(tam, rasterizar(tam, op)));
  console.log(`✔ brand/png/${nome} (${tam}×${tam})`);
}
console.log('✔ brand/quimica-icon.svg');
