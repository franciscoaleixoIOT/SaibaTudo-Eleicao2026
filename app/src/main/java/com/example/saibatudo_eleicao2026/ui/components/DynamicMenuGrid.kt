package com.example.saibatudo_eleicao2026.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.saibatudo_eleicao2026.domain.model.MenuItem
import com.example.saibatudo_eleicao2026.ui.theme.GoldSecondary
import com.example.saibatudo_eleicao2026.ui.theme.GreenLight
import com.example.saibatudo_eleicao2026.ui.theme.GreenPrimary
import com.example.saibatudo_eleicao2026.ui.theme.NavyAccent

@Composable
fun DynamicMenuGrid(
    menuItems: List<MenuItem>,
    activeMenuId: String?,
    onMenuClick: (MenuItem) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Text(
            text = "Navegação Eleitoral",
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground,
            modifier = Modifier.padding(bottom = 12.dp)
        )

        // 2-column grid layout
        val chunked = menuItems.chunked(2)
        chunked.forEach { rowItems ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                rowItems.forEach { item ->
                    val isActive = item.id == activeMenuId
                    MenuCardItem(
                        item = item,
                        isActive = isActive,
                        onClick = { onMenuClick(item) },
                        modifier = Modifier.weight(1f)
                    )
                }
                if (rowItems.size == 1) {
                    Spacer(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
fun MenuCardItem(
    item: MenuItem,
    isActive: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val icon = when (item.id) {
        "menu_presidente" -> Icons.Default.AccountBalance
        "menu_governador" -> Icons.Default.LocationCity
        "menu_senador" -> Icons.Default.Gavel
        "menu_deputado_federal", "menu_deputado_estadual" -> Icons.Default.Groups
        "menu_calendario" -> Icons.Default.CalendarMonth
        "menu_locais_votacao" -> Icons.Default.HowToVote
        else -> Icons.Default.Info
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .height(115.dp)
            .clickable { onClick() },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isActive) MaterialTheme.colorScheme.primary.copy(alpha = 0.15f) else MaterialTheme.colorScheme.surface
        ),
        border = if (isActive) BorderStroke(2.dp, GreenPrimary) else BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        elevation = CardDefaults.cardElevation(defaultElevation = if (isActive) 4.dp else 1.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = if (isActive) GreenPrimary else MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(modifier = Modifier.weight(1f))
                if (item.submenus.isNotEmpty()) {
                    Badge(
                        containerColor = GoldSecondary,
                        contentColor = Color.Black
                    ) {
                        Text("${item.submenus.size}", fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }

            Column {
                Text(
                    text = item.title,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (isActive) GreenPrimary else MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = item.description,
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}
