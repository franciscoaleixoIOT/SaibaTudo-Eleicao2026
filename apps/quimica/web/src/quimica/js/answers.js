// Respostas montadas SÓ dos dados do pacote assinado e de cálculos locais testados. Cada bloco traz a fonte; nada vem do modelo (origem 'LOCAL').
// Formato de uma resposta: { intent, resolvida, origem, titulo, blocos[], directAnswer, fontes[], acoes[], sugestoes[], ... } (ver `montar`).
import { balancear } from './calc/balancear.js';
import { calcularConcentracao } from './calc/concentracao.js';
import { calcularEstequiometria, converterQuantidade } from './calc/estequiometria.js';
import { calcularBoyle, calcularGas } from './calc/gas.js';
import { calcularMassaMolar } from './calc/massa.js';
import { calcularPH } from './calc/ph.js';
import { acharUnidade, converter, paraBase } from './calc/unidades.js';
import { chaveFormula, formulaUnicode, tentarFormula } from './calc/formula.js';
import { respostaRecusa } from './seguranca.js';
import { fmt, fmtTex } from './formato.js';
import { CATEGORIA_GRUPO_PLURAL, CLASSES_PT } from './ghs.js';
import { lerNumero } from './formato.js';
import { ligarQuantidades, termosDeBusca } from './nlu.js';
import { descreverGhs, urlSegura } from './perigos.js';
import { categoriaRotulo, estadoChave, estadoRotulo, formatarValor, valorBruto } from './propriedades.js';
import { capitalizar, listar, normalizar, plural } from './texto.js';

export const FONTE_APP = { nome: 'SaibaTudo Química (este aplicativo)', licenca: 'MIT' };
const FONTE_CALCULO = { nome: 'Cálculo local do aplicativo, com dados do pacote assinado' };

export const SUGESTOES_PADRAO = [
  'Qual é a massa molar da água?',
  'Balancear Fe + O2 -> Fe2O3',
  'pH de HCl 0,01 mol/L',
  'Estrutura da aspirina',
  'Perigos do ácido sulfúrico',
  'Converter 5 atm em kPa',
  'Quantos mols há em 18 g de água?',
  'Ponto de fusão do ferro',
  'Elementos do grupo 17',
  'O que é um mol?',
  'Por que não misturar água sanitária com amoníaco?'
];

export const ORIENTACAO_GERAL = [
  'Leia o rótulo e a ficha de segurança (FISPQ) do produto antes de usar e siga as instruções do fabricante.',
  'Use luvas e óculos de proteção compatíveis com o produto e trabalhe em local ventilado.',
  'Não misture produtos químicos; guarde no recipiente original, bem fechado, longe de crianças, alimentos e fontes de calor.',
  'Em contato com a pele ou os olhos, lave com água corrente em abundância; se inalar, vá para o ar livre; não provoque vômito sem orientação profissional.',
  'Em qualquer intoxicação ou acidente, procure atendimento médico ou o centro de informação toxicológica da sua região, levando a embalagem do produto.'
];

const REGRAS_ACIDOS_BASES_PADRAO = [
  { formula: 'HCl', tipo: 'acido', n: 1 }, { formula: 'HBr', tipo: 'acido', n: 1 }, { formula: 'HI', tipo: 'acido', n: 1 }, { formula: 'HNO3', tipo: 'acido', n: 1 },
  { formula: 'HClO4', tipo: 'acido', n: 1 }, { formula: 'H2SO4', tipo: 'acido', nota: 'forte na 1ª ionização' }, { formula: 'NaOH', tipo: 'base', n: 1 }, { formula: 'KOH', tipo: 'base', n: 1 },
  { formula: 'LiOH', tipo: 'base', n: 1 }, { formula: 'Ca(OH)2', tipo: 'base', n: 2 }, { formula: 'Ba(OH)2', tipo: 'base', n: 2 }, { formula: 'Sr(OH)2', tipo: 'base', n: 2 }
];

const minus = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const fonteDe = (f) => (typeof f === 'string' ? { nome: f } : f && typeof f === 'object' ? { nome: f.nome ?? 'Pacote de dados', url: f.url, licenca: f.licenca } : FONTE_APP);
const dado = (...fontes) => fontes.filter(Boolean).map(fonteDe);

function textoDoBloco(b) {
  switch (b.tipo) {
    case 'texto': case 'aviso': return b.texto;
    case 'formula': return formulaUnicode(b.formula);
    case 'lista': return [b.titulo, ...b.itens.map((i) => `• ${i}`)].filter(Boolean).join('\n');
    case 'kv': return [b.titulo, ...b.itens.map((i) => `${i.rotulo}: ${i.valor}`)].filter(Boolean).join('\n');
    case 'resultado': return [b.titulo, ...b.itens.map((i) => `${i.rotulo}: ${i.valor}${i.unidade ? ' ' + i.unidade : ''}${i.extra ? ` (${i.extra})` : ''}`)].filter(Boolean).join('\n');
    case 'passos': return [b.titulo, ...b.passos.map((p, i) => `${i + 1}. ${p.texto}`)].filter(Boolean).join('\n');
    case 'tabela': return [b.legenda, b.cabecalho.join(' | '), ...b.linhas.map((l) => l.join(' | '))].filter(Boolean).join('\n');
    case 'ghs': return [b.titulo, b.palavraSinal ? `Palavra de sinal: ${b.palavraSinal}` : null, ...b.pictogramas.map((p) => `${p.codigo}: ${p.nome}`), ...b.frases.map((f) => `${f.codigo}: ${f.texto ?? ''}`)].filter(Boolean).join('\n');
    case 'molecula': return `Estrutura 2D de ${b.nome}`;
    case 'equacao': return b.texto;
    case 'citacao': return `${b.texto}\n(${b.aviso ? b.aviso + ' ' : ''}${b.fonte?.nome ?? ''}${b.fonte?.licenca ? ', ' + b.fonte.licenca : ''})`;
    default: return '';
  }
}

/** Monta a resposta final: texto plano, fontes agregadas (únicas), ações e sugestões. */
function montar({ intent, titulo, blocos, acoes = [], sugestoes = [], resolvida = true, extra = {} }) {
  const todos = blocos.map((b) => ({ ...b, fonte: b.fonte ?? FONTE_APP }));
  const vistas = new Set();
  const fontes = [];
  for (const b of todos) {
    for (const f of Array.isArray(b.fonte) ? b.fonte : [b.fonte]) {
      const k = `${f.nome}|${f.url ?? ''}`;
      if (!vistas.has(k)) { vistas.add(k); fontes.push(f); }
    }
  }
  const directAnswer = [titulo, ...todos.map(textoDoBloco)].filter(Boolean).join('\n');
  return { intent, resolvida, origem: 'LOCAL', titulo, blocos: todos, directAnswer, fontes, acoes, sugestoes: [...new Set(sugestoes)].slice(0, 6), ...extra };
}

const B = {
  texto: (texto, fonte = FONTE_APP) => ({ tipo: 'texto', texto, fonte }),
  aviso: (texto, fonte = FONTE_APP) => ({ tipo: 'aviso', texto, fonte }),
  lista: (titulo, itens, fonte = FONTE_APP) => ({ tipo: 'lista', titulo, itens, fonte }),
  kv: (titulo, itens, fonte) => ({ tipo: 'kv', titulo, itens, fonte }),
  resultado: (titulo, itens, fonte = FONTE_CALCULO) => ({ tipo: 'resultado', titulo, itens, fonte }),
  passos: (titulo, passos, fonte = FONTE_CALCULO) => ({ tipo: 'passos', titulo, passos, fonte }),
  formula: (formula, fonte) => ({ tipo: 'formula', formula, fonte }),
  tabela: (legenda, cabecalho, linhas, fonte) => ({ tipo: 'tabela', legenda, cabecalho, linhas, fonte }),
  molecula: (smiles, nome, fonte) => ({ tipo: 'molecula', smiles, nome, fonte }),
  equacao: (tex, texto, fonte = FONTE_CALCULO) => ({ tipo: 'equacao', tex, texto, fonte })
};

const rota = (r, rotulo) => ({ rotulo, rota: r });

export class AnswerBuilder {
  /** @param {{store: import('./data.js').DataStore, dic: import('./dicionario.js').Dicionario}} o */
  constructor({ store, dic }) {
    this.store = store;
    this.dic = dic;
    this.ctx = store.ctx;
  }

  async construir(p) {
    try {
      switch (p.intent) {
        case 'RECUSA_PERIGO': return this.recusa(p);
        case 'AJUDA': return this.ajuda();
        case 'SOBRE_DADOS': return this.sobreDados();
        case 'FONTES': return this.fontes();
        case 'ELEMENTO': return this.elemento(p);
        case 'COMPOSTO': return await this.composto(p);
        case 'PROPRIEDADE': return await this.propriedade(p);
        case 'MASSA_MOLAR': return await this.massaMolar(p);
        case 'BALANCEAR': return this.balancear(p);
        case 'ESTEQUIOMETRIA': return await this.estequiometria(p);
        case 'CONCENTRACAO': return await this.concentracao(p);
        case 'PH': return await this.ph(p);
        case 'GAS_IDEAL': return await this.gas(p);
        case 'CONVERSAO_UNIDADE': return this.conversao(p);
        case 'NOMENCLATURA': return await this.nomenclatura(p);
        case 'DESENHAR': return await this.desenhar(p);
        case 'COMPARAR': return await this.comparar(p);
        case 'TABELA_PERIODICA': return this.tabela(p);
        case 'SEGURANCA': return await this.seguranca(p);
        case 'CONCEITO': return await this.conceito(p);
        default: return this.naoEntendi(p);
      }
    } catch (e) {
      return montar({
        intent: p.intent, resolvida: false, titulo: 'Não consegui montar essa resposta',
        blocos: [B.aviso(`Ocorreu um problema ao ler os dados (${e instanceof Error ? e.message : String(e)}). Tente de novo ou use as telas do aplicativo.`)],
        sugestoes: SUGESTOES_PADRAO.slice(0, 4)
      });
    }
  }

