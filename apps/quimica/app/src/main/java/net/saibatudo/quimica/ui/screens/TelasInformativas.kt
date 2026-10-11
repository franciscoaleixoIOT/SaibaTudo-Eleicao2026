package net.saibatudo.quimica.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import net.saibatudo.quimica.BuildConfig
import net.saibatudo.quimica.data.bundle.EstadoAtualizacao
import net.saibatudo.quimica.data.prefs.Nivel
import net.saibatudo.quimica.data.prefs.TamanhoFonte
import net.saibatudo.quimica.data.prefs.TemaApp
import net.saibatudo.quimica.data.prefs.UserPreferences
import net.saibatudo.quimica.data.repository.Pacote
import net.saibatudo.quimica.domain.GhsTextos
import net.saibatudo.quimica.ui.components.AvisoBox
import net.saibatudo.quimica.ui.components.Cartao
import net.saibatudo.quimica.ui.components.FontesView
import net.saibatudo.quimica.ui.components.LinhaCampo
import net.saibatudo.quimica.ui.components.PictogramaGhs
import net.saibatudo.quimica.ui.components.TituloSecao
import net.saibatudo.quimica.ui.viewmodel.MainViewModel
import net.saibatudo.quimica.ui.viewmodel.Tela
import java.text.DateFormat
import java.util.Date

@Composable
private fun Pagina(titulo: String, modifier: Modifier = Modifier, conteudo: @Composable () -> Unit) {
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(titulo, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
        conteudo()
    }
}

// ---- Mais ----------------------------------------------------------------------------------------------------------------------------

