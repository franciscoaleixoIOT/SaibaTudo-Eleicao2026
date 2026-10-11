// Configurações: aparência, instalação do app, IA na nuvem (ainda indisponível) e apagar os dados deste aparelho.
import { h, icon } from '../dom.js';
import { instalar, instrucoes, jaInstalado, podeInstalarAgora } from '../install.js';
import { FONTES, TEMAS, apagar, aplicarAparencia, carregar, salvar } from '../prefs.js';
import { botaoAtualizacao } from './sobre.js';
import { kvEl, toast } from './componentes.js';

function radios(nome, legenda, opcoes, atual, aoMudar) {
  return h('fieldset', { class: 'radios' }, h('legend', null, legenda),
    opcoes.map(([valor, rotulo]) => h('label', { class: 'radio' }, h('input', { type: 'radio', name: nome, value: valor, checked: valor === atual, onChange: () => aoMudar(valor) }), h('span', null, rotulo))));
}

export function viewConfig({ store }) {
  let prefs = carregar();
  const mudar = (campo, valor) => { prefs = { ...prefs, [campo]: valor }; salvar(prefs); aplicarAparencia(prefs); toast('Preferência salva neste aparelho.'); };

  const blocoInstalar = h('div');
  const atualizarInstalar = () => {
    const ins = instrucoes();
    blocoInstalar.replaceChildren(jaInstalado() ? h('p', { class: 'mudo' }, 'O aplicativo já está instalado neste aparelho.')
      : podeInstalarAgora() ? h('button', { class: 'btn btn-primario', type: 'button', onClick: async () => { await instalar(); atualizarInstalar(); } }, icon('download', 18), 'Instalar app')
        : h('div', null, h('p', { class: 'mudo' }, ins.titulo), h('ul', { class: 'lista-pontos' }, ins.passos.map((p) => h('li', null, p)))));
  };
  atualizarInstalar();

  const status = h('p', { class: 'pequeno mudo', role: 'status', 'aria-live': 'polite' });
  const botaoApagar = h('button', { class: 'btn btn-contorno peq perigo', type: 'button', onClick: async () => {
    if (botaoApagar.dataset.confirma !== '1') { botaoApagar.dataset.confirma = '1'; botaoApagar.textContent = 'Toque de novo para confirmar'; return; }
    apagar();
    try { if (globalThis.caches) for (const k of await caches.keys()) if (k.startsWith('quimica-')) await caches.delete(k); } catch { /* ignorado */ }
    try { const regs = await navigator.serviceWorker?.getRegistrations?.(); for (const r of regs ?? []) if (r.scope.endsWith('/quimica/')) await r.unregister(); } catch { /* ignorado */ }
    status.textContent = 'Dados apagados. Recarregando…';
    setTimeout(() => location.assign('/quimica/'), 600);
  } }, icon('trash', 16), 'Apagar os dados deste aparelho');

  const no = h('div', { class: 'tela-corpo' },
    h('h1', { id: 'titulo-pagina', tabindex: '-1' }, 'Configurações'),
    h('div', { class: 'grupo' }, 'Aparência'),
    radios('tema', 'Tema', Object.entries(TEMAS), prefs.tema, (v) => mudar('tema', v)),
    radios('fonte', 'Tamanho do texto', Object.entries(FONTES).map(([k, v]) => [k, v.rotulo]), prefs.tamanhoFonte, (v) => mudar('tamanhoFonte', v)),
    h('div', { class: 'grupo' }, 'Instalar'), blocoInstalar,
    h('div', { class: 'grupo' }, 'Inteligência artificial na nuvem'),
    h('p', { class: 'aviso-caixa discreto' }, icon('info', 16), 'Ainda não disponível. Quando existir, será opcional, só funcionará com o seu consentimento e nunca fornecerá números: eles continuam vindo dos dados e dos cálculos. Nesta versão nada sai do seu aparelho.'),
    h('div', { class: 'grupo' }, 'Dados'),
    kvEl([{ rotulo: 'Versão do pacote', valor: String(store.versao) }, { rotulo: 'Assinatura', valor: { verificada: 'verificada', invalida: 'NÃO verificada', indisponivel: 'indisponível neste navegador' }[store.sig.estado] }]),
    botaoAtualizacao(store),
    h('div', { class: 'grupo' }, 'Privacidade'),
    h('p', { class: 'pequeno mudo' }, 'Guardamos neste aparelho só o tema e o tamanho do texto, além do cache para uso offline. ', h('a', { href: '/quimica/privacidade' }, 'Política de privacidade'), '.'),
    botaoApagar, status);
  return { titulo: 'Configurações', node: no };
}
