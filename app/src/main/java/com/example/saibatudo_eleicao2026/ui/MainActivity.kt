package com.example.saibatudo_eleicao2026.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.example.saibatudo_eleicao2026.ai.engine.HybridAiInferenceEngine
import com.example.saibatudo_eleicao2026.ai.engine.HuggingFaceInferenceEngine
import com.example.saibatudo_eleicao2026.ai.engine.LocalOfficialAiEngine
import com.example.saibatudo_eleicao2026.ai.engine.TseKnowledgeContext
import com.example.saibatudo_eleicao2026.data.datasource.OfficialElectionDataSource
import com.example.saibatudo_eleicao2026.data.repository.ElectionsRepositoryImpl
import com.example.saibatudo_eleicao2026.ui.screens.MainAppScreen
import com.example.saibatudo_eleicao2026.ui.theme.SaibaTudoTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Fonte de dados OFICIAL do TSE (assets gerados do Portal de Dados Abertos do TSE)
        val dataSource = OfficialElectionDataSource(applicationContext)
        val repository = ElectionsRepositoryImpl(dataSource)

        // Motor local determinístico alimentado pelos MESMOS dados oficiais do TSE
        val localEngine = LocalOfficialAiEngine {
            TseKnowledgeContext(
                candidatos = dataSource.getCandidatos(),
                pesquisas = dataSource.getPesquisas(),
                regras = dataSource.getRegras()
            )
        }

        // Motor híbrido: modelo oficial publicado no Hugging Face + fallback local oficial
        val aiEngine = HybridAiInferenceEngine(
            cloudEngine = HuggingFaceInferenceEngine(),
            localEngine = localEngine
        )

        setContent {
            SaibaTudoTheme {
                MainAppScreen(
                    repository = repository,
                    aiEngine = aiEngine
                )
            }
        }
    }
}
