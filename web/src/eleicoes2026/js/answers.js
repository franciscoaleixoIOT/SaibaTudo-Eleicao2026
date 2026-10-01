// Monta a RESPOSTA a partir de uma ParsedQuery usando SOMENTE os dados oficiais carregados (e, para apuração ao vivo,
// o JSON público do TSE). Porte fiel de AnswerBuilder.kt. Nenhum texto gerado por modelo de linguagem é exibido como
// fato: a nuvem ajuda apenas a entender a pergunta.
//
// Princípios: neutralidade (ordem fixa), fonte e data em toda resposta, sem recomendação/previsão de voto,
// elegibilidade = situação oficial do TSE (não é certidão de "Ficha Limpa").
import {
  MENU, normalizar, NOMES_UF, SISTEMAS_OFICIAIS_TSE, URL_CALENDARIO_TSE, URL_DADOS_ABERTOS_TSE, URL_RESULTADOS_TSE,
  decimal2, inteiro, moeda, primeiraMaiuscula, tituloCargo, tituloPalavras, HISTORICO, resultadoEleito
} from './model.js';
import { FASES, diasEntre, faseDe, formatarBr } from './phase.js';
import { filtrar } from './filters.js';

export const ORIGEM_ROTULO = {
  LOCAL: 'IA local • dados oficiais',
  NUVEM: 'IA na nuvem + dados oficiais',
  AVISO: 'Aviso'
};

const nl = (n, singular, plural) => (n === 1 ? singular : plural);

/** Alterações de filtro sugeridas pela resposta (aplicadas pela interface sobre o filtro atual). */
const filtros = (x = {}) => ({
  cargo: null, estadoUf: null, partido: null, tema: null, buscaTexto: null, apenasDeferidas: null,
  apenasEleitos: null, historico: null, resetar: false, ...x
});

const resposta = (x) => ({
  targetRoute: 'menu/home', menuId: MENU.HOME, submenuId: null, intent: 'DESCONHECIDA', filters: filtros(),
  directAnswer: null, suggestedQuestions: [], candidateIds: [], fonte: null, origem: 'LOCAL', resolvida: true,
  abrirResultados: false, apuracao: null, ...x
});

const rotaCargo = (c) => {
  switch (c) {
    case 'PRESIDENTE': case 'VICE_PRESIDENTE': return 'candidates/presidente';
    case 'GOVERNADOR': case 'VICE_GOVERNADOR': return 'candidates/governador';
    case 'SENADOR': case 'SUPLENTE_1': case 'SUPLENTE_2': return 'candidates/senador';
    case 'DEPUTADO_FEDERAL': return 'candidates/deputado_federal';
    case 'DEPUTADO_ESTADUAL': case 'DEPUTADO_DISTRITAL': return 'candidates/deputado_estadual';
    default: return 'candidates/todos';
  }
};

const menuCargo = (c) => {
  switch (c) {
    case 'PRESIDENTE': case 'VICE_PRESIDENTE': return MENU.PRESIDENTE;
    case 'GOVERNADOR': case 'VICE_GOVERNADOR': return MENU.GOVERNADOR;
    case 'SENADOR': case 'SUPLENTE_1': case 'SUPLENTE_2': return MENU.SENADOR;
    case 'DEPUTADO_FEDERAL': return MENU.DEPUTADO_FEDERAL;
    case 'DEPUTADO_ESTADUAL': case 'DEPUTADO_DISTRITAL': return MENU.DEPUTADO_ESTADUAL;
    default: return MENU.HOME;
  }
};

const tituloCargoDe = (codigo) => {
  switch (codigo) {
    case 'PRESIDENTE': case 'VICE_PRESIDENTE': return 'a Presidência';
    case 'GOVERNADOR': case 'VICE_GOVERNADOR': return 'o Governo';
    case 'SENADOR': case 'SUPLENTE_1': case 'SUPLENTE_2': return 'o Senado';
    default: return tituloCargo(codigo);
  }
};

/** Cargos que dependem do estado: sem UF na pergunta, vale o "Meu estado" do usuário (se ligado). */
const CARGOS_ESTADUAIS = new Set(['GOVERNADOR', 'VICE_GOVERNADOR', 'SENADOR', 'DEPUTADO_FEDERAL', 'DEPUTADO_ESTADUAL', 'DEPUTADO_DISTRITAL']);
/** Quem pede "em todo o Brasil" afasta o recorte do "Meu estado" (a dica da própria resposta ensina esse pedido). */
const RX_BRASIL_TODO = /\b(todo o brasil|brasil todo|todo brasil|todos os estados|todo o pais|pais todo)\b/;

/**
 * Paridade com o Android: "Meu estado" LIGADO vale implicitamente para perguntas de LISTAR/CONTAR sobre cargos estaduais
 * feitas SEM UF. Cargo nacional (Presidente) e UF explícita na pergunta não são afetados.
 */
export function usaMeuEstado(consulta, ufPadrao) {
  return consulta.uf == null && ufPadrao != null && CARGOS_ESTADUAIS.has(consulta.cargo) &&
    ['LISTAR_CANDIDATOS', 'CONTAR'].includes(consulta.intent) && !RX_BRASIL_TODO.test(normalizar(consulta.textoOriginal ?? ''));
}

