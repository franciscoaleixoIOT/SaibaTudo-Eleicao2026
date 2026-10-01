// Ponto de entrada do PWA /eleicoes2026/.
import { iniciarApp, toast } from './app.js';

/** Service worker: somente em HTTPS (produção) ou localhost. */
function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const seguro = location.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (!seguro) return;
  // só avisa quando o controlador anterior era o service worker do próprio app (não o do portal "/")
  let anterior = navigator.serviceWorker.controller?.scriptURL ?? '';
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (anterior.endsWith('/eleicoes2026/sw.js')) toast('Nova versão do app instalada. Feche e reabra (ou recarregue) para usá-la.');
    anterior = navigator.serviceWorker.controller?.scriptURL ?? '';
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/eleicoes2026/sw.js', { scope: '/eleicoes2026/' }).catch(() => { /* sem offline; o app segue online */ });
  });
}

registrarServiceWorker();
iniciarApp();
