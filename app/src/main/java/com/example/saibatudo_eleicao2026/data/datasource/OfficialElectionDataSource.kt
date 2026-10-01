package com.example.saibatudo_eleicao2026.data.datasource

import android.content.Context
import com.example.saibatudo_eleicao2026.domain.model.Candidate
import com.example.saibatudo_eleicao2026.domain.model.FontesOficiais
import com.example.saibatudo_eleicao2026.domain.model.OrgaoOficial
import com.example.saibatudo_eleicao2026.domain.model.PesquisaEleitoral
import com.example.saibatudo_eleicao2026.domain.model.TreOficial
import com.example.saibatudo_eleicao2026.domain.model.TseRegras
import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import com.google.gson.stream.JsonReader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.InputStreamReader

/**
 * Fonte de dados OFICIAL do TSE (Eleições Gerais 2026).
 *
 * Carrega os assets JSON gerados diretamente dos arquivos oficiais do Portal de
 * Dados Abertos do TSE (https://dadosabertos.tse.jus.br) e do CDN oficial
 * (https://cdn.tse.jus.br) pelo pipeline `ai_model/scripts/build_official_data.py`:
 *
 *  - tse_candidatos_2026.json  -> 20.988 candidatos oficiais registrados
 *  - tse_pesquisas_2026.json   -> 3.467 pesquisas eleitorais registradas
 *  - tse_regras_2026.json      -> regras, vagas, calendário e estatísticas oficiais
 *  - fotos (JPEGs)            -> fotos oficiais de candidatos (CDN TSE)
 *
 * Parsing via Gson streaming (JsonReader) para manter o consumo de memória
 * sob controle mesmo com 21 mil registros.
 */
class OfficialElectionDataSource(private val context: Context) {

    private val gson = Gson()
    private val mutex = Mutex()

    @Volatile private var candidatosCache: List<Candidate>? = null
    @Volatile private var pesquisasCache: List<PesquisaEleitoral>? = null
    @Volatile private var regrasCache: TseRegras? = null
    @Volatile private var fontesCache: FontesOficiais? = null

    // ============================ DTOs (JSON -> objeto) ============================

    data class CandidateDto(
        @SerializedName("id") val id: String? = null,
        @SerializedName("numero") val numero: String? = null,
        @SerializedName("nomeUrna") val nomeUrna: String? = null,
        @SerializedName("nomeCompleto") val nomeCompleto: String? = null,
        @SerializedName("cargo") val cargoCodigo: String? = null,
        @SerializedName("dsCargo") val cargoDisplay: String? = null,
        @SerializedName("digitosUrna") val digitosUrna: Int? = null,
        @SerializedName("ordemVotacao") val ordemVotacao: Int? = null,
        @SerializedName("partido") val partido: String? = null,
        @SerializedName("nomePartido") val nomePartido: String? = null,
        @SerializedName("coligacao") val coligacao: String? = null,
        @SerializedName("federacao") val federacao: String? = null,
        @SerializedName("siglaFederacao") val siglaFederacao: String? = null,
        @SerializedName("estadoUf") val estadoUf: String? = null,
        @SerializedName("regiao") val regiao: String? = null,
        @SerializedName("municipioNascimento") val municipioNascimento: String? = null,
        @SerializedName("ufNascimento") val ufNascimento: String? = null,
        @SerializedName("idade") val idade: Int? = null,
        @SerializedName("genero") val genero: String? = null,
        @SerializedName("corRaca") val corRaca: String? = null,
        @SerializedName("grauInstrucao") val grauInstrucao: String? = null,
        @SerializedName("estadoCivil") val estadoCivil: String? = null,
        @SerializedName("ocupacao") val ocupacao: String? = null,
        @SerializedName("situacaoJulgamento") val situacaoJulgamento: String? = null,
        @SerializedName("fichaLimpa") val fichaLimpa: Boolean? = null,
        @SerializedName("processosAdministrativos") val processosAdministrativos: Int? = null,
        @SerializedName("motivosCassacao") val motivosCassacao: List<String>? = null,
        @SerializedName("mandatosAnteriores") val mandatosAnteriores: Int? = null,
        @SerializedName("totalEleicoesDisputadas") val totalEleicoesDisputadas: Int? = null,
        @SerializedName("reeleicao") val reeleicao: Boolean? = null,
        @SerializedName("redesSociais") val redesSociais: List<String>? = null,
        @SerializedName("temPlanoGoverno") val temPlanoGoverno: Boolean? = null,
        @SerializedName("propostasResumo") val propostasResumo: List<String>? = null,
        @SerializedName("fotoLocal") val fotoLocal: String? = null
    )