export class AnswerBuilder {
  /**
   * @param {object} o
   * @param {object} o.data dados ativos: { regras, candidatos, pesquisas, fontes, manifest, origem, porId }
   * @param {import('./gazetteer.js').Gazetteer} o.gaz
   * @param {string} o.hoje data de hoje (ISO, Brasília)
   * @param {string|null} [o.ufPadrao]
   * @param {{obter(cargo:string, uf:string, turno:number):Promise<object|null>}|null} [o.apuracao]
   * @param {'LOCAL'|'NUVEM'|'AVISO'} [o.origem]
   */
  constructor({ data, gaz, hoje, ufPadrao = null, apuracao = null, origem = 'LOCAL' }) {
    this.data = data;
    this.gaz = gaz;
    this.hoje = hoje;
    this.ufPadrao = ufPadrao;
    this.apuracao = apuracao;
    this.origem = origem;
    this.regras = data.regras;
    this.fase = faseDe(hoje, this.regras.turno1, this.regras.turno2);
    this.fonte = 'Fonte: TSE – dados abertos (CC BY)' +
      (this.regras.extracaoTse && this.regras.extracaoTse.trim() ? `, extração ${this.regras.extracaoTse}` : '') +
      '. App independente.';
  }

  async construir(consulta) {
    const meuEstado = usaMeuEstado(consulta, this.ufPadrao);
    const r = await this.responder(meuEstado ? { ...consulta, uf: this.ufPadrao } : consulta);
    return meuEstado && r.directAnswer != null
      ? { ...r, directAnswer: r.directAnswer + ` (Filtrado pelo seu estado, ${this.ufPadrao}; para ver o Brasil todo, peça "em todo o Brasil" ou desligue "Meu estado".)` }
      : r;
  }

  async responder(p) {
    switch (p.intent) {
      case 'RECOMENDACAO': return this.recomendacao();
      case 'LISTAR_CANDIDATOS': return this.listar(p);
      case 'PERFIL_CANDIDATO': return this.perfil(p);
      case 'CONTAR': return this.contar(p);
      case 'PESQUISAS': return this.pesquisas(p);
      case 'CALENDARIO': return this.calendario();
      case 'LOCAL_VOTACAO': return this.localVotacao();
      case 'REGRAS_URNA': return this.regrasUrna();
      case 'SENADO_DOIS_VOTOS': return this.senadoDoisVotos();
      case 'ELEGIBILIDADE': return this.elegibilidade(p);
      case 'RESULTADOS': return this.resultados(p);
      case 'SEGUNDO_TURNO': return this.segundoTurno(p);
      case 'PATRIMONIO': return this.patrimonio(p);
      case 'FONTES': return this.fontes(p);
      case 'SOBRE_DADOS': return this.sobreDados();
      default: return this.desconhecida(p);
    }
  }

  // ------------------------------------------------------------------ listagem e contagem

  listar(p) {
    const cargo = p.cargo;
    const fi = filtros({
      cargo, estadoUf: p.uf, partido: p.partido, tema: p.tema, apenasDeferidas: p.apenasDeferidas,
      historico: p.historico, resetar: true
    });
    const lista = filtrar(this.data.candidatos, {
      regiao: null, estadoUf: p.uf, cargo, apenasDeferidas: p.apenasDeferidas === true, apenasNaUrna: true,
      apenasEleitos: false, historico: p.historico ?? 'TODOS', partido: p.partido, tema: p.tema, buscaTexto: null
    }).filter((c) => cargo != null || p.uf == null || c.estadoUf === p.uf); // sem cargo: só a UF pedida (sem nacionais)
    // Em listas por cargo (sem partido/tema) citamos só os titulares; vices/suplentes aparecem nos cartões
    const citados = cargo != null && p.partido == null && p.tema == null ? lista.filter((c) => c.cargoCodigo === cargo) : lista;
    const titulo = this.montarTitulo(cargo, p);
    let texto = '';
    if (citados.length === 0) {
      texto += `Não encontrei candidaturas na urna ${titulo} nos dados oficiais do TSE.`;
    } else {
      const n = citados.length;
      texto += `O TSE registra ${inteiro(n)} ${nl(n, 'candidatura', 'candidaturas')} na urna ${titulo}`;
      if (n <= 30) {
        texto += ': ' + citados.map((c) =>
          `${c.nomeUrna} (${c.partido}${c.estadoUf !== 'BR' && p.uf == null ? `-${c.estadoUf}` : ''}, nº ${c.numero})`).join('; ') + '.';
      } else {
        texto += '. A lista completa está nos cartões abaixo, em ordem fixa por cargo, estado e número.';
      }
      if (p.tema != null) {
        texto += ` Tema "${this.regras.temas?.[p.tema] ?? p.tema}": inclui apenas candidatos com plano de governo registrado ` +
          `(${this.regras.estatisticas.candidatosComPlanoGoverno} no total) cujo texto cita o tema com frequência.`;
      }
      if (p.apenasDeferidas === true) {
        texto += ' Filtro: candidaturas deferidas pelo TSE (não é certidão de Ficha Limpa).';
      }
    }
    const fora = cargo != null
      ? this.data.candidatos.filter((c) => c.cargoCodigo === cargo && !c.naUrna && (p.uf == null || c.estadoUf === p.uf)).length : 0;
    if (fora > 0 && p.partido == null && p.tema == null) {
      texto += ` Há ainda ${fora} ${nl(fora, 'registro', 'registros')} fora da urna (renúncia, indeferimento etc.).`;
    }
    return resposta({
      targetRoute: rotaCargo(cargo), menuId: menuCargo(cargo), submenuId: p.uf ? `sub_${p.uf.toLowerCase()}` : null,
      intent: p.intent, filters: fi, directAnswer: texto, candidateIds: citados.slice(0, 12).map((c) => c.id),
      suggestedQuestions: this.sugestoesLista(cargo, p.uf), fonte: this.fonte, origem: this.origem
    });
  }

