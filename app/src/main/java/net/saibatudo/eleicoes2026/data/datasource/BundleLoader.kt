package net.saibatudo.eleicoes2026.data.datasource

import com.google.gson.Gson
import com.google.gson.stream.JsonReader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import net.saibatudo.eleicoes2026.data.bundle.BundleManifest
import net.saibatudo.eleicoes2026.data.bundle.BundleReader
import net.saibatudo.eleicoes2026.data.dto.CandidateDto
import net.saibatudo.eleicoes2026.data.dto.FontesDto
import net.saibatudo.eleicoes2026.data.dto.PesquisaDto
import net.saibatudo.eleicoes2026.data.dto.RegrasDto
import net.saibatudo.eleicoes2026.domain.model.Candidate
import net.saibatudo.eleicoes2026.domain.model.Elegibilidade
import net.saibatudo.eleicoes2026.domain.model.FontesOficiais
import net.saibatudo.eleicoes2026.domain.model.OrgaoOficial
import net.saibatudo.eleicoes2026.domain.model.PesquisaEleitoral
import net.saibatudo.eleicoes2026.domain.model.ResultadoCandidato
import net.saibatudo.eleicoes2026.domain.model.ResultadoTurno
import net.saibatudo.eleicoes2026.domain.model.TreOficial
import net.saibatudo.eleicoes2026.domain.model.TseRegras
import net.saibatudo.eleicoes2026.domain.model.Ufs
import java.io.InputStreamReader

/** Dados oficiais carregados de um pacote (imutável). */
data class ElectionData(
    val manifest: BundleManifest,
    val origem: String,
    val candidatos: List<Candidate>,
    val pesquisas: List<PesquisaEleitoral>,
    val regras: TseRegras,
    val fontes: FontesOficiais?,
    val resultadosTse: ResultadosTseConfig?
) {
    val porId: Map<String, Candidate> by lazy { candidatos.associateBy { it.id } }
    val temResultados: Boolean get() = candidatos.any { it.resultado != null }
}

/** Códigos do sistema de resultados do TSE (para a apuração ao vivo). */
data class ResultadosTseConfig(
    val base: String,
    val federalTurno1: Int, val federalTurno2: Int,
    val estadualTurno1: Int, val estadualTurno2: Int,
    val cargos: Map<String, Int>
)

/**
 * Carrega um pacote de dados oficial (snapshot embutido ou atualização baixada).
 * Puro (sem Android): testável em JVM contra os arquivos reais de data/eleicoes2026.
 */
object BundleLoader {
    private val gson = Gson()

    suspend fun carregar(reader: BundleReader, manifest: BundleManifest): ElectionData = coroutineScope {
        val arquivos = manifest.arquivos.orEmpty().mapNotNull { it.path }
        val shardsCand = arquivos.filter { it.startsWith("candidatos/") && it.endsWith(".json") }
        val shardsRes = arquivos.filter { it.startsWith("resultados/") && it.endsWith(".json") }

        val candidatosDef = shardsCand.map { p -> async(Dispatchers.Default) { lerCandidatos(reader, p) } }
        val resultadosDef = shardsRes.map { p -> async(Dispatchers.Default) { lerResultados(reader, p) } }
        val pesquisasDef = async(Dispatchers.Default) {
            if ("pesquisas.json" in arquivos) lerPesquisas(reader) else emptyList()
        }
        val regrasDto = reader.open("regras.json").use {
            gson.fromJson(InputStreamReader(it, Charsets.UTF_8), RegrasDto::class.java)
        }
        val fontes = if ("fontes.json" in arquivos) lerFontes(reader) else null

        val resultados = resultadosDef.awaitAll().fold(emptyMap<String, ResultadoCandidato>()) { acc, m -> acc + m }
        val candidatos = candidatosDef.awaitAll().flatten().map { c ->
            resultados[c.id]?.let { c.copy(resultado = it) } ?: c
        }
        ElectionData(
            manifest = manifest,
            origem = reader.origem,
            candidatos = candidatos,
            pesquisas = pesquisasDef.await(),
            regras = mapRegras(regrasDto),
            fontes = fontes,
            resultadosTse = mapResultadosTse(regrasDto.resultadosTse)
        )
    }

    // ------------------------------------------------------------------ candidatos

