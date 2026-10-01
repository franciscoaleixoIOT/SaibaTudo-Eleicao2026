// Motor de IA LOCAL e DETERMINÍSTICO (NLU por regras + respostas montadas dos dados oficiais), com a nuvem como apoio
// opcional de interpretação. Porte de LocalOfficialAiEngine + HybridAiInferenceEngine. Funciona 100% offline.
//
// Carga sob demanda: o NLU/respostas precisam das candidaturas da UF (ou de todas) — o motor pede ao DataStore apenas
// as fatias necessárias antes de responder; intenções que não dependem de candidaturas respondem na hora.
import { AnswerBuilder, usaMeuEstado } from './answers.js';
import { Gazetteer } from './gazetteer.js';
import { parse } from './nlu.js';
import { hojeBrasilia } from './phase.js';

/** Intenções decididas ANTES da resolução de nomes: independem das candidaturas carregadas. */
const INDEPENDENTES = new Set([
  'RECOMENDACAO', 'SENADO_DOIS_VOTOS', 'REGRAS_URNA', 'LOCAL_VOTACAO', 'CALENDARIO', 'PESQUISAS', 'SOBRE_DADOS', 'FONTES'
]);

/** Fatias de UF necessárias para responder a uma interpretação. */
export function ufsParaConsulta(p, ufPadrao = null) {
  if (p.cargo === 'PRESIDENTE' || p.cargo === 'VICE_PRESIDENTE') return ['BR'];
  if (p.uf) return ['BR', p.uf];
  if (usaMeuEstado(p, ufPadrao)) return ['BR', ufPadrao]; // "Meu estado" vale implicitamente
  return null; // todas
}

export class Engine {
  /**
   * @param {object} o
   * @param {import('./data.js').DataStore} o.store
   * @param {() => string|null} [o.ufPadrao]
   * @param {{obter: Function}|null} [o.apuracao]
   * @param {() => string} [o.hoje]
   * @param {{interpretar(q:string, gaz:Gazetteer): Promise<object|null>}|null} [o.nuvem]
   */
  constructor({ store, ufPadrao = () => null, apuracao = null, hoje = () => hojeBrasilia(), nuvem = null }) {
    Object.assign(this, { store, ufPadrao, apuracao, hoje, nuvem });
    this._gaz = null;
    this._gazRev = -1;
  }

  /** Dicionário (partidos/nomes) derivado dos dados; reconstruído quando o pacote muda. */
  gazetteer() {
    if (!this._gaz || this._gazRev !== this.store.revCand) {
      this._gaz = new Gazetteer(this.store.candidatos, this.store.partidosConhecidos());
      this._gazRev = this.store.revCand;
    }
    return this._gaz;
  }

  async _garantir(p) {
    const ufs = ufsParaConsulta(p, this.ufPadrao());
    if (ufs) await this.store.ensureUfs(ufs); else await this.store.ensureTodas();
  }

  async _construir(parsed, origem) {
    if (parsed.intent === 'PESQUISAS') await this.store.ensurePesquisas();
    const b = new AnswerBuilder({
      data: this.store.snapshot(), gaz: this.gazetteer(), hoje: this.hoje(), ufPadrao: this.ufPadrao(),
      apuracao: this.apuracao, origem
    });
    return b.construir(parsed);
  }

  /** Responde uma pergunta. `onEtapa('carregando')` avisa a interface quando é preciso baixar mais UFs. */
  async responder(pergunta, { onEtapa = () => {} } = {}) {
    let gaz = this.gazetteer();
    let p = parse(pergunta, gaz);
    if (!INDEPENDENTES.has(p.intent)) {
      const ufs = ufsParaConsulta(p, this.ufPadrao());
      const faltando = (ufs ?? this.store._ufsDoManifesto()).some((u) => !this.store.shards.has(u));
      if (faltando) onEtapa('carregando');
      try { await this._garantir(p); } catch { /* UF indisponível: responde com o que há (ver Sobre os dados) */ }
      gaz = this.gazetteer();
      p = parse(pergunta, gaz); // com mais nomes carregados a interpretação pode mudar (ex.: nome de candidato)
    }
    const local = await this._construir(p, 'LOCAL');
    if (local.resolvida || !this.nuvem) return local;
    // O NLU local não entendeu: com consentimento, a nuvem tenta interpretar (e a resposta continua vindo dos dados)
    onEtapa('nuvem');
    const interpretada = await this.nuvem.interpretar(pergunta, gaz);
    if (!interpretada) return local;
    if (!INDEPENDENTES.has(interpretada.intent)) { try { await this._garantir(interpretada); } catch { /* idem */ } }
    const viaNuvem = await this._construir(interpretada, 'NUVEM');
    return viaNuvem.resolvida ? viaNuvem : local;
  }
}