  contar(p) {
    const cargo = p.cargo;
    const casa = (c) => (cargo == null || c.cargoCodigo === cargo) && (p.uf == null || c.estadoUf === p.uf) &&
      (p.partido == null || c.partido.toLowerCase() === p.partido.toLowerCase());
    const total = this.data.candidatos.filter((c) => casa(c) && c.naUrna).length;
    const registros = this.data.candidatos.filter(casa).length;
    const titulo = this.montarTitulo(cargo, p);
    let texto = `O TSE registra ${inteiro(registros)} ${nl(registros, 'candidatura', 'candidaturas')} ${titulo}, ` +
      `sendo ${inteiro(total)} ${nl(total, 'inserida', 'inseridas')} na urna.`;
    if (cargo == null && p.uf == null && p.partido == null) {
      texto += ' Por cargo (na urna): ' + Object.entries(this.regras.estatisticas.porCargoNaUrna)
        .map((e, i) => ({ e, i })).sort((a, b) => b.e[1] - a.e[1] || a.i - b.i).map((x) => x.e)
        .map(([k, v]) => `${primeiraMaiuscula(k.toLowerCase())}: ${inteiro(v)}`).join(', ') + '.';
    }
    return resposta({
      targetRoute: rotaCargo(cargo), menuId: menuCargo(cargo), intent: p.intent,
      filters: filtros({ cargo, estadoUf: p.uf, partido: p.partido, resetar: true }),
      directAnswer: texto, suggestedQuestions: this.sugestoesLista(cargo, p.uf), fonte: this.fonte, origem: this.origem
    });
  }

  // ------------------------------------------------------------------ perfil

  perfil(p) {
    const achados = this.gaz.buscarPorNome(p.nome ?? '', p.cargo, p.uf);
    if (achados.length === 0) return this.naoEncontrado(p);
    return this.montarPerfil(p, achados);
  }

  montarPerfil(p, achados) {
    const melhor = achados[0];
    const unico = achados.length === 1 ||
      (achados.filter((c) => c.nomeUrna.toLowerCase() === melhor.nomeUrna.toLowerCase()).length === 1 && melhor.ehMajoritario);
    if (!unico) {
      const lista = achados.slice(0, 8).map((c) =>
        `${c.nomeUrna} (${c.cargo} ${c.estadoUf === 'BR' ? 'nacional' : c.estadoUf}, ${c.partido}, nº ${c.numero})`).join('; ');
      return resposta({
        targetRoute: 'candidates/todos', menuId: MENU.HOME, intent: p.intent,
        filters: filtros({ buscaTexto: p.nome, resetar: true }),
        directAnswer: `Encontrei ${achados.length} candidaturas com "${p.nome}": ${lista}` +
          (achados.length > 8 ? ' e outras' : '') + '. Informe o cargo ou o estado para refinar.',
        candidateIds: achados.slice(0, 12).map((c) => c.id),
        suggestedQuestions: [`Candidatos a ${melhor.cargo}`, 'Quantos candidatos no total?'],
        fonte: this.fonte, origem: this.origem
      });
    }
    return resposta({
      targetRoute: rotaCargo(melhor.cargoCodigo), menuId: menuCargo(melhor.cargoCodigo),
      submenuId: melhor.estadoUf !== 'BR' ? `sub_${melhor.estadoUf.toLowerCase()}` : null, intent: p.intent,
      filters: filtros({ buscaTexto: melhor.nomeUrna, resetar: true }),
      directAnswer: this.descricaoPerfil(melhor), candidateIds: [melhor.id],
      suggestedQuestions: [
        `Simular voto em ${melhor.nomeUrna} (${melhor.numero})`,
        `Quem disputa ${tituloCargoDe(melhor.cargoCodigo)}${melhor.estadoUf !== 'BR' ? ` em ${melhor.estadoUf}` : ''}?`
      ],
      fonte: this.fonte, origem: this.origem
    });
  }

