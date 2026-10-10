package net.saibatudo.quimica.domain

// GERADO por app/tools/gerar_ghs_kt.py a partir de dataset/ghs_pt.py: não edite à mão.
// Frases de perigo (H), pictogramas e rótulos do GHS em português do Brasil, idênticos aos do site.
// Fonte dos textos padronizados: UNECE GHS (frases H) / ECHA CLP (uso livre (UNECE); dataset CC BY 4.0).

/** Textos padronizados do GHS em português (os mesmos do site). */
object GhsTextos {
    const val FONTE_NOME = "UNECE GHS (frases H) / ECHA CLP"
    const val FONTE_LICENCA = "uso livre (UNECE); dataset CC BY 4.0"

    /** Texto das frases de perigo padronizadas, por código. */
    val FRASES_H: Map<String, String> = mapOf(
        "H200" to "Explosivo instável.",
        "H201" to "Explosivo; perigo de explosão em massa.",
        "H202" to "Explosivo; perigo grave de projeção.",
        "H203" to "Explosivo; perigo de incêndio, de sopro ou de projeção.",
        "H204" to "Perigo de incêndio ou de projeção.",
        "H205" to "Perigo de explosão em massa em caso de incêndio.",
        "H206" to "Perigo de incêndio, de sopro ou de projeção; risco acrescido de explosão se o agente de insensibilização for reduzido.",
        "H207" to "Perigo de incêndio ou de projeção; risco acrescido de explosão se o agente de insensibilização for reduzido.",
        "H208" to "Perigo de incêndio; risco acrescido de explosão se o agente de insensibilização for reduzido.",
        "H220" to "Gás extremamente inflamável.",
        "H221" to "Gás inflamável.",
        "H222" to "Aerossol extremamente inflamável.",
        "H223" to "Aerossol inflamável.",
        "H224" to "Líquido e vapores extremamente inflamáveis.",
        "H225" to "Líquido e vapores altamente inflamáveis.",
        "H226" to "Líquido e vapores inflamáveis.",
        "H227" to "Líquido combustível.",
        "H228" to "Sólido inflamável.",
        "H229" to "Recipiente pressurizado: pode romper-se se aquecido.",
        "H230" to "Pode reagir explosivamente, mesmo na ausência de ar.",
        "H231" to "Pode reagir explosivamente, mesmo na ausência de ar, a pressão e/ou temperatura elevadas.",
        "H232" to "Pode inflamar-se espontaneamente se exposto ao ar.",
        "H240" to "Pode explodir sob a ação do calor.",
        "H241" to "Pode incendiar-se ou explodir sob a ação do calor.",
        "H242" to "Pode incendiar-se sob a ação do calor.",
        "H250" to "Inflama-se espontaneamente em contato com o ar.",
        "H251" to "Sujeito a autoaquecimento; pode inflamar-se.",
        "H252" to "Sujeito a autoaquecimento em grandes quantidades; pode inflamar-se.",
        "H260" to "Em contato com a água libera gases inflamáveis que podem inflamar-se espontaneamente.",
        "H261" to "Em contato com a água libera gases inflamáveis.",
        "H270" to "Pode provocar ou agravar um incêndio; comburente.",
        "H271" to "Pode provocar incêndio ou explosão; muito comburente.",
        "H272" to "Pode agravar um incêndio; comburente.",
        "H280" to "Contém gás sob pressão; pode explodir sob a ação do calor.",
        "H281" to "Contém gás refrigerado; pode provocar queimaduras ou lesões criogênicas.",
        "H290" to "Pode ser corrosivo para os metais.",
        "H300" to "Fatal se ingerido.",
        "H301" to "Tóxico se ingerido.",
        "H302" to "Nocivo se ingerido.",
        "H303" to "Pode ser nocivo se ingerido.",
        "H304" to "Pode ser fatal se ingerido e penetrar nas vias respiratórias.",
        "H305" to "Pode ser nocivo se ingerido e penetrar nas vias respiratórias.",
        "H310" to "Fatal em contato com a pele.",
        "H311" to "Tóxico em contato com a pele.",
        "H312" to "Nocivo em contato com a pele.",
        "H313" to "Pode ser nocivo em contato com a pele.",
        "H314" to "Provoca queimaduras graves na pele e lesões oculares graves.",
        "H315" to "Provoca irritação à pele.",
        "H316" to "Provoca irritação moderada à pele.",
        "H317" to "Pode provocar reações alérgicas na pele.",
        "H318" to "Provoca lesões oculares graves.",
        "H319" to "Provoca irritação ocular grave.",
        "H320" to "Provoca irritação ocular.",
        "H330" to "Fatal se inalado.",
        "H331" to "Tóxico se inalado.",
        "H332" to "Nocivo se inalado.",
        "H333" to "Pode ser nocivo se inalado.",
        "H334" to "Pode provocar sintomas de alergia ou asma ou dificuldades respiratórias se inalado.",
        "H335" to "Pode provocar irritação das vias respiratórias.",
        "H336" to "Pode provocar sonolência ou vertigem.",
        "H340" to "Pode provocar defeitos genéticos.",
        "H341" to "Suspeito de provocar defeitos genéticos.",
        "H350" to "Pode provocar câncer.",
        "H351" to "Suspeito de provocar câncer.",
        "H360" to "Pode prejudicar a fertilidade ou o feto.",
        "H361" to "Suspeito de prejudicar a fertilidade ou o feto.",
        "H362" to "Pode ser nocivo às crianças alimentadas com leite materno.",
        "H370" to "Provoca danos aos órgãos.",
        "H371" to "Pode provocar danos aos órgãos.",
        "H372" to "Provoca danos aos órgãos por exposição prolongada ou repetida.",
        "H373" to "Pode provocar danos aos órgãos por exposição prolongada ou repetida.",
        "H400" to "Muito tóxico para os organismos aquáticos.",
        "H401" to "Tóxico para os organismos aquáticos.",
        "H402" to "Nocivo para os organismos aquáticos.",
        "H410" to "Muito tóxico para os organismos aquáticos, com efeitos prolongados.",
        "H411" to "Tóxico para os organismos aquáticos, com efeitos prolongados.",
        "H412" to "Nocivo para os organismos aquáticos, com efeitos prolongados.",
        "H413" to "Pode provocar efeitos nocivos prolongados para os organismos aquáticos.",
        "H420" to "Prejudica a saúde pública e o meio ambiente por destruir o ozônio na camada superior da atmosfera."
    )

