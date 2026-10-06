// "Ajudar a melhorar o app": envio OPCIONAL, com consentimento próprio, das perguntas que o app não entendeu (POST /api/melhoria).
//
// Diferente da "IA na nuvem" (que só interpreta uma pergunta e a descarta), aqui o texto é GUARDADO no servidor para uma pessoa revisar
// e melhorar o NLU. Por isso:
//  - só existe se o pacote de dados ASSINADO liga cliente.melhoria.enabled (padrão: desligado) E a pessoa liga a opção (padrão: desligada);
//  - só entram perguntas que o app NÃO entendeu, nunca as respondidas; dados pessoais (e-mail, CPF, telefone, número longo) derrubam a
//    pergunta ANTES de ir para a fila (o servidor refaz a checagem);
//  - a fila fica só neste navegador (localStorage), tem no máximo LIMITE_FILA perguntas e é apagada ao desligar a opção;
//  - vai no máximo LOTE perguntas por envio, sem resposta, sem intenção e sem horário (o servidor também não guarda o iid).
// Uma pergunta livre pode revelar opinião política: o texto de consentimento (MELHORIA_TEXTOS) diz isso com todas as letras.

export const MELHORIA_TEXTOS = Object.freeze({
  chave: 'Ajudar a melhorar o app',
  descricao: 'Desligado por padrão. Se ligar, as perguntas que o app não entendeu são enviadas ao nosso servidor, sem seu nome e sem identificar você, ' +
    'para uma pessoa revisar e ensinar o app a entendê-las. Perguntas com e-mail, CPF ou telefone nunca são enviadas. ' +
    'Atenção: o texto de uma pergunta pode revelar sua opinião política; ligue só se estiver de acordo e evite escrever dados pessoais. ' +
    'Você pode desligar a qualquer momento; o que ainda não foi enviado é apagado.'
});

export const LIMITE_FILA = 30;
export const LOTE = 10;
export const MIN_PARA_ENVIAR = 3;
export const MIN_Q = 3;
export const MAX_Q = 300;
const CHAVE = 'st26:melhoria';

// Mesmas regras de api/_lib/sanitize.js (redactPii): o servidor DESCARTA o que mascararia; aqui nem entra na fila.
const RX_PII = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/,
  /(?:\+?55[\s-]?)?(?:\(?\d{2}\)?[\s-]?)?9?\d{4}[\s-]\d{4}\b/,
  /\b\d{9,}\b/
];

/** O pacote assinado libera a captura de perguntas? Ausente ou diferente de true = desligada. */
export const melhoriaLigada = (manifesto) => manifesto?.cliente?.melhoria?.enabled === true;

/** Texto limpo se puder ir para a fila; null se for curto, longo ou tiver dado pessoal. */
export function textoEnfileiravel(q) {
  if (typeof q !== 'string') return null;
  const t = q.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length < MIN_Q || t.length > MAX_Q) return null;
  if (RX_PII.some((rx) => rx.test(t))) return null;
  return t;
}

/** Armazenamento com fallback em memória (modo privado ou armazenamento bloqueado). */
function armazenamentoPadrao() {
  let memoria = [];
  return {
    ler() {
      try { const v = JSON.parse(globalThis.localStorage?.getItem(CHAVE) ?? 'null'); return Array.isArray(v) ? v : memoria; } catch { return memoria; }
    },
    gravar(lista) {
      memoria = lista;
      try { globalThis.localStorage?.setItem(CHAVE, JSON.stringify(lista)); } catch { /* vale só nesta sessão */ }
    },
    apagar() {
      memoria = [];
      try { globalThis.localStorage?.removeItem(CHAVE); } catch { /* idem */ }
    }
  };
}

export class FilaMelhoria {
  /**
   * @param {{ habilitada: () => boolean, noPacote: () => boolean, installId: () => string, endpoint?: string,
   *   fetchFn?: typeof fetch, armazenamento?: {ler:()=>string[], gravar:(l:string[])=>void, apagar:()=>void} }} o
   *   `habilitada`: a pessoa ligou a opção; `noPacote`: o manifesto assinado liga o recurso.
   */
  constructor({ habilitada, noPacote, installId, endpoint = '/api/melhoria', fetchFn = (...a) => globalThis.fetch(...a), armazenamento = armazenamentoPadrao() }) {
    Object.assign(this, { habilitada, noPacote, installId, endpoint, fetchFn, armazenamento });
    this.enviando = false;
  }

  ativa() { return this.noPacote() === true && this.habilitada() === true; }

  pendentes() { return this.armazenamento.ler(); }

  /** Põe a pergunta na fila (só se a captura estiver ativa e o texto puder ser guardado). Devolve se entrou. */
  enfileirar(q) {
    if (!this.ativa()) return false;
    const t = textoEnfileiravel(q);
    if (!t) return false;
    const atual = this.armazenamento.ler();
    if (atual.some((x) => x.toLowerCase() === t.toLowerCase())) return false;
    this.armazenamento.gravar([...atual, t].slice(-LIMITE_FILA));
    return true;
  }

  /** Apaga a fila (ao desligar a opção). */
  limpar() { this.armazenamento.apagar(); }

  /**
   * Envia um lote se houver perguntas suficientes (ou `forcar`). Nunca lança. Só remove da fila o que o servidor confirmou.
   * @returns {Promise<'enviado'|'nada'|'inativa'|'falhou'>}
   */
  async enviarSePreciso({ forcar = false } = {}) {
    if (!this.ativa()) return 'inativa';
    if (this.enviando) return 'nada';
    const fila = this.armazenamento.ler();
    if (fila.length === 0 || (!forcar && fila.length < MIN_PARA_ENVIAR)) return 'nada';
    const lote = fila.slice(0, LOTE);
    this.enviando = true;
    try {
      const r = await this.fetchFn(this.endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'omit', cache: 'no-store',
        body: JSON.stringify({ v: 1, client: 'web', iid: this.installId(), itens: lote.map((q) => ({ q })) })
      });
      const corpo = r.ok ? await r.json() : null;
      if (corpo?.ok !== true) {
        // 400 com o lote inválido nunca vai passar: descarta para não travar a fila; os demais erros (503 desligado, 429, rede) mantêm
        if (r.status === 400) this.armazenamento.gravar(fila.slice(lote.length));
        return 'falhou';
      }
      this.armazenamento.gravar(fila.slice(lote.length));
      return 'enviado';
    } catch {
      return 'falhou';
    } finally {
      this.enviando = false;
    }
  }
}