  naoEncontrado(p) {
    return resposta({
      targetRoute: 'candidates/todos', menuId: MENU.HOME, intent: p.intent,
      filters: filtros({ buscaTexto: p.nome, resetar: true }),
      directAnswer: `Nenhum candidato com nome semelhante a "${p.nome}" nos registros oficiais do TSE ` +
        `(${inteiro(this.data.candidatos.length)} candidaturas). Verifique a grafia ou busque por cargo/UF.`,
      suggestedQuestions: ['Quem disputa a Presidência?', `Candidatos a Governador em ${this.ufPadrao ?? 'SP'}`],
      fonte: this.fonte, origem: this.origem
    });
  }

  descricaoPerfil(c) {
    let s = `${c.nomeUrna} (${tituloPalavras(c.nomeCompleto)}), número ${c.numero}, ${c.partido} — ${c.cargo}`;
    s += c.estadoUf === 'BR' ? ' (nacional)' : ` por ${NOMES_UF[c.estadoUf] ?? c.estadoUf}`;
    s += '. ';
    const partes = [];
    if (c.idade != null) partes.push(`${c.idade} anos`);
    if (c.ocupacao != null) partes.push(`ocupação declarada: ${c.ocupacao.toLowerCase()}`);
    if (c.municipioNascimento != null) {
      partes.push(`natural de ${tituloPalavras(c.municipioNascimento)}${c.ufNascimento != null ? `/${c.ufNascimento}` : ''}`);
    }
    if (partes.length > 0) s += partes.join('; ') + '. ';
    s += `Situação da candidatura no TSE: ${c.elegibilidade.rotulo}`;
    if (c.situacao != null && c.situacao.toLowerCase() !== c.elegibilidade.rotulo.toLowerCase()) s += ` ("${c.situacao}")`;
    s += c.naUrna ? '; inserida na urna.' : '; NÃO está inserida na urna.';
    if (c.motivosIndeferimento.length > 0) s += ` Motivos registrados: ${c.motivosIndeferimento.join('; ')}.`;
    if (c.vezesEleito > 0) {
      s += ` Eleito ${c.vezesEleito} ${nl(c.vezesEleito, 'vez', 'vezes')} em eleições anteriores (histórico do TSE)`;
      if (c.eleitoMesmoCargo) s += ', inclusive para este mesmo cargo';
      s += '.';
    }
    if (c.patrimonioDeclarado != null) {
      s += ` Patrimônio declarado ao TSE: ${moeda(c.patrimonioDeclarado)} (${c.qtdBens ?? '?'} bens).`;
    }
    if (c.contas && (c.contas.receitas > 0 || c.contas.despesasContratadas > 0)) {
      s += ` Prestação de contas (${(c.contas.tipo ?? 'parcial').toLowerCase()}): receitas ${moeda(c.contas.receitas)}, despesas contratadas ${moeda(c.contas.despesasContratadas)}.`;
    }
    if (c.temPlanoGoverno) s += ' Possui plano de governo registrado no TSE.';
    const r = c.resultado;
    if (r && (Object.keys(r.turnos).length > 0 || r.situacaoTotalizacao != null)) {
      s += ' Resultado oficial: ' + (r.situacaoTotalizacao ?? '');
      for (const t of Object.keys(r.turnos).map(Number).sort((a, b) => a - b)) {
        const v = r.turnos[t];
        s += ` ${t}º turno: ${v.votos != null ? inteiro(v.votos) : '—'} votos`;
        if (v.percentual != null) s += ` (${decimal2(v.percentual)}%)`;
        s += ';';
      }
    }
    return s;
  }

  // ------------------------------------------------------------------ pesquisas, calendário, regras, fontes

  pesquisas(p) {
    const todas = this.data.pesquisas ?? [];
    const filtro = todas.filter((x) =>
      (p.uf == null || (x.uf ?? '').toLowerCase() === p.uf.toLowerCase()) &&
      (p.cargo == null || (x.cargo ?? '').toUpperCase().replace(/ /g, '_').startsWith(p.cargo.slice(0, 8))));
    const n = filtro.length;
    let texto = `O TSE tem ${inteiro(n)} ${nl(n, 'pesquisa', 'pesquisas')} ${nl(n, 'eleitoral', 'eleitorais')} ${nl(n, 'registrada', 'registradas')}`;
    if (p.uf != null) texto += ` para ${p.uf}`;
    if (p.cargo != null) texto += ` (${tituloCargo(p.cargo)})`;
    texto += '.';
    const primeira = filtro[0];
    if (primeira) {
      texto += ` Mais recente: ${primeira.empresa ?? 'empresa não informada'}`;
      if (primeira.dataDivulgacao != null) texto += `, divulgação em ${primeira.dataDivulgacao.slice(0, 10)}`;
      if (primeira.entrevistados != null) texto += `, ${primeira.entrevistados} entrevistados`;
      texto += '.';
    }
    const inst = [...new Set(filtro.map((x) => x.empresa).filter((e) => e != null))].slice(0, 6);
    if (inst.length > 0) texto += ` Institutos: ${inst.join(', ')}.`;
    texto += ' Atenção: o registro no TSE não informa os resultados da pesquisa; consulte o relatório divulgado pelo instituto.';
    return resposta({
      targetRoute: 'info/pesquisas', menuId: MENU.PESQUISAS, intent: p.intent,
      filters: filtros({ estadoUf: p.uf, cargo: p.cargo }), directAnswer: texto,
      suggestedQuestions: ['Quem disputa a Presidência?', 'Calendário eleitoral 2026'], fonte: this.fonte, origem: this.origem
    });
  }