    /** Pictograma: descrição do desenho e quando aparece. */
    val PICTOGRAMAS: Map<String, Pair<String, String>> = mapOf(
        "GHS01" to ("bomba explodindo" to "explosivos, substâncias autorreativas e peróxidos orgânicos"),
        "GHS02" to ("chama" to "inflamáveis, pirofóricos, sujeitos a autoaquecimento ou que liberam gases inflamáveis em contato com a água"),
        "GHS03" to ("chama sobre círculo" to "comburentes (oxidantes)"),
        "GHS04" to ("botijão de gás" to "gases sob pressão"),
        "GHS05" to ("corrosão" to "corrosivos para metais, que queimam a pele e causam lesões oculares graves"),
        "GHS06" to ("caveira e tíbias cruzadas" to "toxicidade aguda (fatal ou tóxico)"),
        "GHS07" to ("ponto de exclamação" to "toxicidade aguda moderada (nocivo), irritação da pele e dos olhos, sensibilização da pele e irritação das vias respiratórias"),
        "GHS08" to ("perigo para a saúde" to "carcinogenicidade, mutagenicidade, toxicidade reprodutiva, sensibilização respiratória, toxicidade para órgãos-alvo e perigo por aspiração"),
        "GHS09" to ("meio ambiente" to "perigo para o ambiente aquático")
    )

    val CLASSES_PT: Map<String, String> = mapOf(
        "acido" to "ácido",
        "acido_carboxilico" to "ácido carboxílico",
        "base" to "base",
        "sal" to "sal",
        "oxido" to "óxido",
        "hidroxido" to "hidróxido",
        "peroxido" to "peróxido",
        "oxidante" to "oxidante",
        "inorganico" to "inorgânico",
        "organico" to "orgânico",
        "alcool" to "álcool",
        "fenol" to "fenol",
        "aldeido" to "aldeído",
        "cetona" to "cetona",
        "eter" to "éter",
        "ester" to "éster",
        "amina" to "amina",
        "amida" to "amida",
        "alcano" to "alcano",
        "alqueno" to "alqueno",
        "alquino" to "alquino",
        "hidrocarboneto" to "hidrocarboneto",
        "aromatico" to "aromático",
        "heterociclico" to "heterocíclico",
        "halogenado" to "composto halogenado",
        "carboidrato" to "carboidrato",
        "aminoacido" to "aminoácido",
        "lipidio" to "lipídio",
        "proteina" to "proteína",
        "vitamina" to "vitamina",
        "farmaco" to "fármaco",
        "solvente" to "solvente",
        "polimero" to "polímero",
        "gas" to "gás",
        "metal" to "metal",
        "nitrocomposto" to "nitrocomposto",
        "nitrila" to "nitrila",
        "tiol" to "tiol",
        "sulfonato" to "sulfonato",
        "organometalico" to "organometálico",
        "ionico" to "composto iônico",
        "molecular" to "composto molecular",
        "esteroide" to "esteroide",
        "alcaloide" to "alcaloide"
    )

    val CATEGORIA_GRUPO_PLURAL: Map<String, String> = mapOf(
        "metal_alcalino" to "metais alcalinos",
        "metal_alcalino_terroso" to "metais alcalino-terrosos",
        "metal_transicao" to "metais de transição",
        "metal_pos_transicao" to "metais pós-transição",
        "semimetal" to "semimetais",
        "nao_metal" to "não metais",
        "halogenio" to "halogênios",
        "gas_nobre" to "gases nobres",
        "lantanideo" to "lantanídeos",
        "actinideo" to "actinídeos"
    )

    /** "H302+H312": texto das frases juntas; null se algum código for desconhecido. */
    fun fraseH(codigo: String): String? {
        val cods = codigo.trim().split(Regex("\\s*\\+\\s*"))
        if (cods.isEmpty() || cods.any { it !in FRASES_H }) return null
        if (cods.size == 1) return FRASES_H.getValue(cods[0])
        return cods.joinToString(" / ") { FRASES_H.getValue(it).trimEnd('.') } + "."
    }

    fun classePt(c: String): String = CLASSES_PT[c] ?: c.replace('_', ' ')
}