  // ------------------------------------------------------------------------------------------------ utilidades
  nomeComposto(c) { return c?.nome ?? c?.nomeIupac ?? String(c?.cid ?? ''); }
  rotaComposto(cid) { return `/quimica/composto/${cid}`; }
  rotaElemento(s) { return `/quimica/elemento/${encodeURIComponent(s)}`; }
  entradaComposto(cid) { return this.store.indice.porCid.get(Number(cid)) ?? null; }

  /** Compostos citados (registro completo, quando o lote existe) e elementos. */
  async entidades(p) {
    const compostos = [];
    for (const cid of p.compostos ?? []) { const c = await this.store.composto(cid); if (c) compostos.push(c); }
    const elementos = (p.elementos ?? []).map((s) => this.store.porSimbolo.get(s)).filter(Boolean);
    return { compostos, elementos };
  }

  /** Fonte das frases H: a do pacote (CLP/EUR-Lex em ghs_frases.json) ou, sem ela, o texto padrão do aplicativo. */
  fonteFrases() { return this.store.fonteFrasesH ? fonteDe(this.store.fonteFrasesH) : { nome: 'Frases de perigo: UNECE GHS / ECHA CLP' }; }

  fonteRegras() { return fonteDe(this.store.regras?.fontes?.[0] ?? { nome: 'regras.json (pacote de dados assinado)' }); }

  // ------------------------------------------------------------------------------------------------ meta
  recusa(p) {
    const r = respostaRecusa(p.seguranca);
    const fonte = { nome: 'Política de segurança do aplicativo (regras locais)' };
    return montar({
      intent: 'RECUSA_PERIGO', titulo: p.seguranca?.categoria === 'AUTOLESAO' ? 'Você não está sozinho(a)' : 'Não posso ajudar com esse pedido',
      blocos: r.linhas.map((l) => B.aviso(l, fonte)), resolvida: true,
      sugestoes: p.seguranca?.categoria === 'AUTOLESAO' ? [] : ['Perigos do ácido sulfúrico', 'Por que não misturar água sanitária com amoníaco?', 'Qual é a massa molar da água?'],
      extra: { categoriaRecusa: p.seguranca?.categoria ?? null }
    });
  }

  ajuda() {
    return montar({
      intent: 'AJUDA', titulo: 'O que o SaibaTudo Química faz',
      blocos: [
        B.texto('Eu respondo perguntas de Química com dados abertos e com cálculos feitos no seu aparelho: nada sai do seu celular ou computador.'),
        B.lista('Você pode perguntar sobre', [
          'elementos e a tabela periódica (propriedades, grupos, períodos)', 'compostos (fórmula, massa molar, estrutura 2D e perigos do GHS)',
          'cálculos com passos: massa molar, balanceamento, estequiometria, concentração e diluição, pH, gás ideal e unidades',
          'segurança: pictogramas, frases de perigo e como evitar misturas perigosas', 'conceitos básicos, com trechos de fontes abertas citadas'
        ]),
        B.aviso('Não ajudo com síntese, purificação ou receitas de explosivos, armas químicas, drogas ilícitas e outros reagentes perigosos.')
      ],
      acoes: [rota('/quimica/tabela', 'Tabela periódica'), rota('/quimica/calculadoras', 'Calculadoras')],
      sugestoes: SUGESTOES_PADRAO.slice(0, 6)
    });
  }

  sobreDados() {
    const m = this.store.manifest;
    const fontesQtd = Array.isArray(this.store.fontes) ? this.store.fontes.length : (this.store.fontes?.fontes?.length ?? 0);
    const sig = { verificada: 'verificada', invalida: 'NÃO verificada', indisponivel: 'não pôde ser verificada neste navegador' }[this.store.sig.estado];
    return montar({
      intent: 'SOBRE_DADOS', titulo: 'Sobre os dados deste aplicativo',
      blocos: [
        B.kv(null, [
          { rotulo: 'Versão do pacote de dados', valor: String(this.store.versao) },
          { rotulo: 'Gerado em', valor: String(m?.generatedAt ?? '—') },
          { rotulo: 'Assinatura digital (ECDSA P-256)', valor: sig },
          { rotulo: 'Elementos no pacote', valor: String(this.store.elementos.length) },
          { rotulo: 'Compostos no índice', valor: String(this.store.indice.entradas.length) },
          ...(fontesQtd ? [{ rotulo: 'Fontes listadas', valor: String(fontesQtd) }] : [])
        ], FONTE_APP),
        B.texto('A lista completa de fontes, licenças e datas está na tela "Sobre os dados". Todo valor mostrado vem do pacote assinado ou de um cálculo local.')
      ],
      acoes: [rota('/quimica/sobre-os-dados', 'Ver todas as fontes e licenças')],
      sugestoes: ['Quais as fontes?', 'Qual é a massa molar da água?']
    });
  }

  fontes() {
    const lista = Array.isArray(this.store.fontes) ? this.store.fontes : this.store.fontes?.fontes ?? [];
    const itens = lista.filter((f) => f?.nome).map((f) => `${f.nome}${f.licenca ? ` — ${f.licenca}` : ''}`);
    return montar({
      intent: 'FONTES', titulo: 'Fontes dos dados',
      blocos: [itens.length ? B.lista('O pacote de dados usa', itens, FONTE_APP) : B.texto('A lista de fontes está na tela "Sobre os dados".')],
      acoes: [rota('/quimica/sobre-os-dados', 'Sobre os dados')],
      sugestoes: ['De onde vêm os dados?']
    });
  }

  naoEntendi(p) {
    const sug = SUGESTOES_PADRAO;
    return montar({
      intent: 'DESCONHECIDA', resolvida: false, titulo: 'Não entendi a pergunta',
      blocos: [
        B.texto(p.textoOriginal ? `Não entendi "${p.textoOriginal}". Tente citar um elemento, um composto, uma fórmula ou um cálculo, por exemplo:` : 'Escreva sua pergunta, por exemplo:'),
        B.lista(null, sug.slice(0, 5))
      ],
      acoes: [rota('/quimica/tabela', 'Tabela periódica'), rota('/quimica/compostos', 'Buscar compostos'), rota('/quimica/calculadoras', 'Calculadoras')],
      sugestoes: sug.slice(0, 6)
    });
  }

  // ------------------------------------------------------------------------------------------------ elementos e compostos
  itensDoElemento(e) {
    const itens = [];
    for (const prop of this.dic.props.filter((x) => x.alvo === 'elemento' && x.id !== 'simbolo')) {
      const f = formatarValor(prop, valorBruto(prop, e), this.ctx);
      if (f) itens.push({ rotulo: capitalizar(prop.rotulo), valor: f.texto });
    }
    return itens;
  }

  elemento(p) {
    const e = this.store.porSimbolo.get(p.elemento);
    if (!e) return this.naoEntendi(p);
    const fonte = dado(e.fontes?.[0])[0] ?? FONTE_APP;
    const itens = [{ rotulo: 'Nome em inglês', valor: e.nomeEn ?? '—' }, ...this.itensDoElemento(e)].filter((i) => i.valor !== '—');
    const sug = [`Ponto de fusão de ${minus(e.nome)}`, `Configuração eletrônica de ${minus(e.nome)}`].filter((_, i) => (i === 0 ? e.pontoFusaoK != null : !!e.configuracaoEletronica));
    if (e.massaAtomica != null) sug.push(`Massa molar de ${minus(e.nome)}`);
    return montar({
      intent: 'ELEMENTO', titulo: `${e.nome} (${e.simbolo}), elemento ${e.z}`,
      blocos: [B.kv(null, itens, fonte)],
      acoes: [rota(this.rotaElemento(e.simbolo), `Ficha completa de ${e.nome}`), rota('/quimica/tabela', 'Ver na tabela periódica')],
      sugestoes: sug
    });
  }

  async composto(p) {
    const { compostos } = await this.entidades(p);
    const c = compostos[0];
    if (!c) return p.formulas?.length ? this.massaMolarDeFormula(p.formulas[0], p) : this.naoEntendi(p);
    return this.fichaResumida(c, p);
  }