    private fun lerCandidatos(reader: BundleReader, path: String): List<Candidate> {
        reader.open(path).use { stream ->
            JsonReader(InputStreamReader(stream, Charsets.UTF_8)).use { jr ->
                val lista = ArrayList<Candidate>(4096)
                jr.beginArray()
                while (jr.hasNext()) {
                    val dto = gson.fromJson<CandidateDto>(jr, CandidateDto::class.java)
                    mapCandidate(dto)?.let(lista::add)
                }
                jr.endArray()
                return lista
            }
        }
    }

    fun mapCandidate(d: CandidateDto): Candidate? {
        val id = d.id ?: return null
        val cargo = d.cargo ?: return null
        val uf = d.estadoUf ?: return null
        return Candidate(
            id = id,
            numero = d.numero.orEmpty(),
            nomeUrna = d.nomeUrna.orEmpty(),
            nomeCompleto = d.nomeCompleto.orEmpty(),
            cargoCodigo = cargo,
            partido = d.partido.orEmpty(),
            nomePartido = d.nomePartido,
            coligacao = d.coligacao,
            federacao = d.federacao ?: d.siglaFederacao,
            estadoUf = uf,
            regiao = d.regiao ?: Ufs.regiaoDe(uf) ?: "Nacional",
            digitosUrna = d.digitosUrna ?: 0,
            ordemVotacao = d.ordemVotacao ?: 0,
            foto = d.foto,
            temFoto = d.temFoto == true || d.foto != null,
            situacao = d.situacao,
            elegibilidade = Elegibilidade.fromWire(d.elegibilidade),
            naUrna = d.naUrna ?: true,
            motivosIndeferimento = d.motivosIndeferimento.orEmpty(),
            vezesEleito = d.vezesEleito ?: 0,
            eleicoesDisputadas = d.eleicoesDisputadas ?: 0,
            eleitoMesmoCargo = d.eleitoMesmoCargo ?: false,
            redesSociais = d.redesSociais.orEmpty(),
            temPlanoGoverno = d.temPlanoGoverno ?: false,
            temasPlano = d.temasPlano.orEmpty(),
            patrimonioDeclarado = d.patrimonioDeclarado,
            qtdBens = d.qtdBens,
            declaraBens = d.declaraBens,
            prestouContas = d.prestouContas,
            substituido = d.substituido ?: false,
            idade = d.idade,
            genero = d.genero,
            corRaca = d.corRaca,
            grauInstrucao = d.grauInstrucao,
            estadoCivil = d.estadoCivil,
            ocupacao = d.ocupacao,
            municipioNascimento = d.municipioNascimento,
            ufNascimento = d.ufNascimento
        )
    }

    // ------------------------------------------------------------------ resultados oficiais (CSV pós-apuração)

    /** resultados/<UF>.json: { "<sq>": { "situacaoTotalizacao": "...", "1": {votos, percentual, situacao}, "2": {...} } } */
    private fun lerResultados(reader: BundleReader, path: String): Map<String, ResultadoCandidato> {
        val out = HashMap<String, ResultadoCandidato>()
        reader.open(path).use { stream ->
            JsonReader(InputStreamReader(stream, Charsets.UTF_8)).use { jr ->
                jr.beginObject()
                while (jr.hasNext()) {
                    val sq = jr.nextName()
                    var situacao: String? = null
                    val turnos = HashMap<Int, ResultadoTurno>()
                    jr.beginObject()
                    while (jr.hasNext()) {
                        val k = jr.nextName()
                        if (k == "situacaoTotalizacao") {
                            situacao = jr.nextString()
                        } else {
                            val turno = k.toIntOrNull()
                            if (turno == null) { jr.skipValue(); continue }
                            var votos: Long? = null
                            var pct: Double? = null
                            var sit: String? = null
                            jr.beginObject()
                            while (jr.hasNext()) {
                                when (jr.nextName()) {
                                    "votos" -> votos = jr.nextLong()
                                    "percentual" -> pct = jr.nextDouble()
                                    "situacao" -> sit = jr.nextString()
                                    else -> jr.skipValue()
                                }
                            }
                            jr.endObject()
                            turnos[turno] = ResultadoTurno(votos, pct, sit)
                        }
                    }
                    jr.endObject()
                    out[sq] = ResultadoCandidato(situacao, turnos)
                }
                jr.endObject()
            }
        }
        return out
    }

    // ------------------------------------------------------------------ pesquisas / regras / fontes

