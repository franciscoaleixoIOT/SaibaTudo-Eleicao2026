// Motor de IA LOCAL e DETERMINÍSTICO (NLU por regras + respostas montadas dos dados oficiais), com a nuvem como apoio
// opcional de interpretação. Porte de LocalOfficialAiEngine + HybridAiInferenceEngine. Funciona 100% offline.
//
// Carga sob demanda: o NLU/respostas precisam das candidaturas da UF (ou de todas) — o motor pede ao DataStore apenas
// as fatias necessárias antes de responder; intenções que não dependem de candidaturas respondem na hora.
import { AnswerBuilder, usaMeuEstado } from './answers.js';
import { Gazetteer } from './gazetteer.js';
import { parse } from './nlu.js';
import { normalizar } from './model.js';
import { hojeBrasilia } from './phase.js';

/** Intenções decididas ANTES da resolução de nomes: independem das candidaturas carregadas. */
const INDEPENDENTES = new Set([
  'RECOMENDACAO', 'AJUDA', 'SENADO_DOIS_VOTOS', 'REGRAS_VOTO', 'REGRAS_URNA', 'LOCAL_VOTACAO', 'CALENDARIO', 'PESQUISAS',
  'SOBRE_DADOS', 'FONTES'
]);

/** "Simular voto na urna", "simulador"...: abrir o simulador sem candidato não depende das candidaturas (ele carrega a UF que usar). */
const RX_SIMULADOR_SEM_CANDIDATO = /^(quero |abrir o |abre o |abrir |usar o )?(simular|simule|simula|simulador|simulacao)( (o |meu )?voto)?( (na|da) urna)?( educativ[oa])?[\s!.?]*$/;

/** A interpretação dispensa as candidaturas (responde com as regras e textos oficiais). */
export const independeDosDados = (p) =>
  INDEPENDENTES.has(p.intent) ||
  (p.intent === 'SIMULADOR' && p.nome == null && p.numero == null && RX_SIMULADOR_SEM_CANDIDATO.test(normalizar(p.textoOriginal ?? '')));

/** Fatias de UF necessárias para responder a uma interpretação. */
export function ufsParaConsulta(p, ufPadrao = null) {
  if (p.cargo === 'PRESIDENTE' || p.cargo === 'VICE_PRESIDENTE') return ['BR'];
  if (p.uf) return ['BR', p.uf];
  if (usaMeuEstado(p, ufPadrao)) return ['BR', ufPadrao]; // "Meu estado" vale implicitamente
  // número de urna sem nome: o candidato procurado é nacional ou do estado do usuário (AnswerBuilder.localizar)
  if (p.numero != null && p.nome == null && ufPadrao != null && !p.nacional && BUSCA_POR_NUMERO.has(p.intent)) return ['BR', ufPadrao];
  return null; // todas
}

/** Intenções cuja resposta, com número de urna, depende só do candidato localizado (sem totais sobre os dados). */
const BUSCA_POR_NUMERO = new Set(['PERFIL_CANDIDATO', 'PLANO_GOVERNO', 'CONTAS_CAMPANHA', 'PATRIMONIO', 'SIMULADOR']);