  fichaResumida(c, p) {
    const fonte = dado(c.fontes?.[0])[0] ?? { nome: `PubChem CID ${c.cid} (NCBI/NLM)` };
    const nome = this.nomeComposto(c);
    const itens = [];
    if (c.nomePopular && c.nomePopular !== c.nome) itens.push({ rotulo: 'Nome popular', valor: c.nomePopular });
    if (c.nomeIupac) itens.push({ rotulo: 'Nome IUPAC', valor: c.nomeIupac });
    if (c.formula) itens.push({ rotulo: 'Fórmula', valor: formulaUnicode(c.formula) });
    if (c.massaMolar != null) itens.push({ rotulo: 'Massa molar', valor: formatarValor({ tipo: 'massaMolar' }, c.massaMolar, this.ctx).texto });
    if (c.cas) itens.push({ rotulo: 'Número CAS', valor: c.cas });
    itens.push({ rotulo: 'CID no PubChem', valor: String(c.cid) });
    for (const prop of this.dic.props.filter((x) => x.alvo === 'composto' && ['xlogp', 'doadoresH', 'aceptoresH', 'ligacoesRotaveis', 'carga', 'tpsa'].includes(x.id))) {
      const f = formatarValor(prop, valorBruto(prop, c), this.ctx);
      if (f) itens.push({ rotulo: capitalizar(prop.rotulo), valor: f.texto });
    }
    if (c.classes?.length) itens.push({ rotulo: 'Classes', valor: listar(c.classes.map((x) => CLASSES_PT[x] ?? x.replace(/_/g, ' '))) });
    const blocos = [B.kv(null, itens, fonte)];
    if (c.smiles) blocos.push(B.molecula(c.smiles, nome, fonte));
    const g = descreverGhs(c.ghs, this.store.regras);
    if (g) blocos.push({ tipo: 'ghs', titulo: 'Perigos (GHS)', ...g, fonte: dado(c.ghs.fonte ? { nome: c.ghs.fonte } : fonte, this.fonteFrases()) });
    const defin = this.definicaoChebi(c);
    if (defin) blocos.push({ tipo: 'citacao', texto: defin.texto, aviso: 'Definição em inglês.', fonte: defin.fonte });
    const sug = [`Massa molar de ${minus(nome)}`];
    if (c.ghs) sug.push(`Perigos de ${minus(nome)}`);
    return montar({
      intent: 'COMPOSTO', titulo: `${nome}${c.formula ? ` (${formulaUnicode(c.formula)})` : ''}`,
      blocos,
      acoes: [rota(this.rotaComposto(c.cid), 'Ficha completa'), ...this.acoesIcsc(c)],
      sugestoes: sug,
      extra: { compostoCid: c.cid }
    });
  }

  /** Definição do ChEBI (`definicaoChebi`: texto ou objeto), com a atribuição exigida (CC BY 4.0). */
  definicaoChebi(c) {
    const d = c.definicaoChebi;
    if (!d) return null;
    const texto = typeof d === 'string' ? d : d.texto ?? d.definicao ?? null;
    if (!texto) return null;
    const id = typeof d === 'object' ? d.chebiId ?? d.chebi ?? d.id ?? null : null;
    const url = urlSegura(typeof d === 'object' ? d.url : null) ?? (id && /^(?:CHEBI:)?\d+$/i.test(String(id)) ? `https://www.ebi.ac.uk/chebi/searchId.do?chebiId=${/^\d+$/.test(String(id)) ? `CHEBI:${id}` : id}` : 'https://www.ebi.ac.uk/chebi/');
    return { texto, id, fonte: { nome: id ? `ChEBI (${id})` : 'ChEBI (EMBL-EBI)', url, licenca: (typeof d === 'object' && d.licenca) || 'CC BY 4.0' } };
  }

  acoesIcsc(c, comNome = false) {
    const url = urlSegura(c.icscBuscaUrl ?? this.entradaComposto(c.cid)?.icscBuscaUrl);
    return url ? [{ rotulo: comNome ? `Ficha ICSC de ${this.nomeComposto(c)} no site da OIT` : 'Ficha ICSC no site da OIT', url, externo: true }] : [];
  }

  // ------------------------------------------------------------------------------------------------ propriedades
  async propriedade(p) {
    const ids = p.propriedades?.length ? p.propriedades : p.propriedade ? [p.propriedade] : [];
    const { compostos, elementos } = await this.entidades(p);
    if (!ids.length || (!compostos.length && !elementos.length)) {
      return montar({
        intent: 'PROPRIEDADE', resolvida: false, titulo: 'De qual substância?',
        blocos: [B.texto(ids.length ? `Diga de qual elemento ou composto você quer ${listar(ids.map((i) => this.dic.propPorId.get(i)?.rotulo ?? i))}. Por exemplo: "ponto de fusão do ferro".` : 'Diga qual propriedade e de qual elemento ou composto. Por exemplo: "densidade do ouro".')],
        sugestoes: ['Ponto de fusão do ferro', 'Massa molar da água']
      });
    }
    const linhas = [];
    const ausentes = [];
    const fontes = [];
    for (const id of ids) {
      const prop = this.dic.propPorId.get(id);
      if (!prop) continue;
      const alvos = prop.alvo === 'composto' ? compostos : elementos;
      for (const reg of alvos) {
        const nome = prop.alvo === 'composto' ? this.nomeComposto(reg) : reg.nome;
        let f = formatarValor(prop, valorBruto(prop, reg), this.ctx);
        if (f && prop.id === 'formula') f = { texto: formulaUnicode(String(valorBruto(prop, reg))) };
        if (f) { linhas.push({ rotulo: `${capitalizar(prop.rotulo)} de ${nome}`, valor: f.texto }); fontes.push(dado(reg.fontes?.[0])[0]); }
        else ausentes.push(`${prop.rotulo} de ${nome}`);
      }
      // propriedade de elemento perguntada para um composto (ou o contrário)
      const outros = prop.alvo === 'composto' ? elementos : compostos;
      if (!alvos.length && outros.length) ausentes.push(`${prop.rotulo} (essa propriedade é de ${prop.alvo === 'composto' ? 'compostos' : 'elementos'}; ${outros.map((o) => o.nome ?? this.nomeComposto(o)).join(', ')} ${outros.length > 1 ? 'são' : 'é'} de outro tipo)`);
    }
    const blocos = [];
    if (linhas.length) blocos.push(B.kv(null, linhas, fontes.filter(Boolean).length ? fontes.filter(Boolean) : FONTE_APP));
    if (ausentes.length) blocos.push(B.aviso(`O pacote de dados não tem: ${ausentes.join('; ')}.`));
    const primeiro = elementos[0] ?? compostos[0];
    const acoes = elementos[0] && ids.some((i) => this.dic.propPorId.get(i)?.alvo === 'elemento')
      ? [rota(this.rotaElemento(elementos[0].simbolo), `Ficha de ${elementos[0].nome}`)]
      : compostos[0] ? [rota(this.rotaComposto(compostos[0].cid), `Ficha de ${this.nomeComposto(compostos[0])}`)] : [];
    return montar({
      intent: 'PROPRIEDADE', titulo: linhas.length === 1 ? linhas[0].rotulo : `Propriedades de ${listar([...elementos.map((e) => e.nome), ...compostos.map((c) => this.nomeComposto(c))])}`,
      blocos, acoes,
      sugestoes: primeiro ? [elementos[0] ? `Densidade de ${minus(elementos[0].nome)}` : `Massa molar de ${minus(this.nomeComposto(compostos[0]))}`] : [],
      extra: { alvoPropriedade: elementos.length ? 'elemento' : 'composto' }
    });
  }

  // ------------------------------------------------------------------------------------------------ massa molar
  async massaMolar(p) {
    const { compostos, elementos } = await this.entidades(p);
    if (compostos[0]?.formula) return this.massaMolarDeFormula(compostos[0].formula, p, compostos[0]);
    if (p.formulas?.length) return this.massaMolarDeFormula(p.formulas[0], p);
    if (elementos[0]) {
      const e = elementos[0];
      const r = calcularMassaMolar(e.simbolo, this.ctx);
      if (r.ok) {
        return montar({
          intent: 'MASSA_MOLAR', titulo: `Massa molar: ${e.nome} (${e.simbolo})`,
          blocos: [
            B.resultado(null, r.resultados.slice(0, 1).map((x) => ({ ...x, rotulo: `Massa molar de ${minus(e.nome)} (átomos)` })), dado(e.fontes?.[0])[0] ?? FONTE_CALCULO),
            B.aviso('Para a substância simples molecular, como O₂ ou N₂, digite a fórmula: a massa molar é a do átomo vezes o número de átomos da molécula.')
          ],
          acoes: [rota(`/quimica/calculadoras/massa-molar?f=${encodeURIComponent(e.simbolo)}`, 'Abrir na calculadora')],
          sugestoes: [`Massa molar de ${minus(e.nome)}`]
        });
      }
    }
    return montar({
      intent: 'MASSA_MOLAR', resolvida: false, titulo: 'Massa molar de quê?',
      blocos: [B.texto('Digite a fórmula ou o nome da substância. Por exemplo: "massa molar da água" ou "massa molar de Ca(OH)2".')],
      acoes: [rota('/quimica/calculadoras/massa-molar', 'Calculadora de massa molar')],
      sugestoes: ['Qual é a massa molar da água?']
    });
  }

