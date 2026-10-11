// SIMULADOR EDUCATIVO da urna. NÃO é a urna eletrônica oficial, não registra votos e não tem vínculo com a Justiça Eleitoral.
// Etapas na ordem de votação de 2026: 1º Dep. Federal (4) → 2º Dep. Estadual/Distrital (5) → 3º Senador 1ª vaga (3) →
// 4º Senador 2ª vaga (3) → 5º Governador (2) → 6º Presidente (2). Os candidatos são os registrados no TSE para a UF
// escolhida (números iguais existem em UFs diferentes). Porte de UrnaSimulatorDialog.kt.
import { h, trocar } from '../dom.js';
import { SIGLAS } from '../model.js';
import { fotoCandidato, modal } from './components.js';

export const ETAPAS = [
  { cargoCodigo: 'DEPUTADO_FEDERAL', titulo: 'Deputado Federal', digitos: 4 },
  { cargoCodigo: 'DEPUTADO_ESTADUAL', titulo: 'Deputado Estadual / Distrital', digitos: 5 },
  { cargoCodigo: 'SENADOR', titulo: 'Senador – 1ª vaga', digitos: 3, primeiraVagaSenador: true },
  { cargoCodigo: 'SENADOR', titulo: 'Senador – 2ª vaga', digitos: 3, segundaVagaSenador: true },
  { cargoCodigo: 'GOVERNADOR', titulo: 'Governador', digitos: 2 },
  { cargoCodigo: 'PRESIDENTE', titulo: 'Presidente da República', digitos: 2 }
];

/** Candidato oficial pelo número digitado, na UF escolhida (Presidente é nacional). */
export function buscarCandidatoNaUrna(todos, etapa, digitos, uf) {
  if (digitos.length !== etapa.digitos) return null;
  return todos.find((c) =>
    c.naUrna && c.numero === digitos &&
    (c.cargoCodigo === etapa.cargoCodigo || (etapa.cargoCodigo === 'DEPUTADO_ESTADUAL' && c.cargoCodigo === 'DEPUTADO_DISTRITAL')) &&
    (etapa.cargoCodigo === 'PRESIDENTE' || c.estadoUf === uf)) ?? null;
}

/** Segundo voto de Senador no mesmo número da 1ª vaga: a urna anula o 2º voto. */
export const votoRepetido = (etapa, digitos, primeiroSenador, branco) =>
  !!etapa.segundaVagaSenador && digitos.length === etapa.digitos && digitos === primeiroSenador && !branco;