    private fun lerPesquisas(reader: BundleReader): List<PesquisaEleitoral> {
        reader.open("pesquisas.json").use { stream ->
            JsonReader(InputStreamReader(stream, Charsets.UTF_8)).use { jr ->
                val lista = ArrayList<PesquisaEleitoral>(4000)
                jr.beginArray()
                while (jr.hasNext()) {
                    val d = gson.fromJson<PesquisaDto>(jr, PesquisaDto::class.java)
                    lista.add(
                        PesquisaEleitoral(
                            d.protocolo, d.uf, d.municipio, d.cargo, d.empresa, d.cnpj, d.pesquisaPropria == true,
                            d.dataRegistro, d.dataInicio, d.dataFim, d.dataDivulgacao, d.entrevistados,
                            d.estatistico, d.conre, d.valor, d.metodologia
                        )
                    )
                }
                jr.endArray()
                return lista
            }
        }
    }

    private fun mapRegras(d: RegrasDto): TseRegras {
        val e = d.estatisticas
        return TseRegras(
            fonte = d.fonte ?: "Tribunal Superior Eleitoral (TSE)",
            licenca = d.licenca ?: "CC BY 4.0",
            extracaoTse = d.extracaoTse.orEmpty(),
            turno1 = d.turno1 ?: "2026-10-04",
            turno2 = d.turno2 ?: "2026-10-25",
            horarioVotacao = d.horarioVotacao ?: "08h às 17h (horário de Brasília)",
            ordemVotacaoUrna = d.ordemVotacaoUrna.orEmpty().map {
                TseRegras.UrnaEtapa(it.ordem ?: 0, it.cargo.orEmpty(), it.codigo.orEmpty(), it.digitos ?: 0,
                    it.regra.orEmpty(), it.sistema.orEmpty())
            },
            estatisticas = TseRegras.Estatisticas(
                totalRegistros = e?.totalRegistros ?: 0,
                totalNaUrna = e?.totalNaUrna ?: 0,
                porCargo = e?.porCargo.orEmpty(),
                porCargoNaUrna = e?.porCargoNaUrna.orEmpty(),
                porUf = e?.porUf.orEmpty(),
                porPartido = e?.porPartido.orEmpty(),
                porGenero = e?.porGenero.orEmpty(),
                porElegibilidade = e?.porElegibilidade.orEmpty(),
                eleitosMesmoCargoAntes = e?.eleitosMesmoCargoAntes ?: 0,
                pesquisasRegistradas = e?.pesquisasRegistradas ?: 0,
                candidatosComPlanoGoverno = e?.candidatosComPlanoGoverno ?: 0
            ),
            temas = d.temas.orEmpty(),
            glossario = d.glossario.orEmpty()
        )
    }

    private fun mapResultadosTse(d: RegrasDto.ResultadosTseDto?): ResultadosTseConfig? {
        if (d == null) return null
        return ResultadosTseConfig(
            base = d.base ?: return null,
            federalTurno1 = d.federal?.turno1 ?: return null,
            federalTurno2 = d.federal.turno2 ?: return null,
            estadualTurno1 = d.estadual?.turno1 ?: return null,
            estadualTurno2 = d.estadual.turno2 ?: return null,
            cargos = d.cargos.orEmpty()
        )
    }

    private fun lerFontes(reader: BundleReader): FontesOficiais? = try {
        reader.open("fontes.json").use { stream ->
            val d = gson.fromJson(InputStreamReader(stream, Charsets.UTF_8), FontesDto::class.java)
            FontesOficiais(
                nota = d.nota.orEmpty(),
                sistemasNacionais = d.sistemasNacionais.orEmpty().map {
                    FontesOficiais.SistemaNacional(it.nome.orEmpty(), it.url.orEmpty(), it.utilidade.orEmpty())
                },
                tres = d.tres.orEmpty().map { t ->
                    TreOficial(
                        uf = t.uf.orEmpty(), estado = t.estado.orEmpty(), tribunal = t.tribunal.orEmpty(),
                        url = t.url.orEmpty(),
                        secoes = t.secoes.orEmpty().map { TreOficial.SecaoOficial(it.titulo.orEmpty(), it.url.orEmpty()) }
                    )
                },
                orgaos = d.orgaos.orEmpty().map { OrgaoOficial(it.orgao.orEmpty(), it.url.orEmpty(), it.utilidade.orEmpty()) }
            )
        }
    } catch (_: Exception) {
        null // fontes complementares são opcionais; o app segue com os links oficiais fixos
    }
}