  massaMolarDeFormula(formula, p, composto = null) {
    const r = calcularMassaMolar(formula, this.ctx);
    if (!r.ok) {
      return montar({ intent: 'MASSA_MOLAR', resolvida: false, titulo: 'Não consegui calcular a massa molar', blocos: [B.aviso(r.erro)], sugestoes: ['Qual é a massa molar da água?'] });
    }
    const nome = composto ? this.nomeComposto(composto) : null;
    const blocos = [
      B.resultado(null, r.resultados.slice(0, 1), r.fontes[0] ? fonteDe(r.fontes[0]) : FONTE_CALCULO),
      B.passos('Como calcular', r.passos),
      B.kv('Composição em massa', r.composicao.map((c) => ({ rotulo: `${c.nome} (${c.simbolo})`, valor: `${fmt(c.percentual, { sig: 4 })} %` })), FONTE_CALCULO)
    ];
    if (composto?.massaMolar != null) {
      blocos.push(B.kv('Valor de referência', [{ rotulo: 'PubChem informa', valor: `${fmt(composto.massaMolar, { sig: 8 })} g/mol` }], dado(composto.fontes?.[0])[0] ?? { nome: `PubChem CID ${composto.cid} (NCBI/NLM)` }));
    }
    if (r.notas.length) blocos.push(B.aviso(r.notas.join(' ')));
    return montar({
      intent: 'MASSA_MOLAR', titulo: `Massa molar${nome ? `: ${nome}` : ''} (${r.formulaUnicode})`,
      blocos,
      acoes: [rota(`/quimica/calculadoras/massa-molar?f=${encodeURIComponent(r.formula)}`, 'Abrir na calculadora')],
      sugestoes: composto ? [`Estrutura de ${minus(nome)}`] : []
    });
  }

  // ------------------------------------------------------------------------------------------------ balanceamento e estequiometria
  balancear(p) {
    if (!p.equacao) {
      return montar({
        intent: 'BALANCEAR', titulo: 'Balanceamento de equações',
        blocos: [B.texto('Digite a equação com os reagentes, uma seta e os produtos. Por exemplo: Fe + O2 -> Fe2O3. Íons também valem: Zn + Cu2+ -> Zn2+ + Cu.')],
        acoes: [rota('/quimica/calculadoras/balanceamento', 'Abrir a calculadora')],
        sugestoes: ['Balancear Fe + O2 -> Fe2O3']
      });
    }
    const r = balancear(p.equacao, { simbolos: this.ctx.simbolos });
    if (!r.ok) {
      return montar({
        intent: 'BALANCEAR', resolvida: false, titulo: 'Não consegui balancear', blocos: [B.aviso(r.erro)],
        acoes: [rota(`/quimica/calculadoras/balanceamento?eq=${encodeURIComponent(p.equacao)}`, 'Ajustar na calculadora')], sugestoes: ['Balancear Fe + O2 -> Fe2O3']
      });
    }
    return montar({
      intent: 'BALANCEAR', titulo: 'Equação balanceada',
      blocos: [
        B.equacao(r.equacaoTex, r.equacao),
        B.passos('Passo a passo', r.passos.slice(0, -1)),
        ...(r.digitouCoeficientes ? [B.aviso('Os coeficientes digitados foram ignorados: o aplicativo balanceia a equação inteira.')] : [])
      ],
      acoes: [rota(`/quimica/calculadoras/balanceamento?eq=${encodeURIComponent(p.equacao)}`, 'Abrir na calculadora')],
      sugestoes: ['Quantos mols há em 18 g de água?'],
      extra: { equacaoBalanceada: r.equacao }
    });
  }

  /** Liga cada "número unidade de X" ao composto/fórmula X: [{especie, valor, unidade}]. */
  async quantidadesComEspecie(original) {
    const out = [];
    for (const x of ligarQuantidades(original, this.dic)) {
      const especie = x.especie ?? (x.cid != null ? (await this.store.composto(x.cid))?.formula : null);
      if (especie) out.push({ especie, valor: x.valor, unidade: x.unidade });
    }
    return out;
  }

  async estequiometria(p) {
    const dados = await this.quantidadesComEspecie(p.textoOriginal);
    const acaoCalc = [rota('/quimica/calculadoras/estequiometria', 'Abrir a calculadora de estequiometria')];
    if (p.equacao) {
      if (!dados.length) {
        const unid = p.quantidades.filter((q) => q.unidade);
        return montar({
          intent: 'ESTEQUIOMETRIA', resolvida: false, titulo: 'Faltam as quantidades',
          blocos: [B.texto(unid.length ? 'Diga a quantidade de cada reagente com o nome ou a fórmula, por exemplo "4 g de H2 e 16 g de O2".' : 'Informe a quantidade de pelo menos um reagente, por exemplo "4 g de H2 e 16 g de O2".')],
          acoes: acaoCalc, sugestoes: ['Quantos mols há em 18 g de água?']
        });
      }
      const r = calcularEstequiometria({ equacao: p.equacao, dados }, this.ctx);
      if (!r.ok) return montar({ intent: 'ESTEQUIOMETRIA', resolvida: false, titulo: 'Não consegui calcular', blocos: [B.aviso(r.erro)], acoes: acaoCalc, sugestoes: [] });
      return montar({
        intent: 'ESTEQUIOMETRIA', titulo: `Estequiometria: ${r.equacao}`,
        blocos: [B.resultado(null, r.resultados), B.passos('Passo a passo', r.passos), ...(r.notas.length ? [B.aviso(r.notas.join(' '))] : [])],
        acoes: acaoCalc, sugestoes: ['Balancear Fe + O2 -> Fe2O3']
      });
    }
    // uma substância: massa ↔ mol ↔ partículas ↔ volume
    const q = dados[0] ?? await (async () => {
      const u = p.quantidades.find((x) => x.unidade && x.unidade !== '%');
      const formula = await this.formulaDoAlvo(p);
      return u && formula ? { especie: formula, valor: u.valor, unidade: u.unidade } : null;
    })();
    if (q) {
      const r = converterQuantidade({ formula: q.especie, valor: q.valor, unidade: q.unidade }, this.ctx);
      if (!r.ok) return montar({ intent: 'ESTEQUIOMETRIA', resolvida: false, titulo: 'Não consegui calcular', blocos: [B.aviso(r.erro)], acoes: acaoCalc, sugestoes: [] });
      return montar({
        intent: 'ESTEQUIOMETRIA', titulo: `${fmt(q.valor, { sig: 6 })} ${q.unidade === 'particulas' ? 'partículas' : q.unidade} de ${formulaUnicode(r.formula)}`,
        blocos: [B.resultado(null, r.resultados), B.passos('Passo a passo', r.passos), ...(r.notas.length ? [B.aviso(r.notas.join(' '))] : [])],
        acoes: [rota(`/quimica/calculadoras/estequiometria?f=${encodeURIComponent(r.formula)}&v=${q.valor}&u=${encodeURIComponent(q.unidade)}`, 'Abrir na calculadora')],
        sugestoes: ['Balancear Fe + O2 -> Fe2O3']
      });
    }
    const mol = p.quantidades.find((x) => x.unidade && acharUnidade(this.ctx.unidades, x.unidade).some((u) => u.grupo === 'quantidade'));
    const vm = this.ctx.volumeMolarCNTP();
    if (mol && vm && /\b(?:cntp|condicoes normais|volume)\b/.test(normalizar(p.textoOriginal))) {
      const nMol = paraBase(this.ctx.unidades, mol.unidade, 'quantidade', mol.valor);
      const L = nMol * vm.valor * 1000;
      return montar({
        intent: 'ESTEQUIOMETRIA', titulo: `Volume de ${fmt(mol.valor, { sig: 6 })} ${mol.unidade} de um gás ideal nas CNTP`,
        blocos: [
          B.resultado(null, [{ rotulo: 'Volume nas CNTP (0 °C e 1 atm)', valor: fmt(L, { sig: 6 }), unidade: 'L', destaque: true }, { rotulo: 'Volume molar (RT/P)', valor: fmt(vm.valor * 1000, { sig: 6 }), unidade: 'L/mol' }], { nome: 'Cálculo local com a constante R do pacote (CODATA)' }),
          B.passos('Como calcular', [{ texto: 'Pela equação dos gases ideais, o volume molar é Vm = RT/P, com T = 0 °C e P = 1 atm; multiplique pela quantidade de matéria.', tex: `V = n\\dfrac{RT}{P} = ${fmtTex(nMol, { sig: 6 })} \\times ${fmtTex(vm.valor * 1000, { sig: 6 })}\\ \\mathrm{L/mol} = ${fmtTex(L, { sig: 6 })}\\ \\mathrm{L}` }])
        ],
        acoes: [rota('/quimica/calculadoras/gas-ideal', 'Abrir a calculadora de gás ideal')], sugestoes: ['Quantos mols há em 18 g de água?']
      });
    }
    return montar({
      intent: 'ESTEQUIOMETRIA', resolvida: false, titulo: 'Estequiometria',
      blocos: [B.texto('Para converter massa, mol, partículas e volume, diga a quantidade e a substância, por exemplo "quantos mols há em 18 g de água?". Para reagente limitante, escreva a equação e as quantidades.')],
      acoes: acaoCalc, sugestoes: ['Quantos mols há em 18 g de água?']
    });
  }

  // ------------------------------------------------------------------------------------------------ concentração, pH, gás
  async formulaDoAlvo(p) {
    if (p.compostos?.length) return (await this.store.composto(p.compostos[0]))?.formula ?? null;
    if (p.formulas?.length) return p.formulas[0];
    if (p.elementos?.length) return p.elementos[0];
    return null;
  }

