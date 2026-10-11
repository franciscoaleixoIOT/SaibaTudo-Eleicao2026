// Ponto de entrada do PWA /quimica/.
import { iniciarApp, toast } from './app.js';

/** Service worker: somente em HTTPS (produção) ou localhost. */
function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const seguro = location.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (!seguro) return;
  // só avisa quando o controlador anterior era o service worker do próprio app
  let anterior = navigator.serviceWorker.controller?.scriptURL ?? '';
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (anterior.endsWith('/quimica/sw.js')) toast('Nova versão do app instalada. Feche e reabra (ou recarregue) para usá-la.');
    anterior = navigator.serviceWorker.controller?.scriptURL ?? '';
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/quimica/sw.js', { scope: '/quimica/' }).catch(() => { /* sem offline; o app segue online */ });
  });
}

registrarServiceWorker();
iniciarApp();