  calendario() {
    const { turno1, turno2, horarioVotacao } = this.regras;
    const d1 = formatarBr(turno1);
    const d2 = formatarBr(turno2);
    const dias1 = diasEntre(this.hoje, turno1);
    let situacao;
    switch (this.fase.id) {
      case 'PRE_ELEICAO':
        situacao = `O 1º turno será em ${d1} (${dias1 === 1 ? 'amanhã' : `daqui a ${dias1} dias`}); ` +
          `o 2º turno, se houver (Presidente e Governador), em ${d2}.`;
        break;
      case 'DIA_1T': situacao = `Hoje é o 1º turno (${d1}). O 2º turno, se houver, será em ${d2}.`; break;
      case 'ENTRE_TURNOS': situacao = `O 1º turno foi em ${d1}. O 2º turno, para os cargos sem maioria absoluta, será em ${d2}.`; break;
      case 'DIA_2T': situacao = `Hoje é o 2º turno (${d2}).`; break;
      default: situacao = `As votações ocorreram em ${d1} (1º turno) e ${d2} (2º turno).`;
    }
    const texto = `${situacao} Votação: ${horarioVotacao}. ` +
      'Posse (EC 111/2021): Presidente em 05/01/2027 e Governadores em 06/01/2027. ' +
      `Demais prazos (prestação de contas, diplomação etc.): consulte o calendário oficial do TSE (${URL_CALENDARIO_TSE}).`;
    return resposta({
      targetRoute: 'info/calendario', menuId: MENU.CALENDARIO, intent: 'CALENDARIO', directAnswer: texto,
      suggestedQuestions: ['Onde consultar meu local de votação?', 'Quem disputa a Presidência?'],
      fonte: this.fonte, origem: this.origem
    });
  }

  localVotacao() {
    return resposta({
      targetRoute: 'info/locais', menuId: MENU.LOCAIS_VOTACAO, intent: 'LOCAL_VOTACAO',
      directAnswer: 'Para saber onde votar e a situação do título, use os sistemas oficiais: ' +
        'Autoatendimento do Eleitor (https://autoatendimento.tse.jus.br/) ou o app e-Título. ' +
        'Para justificar a ausência, use o Justifica ou o e-Título. Leve documento oficial com foto. ' +
        'O app não consulta dados pessoais do eleitor.',
      suggestedQuestions: ['Calendário eleitoral 2026', 'Ordem de votação na urna'], fonte: this.fonte, origem: this.origem
    });
  }

  regrasUrna() {
    const etapas = [...this.regras.ordemVotacaoUrna].sort((a, b) => a.ordem - b.ordem)
      .map((e) => `${e.ordem}º) ${e.cargo} (${e.digitos} dígitos)`).join('; ');
    return resposta({
      targetRoute: 'urna/simulador', menuId: MENU.REGRAS_ELEITORAIS, intent: 'REGRAS_URNA',
      directAnswer: `Ordem de votação na urna eletrônica em 2026: ${etapas}. O simulador do app é apenas educativo ` +
        'e não é a urna oficial nem registra votos.',
      suggestedQuestions: ['Regra dos dois senadores', 'Simular voto na urna'], fonte: this.fonte, origem: this.origem
    });
  }

  senadoDoisVotos() {
    return resposta({
      targetRoute: 'candidates/senador', menuId: MENU.SENADOR, intent: 'SENADO_DOIS_VOTOS',
      filters: filtros({ cargo: 'SENADOR', resetar: true }),
      directAnswer: 'Em 2026 há renovação de 2/3 do Senado: cada eleitor vota em DOIS senadores diferentes (1ª e 2ª vaga, ' +
        '3 dígitos cada). Se o mesmo candidato for digitado nas duas vagas, o segundo voto é anulado pela urna.',
      suggestedQuestions: [`Candidatos ao Senado em ${this.ufPadrao ?? 'SP'}`, 'Ordem de votação na urna'],
      fonte: this.fonte, origem: this.origem
    });
  }

  fontes(p) {
    const tre = p.uf ? (this.data.fontes?.tres ?? []).find((t) => t.uf === p.uf) : null;
    let texto = 'Fontes oficiais: ' + SISTEMAS_OFICIAIS_TSE.map(([n, u]) => `${n} (${u})`).join('; ');
    if (tre) texto += `; ${tre.tribunal}: ${tre.url}`;
    texto += '.';
    return resposta({
      targetRoute: 'info/fontes', menuId: MENU.REGRAS_ELEITORAIS, intent: 'FONTES', directAnswer: texto,
      suggestedQuestions: ['De onde vêm os dados?'], fonte: this.fonte, origem: this.origem
    });
  }