export function abrirUrna({ store, ufInicial = null, candidatoInicial = null, permitirRemota = true }) {
  const est = {
    uf: candidatoInicial && candidatoInicial.estadoUf !== 'BR' ? candidatoInicial.estadoUf : ufInicial,
    etapa: 0, digitos: '', branco: false, fim: false, primeiroSenador: null, carregandoUf: false
  };
  if (candidatoInicial) {
    const i = ETAPAS.findIndex((e) => e.cargoCodigo === candidatoInicial.cargoCodigo || (e.cargoCodigo === 'DEPUTADO_ESTADUAL' && candidatoInicial.cargoCodigo === 'DEPUTADO_DISTRITAL'));
    if (i >= 0) est.etapa = i;
    if (candidatoInicial.cargoCodigo === ETAPAS[est.etapa].cargoCodigo) est.digitos = candidatoInicial.numero;
  }

  const ecra = h('div', { class: 'urna-tela', role: 'region', 'aria-label': 'Tela da urna simulada', 'aria-live': 'polite' });
  const chipsUf = h('div', { class: 'urna-ufs', role: 'group', 'aria-label': 'Estado da simulação' });
  const teclado = h('div', { class: 'urna-teclado', role: 'group', 'aria-label': 'Teclado numérico' });
  const acoes = h('div', { class: 'urna-acoes' });
  const atual = () => ETAPAS[est.etapa];

  /** Carrega sob demanda as candidaturas da UF (BR + UF) antes de mostrar o resultado da digitação. */
  async function carregar(uf) {
    if (store.shards.has(uf) && store.shards.has('BR')) return;
    est.carregandoUf = true;
    desenhar();
    try { await store.ensureUfs(['BR', uf]); } catch { /* UF indisponível: a tela informa "número errado" */ }
    est.carregandoUf = false;
    desenhar();
  }
  function escolherUf(uf) {
    est.uf = uf; est.digitos = ''; est.branco = false;
    desenhar();
    carregar(uf);
  }

  function desenharEcra() {
    const e = atual();
    if (est.fim) {
      return trocar(ecra, h('div', { class: 'urna-fim' }, h('strong', { class: 'urna-fim-t' }, 'F I M'), h('span', null, 'Simulação concluída. Nenhum voto foi registrado.')));
    }
    if (est.uf == null && e.cargoCodigo !== 'PRESIDENTE') {
      return trocar(ecra, h('p', { class: 'urna-aviso' }, 'Escolha o estado acima para simular a votação.'));
    }
    if (est.carregandoUf) return trocar(ecra, h('p', { class: 'urna-aviso' }, `Carregando candidatos de ${est.uf}…`));
    const encontrado = buscarCandidatoNaUrna(store.candidatos, e, est.digitos, est.uf);
    const caixas = [];
    for (let i = 0; i < e.digitos; i++) {
      caixas.push(h('span', { class: `urna-dig${i === est.digitos.length ? ' atual' : ''}` }, est.digitos[i] ?? ''));
    }
    const conteudo = [h('p', { class: 'urna-peq' }, 'SEU VOTO PARA'), h('p', { class: 'urna-cargo' }, e.titulo.toUpperCase())];
    if (est.branco) {
      conteudo.push(h('p', { class: 'urna-branco' }, 'VOTO EM BRANCO'));
    } else {
      conteudo.push(h('div', { class: 'urna-digitos', 'aria-label': `Número digitado: ${est.digitos || 'nenhum'}` }, caixas));
      if (est.digitos.length === e.digitos) {
        if (encontrado) {
          conteudo.push(h('div', { class: 'urna-cand' },
            fotoCandidato(encontrado, 48, { store, permitirRemota }),
            h('div', null,
              h('p', { class: 'urna-nome' }, `Nome: ${encontrado.nomeUrna}`),
              h('p', { class: 'urna-part' }, `Partido: ${encontrado.partido}`),
              h('p', { class: 'urna-sit' }, `Situação no TSE: ${encontrado.elegibilidade.rotulo}`))));
        } else {
          conteudo.push(h('p', { class: 'urna-erro' }, 'NÚMERO ERRADO'), h('p', { class: 'urna-erro menor' }, 'VOTO NULO'));
        }
      }
      if (votoRepetido(e, est.digitos, est.primeiroSenador, est.branco)) {
        conteudo.push(h('p', { class: 'urna-erro menor', role: 'alert' }, 'ATENÇÃO: mesmo número da 1ª vaga — o 2º voto no mesmo candidato é ANULADO.'));
      }
    }
    conteudo.push(h('p', { class: 'urna-rodape' }, 'CONFIRMA para votar • CORRIGE para recomeçar o cargo'));
    trocar(ecra, conteudo);
  }

  function tecla(n) {
    if (est.fim || est.carregandoUf) return;
    if (est.digitos.length < atual().digitos && !est.branco) { est.digitos += n; desenhar(); }
  }
  const branco = () => { if (est.fim) return; est.branco = true; est.digitos = ''; desenhar(); };
  const corrige = () => { if (est.fim) return; est.branco = false; est.digitos = ''; desenhar(); };
  const confirma = () => {
    if (est.fim) return;
    const e = atual();
    if (est.branco || est.digitos.length === e.digitos) {
      if (e.primeiraVagaSenador) est.primeiroSenador = est.branco ? null : est.digitos;
      if (est.etapa < ETAPAS.length - 1) { est.etapa++; est.digitos = ''; est.branco = false; } else est.fim = true;
      desenhar();
    }
  };
  const reiniciar = () => { Object.assign(est, { fim: false, etapa: 0, digitos: '', branco: false, primeiroSenador: null }); desenhar(); };

  function desenhar() {
    trocar(chipsUf, SIGLAS.map((s) => h('button', {
      type: 'button', class: `chip urna-chip${est.uf === s ? ' on' : ''}`, 'aria-pressed': est.uf === s ? 'true' : 'false', onClick: () => escolherUf(s)
    }, s)));
    desenharEcra();
    if (est.fim) {
      trocar(teclado);
      trocar(acoes, h('button', { type: 'button', class: 'btn btn-primario cheio', onClick: reiniciar }, 'Simular novamente'));
    } else {
      if (!teclado.firstChild) {
        trocar(teclado, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((n) => h('button', {
          type: 'button', class: `urna-tecla t${n}`, 'aria-label': `Tecla ${n}`, onClick: () => tecla(n)
        }, n)));
      }
      trocar(acoes,
        h('button', { type: 'button', class: 'urna-bt branco', onClick: branco }, 'BRANCO'),
        h('button', { type: 'button', class: 'urna-bt corrige', onClick: corrige }, 'CORRIGE'),
        h('button', { type: 'button', class: 'urna-bt confirma', onClick: confirma }, 'CONFIRMA'));
    }
  }

  const corpo = [
    h('p', { class: 'urna-sel' }, 'Estado da simulação:'), chipsUf, ecra, teclado, acoes,
    h('p', { class: 'urna-nota' }, 'Os candidatos exibidos são os registrados no TSE (dados abertos). Este simulador é apenas para treino e não representa a urna eletrônica nem a Justiça Eleitoral. Dica: no teclado do computador, digite os números e use Backspace para CORRIGE.')
  ];
  const dlg = modal({
    classe: 'modal-urna',
    cabecalho: h('div', null,
      h('h2', { class: 'modal-titulo urna-tit', 'data-titulo': '' }, 'SIMULADOR EDUCATIVO'),
      h('p', { class: 'urna-sub' }, 'Não é a urna oficial • não registra votos')),
    corpo
  });
  dlg.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('button') && e.key === 'Enter') return;
    if (/^[0-9]$/.test(e.key)) { tecla(e.key); e.preventDefault(); } else if (e.key === 'Backspace' || e.key === 'Delete') { corrige(); e.preventDefault(); }
  });
  desenhar();
  if (est.uf) carregar(est.uf); // garante as candidaturas da UF (carga sob demanda)
  return dlg;
}