  async concentracao(p) {
    const calc = [rota('/quimica/calculadoras/concentracao', 'Abrir a calculadora')];
    const q = p.quantidades.filter((x) => x.unidade);
    const grupoDe = (u) => acharUnidade(this.ctx.unidades, u)[0]?.grupo;
    const massas = q.filter((x) => grupoDe(x.unidade) === 'massa');
    const volumes = q.filter((x) => grupoDe(x.unidade) === 'volume');
    const concs = q.filter((x) => x.unidade === 'g/L' || grupoDe(x.unidade) === 'concentracao');
    const formula = await this.formulaDoAlvo(p);
    const n = normalizar(p.textoOriginal);
    let entrada = null;
    if (/\b(?:dilu\w*|c1v1|c1 v1)\b/.test(n) && concs.length >= 1 && volumes.length >= 1 && concs.length + volumes.length >= 3) {
      const unidadeC = concs[0].unidade;
      const unidadeV = volumes[0].unidade;
      entrada = { modo: 'diluicao', C1: concs[0].valor, V1: volumes[0].valor, C2: concs[1]?.valor ?? null, V2: volumes[1]?.valor ?? null, unidadeC, unidadeV };
    } else if (formula && concs.length && volumes.length && !massas.length) {
      entrada = { modo: 'massa', formula, concentracao: { valor: concs[0].valor, unidade: concs[0].unidade }, volume: volumes[0] };
    } else if (formula && massas.length && volumes.length) {
      entrada = { modo: 'molaridade', formula, massa: massas[0], volume: volumes[0] };
    } else if (formula && concs.length === 1 && !volumes.length && !massas.length && (concs[0].unidade === 'g/L' || grupoDe(concs[0].unidade) === 'concentracao')) {
      entrada = { modo: 'gl-mol', formula, valor: concs[0].unidade === 'g/L' ? concs[0].valor : concs[0].valor * (acharUnidade(this.ctx.unidades, concs[0].unidade)[0]?.fator ?? 1000) / 1000, de: concs[0].unidade === 'g/L' ? 'g/L' : 'mol/L' };
    } else if (!formula && massas.length >= 2 && /\bmassa|percent|porcent|titulo\b/.test(n)) {
      entrada = { modo: 'percentual-mm', soluto: massas[0], solucao: massas[1] };
    }
    if (!entrada) {
      return montar({
        intent: 'CONCENTRACAO', resolvida: false, titulo: 'Concentração e diluição',
        blocos: [B.texto('Diga os valores com unidades. Exemplos: "molaridade de 5,85 g de NaCl em 500 mL", "quantos gramas de NaOH para 250 mL de solução 0,1 mol/L" ou "diluir 100 mL de solução 2 mol/L para 0,5 mol/L".')],
        acoes: calc, sugestoes: ['Molaridade de 5,85 g de NaCl em 500 mL']
      });
    }
    const r = calcularConcentracao(entrada, this.ctx);
    if (!r.ok) return montar({ intent: 'CONCENTRACAO', resolvida: false, titulo: 'Não consegui calcular', blocos: [B.aviso(r.erro)], acoes: calc, sugestoes: [] });
    return montar({
      intent: 'CONCENTRACAO', titulo: MODO_TITULO[r.modo] ?? 'Concentração',
      blocos: [B.resultado(null, r.resultados, r.fontes?.[0] ? fonteDe(r.fontes[0]) : FONTE_CALCULO), B.passos('Passo a passo', r.passos), ...(r.notas.length ? [B.aviso(r.notas.join(' '))] : [])],
      acoes: calc, sugestoes: ['pH de HCl 0,01 mol/L']
    });
  }

  /** Ácido ou base forte conhecido pelo pacote (`acidosFortes`/`basesFortes`, ou `acidosBases`) ou pela lista padrão: {tipo, n, parcial}. */
  regraAcidoBase(formula) {
    const regras = this.store.regras;
    const k = chaveFormula(formula);
    const doPacote = [
      ...(Array.isArray(regras?.acidosFortes) ? regras.acidosFortes.map((x) => ({ ...x, tipo: 'acido' })) : []),
      ...(Array.isArray(regras?.basesFortes) ? regras.basesFortes.map((x) => ({ ...x, tipo: 'base' })) : []),
      ...(Array.isArray(regras?.acidosBases) ? regras.acidosBases : [])
    ];
    const r = (doPacote.length ? doPacote : REGRAS_ACIDOS_BASES_PADRAO).find((x) => chaveFormula(x.formula) === k);
    if (!r) return null;
    const parcial = /1[ªa]\s*ioniza/i.test(r.nota ?? '');
    const hidrogenios = tentarFormula(r.formula)?.atomos.get('H') ?? 1; // H ionizáveis (ácidos) ou OH (hidróxidos: todos os H são de OH)
    return { ...r, n: r.n ?? (parcial ? 1 : hidrogenios), parcial };
  }

  async ph(p) {
    const calc = [rota('/quimica/calculadoras/ph', 'Abrir a calculadora de pH')];
    const q = p.quantidades.filter((x) => x.unidade);
    const grupoDe = (u) => acharUnidade(this.ctx.unidades, u)[0]?.grupo;
    const conc = q.find((x) => grupoDe(x.unidade) === 'concentracao');
    const formula = await this.formulaDoAlvo(p);
    const k = p.constantes ?? {};
    let C = null;
    if (conc) C = paraBase(this.ctx.unidades, conc.unidade, 'concentracao', conc.valor) / 1000;
    else if (q.find((x) => x.unidade === 'g/L') && formula) {
      const g = q.find((x) => x.unidade === 'g/L');
      const m = calcularMassaMolar(formula, this.ctx);
      if (m.ok) C = g.valor / m.massaMolar;
    }
    const n = normalizar(p.textoOriginal);
    // conversão: "pH 3" sem concentração
    const solto = p.quantidades.find((x) => !x.unidade);
    if (C == null && solto && !Object.keys(k).length && /\b(?:ph|poh)\b/.test(n)) {
      const poh = /\bpoh\b/.test(n);
      const r = calcularPH(poh ? { tipo: 'converter', pOH: solto.valor } : { tipo: 'converter', pH: solto.valor }, this.ctx);
      if (r.ok) return this.respostaPh(r, `Conversões a partir de ${poh ? 'pOH' : 'pH'} = ${fmt(solto.valor)}`, calc);
    }
    if (C == null) {
      return montar({
        intent: 'PH', resolvida: false, titulo: 'pH de uma solução',
        blocos: [B.texto('Informe a concentração em mol/L e a substância. Exemplos: "pH de HCl 0,01 mol/L" ou "pH do ácido acético 0,1 mol/L com Ka 1,8e-5".')],
        acoes: calc, sugestoes: ['pH de HCl 0,01 mol/L']
      });
    }
    let entrada = null;
    const regra = formula ? this.regraAcidoBase(formula) : null;
    if (k.Ka != null || k.pKa != null) entrada = { tipo: 'acido-fraco', C, Ka: k.Ka, pKa: k.pKa };
    else if (k.Kb != null || k.pKb != null) entrada = { tipo: 'base-fraca', C, Kb: k.Kb, pKb: k.pKb };
    else if (regra) entrada = { tipo: regra.tipo === 'acido' ? 'acido-forte' : 'base-forte', C, n: regra.n ?? 1 };
    if (!entrada) {
      return montar({
        intent: 'PH', resolvida: false, titulo: 'Preciso de mais dados para o pH',
        blocos: [B.texto(`${formula ? `Não tenho "${formatarFormulaTexto(formula)}" na lista de ácidos e bases fortes do pacote. ` : ''}Para ácidos e bases fracos, informe Ka (ou pKa) ou Kb (ou pKb); para fortes, escreva a fórmula, por exemplo HCl ou NaOH.`)],
        acoes: calc, sugestoes: ['pH de HCl 0,01 mol/L']
      });
    }
    const r = calcularPH(entrada, this.ctx);
    if (r.ok && regra?.parcial) r.notas.unshift('Só a 1ª ionização é forte; a 2ª é parcial e foi ignorada (aproximação).');
    if (!r.ok) return montar({ intent: 'PH', resolvida: false, titulo: 'Não consegui calcular o pH', blocos: [B.aviso(r.erro)], acoes: calc, sugestoes: [] });
    const titulo = `pH ${fmt(r.pH, { casas: 2 })}${formula ? ` (${formulaUnicode(formula)} ${fmt(C, { sig: 4 })} mol/L)` : ''}`;
    return this.respostaPh(r, titulo, calc, regra ? this.fonteRegras() : null);
  }

  respostaPh(r, titulo, acoes, fonteRegra = null) {
    return montar({
      intent: 'PH', titulo,
      blocos: [B.resultado(null, r.resultados, fonteRegra ? [FONTE_CALCULO, fonteRegra] : FONTE_CALCULO), B.passos('Passo a passo', r.passos), ...(r.notas.length ? [B.aviso(r.notas.join(' '))] : [])],
      acoes, sugestoes: ['Quantos mols há em 18 g de água?']
    });
  }

