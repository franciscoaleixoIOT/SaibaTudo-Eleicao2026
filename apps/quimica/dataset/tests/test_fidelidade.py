# -*- coding: utf-8 -*-
"""FIDELIDADE NUMÉRICA: todo número da `resposta` está em `numeros`, tem origem registrada e a origem confere
(pacote, cálculo recomputado por código independente, pergunta, definição, regra de nomenclatura ou trecho licenciado)."""
import re
import unittest
from collections import Counter, defaultdict
from decimal import Decimal

from tests import _base
import calculo as C
import fam_calculos
from comum import MENOS, dec, fmt_casas, fmt_pacote, fmt_sig, numeros_do_texto, valor_do_token
from fam_textos import numero_na_fonte, valores_no_texto
from pacote import resolver_origem


def num(s):
    s = s.strip()
    neg = s.startswith(MENOS) or s.startswith("-")
    d = valor_do_token(s.lstrip(MENOS + "-+"))
    return -d if neg else d


def ignorar_para(reg, pac):
    ig = set()
    ents = reg.get("entidades") or {}
    for cid in ents.get("compostos", []) or []:
        c = pac.comp_cid.get(cid)
        if not c:
            continue
        for k in ("nomeIupac", "smiles", "nome", "nomePopular", "formula", "formulaHill"):
            if c.get(k):
                ig.add(c[k])
                ig.add(c[k][:1].lower() + c[k][1:])
        ig.update(c.get("sinonimos") or [])
    for s in ents.get("elementos", []) or []:
        e = pac.el_simbolo.get(s)
        if e:
            ig.update([e["nome"], e["nome"].lower(), e.get("nomeEn") or "", e["simbolo"]])
    if reg.get("smiles"):
        ig.add(reg["smiles"])
    if reg["tipo"] in ("fato", "seguranca"):
        import ghs_pt
        for txt in ghs_pt.frases_ativas().values():
            ig.add(txt)
            ig.add(txt.rstrip("."))
    for k in ("formula", "nome"):
        if ents.get(k):
            ig.add(ents[k])
    return [x for x in ig if x]


