import { writeFileSync, mkdirSync } from 'node:fs';
const [,, destino] = process.argv;
mkdirSync(destino, { recursive: true });
const estrela = (cx, cy, pontas, re, ri, rot = -90) => Array.from({ length: pontas * 2 }, (_, i) => {
  const r = i % 2 === 0 ? re : ri; const a = (rot + (180 / pontas) * i) * Math.PI / 180;
  return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
}).join(' ');
const chama = (t = '') => `<path ${t} d="M50 22C52 33 63 39 63 54C63 66 57 74 50 74C43 74 37 67 37 57C37 49 41 45 44 40C45 46 48 48 50 46C52 40 50 31 50 22Z"/>`;
const SIMBOLOS = {
  GHS01: ['Explosivo', 'bomba explodindo', `<circle cx="42" cy="63" r="14"/><path d="M51 53L59 45" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round"/><polygon points="${estrela(65, 38, 8, 13, 5)}"/>`],
  GHS02: ['Inflamável', 'chama', chama()],
  GHS03: ['Comburente', 'chama sobre um círculo', `${chama('transform="translate(50 23) scale(.62) translate(-50 -22)"')}<circle cx="50" cy="65" r="11" fill="none" stroke="#000" stroke-width="5"/><path d="M33 79H67" stroke="#000" stroke-width="5" stroke-linecap="round"/>`],
  GHS04: ['Gás sob pressão', 'cilindro de gás', `<rect x="38" y="37" width="24" height="38" rx="11"/><rect x="45" y="29" width="10" height="11"/><rect x="41" y="24" width="18" height="6" rx="2"/>`],
  GHS05: ['Corrosivo', 'tubos de ensaio gotejando sobre uma mão e uma superfície', `<g transform="rotate(35 36 32)"><rect x="29" y="22" width="12" height="22" rx="4"/></g><g transform="rotate(-35 62 32)"><rect x="56" y="22" width="12" height="22" rx="4"/></g><path d="M39 49q-3 5 0 8q3-3 0-8zM61 49q-3 5 0 8q3-3 0-8z"/><path d="M24 76H76V70H24Z"/><path d="M28 68V62H33V68M35 68V58H40V68M42 68V56H47V68M49 68V59H54V68"/><path d="M58 68V64H74V68Z"/>`],
  GHS06: ['Toxicidade aguda (tóxico ou fatal)', 'caveira com ossos cruzados', `<path d="M30 56L70 78M70 56L30 78" stroke="#000" stroke-width="6" stroke-linecap="round"/><circle cx="50" cy="42" r="15"/><rect x="43" y="52" width="14" height="10" rx="2"/><circle cx="44.5" cy="42" r="4.2" fill="#fff"/><circle cx="55.5" cy="42" r="4.2" fill="#fff"/><path d="M50 47L47.5 52H52.5Z" fill="#fff"/>`],
  GHS07: ['Nocivo, irritante ou sensibilizante', 'ponto de exclamação', `<rect x="44.5" y="25" width="11" height="31" rx="4"/><circle cx="50" cy="67" r="6.5"/>`],
  GHS08: ['Perigo grave à saúde', 'busto humano com uma estrela no peito', `<circle cx="50" cy="30" r="8.5"/><path d="M31 75V54Q31 43 42 42H58Q69 43 69 54V75Z"/><polygon fill="#fff" points="${estrela(50, 58, 5, 10, 4.2)}"/>`],
  GHS09: ['Perigoso para o meio ambiente aquático', 'árvore seca e peixe', `<path d="M31 72V48M31 58L23 48M31 52L39 42M31 64L38 58" fill="none" stroke="#000" stroke-width="4.5" stroke-linecap="round"/><ellipse cx="60" cy="63" rx="12.5" ry="7.5"/><path d="M71 63L81 55V71Z"/><circle cx="54" cy="61" r="1.8" fill="#fff"/><path d="M22 77H78" stroke="#000" stroke-width="4" stroke-linecap="round"/>`]
};
for (const [id, [nome, desc, corpo]] of Object.entries(SIMBOLOS)) {
  writeFileSync(`${destino}/${id.toLowerCase()}.svg`,
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" role="img" aria-labelledby="t d"><title id="t">${id} — ${nome}</title><desc id="d">Pictograma GHS simplificado: ${desc}</desc><polygon points="50,3 97,50 50,97 3,50" fill="#fff" stroke="#D0021B" stroke-width="7" stroke-linejoin="miter"/><g fill="#000">${corpo}</g></svg>\n`);
}
console.log('ok', Object.keys(SIMBOLOS).length);
