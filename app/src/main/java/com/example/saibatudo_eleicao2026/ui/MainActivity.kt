package com.example.saibatudo_eleicao2026.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.example.saibatudo_eleicao2026.ui.screens.MainAppScreen
import com.example.saibatudo_eleicao2026.ui.theme.SaibaTudoTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            SaibaTudoTheme {
                MainAppScreen()
            }
        }
    }
}