export class Engine {
  /**
   * @param {object} o
   * @param {import('./data.js').DataStore} o.store
   * @param {() => string|null} [o.ufPadrao]
   * @param {{obter: Function}|null} [o.apuracao]
   * @param {() => string} [o.hoje]
   * @param {{interpretar(q:string, gaz:Gazetteer): Promise<object|null>, interpretarAgora?(q:string, gaz:Gazetteer): Promise<object|null>,
   *   habilitada?: () => boolean}|null} [o.nuvem]
   */
  constructor({ store, ufPadrao = () => null, apuracao = null, hoje = () => hojeBrasilia(), nuvem = null }) {
    Object.assign(this, { store, ufPadrao, apuracao, hoje, nuvem });
    this._gaz = null;
    this._gazRev = -1;
    this._ultimoContexto = null;
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
  async responder(pergunta, { onEtapa = () => {}, contexto = undefined } = {}) {
    const ctx = contexto !== undefined ? contexto : this._ultimoContexto;
    let gaz = this.gazetteer();
    let p = parse(pergunta, gaz, ctx);
    if (!independeDosDados(p)) {
      const ufs = ufsParaConsulta(p, this.ufPadrao());
      const faltando = (ufs ?? this.store._ufsDoManifesto()).some((u) => !this.store.shards.has(u));
      if (faltando) onEtapa('carregando');
      try { await this._garantir(p); } catch { /* UF indisponível: responde com o que há (ver Sobre os dados) */ }
      gaz = this.gazetteer();
      p = parse(pergunta, gaz, ctx); // com mais nomes carregados a interpretação pode mudar (ex.: nome de candidato)
    }
    const local = await this._construir(p, 'LOCAL');
    if (local.resolvida) {
      this._ultimoContexto = p;
    }
    // modo automático desligado: nada é enviado (a interface oferece "Perguntar à IA na nuvem" na resposta)
    if (local.resolvida || !this.nuvem || this.nuvem.habilitada?.() === false) return local;
    // O NLU local não entendeu: com consentimento, a nuvem tenta interpretar (e a resposta continua vindo dos dados)
    onEtapa('nuvem');
    const interpretada = await this.nuvem.interpretar(pergunta, gaz);
    if (!interpretada) return local;
    const respNuvem = (await this._viaNuvem(interpretada)) ?? local;
    if (respNuvem.resolvida) {
      this._ultimoContexto = interpretada;
    }
    return respNuvem;
  }

  limparContexto() {
    this._ultimoContexto = null;
  }

  /**
   * "Perguntar à IA na nuvem": pedido EXPLÍCITO para uma pergunta que o usuário quer aprofundar na nuvem
   * (o toque é o consentimento para enviar só esta pergunta).
   * Prioridade: resposta generativa ancorada com Qwen 7B via /api/ask.
   * Fallback: reinterpretação NLU estruturada com montagem via AnswerBuilder.
   * Retorna a resposta (origem GENERATIVA ou NUVEM) ou null se a nuvem falhar. Nunca lança.
   */
  async perguntarANuvem(pergunta, respostaAtual = null, { generativo = false } = {}) {
    if (generativo && typeof this.nuvem?.gerarResposta === 'function') {
      try {
        const contexto = respostaAtual?.directAnswer ? `Dados apurados no sistema:\n${respostaAtual.directAnswer.slice(0, 1500)}` : '';
        const gen = await this.nuvem.gerarResposta(pergunta, contexto);
        if (gen && gen.answer) {
          return {
            targetRoute: respostaAtual?.targetRoute ?? 'menu/home',
            menuId: respostaAtual?.menuId ?? 'home',
            submenuId: respostaAtual?.submenuId ?? null,
            intent: respostaAtual?.intent ?? 'RESPOSTA_GENERATIVA',
            filters: respostaAtual?.filters ?? {},
            directAnswer: gen.answer,
            suggestedQuestions: respostaAtual?.suggestedQuestions ?? [],
            candidateIds: respostaAtual?.candidateIds ?? [],
            fonte: `IA Generativa (${gen.model}) • Fundamentada nas normas e dados do TSE`,
            origem: 'GENERATIVA',
            resolvida: true,
            abrirResultados: false,
            abrirSimulador: false,
            apuracao: null,
          };
        }
      } catch {
        /* fallback para interpretação NLU estruturada */
      }
    }
    if (typeof this.nuvem?.interpretarAgora !== 'function') return null;
    try {
      const interpretada = await this.nuvem.interpretarAgora(pergunta, this.gazetteer());
      return interpretada ? await this._viaNuvem(interpretada) : null;
    } catch {
      return null;
    }
  }

  /** Resposta (dados oficiais) para uma interpretação vinda da nuvem; null se ela ainda não resolve a pergunta. */
  async _viaNuvem(interpretada) {
    if (!independeDosDados(interpretada)) { try { await this._garantir(interpretada); } catch { /* idem */ } }
    const r = await this._construir(interpretada, 'NUVEM');
    return r.resolvida ? r : null;
  }
}