DEFS_PEQUENAS = {"0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "14", "25", "32", "100", "273,15", "101.325", "1000"}


def fatores_de_unidades():
    out = set()
    from comum import inter
    from decimal import Decimal as D
    tab = fam_calculos.tabela(_base.qa())
    for g, (base, us) in tab.items():
        for u, f in us.items():
            out.add(inter(D(f.numerator) / D(f.denominator), 7)[1])
    return out


FATORES = fatores_de_unidades()


class TestFidelidade(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pac = _base.pacote()
        cls.regs = _base.registros()
        cls.ctx = _base.qa()

    def test_nenhum_registro_descartado_por_fidelidade(self):
        self.assertEqual(self.ctx.stats.get("descartados_fidelidade", 0), 0, [a for a in self.ctx.avisos if "fidelidade" in a][:5])

    # -- 1. todo número da resposta está em `numeros` (e vice-versa) -------------------------------------
    def test_numeros_batem_com_a_resposta(self):
        ruins = []
        for r in self.regs:
            achados = numeros_do_texto(r["resposta"], ignorar_para(r, self.pac))
            esperados = set(r["numeros"])
            if set(achados) != esperados:
                ruins.append((r["id"], sorted(set(achados) ^ esperados)[:4]))
        self.assertEqual(ruins[:10], [], f"{len(ruins)} registros com `numeros` inconsistente")

    def test_todo_numero_tem_origem(self):
        ruins = [(r["id"], n) for r in self.regs for n in r["numeros"] if not r["numerosOrigem"].get(n)]
        self.assertEqual(ruins[:10], [])

    # -- 2. a origem confere --------------------------------------------------------------------------------
    def _origem_ok(self, r, tok, origem):
        tipo, _, resto = origem.partition(":")
        if tipo == "pergunta":
            return tok in numeros_do_texto(r["pergunta"]) or tok in r["pergunta"].replace(".", "")
        if tipo == "pacote":
            caminho, _, suf = resto.partition("@")
            val = resolver_origem(self.pac, caminho)
            if val is None:
                return False
            if suf.endswith("sig"):
                return fmt_sig(val, int(suf[:-3])) == tok
            if suf.endswith("casas"):
                return fmt_casas(val, int(suf[:-5])) == tok
            if isinstance(val, list):
                return tok in {fmt_pacote(abs(x)) for x in val if isinstance(x, (int, float))}
            if isinstance(val, str):
                return tok == val
            if isinstance(val, (int, float)):
                return tok in (fmt_pacote(val), fmt_pacote(abs(val)), str(val), str(abs(val)))
            return False
        if tipo == "definicao":
            return tok in DEFS_PEQUENAS or tok in FATORES
        if tipo == "regra":
            return tok.isdigit() and 0 <= int(tok) <= 12
        if tipo == "passagem":
            vals = set()
            for f in r["fontes"]:
                t = self.pac.textos.get(f.get("id"))
                if t:
                    vals |= valores_no_texto(t.get("textoOriginal", "") + " " + (t.get("textoPt") or ""))
            return numero_na_fonte(tok, vals)
        if tipo == "calculo":
            return self._calculo_fato_ok(r, tok, resto) if r["tipo"] != "calculo" else True
        return False

    def _calculo_fato_ok(self, r, tok, tag):
        pac = self.pac
        ents = r.get("entidades") or {}
        els = [pac.el_simbolo[s] for s in ents.get("elementos", []) if s in pac.el_simbolo]
        if tag == "densidade_g_cm3":
            return any(fmt_sig(dec(e["densidadeKgm3"]) / 1000, 4) == tok for e in els if e.get("densidadeKgm3") is not None)
        if tag.endswith("_celsius"):
            campo = tag[:-len("_celsius")]
            for e in els:
                if e.get(campo) is not None:
                    dk = dec(e[campo])
                    casas = max(0, -dk.normalize().as_tuple().exponent)
                    if fmt_casas(abs(dk - Decimal("273.15")), casas) == tok or fmt_casas(dk - Decimal("273.15"), casas).lstrip(MENOS) == tok:
                        return True
            return False
        if tag == "eletrons_valencia":
            return any(e.get("grupo") is not None and tok in {str(e["grupo"]), str(e["grupo"] - 10), "2"} for e in els)
        if tag == "diferenca_massa_molar":
            cs = [pac.comp_cid[c] for c in ents.get("compostos", []) if c in pac.comp_cid]
            return len(cs) == 2 and fmt_sig(abs(dec(cs[0]["massaMolar"]) - dec(cs[1]["massaMolar"])), 4) == tok
        return False

    def test_origens_conferem(self):
        ruins = []
        for r in self.regs:
            for tok in r["numeros"]:
                origens = r["numerosOrigem"].get(tok, [])
                if not any(self._origem_ok(r, tok, o) for o in origens):
                    ruins.append((r["id"], tok, origens))
        self.assertEqual(ruins[:10], [], f"{len(ruins)} números sem origem válida")

    def test_calculo_so_em_registros_calculo_ou_fatos_conhecidos(self):
        conhecidos = {"densidade_g_cm3", "pontoFusaoK_celsius", "pontoEbulicaoK_celsius", "eletrons_valencia", "diferenca_massa_molar"}
        ruins = []
        for r in self.regs:
            if r["tipo"] in ("calculo", "nomenclatura"):
                continue
            for tok, origens in r["numerosOrigem"].items():
                for o in origens:
                    if o.startswith("calculo:") and o[8:] not in conhecidos:
                        ruins.append((r["id"], o))
        self.assertEqual(ruins[:10], [])

    def test_fato_nao_traz_numero_fora_do_pacote(self):
        for r in self.regs:
            if r["tipo"] in ("fato", "desenho"):
                for tok, origens in r["numerosOrigem"].items():
                    self.assertTrue(any(o.startswith(("pacote:", "calculo:", "pergunta", "definicao:", "regra:")) for o in origens), (r["id"], tok))


# ---------------------------------------------------------------------------------------------------------
# Recomputação INDEPENDENTE dos resultados de cálculo (sem reutilizar o código de apresentação do gerador)
# ---------------------------------------------------------------------------------------------------------
def D(s):
    return Decimal(str(s).replace(",", ".").replace(MENOS, "-"))


class TestCalculosRecomputados(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pac = _base.pacote()
        cls.regs = [r for r in _base.registros() if r["tipo"] == "calculo"]
        c = cls.pac.const("avogadro")
        cls.NA = dec(c.get("valor", c.get("value"))) if c else None
        c = cls.pac.const("R", "gases")
        cls.R = dec(c.get("valor", c.get("value"))) if c else None
        cls.bases = fam_calculos.listas_fortes(_base.qa())[1]

    def mm(self, formula):
        cont = C.parse_formula(formula)
        return sum(dec(self.pac.massas[e]) * n for e, n in cont.items())

    def assertRel(self, esperado, obtido, tol, msg):
        esperado, obtido = dec(esperado), dec(obtido)
        denom = abs(esperado) if esperado != 0 else Decimal(1)
        self.assertLessEqual(abs(esperado - obtido) / denom, Decimal(str(tol)), f"{msg}: esperado {esperado}, obtido {obtido}")

    def test_todos_tem_resultado_na_resposta(self):
        for r in self.regs:
            calc = r["calculo"]
            res = calc["resultado"]
            if isinstance(res, str):
                self.assertIn(res, r["resposta"], r["id"])

    def test_balanceamento(self):
        n = 0
        for r in self.regs:
            c = r["calculo"]
            if c["tipo"] != "balanceamento":
                continue
            n += 1
            reag, prod, coefs = c["entrada"]["reagentes"], c["entrada"]["produtos"], c["resultado"]
            self.assertEqual(C.balancear(reag, prod), coefs, r["id"])
            self.assertTrue(C.conserva(reag, prod, coefs), r["id"])
            # a equação impressa na resposta também conserva os átomos
            linha = r["resposta"].split("\n")[0].replace("Equação balanceada: ", "")
            lados = linha.split(" → ")
            self.assertEqual(len(lados), 2, r["id"])
            cs = []
            for lado in lados:
                for termo in lado.split(" + "):
                    m = re.match(r"^(\d+) (.+)$", termo)
                    cs.append((int(m.group(1)), m.group(2)) if m else (1, termo))
            self.assertEqual([c for c, _ in cs], coefs, r["id"])
        self.assertGreater(n, 0)

    def test_massa_molar(self):
        for r in self.regs:
            c = r["calculo"]
            if c["tipo"] == "massa_molar":
                if "Atenção" in r["resposta"]:  # divergência > 0,5 %: a resposta usa o valor do PubChem
                    cid = r["entidades"]["compostos"][0]
                    self.assertEqual(fmt_sig(self.pac.comp_cid[cid]["massaMolar"], 4), c["resultado"], r["id"])
                else:
                    self.assertEqual(fmt_sig(self.mm(c["entrada"]["formula"]), 4), c["resultado"], r["id"])

    def test_demais_tipos(self):
        cont = Counter()
        for r in self.regs:
            c = r["calculo"]
            t, e = c["tipo"], c["entrada"]
            cont[t] += 1
            res = c["resultado"]
            if t == "massa_para_mol":
                self.assertRel(D(e["massa_g"]) / self.mm(e["formula"]), num(res), 0.008, r["id"])
            elif t == "mol_para_massa":
                self.assertRel(D(e["mol"]) * self.mm(e["formula"]), num(res), 0.008, r["id"])
            elif t == "mol_para_particulas":
                self.assertRel(D(e["mol"]) * self.NA, num(res), 0.002, r["id"])
            elif t == "particulas_para_mol":
                self.assertRel(num(e["N"]) / self.NA, num(res), 0.002, r["id"])
            elif t == "volume_cntp":
                vm = C.volume_molar(self.R)
                self.assertRel(D(e["mol"]) * vm, num(res), 0.003, r["id"])
            elif t == "molaridade":
                self.assertRel((D(e["massa_g"]) / self.mm(e["formula"])) / (D(e["volume_mL"]) / 1000), num(res), 0.008, r["id"])
            elif t == "massa_preparo":
                self.assertRel(D(e["mol_L"]) * (D(e["volume_mL"]) / 1000) * self.mm(e["formula"]), num(res), 0.008, r["id"])
            elif t == "concentracao_comum":
                self.assertRel(D(e["massa_g"]) / (D(e["volume_mL"]) / 1000), num(res), 0.001, r["id"])
            elif t == "mol_L_para_g_L":
                self.assertRel(D(e["mol_L"]) * self.mm(e["formula"]), num(res), 0.008, r["id"])
            elif t == "diluicao_v2":
                self.assertRel(D(e["c1"]) * D(e["v1"]) / D(e["c2"]), num(res), 0.001, r["id"])
            elif t == "diluicao_v1":
                self.assertRel(D(e["c2"]) * D(e["v2"]) / D(e["c1"]), num(res), 0.001, r["id"])
            elif t == "diluicao_c2":
                self.assertRel(D(e["c1"]) * D(e["v1"]) / D(e["v2"]), num(res), 0.001, r["id"])
            elif t == "ph":
                conc = D(e["mol_L"])
                forte = e["formula"]
                if forte in self.bases:
                    ph = 14 + (conc * self.bases[forte][0]).log10()
                else:
                    ph = -conc.log10()
                casas = max(1, len(conc.as_tuple().digits))
                self.assertLessEqual(abs(ph - num(res)), Decimal(10) ** (-casas) * Decimal("1.01"), r["id"])
            elif t == "ph_inverso":
                ph = D(e["ph"])
                forte = e["formula"]
                if forte in self.bases:
                    esperado = (Decimal(10) ** (-(14 - ph))) / self.bases[forte][0]
                else:
                    esperado = Decimal(10) ** (-ph)
                sf = len(e["ph"].split(",")[1])
                self.assertRel(esperado, num(res), 0.12 if sf == 1 else 0.02, r["id"])
            elif t == "gas_ideal":
                self._gas(r, e, res)
            elif t == "conversao":
                esperado, _ = C.converter(D(e["valor"]), e["de"], e["para"], fam_calculos.tabela(_base.qa()))
                self.assertRel(esperado, num(res), 0.0006, r["id"])
            elif t in ("estequiometria", "estequiometria_limitante", "rendimento"):
                self._est(r, t, e, res)
            elif t in ("massa_molar", "balanceamento"):
                pass
            else:
                self.fail(f"tipo de cálculo sem verificação independente: {t} ({r['id']})")
        self.assertGreater(sum(cont.values()), 0)

    def _gas(self, r, e, res):
        d = {k: (D(v[0]), v[1]) for k, v in e["dados"].items()}
        P = T = V = n = None
        for k, (v, u) in d.items():
            if k == "P":
                fp = fam_calculos.tabela(_base.qa())["pressao"][1][u]
                P = v * dec(fp.numerator) / dec(fp.denominator)
            elif k == "V":
                f = fam_calculos.tabela(_base.qa())["volume"][1][u]
                V = v * dec(f.numerator) / dec(f.denominator)
            elif k == "T":
                T = v + Decimal("273.15") if u == "°C" else v
            elif k == "n":
                n = v
        inc = e["incognita"]
        valor = C.gas_ideal(self.R, P=P, V=V, n=n, T=T)
        if inc == "V":
            valor = valor * 1000
        elif inc == "P":
            valor = valor / 101325
        self.assertRel(valor, num(res), 0.004, r["id"])

    def _est(self, r, t, e, res):
        reag, prod = e["reagentes"], e["produtos"]
        coefs = C.balancear(reag, prod)
        todos = reag + prod
        mm = {f: self.mm(f) for f in todos}
        if t == "estequiometria":
            i, j = todos.index(e["de"]), todos.index(e["para"])
            esperado = D(e["massa_g"]) / mm[e["de"]] * coefs[j] / coefs[i] * mm[e["para"]]
            self.assertRel(esperado, num(res), 0.01, r["id"])
        elif t == "estequiometria_limitante":
            a, b = reag[0], reag[1]
            na = D(e["massas_g"][0]) / mm[a] / coefs[0]
            nb = D(e["massas_g"][1]) / mm[b] / coefs[1]
            p = prod[0]
            esperado = min(na, nb) * coefs[len(reag)] * mm[p]
            self.assertRel(esperado, num(res), 0.01, r["id"])
        else:
            i, j = todos.index(e["de"]), todos.index(e["para"])
            teorica = D(e["massa_g"]) / mm[e["de"]] * coefs[j] / coefs[i] * mm[e["para"]]
            self.assertRel(D(e["obtida_g"]) / teorica * 100, num(res), 0.012, r["id"])


class TestConversaoPtBr(unittest.TestCase):
    def test_tokens(self):
        self.assertEqual(numeros_do_texto("A massa é 15,999 u (Z = 8); CAS 7732-18-5; 10.000,5 g; 6,022 × 10²³"),
                         ["15,999", "8", "7732-18-5", "10.000,5", "6,022 × 10²³"])
        self.assertEqual(numeros_do_texto("H2O, Ca(OH)2, 2s² 2p⁴, [He] 2s2, 2-acetil, 2,2,4-trimetil"), [])
        self.assertEqual(numeros_do_texto("−218,79 °C"), ["218,79"])


if __name__ == "__main__":
    unittest.main()
