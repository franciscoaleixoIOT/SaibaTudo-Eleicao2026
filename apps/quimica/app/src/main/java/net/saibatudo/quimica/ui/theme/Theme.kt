package net.saibatudo.quimica.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.Density
import androidx.core.view.WindowCompat
import net.saibatudo.quimica.data.prefs.TemaApp

private val LightColorScheme = lightColorScheme(
    primary = TealPrimary, onPrimary = Color.White, primaryContainer = TealLight, onPrimaryContainer = Color(0xFF042F2E),
    secondary = GoldSecondary, onSecondary = NavyAccent, secondaryContainer = Color(0xFFFEF3C7), onSecondaryContainer = Color(0xFF78350F),
    tertiary = NavyAccent, onTertiary = Color.White,
    background = BackgroundLight, onBackground = TextPrimaryLight, surface = SurfaceLight, onSurface = TextPrimaryLight,
    surfaceVariant = SurfaceVariantLight, onSurfaceVariant = TextSecondaryLight, outline = OutlineLight, outlineVariant = OutlineVariantLight,
    error = ErrorLight, onError = Color.White
)

private val DarkColorScheme = darkColorScheme(
    primary = TealPrimaryDark, onPrimary = Color(0xFF042F2E), primaryContainer = TealContainerDark, onPrimaryContainer = TealOnContainerDark,
    secondary = GoldSecondaryDark, onSecondary = Color(0xFF451A03), secondaryContainer = Color(0xFF78350F), onSecondaryContainer = Color(0xFFFEF3C7),
    tertiary = GoldSecondaryDark, onTertiary = Color.Black,
    background = BackgroundDark, onBackground = TextPrimaryDark, surface = SurfaceDark, onSurface = TextPrimaryDark,
    surfaceVariant = SurfaceVariantDark, onSurfaceVariant = TextSecondaryDark, outline = OutlineDark, outlineVariant = OutlineVariantDark,
    error = ErrorDark, onError = Color(0xFF450A0A)
)

/** O tema atual é escuro? (usado pela tabela periódica e pela WebView da molécula). */
val LocalTemaEscuro = staticCompositionLocalOf { false }

/** Tema do app: claro, escuro ou do sistema (preferência do usuário) e escala de fonte adicional (acessibilidade). */
@Composable
fun SaibaTudoTheme(tema: TemaApp = TemaApp.SISTEMA, escalaFonte: Float = 1f, content: @Composable () -> Unit) {
    val escuro = when (tema) {
        TemaApp.SISTEMA -> isSystemInDarkTheme()
        TemaApp.CLARO -> false
        TemaApp.ESCURO -> true
    }
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !escuro
        }
    }
    val densidade = LocalDensity.current
    CompositionLocalProvider(
        LocalDensity provides Density(densidade.density, densidade.fontScale * escalaFonte),
        LocalTemaEscuro provides escuro
    ) {
        MaterialTheme(colorScheme = if (escuro) DarkColorScheme else LightColorScheme, content = content)
    }
}