  sobreDados() {
    const m = this.data.manifest;
    const r = this.regras;
    const texto = `Os dados vêm dos arquivos abertos do TSE (${URL_DADOS_ABERTOS_TSE}), licença CC BY. ` +
      `Pacote ${m.dataVersion}, extração do TSE em ${r.extracaoTse && r.extracaoTse.trim() ? r.extracaoTse : '—'}, origem: ${this.data.origem}. ` +
      `${inteiro(r.estatisticas.totalRegistros)} candidaturas, ${inteiro(r.estatisticas.pesquisasRegistradas)} pesquisas registradas. ` +
      'O app verifica atualizações automaticamente e confere a assinatura digital dos dados.';
    return resposta({
      targetRoute: 'info/sobre', menuId: MENU.REGRAS_ELEITORAIS, intent: 'SOBRE_DADOS', directAnswer: texto,
      suggestedQuestions: ['Quem disputa a Presidência?'], fonte: this.fonte, origem: this.origem
    });
  }

  // ------------------------------------------------------------------ elegibilidade, patrimônio

  elegibilidade(p) {
    if (p.nome != null) {
      const achados = this.gaz.buscarPorNome(p.nome, p.cargo, p.uf);
      if (achados.length === 1) {
        const c = achados[0];
        return resposta({
          targetRoute: rotaCargo(c.cargoCodigo), menuId: menuCargo(c.cargoCodigo), intent: p.intent,
          filters: filtros({ buscaTexto: c.nomeUrna, resetar: true }),
          directAnswer: `Situação oficial da candidatura de ${c.nomeUrna} no TSE: ${c.elegibilidade.rotulo}.` +
            (c.motivosIndeferimento.length > 0 ? ` Motivos registrados: ${c.motivosIndeferimento.join('; ')}.` : '') +
            ' O app não emite certidão de Ficha Limpa; consulte o DivulgaCandContas para as certidões do candidato.',
          candidateIds: [c.id], fonte: this.fonte, origem: this.origem
        });
      }
    }
    const e = this.regras.estatisticas.porElegibilidade ?? {};
    const n = (...k) => k.reduce((a, x) => a + (e[x] ?? 0), 0);
    const resumo = `Deferidas: ${inteiro(n('DEFERIDA', 'DEFERIDA_COM_RECURSO'))}; ` +
      `indeferidas: ${inteiro(n('INDEFERIDA', 'INDEFERIDA_COM_RECURSO'))}; ` +
      `renúncias: ${inteiro(n('RENUNCIA'))}; aguardando julgamento: ${inteiro(n('PENDENTE'))}.`;
    return resposta({
      targetRoute: rotaCargo(p.cargo), menuId: menuCargo(p.cargo), submenuId: p.uf ? `sub_${p.uf.toLowerCase()}` : null,
      intent: p.intent, filters: filtros({ cargo: p.cargo, estadoUf: p.uf, apenasDeferidas: true, resetar: true }),
      directAnswer: 'A Lei da Ficha Limpa (LC 135/2010) é aplicada pela Justiça Eleitoral no julgamento do registro de cada ' +
        'candidatura. O app NÃO emite certidão de "Ficha Limpa": exibe a situação oficial do julgamento e os motivos de ' +
        `indeferimento registrados. ${resumo} Filtrei as candidaturas deferidas${p.cargo ? ` a ${tituloCargo(p.cargo)}` : ''}` +
        `${p.uf ? ` em ${p.uf}` : ''}. Deferida pode ainda caber recurso; confirme no DivulgaCandContas.`,
      suggestedQuestions: ['Quem disputa a Presidência?', 'Como funciona a elegibilidade?'], fonte: this.fonte, origem: this.origem
    });
  }

  patrimonio(p) {
    if (p.nome != null) {
      const achados = this.gaz.buscarPorNome(p.nome, p.cargo, p.uf);
      if (achados.length === 1) {
        const c = achados[0];
        const v = c.patrimonioDeclarado;
        return resposta({
          targetRoute: rotaCargo(c.cargoCodigo), menuId: menuCargo(c.cargoCodigo), intent: p.intent,
          filters: filtros({ buscaTexto: c.nomeUrna, resetar: true }),
          directAnswer: v != null
            ? `${c.nomeUrna} declarou ao TSE ${c.qtdBens ?? '?'} bem(ns), somando ${moeda(v)} (valor declarado pelo próprio candidato no registro).`
            : c.declaraBens === false ? `${c.nomeUrna} não declarou bens no registro de candidatura.`
              : `Não há bens declarados disponíveis nos dados do TSE para ${c.nomeUrna}.`,
          candidateIds: [c.id], fonte: this.fonte, origem: this.origem
        });
      }
    }
    return resposta({
      targetRoute: 'candidates/todos', menuId: MENU.HOME, intent: p.intent,
      directAnswer: 'O patrimônio é o total de bens que cada candidato declarou ao TSE no registro. ' +
        'Pergunte pelo nome (ex.: "Qual o patrimônio declarado de Fulano?") ou abra a ficha do candidato.',
      suggestedQuestions: ['Quem disputa a Presidência?'], fonte: this.fonte, origem: this.origem
    });
  }

  // ------------------------------------------------------------------ resultados

