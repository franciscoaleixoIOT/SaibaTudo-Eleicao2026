package com.example.saibatudo_eleicao2026.ui.theme

import androidx.compose.ui.graphics.Color

// Primary Civic Palette
val GreenPrimary = Color(0xFF007A3D)
val GreenLight = Color(0xFFE8F5E9)
val GoldSecondary = Color(0xFFFFB81C)
val NavyAccent = Color(0xFF0C2340)

// Light Palette (WCAG Compliant)
val BackgroundLight = Color(0xFFF8F9FA)
val SurfaceLight = Color(0xFFFFFFFF)
val SurfaceVariantLight = Color(0xFFF1F5F9)
val TextPrimaryLight = Color(0xFF0F172A)
val TextSecondaryLight = Color(0xFF475569)
val OutlineLight = Color(0xFFCBD5E1)
val OutlineVariantLight = Color(0xFFE2E8F0)
val ErrorLight = Color(0xFFDC2626)

// Dark Palette (High-Contrast & Accessible)
val GreenPrimaryDark = Color(0xFF22C55E) // Bright vibrant civic green (7.5:1 contrast on #0F172A)
val GreenContainerDark = Color(0xFF14532D) // Deep emerald container
val GreenOnContainerDark = Color(0xFFBBF7D0) // Crisp mint text on dark green
val GoldSecondaryDark = Color(0xFFFBBF24) // Luminous warm gold
val BackgroundDark = Color(0xFF0B132B) // Deep slate background
val SurfaceDark = Color(0xFF1C2541) // Elevated dark card surface
val SurfaceVariantDark = Color(0xFF3A4765) // Chip & input variant surface
val TextPrimaryDark = Color(0xFFFFFFFF) // Pure white text
val TextSecondaryDark = Color(0xFFCBD5E1) // Highly readable secondary text
val OutlineDark = Color(0xFF475569)
val OutlineVariantDark = Color(0xFF334155)
val ErrorDark = Color(0xFFF87171) // High-contrast red for dark mode

// Backward-compatibility aliases
val TextPrimary = TextPrimaryLight
val TextSecondary = TextSecondaryLight
val ChipBackground = SurfaceVariantLight
val ChipSelectedBackground = GreenPrimary
val ChipSelectedText = Color.White
val StatusApproved = Color(0xFF16A34A)
val StatusPending = Color(0xFFD97706)
val StatusRejected = Color(0xFFDC2626)
