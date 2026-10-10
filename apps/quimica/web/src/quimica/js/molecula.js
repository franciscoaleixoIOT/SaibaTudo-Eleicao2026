// Estrutura 2D com SmilesDrawer (vendorizado) em <canvas>: o desenhador SVG da biblioteca usa estilos inline, que a CSP bloqueia.
import { h } from './dom.js';
import { temaEfetivo } from './prefs.js';
import { carregarSmiles } from './vendor.js';

const TEMAS = {
  light: { C: '#1F2937', O: '#DC2626', N: '#2563EB', F: '#15803D', CL: '#0F766E', BR: '#B45309', I: '#7C3AED', P: '#C2410C', S: '#A16207', B: '#C2410C', SI: '#C2410C', H: '#4B5563', BACKGROUND: 'transparent' },
  dark: { C: '#F1F5F9', O: '#F87171', N: '#60A5FA', F: '#4ADE80', CL: '#2DD4BF', BR: '#FBBF24', I: '#C4B5FD', P: '#FB923C', S: '#FACC15', B: '#FB923C', SI: '#FB923C', H: '#CBD5E1', BACKGROUND: 'transparent' }
};

/** Canvas com a estrutura 2D do SMILES; mostra mensagem se a biblioteca ou o SMILES falharem. */
export function moleculaEl(smiles, nome, { largura = 420, altura = 300 } = {}) {
  const canvas = h('canvas', { class: 'molecula', width: largura, height: altura, role: 'img', 'aria-label': `Estrutura 2D de ${nome}` });
  const caixa = h('div', { class: 'molecula-caixa' }, canvas);
  const erro = (msg) => { caixa.replaceChildren(h('p', { class: 'msg-molecula', role: 'status' }, msg)); };
  carregarSmiles().then((SD) => {
    const tema = temaEfetivo();
    const drawer = new SD.Drawer({ width: largura, height: altura, padding: 14, bondThickness: 1.4, fontSizeLarge: 11, fontSizeSmall: 7, compactDrawing: false, themes: TEMAS });
    SD.parse(String(smiles), (arvore) => {
      try { drawer.draw(arvore, canvas, tema, false); } catch { erro('Não foi possível desenhar esta estrutura.'); }
    }, () => erro('Não foi possível interpretar o SMILES desta estrutura.'));
  }).catch(() => erro('A biblioteca de desenho não está disponível agora (sem conexão?). O SMILES continua listado na ficha.'));
  return caixa;
}