  async resultados(p) {
    const cargo = p.cargo;
    const abrir = filtros({ cargo, estadoUf: p.uf, resetar: true });
    if (!this.fase.mostraResultados) {
      return resposta({
        targetRoute: 'info/resultados', menuId: MENU.RESULTADOS, intent: p.intent, filters: abrir,
        directAnswer: `A votação ainda não ocorreu: o 1º turno é em ${formatarBr(this.regras.turno1)}, das 8h às 17h (Brasília). ` +
          `Os resultados oficiais são divulgados pelo TSE em ${URL_RESULTADOS_TSE} e aparecerão aqui durante a apuração.`,
        suggestedQuestions: ['Calendário eleitoral 2026', 'Quem disputa a Presidência?'], fonte: this.fonte, origem: this.origem
      });
    }
    if (cargo == null || !['PRESIDENTE', 'GOVERNADOR', 'SENADOR'].includes(cargo)) {
      return resposta({
        targetRoute: 'info/resultados', menuId: MENU.RESULTADOS, intent: p.intent, filters: abrir, abrirResultados: true,
        directAnswer: 'De qual cargo você quer ver os resultados? Posso mostrar a apuração de Presidente, Governador e Senador ' +
          `(informe o estado para Governador e Senador). Deputados: resultados oficiais completos em ${URL_RESULTADOS_TSE}.`,
        suggestedQuestions: ['Resultado para Presidente', `Resultado para Governador em ${this.ufPadrao ?? 'SP'}`, `Resultado para Senador em ${this.ufPadrao ?? 'SP'}`],
        fonte: this.fonte, origem: this.origem
      });
    }
    const uf = cargo === 'PRESIDENTE' ? 'BR' : (p.uf ?? this.ufPadrao);
    if (uf == null) {
      return resposta({
        targetRoute: 'info/resultados', menuId: MENU.RESULTADOS, intent: p.intent, filters: abrir,
        directAnswer: `De qual estado? Informe a UF (ex.: "Resultado para ${tituloCargo(cargo)} em SP").`,
        suggestedQuestions: [`Resultado para ${cargo} em SP`], fonte: this.fonte, origem: this.origem
      });
    }
    const turno = p.turno ?? (['ENTRE_TURNOS', 'DIA_2T', 'POS_ELEICAO'].includes(this.fase.id) ? 2 : 1);
    let ap = await this.obterApuracao(cargo, uf, turno);
    if (!ap && turno === 2) ap = await this.obterApuracao(cargo, uf, 1);
    return ap && apTemVotos(ap) ? this.respostaApuracao(p, ap, abrir) : this.respostaResultadosCsv(p, cargo, uf, turno, abrir);
  }

  async obterApuracao(cargo, uf, turno) {
    try { return (await this.apuracao?.obter(cargo, uf, turno)) ?? null; } catch { return null; }
  }

  respostaApuracao(p, ap, fi) {
    const ordenadas = ap.linhas.map((l, i) => ({ l, i })).sort((a, b) => b.l.votos - a.l.votos || a.i - b.i).map((x) => x.l);
    const max = ap.cargo === 'PRESIDENTE' || ap.linhas.length <= 12 ? ordenadas.length : 10;
    const corpo = ordenadas.slice(0, max).map((l) =>
      `${l.nome} (${l.partido}, nº ${l.numero}): ${inteiro(l.votos)} votos` +
      (l.percentual != null ? ` (${l.percentual}%)` : '') + (l.eleito ? ' — ELEITO' : '')).join('; ');
    const andamento = ap.totalizacaoFinal ? 'Totalização final.'
      : 'Apuração em andamento' + (ap.secoesTotalizadasPct != null ? ` (${ap.secoesTotalizadasPct}% das seções totalizadas)` : '') + '.';
    const texto = `${tituloCargo(ap.cargo)}${ap.uf !== 'BR' ? ` — ${ap.uf}` : ''}, ${ap.turno}º turno. ${andamento} ` +
      `${corpo}. Dados divulgados pelo TSE em ${ap.geradoEm}; os números são exibidos como publicados pelo TSE ` +
      `(${URL_RESULTADOS_TSE}).`;
    return resposta({
      targetRoute: 'info/resultados', menuId: MENU.RESULTADOS, intent: p.intent, filters: fi, directAnswer: texto,
      abrirResultados: true, apuracao: ap,
      candidateIds: ordenadas.slice(0, 6).map((l) => l.sqCandidato).filter((id) => id != null && this.data.porId.has(id)),
      suggestedQuestions: [`Quem foi eleito Governador em ${ap.uf !== 'BR' ? ap.uf : (this.ufPadrao ?? 'SP')}?`, 'Candidatos ao segundo turno'],
      fonte: 'Fonte: TSE – resultados.tse.jus.br (ao vivo), consultado agora.', origem: this.origem
    });
  }

