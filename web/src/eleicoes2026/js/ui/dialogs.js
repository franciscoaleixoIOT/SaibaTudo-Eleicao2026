// Diálogos: detalhe da candidatura, escolha de UF, relato de problema, fontes oficiais, pesquisas registradas e instalação.
import { h, icon, link, trocar } from '../dom.js';
import {
  AVISO_NEUTRALIDADE, NOMES_UF, SISTEMAS_OFICIAIS_TSE, URL_DIVULGA_CAND_CONTAS, decimal2, inteiro, moeda, sentenca,
  tituloPalavras, treUrl
} from '../model.js';
import { formatarBr } from '../phase.js';
import { instrucoes } from '../install.js';
import { chip, fotoCandidato, modal } from './components.js';

const httpUrl = (u) => /^https?:\/\//i.test(u);

const linha = (rotulo, valor) => h('p', { class: 'kv' }, h('strong', null, `${rotulo}: `), h('span', null, valor));
const secao = (t) => h('h3', { class: 'sec' }, t);
const nota = (t) => h('p', { class: 'nota' }, t);

// -------------------------------------------------------------------------------------------- detalhe da candidatura

export function abrirDetalhe(c, { store, regras, permitirRemota, onSimular }) {
  const g = regras?.glossario ?? {};
  const corpo = [];
  corpo.push(secao('Situação da candidatura (TSE)'));
  corpo.push(linha('Situação', c.elegibilidade.rotulo));
  if (c.situacao) corpo.push(linha('Texto oficial', sentenca(c.situacao)));
  corpo.push(linha('Inserida na urna', c.naUrna ? 'Sim' : 'Não'));
  if (c.substituido) corpo.push(linha('Substituição', 'Candidatura substituída'));
  if (c.motivosIndeferimento.length > 0) {
    corpo.push(h('p', { class: 'kv' }, 'Motivos registrados no julgamento:'));
    corpo.push(h('ul', { class: 'lista-pontos' }, c.motivosIndeferimento.map((m) => h('li', null, m))));
  }
  corpo.push(nota(g.elegibilidade ?? 'Situação do julgamento do registro. O app não emite certidão de Ficha Limpa.'));

  if (c.resultado) {
    corpo.push(secao('Resultado oficial'));
    if (c.resultado.situacaoTotalizacao) corpo.push(linha('Totalização', sentenca(c.resultado.situacaoTotalizacao)));
    for (const t of Object.keys(c.resultado.turnos).map(Number).sort((a, b) => a - b)) {
      const v = c.resultado.turnos[t];
      corpo.push(linha(`${t}º turno`, (v.votos != null ? `${inteiro(v.votos)} votos` : '—') + (v.percentual != null ? ` (${decimal2(v.percentual)}%)` : '')));
    }
  }

  corpo.push(secao('Dados cadastrais'));
  corpo.push(linha('Nome completo', tituloPalavras(c.nomeCompleto)));
  if (c.federacao) corpo.push(linha('Federação', c.federacao));
  if (c.coligacao) corpo.push(linha('Coligação', c.coligacao));
  corpo.push(linha('Estado', c.estadoUf === 'BR' ? 'Nacional' : (NOMES_UF[c.estadoUf] ?? c.estadoUf)));
  if (c.municipioNascimento) corpo.push(linha('Naturalidade', `${sentenca(c.municipioNascimento)}${c.ufNascimento ? `/${c.ufNascimento}` : ''}`));
  if (c.idade != null) corpo.push(linha('Idade na posse', `${c.idade} anos`));
  if (c.ocupacao) corpo.push(linha('Ocupação declarada', sentenca(c.ocupacao)));
  if (c.grauInstrucao) corpo.push(linha('Escolaridade', sentenca(c.grauInstrucao)));
  if (c.genero) corpo.push(linha('Gênero', sentenca(c.genero)));

  corpo.push(secao('Bens declarados ao TSE'));
  if (c.patrimonioDeclarado != null) corpo.push(linha('Total declarado', `${moeda(c.patrimonioDeclarado)} (${c.qtdBens ?? '?'} bens)`));
  else if (c.declaraBens === false) corpo.push(h('p', { class: 'kv' }, 'O candidato informou não possuir bens a declarar.'));
  else corpo.push(h('p', { class: 'kv' }, 'Sem bens declarados nos dados do TSE.'));
  corpo.push(nota(g.patrimonioDeclarado ?? 'Valor declarado pelo próprio candidato.'));

  if (c.contas) {
    corpo.push(secao('Prestação de contas da campanha'));
    corpo.push(linha('Receitas declaradas', moeda(c.contas.receitas)));
    corpo.push(linha('Despesas contratadas', moeda(c.contas.despesasContratadas)));
    corpo.push(nota(`Dados da prestação de contas (${(c.contas.tipo ?? 'parcial').toLowerCase()}), geração do TSE em ${c.contas.geradoEm ?? '—'}. ` +
      'Valores podem mudar até a prestação final; confira no DivulgaCandContas.'));
  }

  corpo.push(secao('Histórico eleitoral (derivado do histórico do TSE)'));
  corpo.push(linha('Eleições disputadas', String(c.eleicoesDisputadas)));
  corpo.push(linha('Vezes eleito', String(c.vezesEleito)));
  if (c.eleitoMesmoCargo) corpo.push(h('p', { class: 'kv' }, 'Já foi eleito para este mesmo cargo em eleição anterior.'));

  if (c.temPlanoGoverno) {
    corpo.push(secao('Plano de governo registrado'));
    if (c.temasPlano.length > 0) {
      corpo.push(h('p', { class: 'kv' }, 'Temas mais citados (detecção automática): ' + c.temasPlano.map((t) => regras?.temas?.[t] ?? t).join(', ')));
      corpo.push(nota(g.temasPlano ?? 'Indica conteúdo citado, não avaliação do plano.'));
    }
    corpo.push(h('p', { class: 'kv' }, 'O documento completo está no DivulgaCandContas.'));
  }

  const redes = c.redesSociais.filter(httpUrl).slice(0, 4);
  if (redes.length > 0) {
    corpo.push(secao('Redes sociais informadas ao TSE'));
    corpo.push(h('ul', { class: 'lista-links' }, redes.map((u) => h('li', null, link(u, u.replace(/^https?:\/\//i, ''))))));
  }
  corpo.push(h('p', { class: 'fonte-link' }, link(URL_DIVULGA_CAND_CONTAS, 'Fonte: Dados Abertos do TSE (CC BY). Confirme no DivulgaCandContas.')));

  let dlg;
  dlg = modal({
    classe: 'modal-detalhe',
    cabecalho: h('div', { class: 'det-cab' },
      fotoCandidato(c, 46, { store, permitirRemota }),
      h('div', null,
        h('h2', { class: 'modal-titulo', 'data-titulo': '' }, c.nomeUrna),
        h('p', { class: 'mudo pequeno' }, `${c.cargo} • Nº ${c.numero} • ${c.partido}`))),
    corpo,
    rodape: [
      h('button', { type: 'button', class: 'btn btn-texto', onClick: () => dlg.close() }, 'Fechar'),
      h('button', { type: 'button', class: 'btn btn-primario', onClick: () => onSimular(c) }, icon('ballot', 18), 'Simulador educativo')
    ]
  });
  return dlg;
}

// -------------------------------------------------------------------------------------------- escolher UF

export function abrirEscolherUf({ atual, onEscolher, onFechar }) {
  let dlg;
  const escolher = (uf) => { dlg.close(); onEscolher(uf); };
  dlg = modal({
    titulo: 'Escolha seu estado',
    classe: 'modal-pequeno',
    onFechar,
    corpo: [
      h('p', { class: 'mudo pequeno' }, 'O app começa mostrando as candidaturas do seu estado. Você pode mudar a qualquer momento e a escolha fica só neste aparelho (não usamos GPS nem localização).'),
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Estados' },
        Object.entries(NOMES_UF).map(([sigla, nome]) => chip({ rotulo: `${sigla} · ${nome}`, selecionado: sigla === atual, onClick: () => escolher(sigla), icone: false })))
    ],
    rodape: [
      h('button', { type: 'button', class: 'btn btn-texto', onClick: () => dlg.close() }, 'Cancelar'),
      h('button', { type: 'button', class: 'btn btn-secundario', onClick: () => escolher(null) }, 'Ver o Brasil todo')
    ]
  });
  return dlg;
}

// -------------------------------------------------------------------------------------------- relato de problema

/** Relato de resposta incorreta/inadequada: só envia depois de o usuário clicar em "Enviar relato". */
export function abrirRelato({ pergunta, resposta, onEnviar }) {
  let dlg;
  const campo = h('textarea', { class: 'campo', rows: '3', maxlength: '500', id: 'relato-nota', 'aria-describedby': 'relato-info' });
  const status = h('p', { class: 'erro', role: 'alert' });
  const enviar = h('button', { type: 'button', class: 'btn btn-primario' }, 'Enviar relato');
  enviar.addEventListener('click', async () => {
    enviar.disabled = true;
    enviar.textContent = 'Enviando…';
    const ok = await onEnviar(campo.value);
    if (ok) {
      trocar(dlg.querySelector('.modal-corpo'), h('p', { role: 'status' }, 'Relato enviado. Obrigado por ajudar a melhorar o SaibaTudo!'));
      trocar(dlg.querySelector('.modal-rodape'), h('button', { type: 'button', class: 'btn btn-primario', onClick: () => dlg.close() }, 'Fechar'));
    } else {
      status.textContent = 'Não foi possível enviar agora. Verifique a conexão e tente novamente.';
      enviar.disabled = false;
      enviar.textContent = 'Enviar relato';
    }
  });
  dlg = modal({
    titulo: 'Relatar problema na resposta',
    classe: 'modal-pequeno',
    corpo: [
      h('p', { class: 'mudo pequeno', id: 'relato-info' },
        'Será enviada à equipe a sua pergunta, a resposta exibida, a versão do app e a dos dados — sem nome, e-mail ou localização. ' +
        'O relato fica em um registro público de correções no GitHub. Nada é enviado antes de você clicar em "Enviar relato".'),
      h('details', { class: 'previa' },
        h('summary', null, 'Ver exatamente o que será enviado'),
        h('p', { class: 'pequeno' }, h('strong', null, 'Pergunta: '), pergunta.slice(0, 300)),
        h('p', { class: 'pequeno' }, h('strong', null, 'Resposta: '), resposta.slice(0, 1500))),
      h('label', { for: 'relato-nota', class: 'rotulo-campo' }, 'O que está errado? (opcional)'),
      campo, status
    ],
    rodape: [h('button', { type: 'button', class: 'btn btn-texto', onClick: () => dlg.close() }, 'Cancelar'), enviar]
  });
  return dlg;
}

// -------------------------------------------------------------------------------------------- fontes oficiais

export function abrirFontes({ estadoUf, fontes }) {
  const sistemas = fontes?.sistemasNacionais?.length
    ? fontes.sistemasNacionais : SISTEMAS_OFICIAIS_TSE.map(([nome, url]) => ({ nome, url, utilidade: null }));
  const item = (nome, url, utilidade) => h('li', null,
    link(url, [icon('external', 16), h('span', null, h('strong', null, nome), utilidade ? h('span', { class: 'mudo pequeno bloco' }, utilidade) : null, h('span', { class: 'url' }, url)) ], { class: 'item-fonte' }));
  const tres = fontes?.tres ?? [];
  const corpo = [h('h3', { class: 'sec' }, 'Sistemas nacionais do TSE'), nota(fontes?.nota ?? 'Os TREs integram suas consultas aos sistemas nacionais do TSE.'),
    h('ul', { class: 'lista-fontes' }, sistemas.filter((s) => httpUrl(s.url)).map((s) => item(s.nome, s.url, s.utilidade)))];
  const uf = estadoUf && estadoUf !== 'BR' ? estadoUf : null;
  corpo.push(h('h3', { class: 'sec' }, 'TRE' + (uf ? ` — ${uf}` : ' (27 UFs)')));
  if (uf) {
    const tre = tres.find((t) => t.uf.toLowerCase() === uf.toLowerCase());
    corpo.push(h('ul', { class: 'lista-fontes' },
      item(tre?.tribunal ?? `TRE ${uf} — Eleições`, tre?.url ?? treUrl(uf), null),
      (tre?.secoes ?? []).filter((s) => httpUrl(s.url)).slice(0, 12).map((s) => item(s.titulo, s.url, null))));
  } else {
    corpo.push(h('ul', { class: 'lista-fontes' }, tres.filter((t) => httpUrl(t.url)).map((t) => item(t.tribunal, t.url, null))));
  }
  const orgaos = (fontes?.orgaos ?? []).filter((o) => httpUrl(o.url));
  if (orgaos.length > 0) {
    corpo.push(h('h3', { class: 'sec' }, 'Acompanhamento, legislação e fiscalização'));
    corpo.push(h('ul', { class: 'lista-fontes' }, orgaos.map((o) => item(o.orgao, o.url, o.utilidade))));
  }
  corpo.push(nota('Base de dados do app: Portal de Dados Abertos do TSE (dadosabertos.tse.jus.br), licença CC BY. Aplicativo independente, sem vínculo com o TSE ou outros órgãos.'));
  return modal({ titulo: 'Fontes oficiais', classe: 'modal-medio', corpo });
}

// -------------------------------------------------------------------------------------------- pesquisas registradas

const PAGINA_PESQ = 60;

/** Pesquisas eleitorais REGISTRADAS no TSE (PesqEle). O registro não traz resultados. */
export function abrirPesquisas({ store }) {
  const corpo = h('div', null, h('p', { class: 'mudo', role: 'status' }, 'Carregando pesquisas registradas…'));
  const dlg = modal({ titulo: 'Pesquisas Eleitorais Registradas', classe: 'modal-medio', corpo });
  store.ensurePesquisas().then((todas) => {
    if (!dlg.isConnected) return;
    let fUf = null;
    let fCargo = null;
    let limite = PAGINA_PESQ;
    const ufs = [...new Set(todas.map((p) => p.uf).filter(Boolean))].sort();
    const cargos = [...new Set(todas.map((p) => p.cargo).filter(Boolean))].sort();
    const lista = h('div', { class: 'pesq-lista' });
    const chipsUf = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar por estado' });
    const chipsCargo = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar por cargo' });
    const resumo = h('p', { class: 'mudo pequeno', role: 'status' });
    const desenhar = () => {
      const filtradas = todas.filter((p) => (fUf == null || (p.uf ?? '').toLowerCase() === fUf.toLowerCase()) && (fCargo == null || (p.cargo ?? '').toLowerCase() === fCargo.toLowerCase()));
      trocar(chipsUf, chip({ rotulo: 'Todas as UFs', selecionado: fUf == null, onClick: () => { fUf = null; limite = PAGINA_PESQ; desenhar(); } }),
        ufs.map((u) => chip({ rotulo: u, selecionado: fUf === u, onClick: () => { fUf = fUf === u ? null : u; limite = PAGINA_PESQ; desenhar(); } })));
      trocar(chipsCargo, chip({ rotulo: 'Todos os cargos', selecionado: fCargo == null, onClick: () => { fCargo = null; limite = PAGINA_PESQ; desenhar(); } }),
        cargos.map((c) => chip({ rotulo: c, selecionado: fCargo === c, onClick: () => { fCargo = fCargo === c ? null : c; limite = PAGINA_PESQ; desenhar(); } })));
      resumo.textContent = `${inteiro(filtradas.length)} pesquisas exibidas (dados oficiais do TSE)`;
      trocar(lista, filtradas.slice(0, limite).map(itemPesquisa),
        filtradas.length > limite ? h('div', { class: 'centro' },
          h('p', { class: 'mudo pequeno' }, `Exibindo ${inteiro(limite)} de ${inteiro(filtradas.length)}.`),
          h('button', { type: 'button', class: 'btn btn-contorno', onClick: () => { limite += PAGINA_PESQ; desenhar(); } }, 'Mostrar mais')) : null);
    };
    trocar(corpo,
      h('p', { class: 'aviso-caixa' }, icon('info', 16), h('span', null, 'Atenção: o registro no TSE não informa os resultados da pesquisa; consulte o relatório divulgado pelo instituto.')),
      h('p', { class: 'mudo pequeno' }, `Registro oficial no TSE • ${inteiro(todas.length)} pesquisas`),
      chipsUf, chipsCargo, resumo, lista);
    desenhar();
  }).catch(() => {
    if (dlg.isConnected) trocar(corpo, h('p', { class: 'erro', role: 'alert' }, 'Não foi possível carregar as pesquisas registradas agora. Verifique a conexão e tente novamente.'));
  });
  return dlg;
}

const dia = (s) => (s ? formatarBr(String(s).slice(0, 10)) : null);

function itemPesquisa(p) {
  const local = [p.cargo, p.uf, p.municipio].filter(Boolean).join(' • ');
  const reg = [p.protocolo ? `Protocolo ${p.protocolo}` : null, p.dataRegistro ? `registrado em ${dia(p.dataRegistro)}` : null].filter(Boolean).join(' • ');
  const campo = [p.dataInicio ? `Campo: ${dia(p.dataInicio)}` : null, p.dataFim ? `a ${dia(p.dataFim)}` : null, p.dataDivulgacao ? `• Divulgação: ${dia(p.dataDivulgacao)}` : null].filter(Boolean).join(' ');
  return h('article', { class: 'pesq' },
    h('div', { class: 'pesq-cab' }, h('strong', null, p.empresa ?? 'Empresa não informada'), p.pesquisaPropria ? h('span', { class: 'tag tag-ouro' }, 'PESQUISA PRÓPRIA') : null),
    local ? h('p', { class: 'mudo pequeno' }, local) : null,
    reg ? h('p', { class: 'mudo mini' }, reg) : null,
    campo ? h('p', { class: 'mudo mini' }, campo) : null,
    p.entrevistados || p.valor ? h('p', { class: 'mini' }, p.entrevistados ? `Entrevistados: ${p.entrevistados}` : null, p.entrevistados && p.valor ? ' • ' : null, p.valor ? `Valor: R$ ${p.valor}` : null) : null,
    p.estatistico ? h('p', { class: 'mudo mini' }, `Estatístico responsável: ${p.estatistico}`) : null);
}

// -------------------------------------------------------------------------------------------- instalação

export function abrirInstrucoesInstalacao() {
  const i = instrucoes();
  return modal({
    titulo: i.titulo, classe: 'modal-pequeno',
    corpo: [h('ol', { class: 'passos' }, i.passos.map((p) => h('li', null, p))), nota(AVISO_NEUTRALIDADE)]
  });
}
