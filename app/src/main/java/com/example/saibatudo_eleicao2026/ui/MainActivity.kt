package com.example.saibatudo_eleicao2026.ui

import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.example.saibatudo_eleicao2026.R
import com.example.saibatudo_eleicao2026.core.constants.AppConstants

class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Simple initial view binding / layout
        val textView = TextView(this).apply {
            text = "Bem-vindo ao ${AppConstants.APP_NAME}\nModelo de IA: ${AppConstants.HF_MODEL_REPO_ID}\n\nInicializando menus, submenus e filtros inteligentes..."
            textSize = 18f
            setPadding(48, 48, 48, 48)
        }
        setContentView(textView)
    }
}
