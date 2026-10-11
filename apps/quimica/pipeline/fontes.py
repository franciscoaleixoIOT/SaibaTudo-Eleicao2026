# -*- coding: utf-8 -*-
"""
Inventário das fontes efetivamente usadas pelo pacote (gera `fontes.json`, exibido em "Sobre os dados", e alimenta
`manifest.licencas`). Política: docs/FONTES_E_LICENCAS.md §5.

Campos: id, nome, mantenedor, url, licenca, uso (dados | textos | link), acessadoEm, atribuicao e a lista de permissão
(`exibir`, `dataset`, `treino`: sim | cond. | nao), que o CI deve checar (FONTES_E_LICENCAS §4.7.3).
"""
import quimica_util as Q

FONTES = [
    {"id": "pubchem", "nome": "PubChem (NCBI/NLM)", "mantenedor": "National Library of Medicine / NCBI (EUA)",
     "url": "https://pubchem.ncbi.nlm.nih.gov/", "licenca": "domínio público (NCBI/NLM)", "uso": "dados",
     "atribuicao": "Source: National Library of Medicine (PubChem). Só campos calculados pelo próprio PubChem e identificadores: "
                   "fórmula, massa, massa exata, SMILES, InChIKey, IUPACName, XLogP, TPSA, contagens, carga.",
     "exibir": "sim", "dataset": "sim", "treino": "sim"},
    {"id": "codata", "nome": "CODATA 2022 (NIST)", "mantenedor": "NIST (EUA)",
     "url": "https://physics.nist.gov/cuu/Constants/", "licenca": "domínio público (NIST); valores de constantes são fatos físicos",
     "uso": "dados",
     "atribuicao": "Tiesinga, Mohr, Newell e Taylor (2024), The 2022 CODATA Recommended Values of the Fundamental Physical "
                   "Constants (Web Version 9.0), NIST.",
     "exibir": "sim", "dataset": "sim", "treino": "sim"},
    {"id": "wikidata", "nome": "Wikidata", "mantenedor": "Wikimedia Foundation", "url": "https://www.wikidata.org/",
     "licenca": "CC0", "uso": "dados",
     "atribuicao": "Nomes em português, número CAS (identificador), fórmula convencional, descobridores, QID e ChEBI ID.",
     "exibir": "sim", "dataset": "sim", "treino": "sim"},
    {"id": "clp-eurlex", "nome": "Regulamento (CE) n.º 1272/2008 (CLP) — EUR-Lex", "mantenedor": "União Europeia",
     "url": "https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:32008R1272",
     "licenca": "reutilização livre da legislação (EUR-Lex)", "uso": "dados",
     "atribuicao": "Frases H/EUH em português: Anexo III do Regulamento CLP (texto consolidado). Classificação harmonizada "
                   "(Anexo VI) lida via PubChem; classificações notificadas (ECHA C&L) e NITE-CMC não são usadas.",
     "exibir": "sim", "dataset": "sim", "treino": "sim"},
    {"id": "chebi", "nome": "ChEBI", "mantenedor": "EMBL-EBI", "url": "https://www.ebi.ac.uk/chebi/",
     "licenca": "CC BY 4.0", "uso": "textos",
     "atribuicao": "Malik, A. et al. (2025). ChEBI: re-engineered for a sustainable future. Nucleic Acids Research. "
                   "Definições em inglês, sem tradução.",
     "exibir": "sim", "dataset": "sim", "treino": "sim"},
    {"id": "wikipedia-pt", "nome": "Wikipédia em português", "mantenedor": "Wikimedia Foundation",
     "url": "https://pt.wikipedia.org/", "licenca": "CC BY-SA 4.0", "uso": "textos",
     "atribuicao": "Introdução de cada artigo, com link permanente (oldid) e lista de autores no histórico do artigo; "
                   "derivados ficam sob CC BY-SA 4.0.",
     "exibir": "sim", "dataset": "sim", "treino": "sim"},
    {"id": "wikibooks-pt", "nome": "Wikilivros (Wikibooks) em português", "mantenedor": "Wikimedia Foundation",
     "url": "https://pt.wikibooks.org/", "licenca": "CC BY-SA 4.0", "uso": "textos",
     "atribuicao": "Livros 'Introdução à Química', 'Química Orgânica' e 'Química inorgânica', com link permanente (oldid); "
                   "derivados ficam sob CC BY-SA 4.0.",
     "exibir": "sim", "dataset": "sim", "treino": "sim"},
    {"id": "gutenberg-14474", "nome": "Project Gutenberg #14474 — The Chemical History of a Candle (Faraday, 1861)",
     "mantenedor": "Project Gutenberg", "url": "https://www.gutenberg.org/ebooks/14474", "licenca": "domínio público",
     "uso": "textos", "atribuicao": "Michael Faraday (1861), editado por William Crookes. Texto histórico em inglês.",
     "exibir": "sim", "dataset": "sim", "treino": "sim"},
    {"id": "icsc-oit", "nome": "ICSC — Fichas Internacionais de Segurança Química (OIT/OMS)", "mantenedor": "OIT/OMS (versão em português: ACT, Portugal)",
     "url": "https://chemicalsafety.ilo.org/dyn/icsc/showcard.home",
     "licenca": "sem licença de reuso declarada; © OIT/OMS e, na versão em português, © ACT", "uso": "link",
     "atribuicao": "Somente link de busca por CAS no site da OIT (campo icscBuscaUrl); nenhum conteúdo dos cartões é copiado.",
     "exibir": "cond.", "dataset": "nao", "treino": "nao"},
]
POR_ID = {f["id"]: f for f in FONTES}


def gerar(usadas=None, hoje=None):
    """Lista de fontes (cópia) com `acessadoEm`; `usadas` (conjunto de ids) filtra as que de fato entraram no pacote."""
    hoje = hoje or Q.hoje_iso()
    return [dict(f, acessadoEm=hoje) for f in FONTES if usadas is None or f["id"] in usadas]


def licencas(fontes):
    """Resumo para `manifest.licencas`: [{licenca, fontes: [ids]}] sem repetir licença."""
    por = {}
    for f in fontes:
        por.setdefault(f["licenca"], []).append(f["id"])
    return [{"licenca": lic, "fontes": ids} for lic, ids in por.items()]