  respostaResultadosCsv(p, cargo, uf, turno, fi) {
    const daqui = this.data.candidatos.filter((c) => c.cargoCodigo === cargo && c.estadoUf === uf && c.resultado != null);
    const eleitos = daqui.filter((c) => resultadoEleito(c.resultado));
    const local = uf !== 'BR' ? ` em ${uf}` : '';
    let texto;
    if (eleitos.length > 0) {
      texto = `Eleito${eleitos.length > 1 ? 's' : ''} para ${tituloCargo(cargo)}${local} segundo o TSE: ` +
        `${eleitos.map((c) => `${c.nomeUrna} (${c.partido}, nº ${c.numero})`).join('; ')}.`;
    } else if (daqui.length > 0) {
      texto = `O TSE já publicou a situação de totalização, mas ainda não há eleito definido para ${tituloCargo(cargo)}${local}. ` +
        daqui.filter((c) => c.resultado?.situacaoTotalizacao != null).slice(0, 6)
          .map((c) => `${c.nomeUrna}: ${c.resultado.situacaoTotalizacao}`).join('; ');
    } else {
      texto = `Ainda não há resultado oficial publicado para ${tituloCargo(cargo)}${local} (${turno}º turno). ` +
        `A apuração do TSE é divulgada em ${URL_RESULTADOS_TSE}; assim que estiver disponível, aparece aqui.`;
    }
    return resposta({
      targetRoute: 'info/resultados', menuId: MENU.RESULTADOS, intent: p.intent, filters: fi, abrirResultados: true,
      directAnswer: texto, candidateIds: eleitos.slice(0, 6).map((c) => c.id),
      suggestedQuestions: ['Calendário eleitoral 2026', 'Quem disputa a Presidência?'], fonte: this.fonte, origem: this.origem
    });
  }

  async segundoTurno(p) {
    if (this.fase === FASES.PRE_ELEICAO || this.fase === FASES.DIA_1T) {
      return resposta({
        targetRoute: 'info/calendario', menuId: MENU.CALENDARIO, intent: p.intent,
        directAnswer: `O 2º turno (${formatarBr(this.regras.turno2)}) ocorre somente para Presidente e Governador quando nenhum candidato ` +
          `alcança mais de 50% dos votos válidos no 1º turno. Os candidatos ao 2º turno só são conhecidos após a apuração de ${formatarBr(this.regras.turno1)}.`,
        suggestedQuestions: ['Calendário eleitoral 2026'], fonte: this.fonte, origem: this.origem
      });
    }
    const r = await this.resultados({ ...p, intent: 'RESULTADOS', turno: p.turno ?? 1 });
    return { ...r, intent: 'SEGUNDO_TURNO' };
  }

  // ------------------------------------------------------------------ recomendação / desconhecida

  recomendacao() {
    return resposta({
      targetRoute: 'menu/home', menuId: MENU.HOME, intent: 'RECOMENDACAO', origem: 'AVISO',
      directAnswer: 'Não indico, recomendo, comparo nem prevejo candidatos: a decisão do voto é sua. ' +
        'Posso mostrar, com dados oficiais do TSE, quem disputa cada cargo, o perfil e a situação da candidatura, ' +
        'bens declarados, planos de governo registrados, pesquisas registradas e os resultados oficiais.',
      suggestedQuestions: ['Quem disputa a Presidência?', `Candidatos a Governador em ${this.ufPadrao ?? 'SP'}`, 'Pesquisas registradas'],
      fonte: this.fonte
    });
  }

  desconhecida(p) {
    const txt = p.textoOriginal ?? '';
    return resposta({
      targetRoute: 'menu/home', menuId: MENU.HOME, intent: 'DESCONHECIDA', resolvida: false, origem: this.origem,
      filters: filtros({ buscaTexto: txt.length >= 3 && txt.length <= 60 ? txt : null, resetar: true }),
      directAnswer: 'Não consegui entender bem a pergunta. Experimente citar um cargo, um estado, um partido ou o nome de um candidato. ' +
        `Há ${inteiro(this.regras.estatisticas.totalNaUrna)} candidaturas na urna nos dados oficiais do TSE.`,
      suggestedQuestions: ['Quem disputa a Presidência?', `Candidatos a Governador em ${this.ufPadrao ?? 'SP'}`, 'Quantos candidatos foram registrados?', 'Calendário eleitoral 2026'],
      fonte: this.fonte
    });
  }

  // ------------------------------------------------------------------ helpers

  montarTitulo(cargo, p) {
    let s = cargo != null ? `a ${tituloCargo(cargo)}` : 'em todos os cargos';
    if (p.partido != null) s += ` do partido ${p.partido}`;
    if (p.uf != null) s += ` em ${NOMES_UF[p.uf] ?? p.uf}`;
    if (p.historico != null && p.historico !== 'TODOS') s += ` (${HISTORICO[p.historico].toLowerCase()})`;
    return s;
  }

  sugestoesLista(cargo, uf) {
    return [
      `Quantos candidatos ${cargo != null ? `a ${tituloCargo(cargo)}` : 'no total'}${uf != null ? ` em ${uf}` : ''}?`,
      'Simular voto na urna',
      `Pesquisas registradas${uf != null ? ` em ${uf}` : ''}`
    ];
  }
}

export const apTemVotos = (ap) => ap.linhas.some((l) => l.votos > 0);