    data class PesquisaDto(
        @SerializedName("protocolo") val protocolo: String? = null,
        @SerializedName("uf") val uf: String? = null,
        @SerializedName("municipio") val municipio: String? = null,
        @SerializedName("cargo") val cargo: String? = null,
        @SerializedName("empresa") val empresa: String? = null,
        @SerializedName("cnpj") val cnpj: String? = null,
        @SerializedName("pesquisaPropria") val pesquisaPropria: Boolean? = null,
        @SerializedName("dataRegistro") val dataRegistro: String? = null,
        @SerializedName("dataInicio") val dataInicio: String? = null,
        @SerializedName("dataFim") val dataFim: String? = null,
        @SerializedName("dataDivulgacao") val dataDivulgacao: String? = null,
        @SerializedName("entrevistados") val entrevistados: String? = null,
        @SerializedName("estatistico") val estatistico: String? = null,
        @SerializedName("conre") val conre: String? = null,
        @SerializedName("valor") val valor: String? = null,
        @SerializedName("metodologia") val metodologia: String? = null
    )

    data class RegrasDto(
        @SerializedName("fonte") val fonte: String? = null,
        @SerializedName("dataGeracaoDados") val dataGeracaoDados: String? = null,
        @SerializedName("dataPrimeiroTurno") val dataPrimeiroTurno: String? = null,
        @SerializedName("dataSegundoTurno") val dataSegundoTurno: String? = null,
        @SerializedName("horarioVotacao") val horarioVotacao: String? = null,
        @SerializedName("ordemVotacaoUrna") val ordemVotacaoUrna: List<UrnaEtapaDto>? = null,
        @SerializedName("estatisticas") val estatisticas: EstatisticasDto? = null
    ) {
        data class UrnaEtapaDto(
            @SerializedName("ordem") val ordem: Int? = null,
            @SerializedName("cargo") val cargo: String? = null,
            @SerializedName("codigo") val codigo: String? = null,
            @SerializedName("digitos") val digitos: Int? = null,
            @SerializedName("regra") val regra: String? = null,
            @SerializedName("sistema") val sistema: String? = null
        )

        data class EstatisticasDto(
            @SerializedName("totalCandidatos") val totalCandidatos: Int? = null,
            @SerializedName("porCargo") val porCargo: Map<String, Int>? = null,
            @SerializedName("porUf") val porUf: Map<String, Int>? = null,
            @SerializedName("porPartido") val porPartido: Map<String, Int>? = null,
            @SerializedName("porGenero") val porGenero: Map<String, Int>? = null,
            @SerializedName("porSituacaoJulgamento") val porSituacaoJulgamento: Map<String, Int>? = null,
            @SerializedName("fichaLimpaTotal") val fichaLimpaTotal: Int? = null,
            @SerializedName("tentandoReeleicao") val tentandoReeleicao: Int? = null,
            @SerializedName("pesquisasRegistradas") val pesquisasRegistradas: Int? = null,
            @SerializedName("planosDeGovernoDisponiveis") val planosDeGovernoDisponiveis: Int? = null
        )
    }

    data class FontesDto(
        @SerializedName("nota") val nota: String? = null,
        @SerializedName("sistemas_nacionais_tse") val sistemasNacionais: List<SistemaDto>? = null,
        @SerializedName("tres") val tres: List<TreDto>? = null,
        @SerializedName("orgaos") val orgaos: List<OrgaoDto>? = null
    ) {
        data class SistemaDto(
            @SerializedName("nome") val nome: String? = null,
            @SerializedName("url") val url: String? = null,
            @SerializedName("utilidade") val utilidade: String? = null
        )

        data class TreDto(
            @SerializedName("uf") val uf: String? = null,
            @SerializedName("estado") val estado: String? = null,
            @SerializedName("tribunal") val tribunal: String? = null,
            @SerializedName("url") val url: String? = null,
            @SerializedName("titulo") val titulo: String? = null,
            @SerializedName("resumo") val resumo: String? = null,
            @SerializedName("secoes") val secoes: List<SecaoDto>? = null
        ) {
            data class SecaoDto(
                @SerializedName("titulo") val titulo: String? = null,
                @SerializedName("url") val url: String? = null
            )
        }

        data class OrgaoDto(
            @SerializedName("orgao") val orgao: String? = null,
            @SerializedName("url") val url: String? = null,
            @SerializedName("utilidade") val utilidade: String? = null,
            @SerializedName("resumo_pagina") val resumoPagina: String? = null
        )
    }