  async gas(p) {
    const calc = [rota('/quimica/calculadoras/gas-ideal', 'Abrir a calculadora de gás ideal')];
    const q = p.quantidades.filter((x) => x.unidade);
    const por = (g) => q.find((x) => acharUnidade(this.ctx.unidades, x.unidade).some((u) => u.grupo === g));
    const P = por('pressao'); const V = por('volume'); const T = por('temperatura'); const N = por('quantidade');
    const massa = por('massa');
    const formula = await this.formulaDoAlvo(p);
    // lei de Boyle: dois estados, mesma temperatura e mesma quantidade de gás
    const pressoes = q.filter((x) => acharUnidade(this.ctx.unidades, x.unidade).some((u) => u.grupo === 'pressao'));
    const volumesQ = q.filter((x) => acharUnidade(this.ctx.unidades, x.unidade).some((u) => u.grupo === 'volume'));
    if (!T && !N && !massa && pressoes.length + volumesQ.length === 3 && pressoes.length >= 1 && volumesQ.length >= 1) {
      const dd = (x) => (x ? { valor: x.valor, unidade: x.unidade } : null);
      const rb = calcularBoyle({ P1: dd(pressoes[0]), V1: dd(volumesQ[0]), P2: dd(pressoes[1]), V2: dd(volumesQ[1]) }, this.ctx);
      if (rb.ok) {
        return montar({
          intent: 'GAS_IDEAL', titulo: `${rb.resultados[0].rotulo}: ${rb.resultados[0].valor} ${rb.unidade}`,
          blocos: [B.resultado(null, rb.resultados, FONTE_CALCULO), B.passos('Passo a passo', rb.passos), B.aviso(rb.notas.join(' '))],
          acoes: calc, sugestoes: ['Converter 5 atm em kPa']
        });
      }
    }
    const dados = { P, V, T, n: N };
    let falta = ['P', 'V', 'T', 'n'].filter((k) => !dados[k]);
    if (falta.includes('n') && massa && formula) falta = falta.filter((k) => k !== 'n');
    if (falta.length === 4 && !q.length) {
      const R = this.ctx.gasR();
      return montar({
        intent: 'GAS_IDEAL', titulo: 'Gás ideal: PV = nRT',
        blocos: [
          B.equacao('PV = nRT', 'PV = nRT'),
          B.lista('Na equação', ['P é a pressão, V é o volume, n é a quantidade de matéria (em mol) e T é a temperatura absoluta (em kelvin).', R ? `R é a constante universal dos gases: ${fmt(R.valor, { sig: 10 })} J/(mol·K), valor do pacote de dados (${R.fonte?.nome ?? 'CODATA'}).` : 'R é a constante universal dos gases.'], R ? dado(R.fonte)[0] ?? FONTE_APP : FONTE_APP),
          B.texto('Informe três das quatro grandezas com unidades e eu calculo a quarta, com os passos.')
        ],
        acoes: calc, sugestoes: ['Qual o volume de 2 mols de gás a 300 K e 1 atm?']
      });
    }
    if (falta.length !== 1) {
      return montar({
        intent: 'GAS_IDEAL', resolvida: false, titulo: 'Gás ideal (PV = nRT)',
        blocos: [B.texto('Informe três das quatro grandezas (pressão, volume, quantidade de matéria e temperatura) com unidades. Exemplo: "qual o volume de 2 mols de gás a 300 K e 1 atm?".')],
        acoes: calc, sugestoes: ['Qual o volume de 2 mols de gás a 300 K e 1 atm?']
      });
    }
    const alvo = falta[0];
    const entrada = { resolver: alvo };
    if (P) entrada.P = { valor: P.valor, unidade: P.unidade };
    if (V) entrada.V = { valor: V.valor, unidade: V.unidade };
    if (T) entrada.T = { valor: T.valor, unidade: T.unidade };
    if (N) entrada.n = { valor: N.valor, unidade: N.unidade };
    else if (massa) { entrada.massa = { valor: massa.valor, unidade: massa.unidade }; entrada.formula = formula; }
    const r = calcularGas(entrada, this.ctx);
    if (!r.ok) return montar({ intent: 'GAS_IDEAL', resolvida: false, titulo: 'Não consegui calcular', blocos: [B.aviso(r.erro)], acoes: calc, sugestoes: [] });
    return montar({
      intent: 'GAS_IDEAL', titulo: `${r.resultados[0].rotulo}: ${r.resultados[0].valor} ${r.resultados[0].unidade}`,
      blocos: [B.resultado(null, r.resultados, r.fontes?.[0] ? fonteDe(r.fontes[0]) : FONTE_CALCULO), B.passos('Passo a passo', r.passos), B.aviso(r.notas.join(' '))],
      acoes: calc, sugestoes: ['Converter 5 atm em kPa']
    });
  }

  conversao(p) {
    const q = p.quantidades.find((x) => x.unidade);
    const calc = [rota('/quimica/calculadoras/unidades', 'Abrir o conversor de unidades')];
    if (!q || !p.unidadeDestino) {
      return montar({ intent: 'CONVERSAO_UNIDADE', resolvida: false, titulo: 'Conversão de unidades', blocos: [B.texto('Diga o valor, a unidade e a unidade de destino. Exemplo: "converter 5 atm em kPa".')], acoes: calc, sugestoes: ['Converter 5 atm em kPa'] });
    }
    const r = converter(q.valor, q.unidade, p.unidadeDestino, this.ctx.unidades);
    if (!r.ok) return montar({ intent: 'CONVERSAO_UNIDADE', resolvida: false, titulo: 'Não consegui converter', blocos: [B.aviso(r.erro)], acoes: calc, sugestoes: ['Converter 5 atm em kPa'] });
    return montar({
      intent: 'CONVERSAO_UNIDADE', titulo: `${fmt(r.valor, { sig: 8 })} ${r.de} = ${fmt(r.resultado, { sig: 8 })} ${r.para}`,
      blocos: [B.resultado(null, [{ rotulo: `${fmt(r.valor, { sig: 8 })} ${r.de} em ${r.para}`, valor: fmt(r.resultado, { sig: 8 }), unidade: r.para, destaque: true }], { nome: `Tabela de unidades: ${r.origem}` }), B.passos('Como converter', r.passos, { nome: `Tabela de unidades: ${r.origem}` })],
      acoes: calc, sugestoes: ['Converter 5 atm em kPa']
    });
  }

  // ------------------------------------------------------------------------------------------------ nomenclatura, estrutura, comparação
  async nomenclatura(p) {
    const { compostos } = await this.entidades(p);
    const c = compostos[0];
    if (!c) {
      return montar({
        intent: 'NOMENCLATURA', resolvida: false, titulo: 'Nomenclatura',
        blocos: [B.aviso(`${p.formulas?.length ? `Não encontrei "${p.formulas[0]}" entre os compostos do pacote.` : 'Não encontrei esse composto.'} Tente o nome comum ou a fórmula.`)],
        acoes: [rota('/quimica/compostos', 'Buscar compostos')], sugestoes: ['Qual a fórmula do ácido sulfúrico?']
      });
    }
    const fonte = dado(c.fontes?.[0])[0] ?? { nome: `PubChem CID ${c.cid} (NCBI/NLM)` };
    const nome = this.nomeComposto(c);
    const itens = [{ rotulo: 'Nome', valor: nome }];
    if (c.nomePopular && c.nomePopular !== c.nome) itens.push({ rotulo: 'Nome popular', valor: c.nomePopular });
    if (c.nomeIupac) itens.push({ rotulo: 'Nome IUPAC', valor: c.nomeIupac });
    if (c.formula) itens.push({ rotulo: 'Fórmula', valor: formulaUnicode(c.formula) });
    if (c.formulaHill && c.formulaHill !== c.formula) itens.push({ rotulo: 'Fórmula na notação de Hill', valor: formulaUnicode(c.formulaHill) });
    if (c.nomePtPendente) itens.push({ rotulo: 'Observação', valor: 'O nome em português ainda está pendente; o nome mostrado é o IUPAC.' });
    return montar({
      intent: 'NOMENCLATURA', titulo: `${nome}${c.formula ? ` — ${formulaUnicode(c.formula)}` : ''}`,
      blocos: [B.kv(null, itens, fonte)],
      acoes: [rota(this.rotaComposto(c.cid), 'Ficha completa')], sugestoes: [`Estrutura de ${minus(nome)}`]
    });
  }

  async desenhar(p) {
    const { compostos } = await this.entidades(p);
    const c = compostos[0];
    if (!c) return this.naoEntendi(p);
    const nome = this.nomeComposto(c);
    const fonte = dado(c.fontes?.[0])[0] ?? { nome: `PubChem CID ${c.cid} (NCBI/NLM)` };
    if (!c.smiles) {
      return montar({ intent: 'DESENHAR', resolvida: true, titulo: `Estrutura de ${nome}`, blocos: [B.aviso('O pacote de dados não tem o SMILES desse composto, então não consigo desenhar a estrutura.')], acoes: [rota(this.rotaComposto(c.cid), 'Ficha completa')], sugestoes: [] });
    }
    return montar({
      intent: 'DESENHAR', titulo: `Estrutura 2D de ${nome}`,
      blocos: [B.molecula(c.smiles, nome, fonte), B.kv(null, [{ rotulo: 'SMILES', valor: c.smiles }, ...(c.formula ? [{ rotulo: 'Fórmula', valor: formulaUnicode(c.formula) }] : [])], fonte)],
      acoes: [rota(this.rotaComposto(c.cid), 'Ficha completa')], sugestoes: [`Massa molar de ${minus(nome)}`]
    });
  }

