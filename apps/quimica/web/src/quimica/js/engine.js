// Motor LOCAL e DETERMINÍSTICO: segurança por regras → NLU por regras + dicionário dos dados → resposta montada dos dados. Funciona offline.
// (A IA na nuvem é da fase 5 e ainda não está disponível: nada sai do aparelho.)
import { AnswerBuilder } from './answers.js';
import { Dicionario } from './dicionario.js';
import { parse } from './nlu.js';
import { avaliarSeguranca } from './seguranca.js';

export class Engine {
  /** @param {{store: import('./data.js').DataStore}} o */
  constructor({ store }) {
    this.store = store;
    this._dic = null;
    this._rev = -1;
    this._ultimoContexto = null;
  }

  /** Dicionário derivado dos dados; reconstruído quando o pacote muda. */
  dicionario() {
    if (!this._dic || this._rev !== this.store.rev) {
      this._dic = new Dicionario(this.store);
      this._rev = this.store.rev;
    }
    return this._dic;
  }

  /** Interpretação sem montar a resposta (útil para testes e para a interface). */
  interpretar(pergunta, contexto = this._ultimoContexto) {
    return parse(pergunta, this.dicionario(), contexto);
  }

  /** Responde uma pergunta. Nunca lança: erros viram uma resposta não resolvida. */
  async responder(pergunta, { contexto = undefined } = {}) {
    const ctx = contexto !== undefined ? contexto : this._ultimoContexto;
    // 1) segurança primeiro: nenhuma outra etapa vê o pedido recusado
    const seg = avaliarSeguranca(pergunta);
    if (!seg.recusar) await this.resolverCas(pergunta);
    const p = seg.recusar
      ? { ...parse('', this.dicionario()), intent: 'RECUSA_PERIGO', textoOriginal: String(pergunta ?? '').slice(0, 300), seguranca: seg }
      : parse(pergunta, this.dicionario(), ctx);
    const builder = new AnswerBuilder({ store: this.store, dic: this.dicionario() });
    const r = await builder.construir(p);
    if (r.resolvida && !['RECUSA_PERIGO', 'AJUDA', 'SOBRE_DADOS', 'FONTES'].includes(r.intent) && (p.elemento || p.composto || p.propriedade)) this._ultimoContexto = p;
    return { ...r, pergunta: p.textoOriginal, parsed: p };
  }

  /** Número CAS citado na pergunta e ausente do dicionário (o índice do pipeline não tem CAS): procura nos lotes e ensina o dicionário. */
  async resolverCas(pergunta) {
    const dic = this.dicionario();
    for (const m of String(pergunta ?? '').matchAll(/\b(\d{2,7}-\d{2}-\d)\b/g)) {
      if (dic.casParaCid.has(m[1])) continue;
      try { const cid = await this.store.cidPorCas(m[1]); if (cid != null) dic.casParaCid.set(m[1], cid); } catch { /* sem o lote, o CAS fica sem resolver */ }
    }
  }

  limparContexto() { this._ultimoContexto = null; }
}