@Composable
fun MaisScreen(onAbrir: (Tela) -> Unit, modifier: Modifier = Modifier) {
    val itens = listOf(
        Triple("Segurança e GHS", "Pictogramas, palavras de sinal e frases de perigo", Tela.Seguranca),
        Triple("Sobre os dados", "Versão, fontes, licenças e atualização", Tela.Sobre),
        Triple("Privacidade", "O que fica no aparelho e o que sai dele", Tela.Privacidade),
        Triple("Configurações", "Tema, tamanho do texto e nível", Tela.Configuracoes)
    )
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Text("Mais", Modifier.padding(16.dp).semantics { heading() }, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        itens.forEach { (titulo, desc, tela) ->
            Row(
                Modifier.fillMaxWidth().clickable(role = Role.Button) { onAbrir(tela) }.padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column(Modifier.weight(1f)) {
                    Text(titulo, style = MaterialTheme.typography.titleMedium)
                    Text(desc, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null)
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }
        Text(
            "SaibaTudo Química ${BuildConfig.VERSION_NAME} (versão ${BuildConfig.VERSION_CODE}). Código aberto, licença MIT.",
            Modifier.padding(16.dp), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

// ---- Segurança e GHS --------------------------------------------------------------------------------------------------------------------

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SegurancaScreen(pacote: Pacote?, onAbrirUrl: (String) -> Unit, modifier: Modifier = Modifier) {
    val ghsFonte = pacote?.fontesExibicao?.firstOrNull { it.nome.contains("CLP", true) || it.id.equals("clp", true) }
    val icscFonte = pacote?.fontesExibicao?.firstOrNull { it.nome.contains("ICSC", true) && it.url != null }
    Pagina("Segurança e GHS", modifier) {
        Cartao {
            TituloSecao("O que é o GHS")
            Text(
                "O Sistema Globalmente Harmonizado (GHS) padroniza como os perigos de uma substância aparecem nos rótulos: pictogramas, palavra de sinal (Perigo ou Atenção) e frases de perigo (H).",
                style = MaterialTheme.typography.bodyMedium
            )
            Text(
                "Na ficha de cada composto, o app mostra a classificação que estiver no pacote de dados. Quando não há classificação no dado, o app diz isso e não inventa nada.",
                style = MaterialTheme.typography.bodyMedium
            )
        }
        Cartao {
            TituloSecao("Os nove pictogramas")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                GhsTextos.PICTOGRAMAS.keys.sorted().forEach { PictogramaGhs(it, tamanho = 64.dp) }
            }
            GhsTextos.PICTOGRAMAS.entries.sortedBy { it.key }.forEach { (cod, par) ->
                LinhaCampo(cod, "${par.first}: ${par.second}")
            }
        }
        Cartao {
            TituloSecao("Palavra de sinal e frases H")
            LinhaCampo("Perigo", "para as categorias mais graves")
            LinhaCampo("Atenção", "para as categorias menos graves")
            LinhaCampo("H2xx", "Perigos físicos: explosivos, inflamáveis, comburentes, gases sob pressão, corrosivos para metais")
            LinhaCampo("H3xx", "Perigos para a saúde: toxicidade aguda, corrosão e irritação, sensibilização, câncer, órgãos-alvo")
            LinhaCampo("H4xx", "Perigos ao meio ambiente: organismos aquáticos e camada de ozônio")
            Text("Texto das frases: ${GhsTextos.FONTE_NOME} (${GhsTextos.FONTE_LICENCA}).", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Cartao {
            TituloSecao("Fichas de segurança (ICSC)")
            Text(
                "As Fichas Internacionais de Segurança Química (OIT/OMS) não têm licença de reuso, então o app não as copia. Na ficha de cada composto há um botão que abre a busca por CAS no site da OIT.",
                style = MaterialTheme.typography.bodyMedium
            )
            icscFonte?.url?.takeIf { it.startsWith("https://") }?.let { u -> OutlinedButton(onClick = { onAbrirUrl(u) }) { Text("Site das fichas ICSC") } }
        }
        Cartao {
            TituloSecao("Cuidados gerais")
            listOf(
                "Leia o rótulo e a FISPQ (ficha de segurança do fabricante) antes de usar qualquer produto.",
                "Nunca misture produtos de limpeza nem substâncias que você não conhece: a mistura pode liberar gases tóxicos.",
                "Use luvas, óculos de proteção e ambiente ventilado quando o rótulo pedir.",
                "Guarde produtos nas embalagens originais, longe de crianças e de alimentos.",
                "Em caso de acidente ou intoxicação, procure atendimento imediatamente."
            ).forEach { Row { Text("•  ", color = MaterialTheme.colorScheme.primary); Text(it, style = MaterialTheme.typography.bodyMedium) } }
            AvisoBox("Emergências no Brasil: SAMU 192, Bombeiros 193 e Disque-Intoxicação 0800 722 6001.")
        }
        ghsFonte?.let { Cartao { FontesView(listOf(it), onAbrirUrl) } }
    }
}

// ---- Sobre os dados ---------------------------------------------------------------------------------------------------------------------

@Composable
fun SobreDadosScreen(
    pacote: Pacote?, prefs: UserPreferences, atualizacao: EstadoAtualizacao, onAtualizar: () -> Unit, onAbrirUrl: (String) -> Unit, modifier: Modifier = Modifier
) {
    Pagina("Sobre os dados", modifier) {
        if (pacote == null) {
            Text("Carregando os dados…")
            return@Pagina
        }
        val m = pacote.manifest
        val dias = m.pollIntervalMinutes / (24 * 60)
        Cartao {
            TituloSecao("Pacote em uso")
            LinhaCampo("Versão", m.version.orEmpty())
            LinhaCampo("Gerado em", m.generatedAt.orEmpty())
            LinhaCampo("Origem", pacote.origem)
            LinhaCampo("Elementos", pacote.elementos.size.toString())
            LinhaCampo("Compostos", pacote.indice.tamanho.toString())
            LinhaCampo("Arquivos", m.arquivos.size.toString())
            Text(
                "O pacote é assinado digitalmente (ECDSA P-256). O app só aceita atualizações com assinatura válida, confere o checksum (SHA-256) de cada arquivo e nunca troca por uma versão mais antiga.",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Cartao {
            TituloSecao("Atualização")
            Text("O app procura dados novos a cada $dias dias, em segundo plano, e quando você abre o app (se já passou o prazo).", style = MaterialTheme.typography.bodyMedium)
            if (prefs.ultimaVerificacaoDados > 0) LinhaCampo("Última verificação", DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(prefs.ultimaVerificacaoDados)))
            prefs.ultimaVersaoDados?.let { LinhaCampo("Última versão baixada", it) }
            when (atualizacao) {
                EstadoAtualizacao.Ociosa -> Unit
                EstadoAtualizacao.Verificando -> Text("Verificando…")
                is EstadoAtualizacao.Concluida -> Text(MainViewModel.descreverResultado(atualizacao.resultado), style = MaterialTheme.typography.bodyMedium)
            }
            Button(onClick = onAtualizar, enabled = atualizacao != EstadoAtualizacao.Verificando) { Text("Atualizar agora") }
        }
        Cartao {
            TituloSecao("Fontes e licenças")
            pacote.fontesExibicao.forEach { f ->
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(f.nome, style = MaterialTheme.typography.titleSmall)
                    Text(listOfNotNull(f.licenca?.let { "Licença: $it" }, f.uso?.let { "Uso: $it" }, f.acessadoEm?.let { "Acesso em $it" }).joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    f.url?.takeIf { it.startsWith("https://") }?.let { u -> OutlinedButton(onClick = { onAbrirUrl(u) }) { Text("Abrir o site") } }
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            }
            if (pacote.manifest.licencas.isNotEmpty()) {
                Text("Licenças: " + pacote.manifest.licencas.joinToString(", ") { it.nome }, style = MaterialTheme.typography.bodySmall)
            }
        }
        Cartao {
            TituloSecao("Este aplicativo")
            Text("Código aberto, licença MIT. O desenho das moléculas usa o SmilesDrawer (licença MIT). Sem anúncios, sem login e sem análise de uso.", style = MaterialTheme.typography.bodyMedium)
            OutlinedButton(onClick = { onAbrirUrl(BuildConfig.SOURCE_URL) }) { Text("Ver o código-fonte") }
        }
    }
}

// ---- Privacidade ---------------------------------------------------------------------------------------------------------------------------

@Composable
fun PrivacidadeScreen(onAbrirUrl: (String) -> Unit, onLimparHistorico: () -> Unit, modifier: Modifier = Modifier) {
    Pagina("Privacidade", modifier) {
        Cartao {
            TituloSecao("Nesta versão, nada seu sai do aparelho")
            Text(
                "Suas perguntas são interpretadas e respondidas no próprio aparelho. O único uso de internet é baixar atualizações assinadas do pacote de dados em saibatudo.net.",
                style = MaterialTheme.typography.bodyMedium
            )
        }
        Cartao {
            TituloSecao("O que fica guardado no aparelho")
            listOf(
                "Suas preferências: tema, tamanho do texto, nível e economia de dados.",
                "O histórico das últimas perguntas (até 30), só para você reutilizá-las. Você pode apagá-lo abaixo.",
                "O pacote de dados e as atualizações baixadas."
            ).forEach { Row { Text("•  ", color = MaterialTheme.colorScheme.primary); Text(it, style = MaterialTheme.typography.bodyMedium) } }
            OutlinedButton(onClick = onLimparHistorico) { Text("Apagar o histórico de perguntas") }
        }
        Cartao {
            TituloSecao("O que sai do aparelho")
            Text(
                "Ao procurar atualização, o app faz pedidos HTTPS para saibatudo.net para baixar os arquivos de dados. Como em qualquer acesso à internet, o servidor vê o endereço IP e a versão do app. Não há envio de perguntas, de identificadores ou de dados de uso.",
                style = MaterialTheme.typography.bodyMedium
            )
        }
        Cartao {
            TituloSecao("O que o app não tem")
            Text("Sem login, sem anúncios, sem análise de uso, sem localização, sem acesso a contatos, câmera ou microfone.", style = MaterialTheme.typography.bodyMedium)
        }
        Cartao {
            TituloSecao("IA na nuvem")
            Text(
                "Ainda não disponível. Se for oferecida no futuro, será opcional, só com o seu consentimento explícito e com aviso do que seria enviado.",
                style = MaterialTheme.typography.bodyMedium
            )
        }
        OutlinedButton(onClick = { onAbrirUrl(BuildConfig.PRIVACY_URL) }) { Text("Política de privacidade completa") }
        OutlinedButton(onClick = { onAbrirUrl(BuildConfig.SOURCE_URL + "/issues") }) { Text("Relatar um problema ou erro nos dados") }
    }
}

// ---- Configurações -----------------------------------------------------------------------------------------------------------------------

@Composable
fun ConfiguracoesScreen(
    prefs: UserPreferences, onTema: (TemaApp) -> Unit, onFonte: (TamanhoFonte) -> Unit, onNivel: (Nivel) -> Unit, onEconomia: (Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    Pagina("Configurações", modifier) {
        Cartao {
            TituloSecao("Tema")
            Column(Modifier.selectableGroup()) {
                TemaApp.entries.forEach { t -> OpcaoRadio(t.rotulo, null, prefs.tema == t) { onTema(t) } }
            }
        }
        Cartao {
            TituloSecao("Tamanho do texto")
            Column(Modifier.selectableGroup()) {
                TamanhoFonte.entries.forEach { f -> OpcaoRadio(f.rotulo, null, prefs.tamanhoFonte == f) { onFonte(f) } }
            }
            Text("Exemplo: H₂O tem massa molar de 18,015 g/mol.", style = MaterialTheme.typography.bodyMedium)
        }
        Cartao {
            TituloSecao("Nível das explicações")
            Column(Modifier.selectableGroup()) {
                Nivel.entries.forEach { n -> OpcaoRadio(n.rotulo, n.descricao, prefs.nivel == n) { onNivel(n) } }
            }
        }
        Cartao {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                Column(Modifier.weight(1f)) {
                    Text("Economia de dados", style = MaterialTheme.typography.titleSmall)
                    Text("Atualizar os dados só em Wi-Fi ou rede sem franquia.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Switch(checked = prefs.economiaDeDados, onCheckedChange = onEconomia)
            }
        }
    }
}

@Composable
private fun OpcaoRadio(rotulo: String, descricao: String?, selecionado: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().selectable(selected = selecionado, onClick = onClick, role = Role.RadioButton).padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        RadioButton(selected = selecionado, onClick = null)
        Column {
            Text(rotulo, style = MaterialTheme.typography.bodyLarge)
            descricao?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}