  async comparar(p) {
    const { compostos, elementos } = await this.entidades(p);
    if (elementos.length >= 2 && !compostos.length) {
      const props = this.dic.props.filter((x) => x.alvo === 'elemento' && !['simbolo', 'descoberta'].includes(x.id));
      const linhas = props.map((pr) => [capitalizar(pr.rotulo), ...elementos.map((e) => formatarValor(pr, valorBruto(pr, e), this.ctx)?.curto ?? '—')]).filter((l) => l.slice(1).some((x) => x !== '—'));
      return montar({
        intent: 'COMPARAR', titulo: `Comparação: ${listar(elementos.map((e) => e.nome))}`,
        blocos: [B.tabela(null, ['Propriedade', ...elementos.map((e) => `${e.nome} (${e.simbolo})`)], linhas, dado(...elementos.map((e) => e.fontes?.[0]))[0] ?? FONTE_APP)],
        acoes: elementos.map((e) => rota(this.rotaElemento(e.simbolo), `Ficha de ${e.nome}`)), sugestoes: []
      });
    }
    if (compostos.length >= 2 && !elementos.length) {
      const linhas = [
        ['Fórmula', ...compostos.map((c) => (c.formula ? formulaUnicode(c.formula) : '—'))],
        ['Massa molar', ...compostos.map((c) => (c.massaMolar != null ? `${fmt(c.massaMolar, { sig: 8 })} g/mol` : '—'))],
        ['Número CAS', ...compostos.map((c) => c.cas ?? '—')],
        ['Nome IUPAC', ...compostos.map((c) => c.nomeIupac ?? '—')],
        ['XLogP', ...compostos.map((c) => (c.propriedades?.xlogp != null ? fmt(c.propriedades.xlogp, { sig: 5 }) : '—'))],
        ['Palavra de sinal (GHS)', ...compostos.map((c) => descreverGhs(c.ghs)?.palavraSinal ?? '—')],
        ['Pictogramas (GHS)', ...compostos.map((c) => (c.ghs?.pictogramas?.length ? c.ghs.pictogramas.join(', ') : '—'))]
      ].filter((l) => l.slice(1).some((x) => x !== '—'));
      return montar({
        intent: 'COMPARAR', titulo: `Comparação: ${listar(compostos.map((c) => this.nomeComposto(c)))}`,
        blocos: [B.tabela(null, ['', ...compostos.map((c) => this.nomeComposto(c))], linhas, dado(...compostos.map((c) => c.fontes?.[0]))[0] ?? FONTE_APP)],
        acoes: compostos.map((c) => rota(this.rotaComposto(c.cid), `Ficha de ${this.nomeComposto(c)}`)), sugestoes: []
      });
    }
    return montar({
      intent: 'COMPARAR', resolvida: false, titulo: 'Comparar',
      blocos: [B.texto('Compare itens do mesmo tipo: dois elementos ("compare sódio e cloro") ou dois compostos ("diferença entre etanol e ácido acético").')],
      sugestoes: ['Compare sódio e cloro']
    });
  }

  // ------------------------------------------------------------------------------------------------ tabela periódica
  filtrarElementos(p) {
    const METAIS = new Set(['metal_alcalino', 'metal_alcalino_terroso', 'metal_transicao', 'metal_pos_transicao', 'lantanideo', 'actinideo']);
    return this.store.elementos.filter((e) => {
      if (p.grupo != null && e.grupo !== p.grupo) return false;
      if (p.periodo != null && e.periodo !== p.periodo) return false;
      if (p.bloco && e.bloco !== p.bloco) return false;
      if (p.categoria === 'metal' && !METAIS.has(e.categoria)) return false;
      if (p.categoria && p.categoria !== 'metal' && e.categoria !== p.categoria) return false;
      if (p.estado && estadoChave(e.estadoPadrao) !== p.estado) return false;
      return true;
    });
  }

  tabela(p) {
    const fonte = dado(this.store.elementos.find((e) => e.fontes?.length)?.fontes[0])[0] ?? FONTE_APP;
    const acao = [rota('/quimica/tabela', 'Abrir a tabela periódica')];
    const prop = p.propriedade ? this.dic.propPorId.get(p.propriedade) : null;
    const propEl = prop?.alvo === 'elemento' ? prop : null;
    if (p.extremo) {
      const [id, dir] = p.extremo;
      const pr = this.dic.propPorId.get(id);
      const com = this.store.elementos.map((e) => ({ e, v: valorBruto(pr, e) })).filter((x) => typeof x.v === 'number' && Number.isFinite(x.v));
      if (!com.length) return montar({ intent: 'TABELA_PERIODICA', resolvida: true, titulo: capitalizar(pr.rotulo), blocos: [B.aviso(`O pacote não tem ${pr.rotulo} para os elementos carregados.`)], acoes: acao, sugestoes: [] });
      com.sort((a, b) => (dir === 'max' ? b.v - a.v : a.v - b.v) || a.e.z - b.e.z);
      const top = com.slice(0, 5);
      return montar({
        intent: 'TABELA_PERIODICA', titulo: `${dir === 'max' ? 'Maior' : 'Menor'} ${pr.rotulo} no pacote: ${top[0].e.nome} (${top[0].e.simbolo})`,
        blocos: [B.tabela(`Entre os ${com.length} elementos com esse dado no pacote`, ['Elemento', 'Símbolo', capitalizar(pr.rotulo)], top.map((x) => [x.e.nome, x.e.simbolo, formatarValor(pr, x.v, this.ctx).curto]), fonte)],
        acoes: acao, sugestoes: ['Elementos do grupo 17']
      });
    }
    if (p.tendencia && propEl) return this.tendencia(p, propEl, fonte, acao);
    const lista = this.filtrarElementos(p);
    const criterios = [];
    if (p.grupo != null) criterios.push(`grupo ${p.grupo}`);
    if (p.periodo != null) criterios.push(`período ${p.periodo}`);
    if (p.bloco) criterios.push(`bloco ${p.bloco}`);
    if (p.categoria) criterios.push(p.categoria === 'metal' ? 'metais' : CATEGORIA_GRUPO_PLURAL[p.categoria] ?? categoriaRotulo(p.categoria));
    if (p.estado) criterios.push(`estado ${estadoRotulo(p.estado)}`);
    const titulo = criterios.length ? `Elementos: ${criterios.join(', ')}` : 'Tabela periódica';
    if (!criterios.length) {
      return montar({
        intent: 'TABELA_PERIODICA', titulo,
        blocos: [B.texto(`O pacote tem ${this.store.elementos.length} ${plural(this.store.elementos.length, 'elemento', 'elementos')} organizados por grupo, período e bloco, com cores por categoria. Toque num elemento para ver a ficha completa.`)],
        acoes: acao, sugestoes: ['Elementos do grupo 17', 'Elementos do período 3']
      });
    }
    if (!lista.length) {
      return montar({ intent: 'TABELA_PERIODICA', titulo, blocos: [B.aviso('Nenhum elemento do pacote atende a esses critérios.')], acoes: acao, sugestoes: ['Elementos do grupo 17'] });
    }
    const colProp = propEl ?? this.dic.propPorId.get('massaAtomica');
    const qs = new URLSearchParams();
    if (p.grupo != null) qs.set('grupo', p.grupo);
    if (p.periodo != null) qs.set('periodo', p.periodo);
    if (p.bloco) qs.set('bloco', p.bloco);
    if (p.categoria && p.categoria !== 'metal') qs.set('categoria', p.categoria);
    if (p.estado) qs.set('estado', p.estado);
    return montar({
      intent: 'TABELA_PERIODICA', titulo: `${titulo} (${lista.length})`,
      blocos: [B.tabela(null, ['Nº', 'Símbolo', 'Nome', capitalizar(colProp.rotulo)], lista.map((e) => [String(e.z), e.simbolo, e.nome, formatarValor(colProp, valorBruto(colProp, e), this.ctx)?.curto ?? '—']), fonte)],
      acoes: [rota(`/quimica/tabela?${qs}`, 'Destacar na tabela periódica')], sugestoes: ['Elemento mais eletronegativo']
    });
  }

