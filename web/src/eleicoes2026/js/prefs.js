// Preferências do usuário (armazenadas apenas neste navegador, em localStorage — nada é enviado a servidores).
// Exceção: o consentimento `iaNuvem` habilita o envio do TEXTO de perguntas não compreendidas ao NLU na nuvem; o
// `idInstalacao` é aleatório (não identifica a pessoa) e só acompanha essas chamadas. Porte de UserPreferences.kt.
import { SIGLAS_SET } from './model.js';

const CHAVE = 'st26:prefs';

export const TEMAS = { SISTEMA: 'Seguir o sistema', CLARO: 'Claro', ESCURO: 'Escuro' };
export const FONTES = {
  PEQUENA: { rotulo: 'Pequena', fator: 0.9 }, NORMAL: { rotulo: 'Normal', fator: 1 },
  GRANDE: { rotulo: 'Grande', fator: 1.15 }, MUITO_GRANDE: { rotulo: 'Muito grande', fator: 1.3 }
};

export const PADRAO = Object.freeze({
  onboardingConcluido: false,
  tema: 'SISTEMA',
  tamanhoFonte: 'NORMAL',
  /** UF escolhida pelo usuário ("meu estado"). Nunca é detectada por geolocalização. */
  ufPadrao: null,
  filtrarPorMinhaUf: true,
  perguntaInicial: '',
  executarPerguntaAoAbrir: false,
  mostrarApenasNaUrna: true,
  economiaDeDados: false,
  /** Consentimento (OPT-IN, desligado por padrão) para enviar perguntas não compreendidas ao NLU na nuvem. */
  iaNuvem: false,
  idInstalacao: null
});

let memoria = null; // fallback quando o armazenamento está bloqueado (modo privado etc.)

function lerBruto() {
  try { return JSON.parse(localStorage.getItem(CHAVE) ?? 'null'); } catch { return memoria; }
}

/** Valida e completa as preferências lidas (valores inválidos voltam ao padrão). */
export function sanear(b) {
  const o = b && typeof b === 'object' ? b : {};
  const bool = (k) => (typeof o[k] === 'boolean' ? o[k] : PADRAO[k]);
  return {
    onboardingConcluido: bool('onboardingConcluido'),
    tema: o.tema in TEMAS ? o.tema : PADRAO.tema,
    tamanhoFonte: o.tamanhoFonte in FONTES ? o.tamanhoFonte : PADRAO.tamanhoFonte,
    ufPadrao: SIGLAS_SET.has(o.ufPadrao) ? o.ufPadrao : null,
    filtrarPorMinhaUf: bool('filtrarPorMinhaUf'),
    perguntaInicial: typeof o.perguntaInicial === 'string' ? o.perguntaInicial.slice(0, 120) : '',
    executarPerguntaAoAbrir: bool('executarPerguntaAoAbrir'),
    mostrarApenasNaUrna: bool('mostrarApenasNaUrna'),
    economiaDeDados: bool('economiaDeDados'),
    iaNuvem: bool('iaNuvem'),
    idInstalacao: typeof o.idInstalacao === 'string' && o.idInstalacao.length >= 8 ? o.idInstalacao : null
  };
}

export function carregar() {
  const p = sanear(lerBruto());
  memoria = p;
  return p;
}

export function salvar(p) {
  memoria = p;
  try { localStorage.setItem(CHAVE, JSON.stringify(p)); } catch { /* sem armazenamento: vale só nesta sessão */ }
}

/** ID aleatório de instalação, criado sob demanda (só é enviado junto com perguntas à IA na nuvem, com consentimento). */
export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // versão 4
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
  return [...b].map((x, i) => ([4, 6, 8, 10].includes(i) ? '-' : '') + x.toString(16).padStart(2, '0')).join('');
}

/** Aplica tema e tamanho de texto ao documento. */
export function aplicarAparencia(p, doc = document) {
  const r = doc.documentElement;
  if (p.tema === 'CLARO') r.setAttribute('data-theme', 'light');
  else if (p.tema === 'ESCURO') r.setAttribute('data-theme', 'dark');
  else r.removeAttribute('data-theme');
  r.style.setProperty('--fs', String(FONTES[p.tamanhoFonte].fator));
}