    // ============================ Carregamento ============================

    suspend fun ensureLoaded() {
        if (candidatosCache != null && pesquisasCache != null && regrasCache != null) return
        mutex.withLock {
            if (candidatosCache == null) loadCandidatos()
            if (pesquisasCache == null) loadPesquisas()
            if (regrasCache == null) loadRegras()
        }
    }

    suspend fun getCandidatos(): List<Candidate> {
        candidatosCache?.let { return it }
        return withContext(Dispatchers.IO) {
            mutex.withLock { if (candidatosCache == null) loadCandidatos(); candidatosCache!! }
        }
    }

    suspend fun getPesquisas(): List<PesquisaEleitoral> {
        pesquisasCache?.let { return it }
        return withContext(Dispatchers.IO) {
            mutex.withLock { if (pesquisasCache == null) loadPesquisas(); pesquisasCache!! }
        }
    }

    suspend fun getRegras(): TseRegras? {
        regrasCache?.let { return it }
        return withContext(Dispatchers.IO) {
            mutex.withLock { if (regrasCache == null) loadRegras(); regrasCache }
        }
    }

    suspend fun getFontesOficiais(): FontesOficiais? {
        fontesCache?.let { return it }
        return withContext(Dispatchers.IO) {
            mutex.withLock { if (fontesCache == null) loadFontes(); fontesCache }
        }
    }

    private fun loadFontes() {
        try {
            context.assets.open("tse_fontes_oficiais_2026.json").use { stream ->
                val dto = gson.fromJson(InputStreamReader(stream, Charsets.UTF_8), FontesDto::class.java)
                fontesCache = FontesOficiais(
                    nota = dto.nota.orEmpty(),
                    sistemasNacionais = dto.sistemasNacionais.orEmpty().map {
                        FontesOficiais.SistemaNacional(it.nome.orEmpty(), it.url.orEmpty(), it.utilidade.orEmpty())
                    },
                    tres = dto.tres.orEmpty().map { t ->
                        TreOficial(
                            uf = t.uf.orEmpty(),
                            estado = t.estado.orEmpty(),
                            tribunal = t.tribunal.orEmpty(),
                            url = t.url.orEmpty(),
                            titulo = t.titulo.orEmpty(),
                            resumo = t.resumo.orEmpty(),
                            secoes = t.secoes.orEmpty().map { s ->
                                TreOficial.SecaoOficial(s.titulo.orEmpty(), s.url.orEmpty())
                            }
                        )
                    },
                    orgaos = dto.orgaos.orEmpty().map { o ->
                        OrgaoOficial(o.orgao.orEmpty(), o.url.orEmpty(), o.utilidade.orEmpty(), o.resumoPagina.orEmpty())
                    }
                )
            }
        } catch (_: Exception) {
            // Asset de fontes complementares ausente: app segue com as URLs estáticas de AppConstants
        }
    }

    private fun loadCandidatos() {
        val dtoList = parseStreamingArray<CandidateDto>("tse_candidatos_2026.json")
        candidatosCache = dtoList.mapNotNull { dto -> mapCandidate(dto) }
    }

    private fun loadPesquisas() {
        val dtoList = parseStreamingArray<PesquisaDto>("tse_pesquisas_2026.json")
        pesquisasCache = dtoList.map { dto ->
            PesquisaEleitoral(
                protocolo = dto.protocolo,
                uf = dto.uf,
                municipio = dto.municipio,
                cargo = dto.cargo,
                empresa = dto.empresa,
                cnpj = dto.cnpj,
                pesquisaPropria = dto.pesquisaPropria == true,
                dataRegistro = dto.dataRegistro,
                dataInicio = dto.dataInicio,
                dataFim = dto.dataFim,
                dataDivulgacao = dto.dataDivulgacao,
                entrevistados = dto.entrevistados,
                estatistico = dto.estatistico,
                conre = dto.conre,
                valor = dto.valor,
                metodologia = dto.metodologia
            )
        }
    }

