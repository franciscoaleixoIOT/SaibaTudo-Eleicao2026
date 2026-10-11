# Identidade visual — SaibaTudo

| Elemento | Arquivo | Uso |
| :-- | :-- | :-- |
| **Símbolo SaibaTudo** (lupa + verificação) | `svg/saibatudo-symbol.svg`, `…-transparent.svg`, `…-mono.svg`, `…-square.svg` | favicon, avatar, página inicial; `-mono` para uma cor; `-square` (sem cantos) para máscaras de plataforma |
| **Logotipo horizontal** | `svg/saibatudo-logo-horizontal.svg` (claro) · `…-dark.svg` (fundo azul-marinho) | cabeçalhos, README |
| **Logotipo vertical** | `svg/saibatudo-logo-vertical.svg` · `…-dark.svg` | capas, apresentações |
| **Ícone do app Eleições 2026** (urna + cédula + verificação) | `svg/eleicoes2026-icon.svg`, `…-icon-square.svg` | Android, PWA, Play |
| **Logotipo Eleições 2026** | `svg/eleicoes2026-logo-horizontal*.svg` | site, divulgação |
| **Gráfico de recursos da Play** (1024×500) | `svg/eleicoes2026-feature-graphic.svg` → `png/play-feature-graphic-1024x500.png` | ficha da Play |
| PNGs prontos | `png/` | Play (512), PWA (192/512/maskable), apple-touch (180), favicons, Android legado (`png/android/mipmap-*`) |

**Paleta:** azul-marinho `#0C2340` · azul de apoio `#143A66` · verde `#22C55E` (escuro: `#007A3D`) · dourado `#FFB81C` · branco.
**Tipografia do logotipo:** Poppins Bold/SemiBold (SIL OFL — `fonts/OFL.txt`); o texto dos SVGs já está convertido em curvas (não exige a fonte).

**Regras de uso**
- Mantenha a área livre de pelo menos a altura do "S" ao redor do logotipo; não distorça, gire ou recolora o símbolo (exceto `-mono`).
- Em fundos escuros use as versões `-dark`. Em fundos claros, as normais.
- **Nunca** use brasões, logotipos ou cores institucionais do TSE/governo; o símbolo é genérico de propósito e a marca deve sempre vir com o aviso de independência.
- Apps futuros: tile azul-marinho + glifo temático (como a urna) + o mesmo lockup "SaibaTudo" com o nome do produto.

**Regerar:** `ai_model/.venv/Scripts/python.exe brand/build_brand.py --png` (usa Chrome/Edge headless para os PNGs; Windows). Depois copie `brand/png/android/mipmap-*` para `app/src/main/res/` e `store/play/` conforme `docs/PLAY_STORE.md`.