  tendencia(p, pr, fonte, acao) {
    const els = this.store.elementos.filter((e) => typeof valorBruto(pr, e) === 'number');
    const porPeriodo = new Map();
    const porGrupo = new Map();
    for (const e of els) {
      if (e.periodo != null) (porPeriodo.get(e.periodo) ?? porPeriodo.set(e.periodo, []).get(e.periodo)).push(e);
      if (e.grupo != null) (porGrupo.get(e.grupo) ?? porGrupo.set(e.grupo, []).get(e.grupo)).push(e);
    }
    const melhor = (mapa, prefer) => (prefer != null && (mapa.get(prefer)?.length ?? 0) >= 2 ? prefer : [...mapa].filter(([, l]) => l.length >= 2).sort((a, b) => b[1].length - a[1].length || a[0] - b[0])[0]?.[0] ?? null);
    const per = melhor(porPeriodo, p.periodo);
    const gr = melhor(porGrupo, p.grupo);
    const blocos = [];
    if (per != null) blocos.push(B.tabela(`Período ${per}, da esquerda para a direita (número atômico crescente)`, ['Elemento', 'Grupo', capitalizar(pr.rotulo)], porPeriodo.get(per).sort((a, b) => a.z - b.z).map((e) => [`${e.nome} (${e.simbolo})`, String(e.grupo ?? '—'), formatarValor(pr, valorBruto(pr, e), this.ctx).curto]), fonte));
    if (gr != null) blocos.push(B.tabela(`Grupo ${gr}, de cima para baixo (período crescente)`, ['Elemento', 'Período', capitalizar(pr.rotulo)], porGrupo.get(gr).sort((a, b) => a.periodo - b.periodo).map((e) => [`${e.nome} (${e.simbolo})`, String(e.periodo), formatarValor(pr, valorBruto(pr, e), this.ctx).curto]), fonte));
    if (!blocos.length) blocos.push(B.aviso(`O pacote não tem ${pr.rotulo} para elementos suficientes de um mesmo período ou grupo.`));
    return montar({
      intent: 'TABELA_PERIODICA', titulo: `Tendência: ${pr.rotulo}`,
      blocos: [B.texto('Valores do pacote de dados ao longo de um período e de um grupo; compare as linhas para ver a tendência.'), ...blocos],
      acoes: acao, sugestoes: ['Elemento mais eletronegativo']
    });
  }

  // ------------------------------------------------------------------------------------------------ segurança
  incompatibilidade(a, b) {
    const lista = this.store.regras?.incompatibilidades;
    if (!Array.isArray(lista)) return null;
    const nomes = (c) => [c.nome, c.nomePopular, c.nomeIupac, ...(c.sinonimos ?? [])].filter(Boolean).map(normalizar);
    const na = nomes(a);
    const nb = nomes(b);
    const tem = (ns, alvo) => ns.some((n) => n === normalizar(alvo) || n.includes(normalizar(alvo)) || normalizar(alvo).includes(n));
    return lista.find((r) => (tem(na, r.a) && tem(nb, r.b)) || (tem(na, r.b) && tem(nb, r.a))) ?? null;
  }

  blocoGhs(c) {
    const g = descreverGhs(c.ghs, this.store.regras);
    const nome = this.nomeComposto(c);
    const fonteC = dado(c.fontes?.[0])[0] ?? { nome: `PubChem CID ${c.cid} (NCBI/NLM)` };
    if (!g) {
      return B.aviso(`O pacote não traz classificação de perigo GHS (harmonizada) para ${nome}. Isso não quer dizer que seja inofensivo: consulte a ficha de segurança do produto.`, fonteC);
    }
    return { tipo: 'ghs', titulo: `Perigos de ${nome} (GHS)`, ...g, fonte: dado(c.ghs.fonte ? { nome: c.ghs.fonte } : fonteC, this.fonteFrases()) };
  }

  async seguranca(p) {
    const { compostos, elementos } = await this.entidades(p);
    const blocos = [];
    const acoes = [];
    if (p.mistura && compostos.length >= 2) {
      const reg = this.incompatibilidade(compostos[0], compostos[1]);
      const nomes = compostos.slice(0, 2).map((c) => this.nomeComposto(c));
      if (reg) blocos.push(B.aviso(`Não misture ${nomes[0]} com ${nomes[1]}. ${reg.motivo}`, this.fonteRegras()));
      else blocos.push(B.aviso(`Não misture ${nomes[0]} com ${nomes[1]}: misturar produtos químicos pode gerar calor, gases tóxicos ou outras reações perigosas. Veja os perigos de cada um abaixo e nunca misture produtos de limpeza.`));
    }
    for (const c of compostos.slice(0, 3)) {
      blocos.push(this.blocoGhs(c));
      acoes.push(...this.acoesIcsc(c, compostos.length > 1));
    }
    for (const e of elementos.slice(0, 2)) {
      blocos.push(B.aviso(`O pacote traz a classificação de perigo (GHS) apenas de compostos, não do elemento ${e.nome}. Os perigos dependem da forma química (por exemplo, o vapor do metal ou um sal): consulte a ficha de segurança do produto.`, dado(e.fontes?.[0])[0] ?? FONTE_APP));
    }
    blocos.push(B.lista('Orientação geral de segurança', ORIENTACAO_GERAL, { nome: 'Orientação geral do aplicativo (não é dado de uma substância específica)' }));
    if (!compostos.length && !elementos.length) {
      blocos.unshift(B.texto('Não identifiquei a substância. Diga o nome ou a fórmula para ver os perigos do GHS, ou siga a orientação geral abaixo.'));
    }
    acoes.push(rota('/quimica/seguranca', 'Como ler pictogramas e frases H'));
    const alvo = compostos[0] ? this.nomeComposto(compostos[0]) : elementos[0]?.nome;
    return montar({
      intent: 'SEGURANCA', titulo: alvo ? `Segurança: ${p.mistura && compostos[1] ? `${this.nomeComposto(compostos[0])} e ${this.nomeComposto(compostos[1])}` : alvo}` : 'Segurança química',
      blocos, acoes,
      sugestoes: ['Por que não misturar água sanitária com amoníaco?', 'Perigos do ácido sulfúrico'],
      extra: { compostoCid: compostos[0]?.cid ?? null }
    });
  }

  // ------------------------------------------------------------------------------------------------ conceitos (trechos licenciados)
  async conceito(p) {
    const termos = termosDeBusca(p.conceito || p.textoOriginal);
    const chave = normalizar(p.conceito || '');
    const pontuar = (textos) => textos.map((t) => {
      const kws = (t.palavrasChave ?? []).map(normalizar);
      const titulo = normalizar(t.titulo ?? '');
      const corpo = normalizar(t.textoPt ?? t.textoOriginal ?? '');
      let s = 0;
      let cobertos = 0;
      if (chave && kws.includes(chave)) s += 6;
      if (chave && titulo === chave) s += 6;
      for (const termo of termos) {
        let achou = false;
        if (kws.some((k) => k === termo || k.split(' ').includes(termo))) { s += 3; achou = true; }
        if (titulo.split(' ').includes(termo)) { s += 2; achou = true; }
        if (corpo.split(' ').includes(termo)) { s += 1; achou = true; }
        if (achou) cobertos++;
      }
      // texto em inglês só entra se for o único jeito de responder (a interface é em português)
      return { t, s: t.idioma === 'en' ? s - 1 : s, cobertura: termos.length ? cobertos / termos.length : 0 };
    }).filter((x) => x.s >= 3 && x.cobertura >= 0.6).sort((a, b) => b.s - a.s).slice(0, 2);
    // primeiro só os arquivos cujo nome combina com a pergunta; se nada servir, todos os trechos
    let pontuados = pontuar(await this.store.textos(termos));
    if (!pontuados.length) pontuados = pontuar(await this.store.textos());
    if (!pontuados.length) {
      return montar({
        intent: 'CONCEITO', resolvida: false, titulo: 'Ainda não tenho um texto sobre isso',
        blocos: [B.texto(`Não encontrei, entre os trechos licenciados do pacote de dados, uma explicação sobre "${p.conceito || p.textoOriginal}". Os dados de elementos, compostos e as calculadoras continuam disponíveis.`)],
        sugestoes: SUGESTOES_PADRAO.slice(0, 4)
      });
    }
    const blocos = pontuados.map(({ t }) => {
      const automatica = /autom[aá]tic/i.test(t.traducao ?? '') && !/sem tradu/i.test(t.traducao ?? '');
      const ingles = t.idioma === 'en' || (!t.textoPt && /pendente/i.test(t.traducao ?? ''));
      const corte = cortarEmFrase(t.textoPt || t.textoOriginal || '', 900);
      return {
        tipo: 'citacao', texto: corte.texto, truncado: corte.truncado,
        aviso: automatica ? 'Tradução automática, ainda não revisada por uma pessoa.' : ingles ? 'Texto em inglês (ainda sem tradução).' : null,
        fonte: { nome: `${t.fonte}${t.titulo ? `: ${t.titulo}` : ''}`, url: urlSegura(t.url) ?? undefined, licenca: t.licenca }
      };
    });
    return montar({
      intent: 'CONCEITO', titulo: capitalizar(pontuados[0].t.titulo ?? p.conceito ?? 'Conceito'), blocos,
      acoes: [], sugestoes: ['Quantos mols há em 18 g de água?', 'pH de HCl 0,01 mol/L']
    });
  }
}

const MODO_TITULO = {
  molaridade: 'Molaridade da solução', massa: 'Massa de soluto necessária', 'gl-mol': 'Conversão g/L ↔ mol/L', 'percentual-mm': 'Percentual em massa', 'percentual-mv': 'Percentual massa/volume', diluicao: 'Diluição'
};

const formatarFormulaTexto = (f) => (tentarFormula(f) ? formulaUnicode(f) : f);

function cortarEmFrase(texto, max) {
  const t = String(texto).replace(/\s+/g, ' ').trim();
  if (t.length <= max) return { texto: t, truncado: false };
  const corte = t.lastIndexOf('. ', max);
  return { texto: `${t.slice(0, corte > max * 0.5 ? corte + 1 : max).trim()}${corte > max * 0.5 ? '' : '…'}`, truncado: true };
}