    private fun loadRegras() {
        context.assets.open("tse_regras_2026.json").use { stream ->
            val dto = gson.fromJson(InputStreamReader(stream, Charsets.UTF_8), RegrasDto::class.java)
            regrasCache = TseRegras(
                fonte = dto.fonte ?: "TSE - Dados Abertos",
                dataGeracaoDados = dto.dataGeracaoDados ?: "",
                dataPrimeiroTurno = dto.dataPrimeiroTurno ?: "04/10/2026",
                dataSegundoTurno = dto.dataSegundoTurno ?: "25/10/2026",
                horarioVotacao = dto.horarioVotacao ?: "8h às 17h",
                ordemVotacaoUrna = dto.ordemVotacaoUrna.orEmpty().map {
                    TseRegras.UrnaEtapa(
                        ordem = it.ordem ?: 0,
                        cargo = it.cargo ?: "",
                        codigo = it.codigo ?: "",
                        digitos = it.digitos ?: 0,
                        regra = it.regra ?: "",
                        sistema = it.sistema ?: ""
                    )
                },
                estatisticas = TseRegras.EstatisticasOficiais(
                    totalCandidatos = dto.estatisticas?.totalCandidatos ?: 0,
                    porCargo = dto.estatisticas?.porCargo.orEmpty(),
                    porUf = dto.estatisticas?.porUf.orEmpty(),
                    porPartido = dto.estatisticas?.porPartido.orEmpty(),
                    porGenero = dto.estatisticas?.porGenero.orEmpty(),
                    porSituacaoJulgamento = dto.estatisticas?.porSituacaoJulgamento.orEmpty(),
                    fichaLimpaTotal = dto.estatisticas?.fichaLimpaTotal ?: 0,
                    tentandoReeleicao = dto.estatisticas?.tentandoReeleicao ?: 0,
                    pesquisasRegistradas = dto.estatisticas?.pesquisasRegistradas ?: 0,
                    planosDeGovernoDisponiveis = dto.estatisticas?.planosDeGovernoDisponiveis ?: 0
                )
            )
        }
    }

    private inline fun <reified T> parseStreamingArray(assetName: String): List<T> {
        context.assets.open(assetName).use { stream ->
            JsonReader(InputStreamReader(stream, Charsets.UTF_8)).use { reader ->
                val list = ArrayList<T>(24_000)
                reader.beginArray()
                while (reader.hasNext()) {
                    list.add(gson.fromJson<T>(reader, T::class.java))
                }
                reader.endArray()
                return list
            }
        }
    }

    private fun mapCandidate(dto: CandidateDto): Candidate? {
        val id = dto.id ?: return null
        return Candidate(
            id = id,
            numero = dto.numero.orEmpty(),
            nomeUrna = dto.nomeUrna.orEmpty(),
            nomeCompleto = dto.nomeCompleto.orEmpty(),
            cargo = dto.cargoDisplay.orEmpty(),
            cargoCodigo = dto.cargoCodigo.orEmpty(),
            partido = dto.partido.orEmpty(),
            coligacao = dto.coligacao,
            federacao = dto.federacao ?: dto.siglaFederacao,
            estadoUf = dto.estadoUf.orEmpty(),
            regiao = dto.regiao.orEmpty(),
            digitosUrna = dto.digitosUrna ?: 0,
            ordemVotacao = dto.ordemVotacao ?: 0,
            fotoLocal = dto.fotoLocal,
            processosAdministrativos = dto.processosAdministrativos ?: 0,
            motivosCassacao = dto.motivosCassacao.orEmpty(),
            fichaLimpa = dto.fichaLimpa ?: true,
            mandatosAnteriores = dto.mandatosAnteriores ?: 0,
            totalEleicoesDisputadas = dto.totalEleicoesDisputadas ?: 0,
            reeleicao = dto.reeleicao ?: false,
            propostasResumo = dto.propostasResumo.orEmpty(),
            temPlanoGoverno = dto.temPlanoGoverno ?: false,
            situacaoCandidatura = dto.situacaoJulgamento ?: "PENDENTE",
            idade = dto.idade,
            genero = dto.genero,
            corRaca = dto.corRaca,
            grauInstrucao = dto.grauInstrucao,
            ocupacao = dto.ocupacao,
            municipioNascimento = dto.municipioNascimento,
            ufNascimento = dto.ufNascimento,
            redesSociais = dto.redesSociais.orEmpty(),
            cidadesAtuacao = dto.municipioNascimento?.let { listOf(it) } ?: emptyList()
        )
    }
}
