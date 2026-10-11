// Instalação do PWA: `beforeinstallprompt` quando disponível; instruções para iPhone/iPad e demais navegadores.
let evento = null;
const ouvintes = new Set();

export function iniciarInstalacao() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    evento = e;
    ouvintes.forEach((f) => f());
  });
  window.addEventListener('appinstalled', () => {
    evento = null;
    ouvintes.forEach((f) => f());
  });
}

export const aoMudarInstalacao = (f) => { ouvintes.add(f); return () => ouvintes.delete(f); };

export const jaInstalado = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

export const ehIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const podeInstalarAgora = () => evento != null && !jaInstalado();

/** Abre o diálogo nativo de instalação. Retorna 'accepted' | 'dismissed' | null (sem suporte). */
export async function instalar() {
  if (!evento) return null;
  const e = evento;
  evento = null;
  ouvintes.forEach((f) => f());
  await e.prompt();
  try { return (await e.userChoice).outcome; } catch { return null; }
}

/** Passo a passo por plataforma, para quando não há prompt automático. */
export function instrucoes() {
  if (ehIos()) {
    return {
      titulo: 'Instalar no iPhone ou iPad',
      passos: ['Abra esta página no Safari.', 'Toque em Compartilhar (o quadrado com a seta para cima).', 'Escolha "Adicionar à Tela de Início" e confirme em "Adicionar".']
    };
  }
  return {
    titulo: 'Instalar o aplicativo',
    passos: [
      'No Chrome ou Edge (Windows, Mac, Linux, Android), use o botão "Instalar app" desta página ou o ícone de instalar na barra de endereço.',
      'No menu do navegador, escolha "Instalar SaibaTudo Química" (ou "Adicionar à tela inicial").',
      'Depois de instalado, o app abre em janela própria e funciona também sem internet (com os dados já carregados).'
    ]
  };
}
