# -*- coding: utf-8 -*-
"""
Mini conversor GBNF -> regex de Python (SOMENTE o subconjunto usado nas gramáticas do projeto: literais, classes, alternativas, grupos
e `?`/`*`/`+`), para testar as gramáticas sem llama.cpp: verifica que são bem formadas, aceitam as saídas válidas e rejeitam as demais.
Uso: `from gbnf_mini import grammar_regex; rx = grammar_regex(texto_da_gramatica); rx.match(saida)`.
"""
import re


class GbnfParseError(Exception):
    pass


def _parse_rules(texto: str) -> dict:
    regras = {}
    for linha in texto.splitlines():
        if not linha.strip() or linha.lstrip().startswith("#"):
            continue
        m = re.match(r"^([a-z][a-z0-9-]*)\s*::=\s*(.+)$", linha)
        if not m:
            raise GbnfParseError(f"linha inválida: {linha!r}")
        regras[m.group(1)] = m.group(2)
    return regras


def _class_to_regex(corpo: str) -> str:
    # corpo sem os colchetes externos; "-" literal só no fim; ranges a-z permitidos
    return "[" + corpo.replace("\\", "\\\\").replace("[", "\\[") .replace("]", "\\]") + "]"


class _Gbnf:
    def __init__(self, texto: str):
        self.regras = _parse_rules(texto)
        if "root" not in self.regras:
            raise GbnfParseError("sem regra root")
        self._cache = {}

    def regex(self) -> "re.Pattern":
        return re.compile(r"\A(?:" + self._rule("root", ()) + r")\Z", re.S)

    def _rule(self, nome, pilha):
        if nome in pilha:
            raise GbnfParseError(f"recursão não suportada: {nome}")
        if nome not in self.regras:
            raise GbnfParseError(f"regra indefinida: {nome}")
        if nome not in self._cache:
            self._cache[nome] = self._expr(self.regras[nome], pilha + (nome,))
        return self._cache[nome]

    # expr := seq ('|' seq)*  — com parênteses e strings tratados pelo tokenizador
    def _expr(self, s, pilha):
        toks = self._tokens(s)
        pos = [0]
        r = self._alts(toks, pos, pilha)
        if pos[0] != len(toks):
            raise GbnfParseError(f"sobra de tokens em: {s!r}")
        return r

    def _tokens(self, s):
        toks, i = [], 0
        while i < len(s):
            c = s[i]
            if c.isspace():
                i += 1
            elif c == '"':
                j = i + 1
                buf = []
                while j < len(s) and s[j] != '"':
                    if s[j] == "\\":
                        nxt = s[j + 1]
                        buf.append({"n": "\n", "t": "\t", "r": "\r"}.get(nxt, nxt))
                        j += 2
                    else:
                        buf.append(s[j])
                        j += 1
                if j >= len(s):
                    raise GbnfParseError(f"literal não fechado: {s!r}")
                toks.append(("lit", "".join(buf)))
                i = j + 1
            elif c == "[":
                j = i + 1
                while j < len(s) and s[j] != "]":
                    j += 1
                if j >= len(s):
                    raise GbnfParseError(f"classe não fechada: {s!r}")
                toks.append(("cls", s[i + 1 : j]))
                i = j + 1
            elif c in "()|?*+":
                toks.append((c, c))
                i += 1
            elif re.match(r"[a-z0-9-]", c):
                j = i
                while j < len(s) and re.match(r"[a-z0-9-]", s[j]):
                    j += 1
                toks.append(("ref", s[i:j]))
                i = j
            else:
                raise GbnfParseError(f"caractere inesperado {c!r} em {s!r}")
        return toks

    def _alts(self, toks, pos, pilha):
        partes = [self._seq(toks, pos, pilha)]
        while pos[0] < len(toks) and toks[pos[0]][0] == "|":
            pos[0] += 1
            partes.append(self._seq(toks, pos, pilha))
        return "(?:" + "|".join(partes) + ")" if len(partes) > 1 else partes[0]

    def _seq(self, toks, pos, pilha):
        out = []
        while pos[0] < len(toks) and toks[pos[0]][0] not in ("|", ")"):
            kind, val = toks[pos[0]]
            pos[0] += 1
            if kind == "lit":
                atom = re.escape(val)
            elif kind == "cls":
                atom = _class_to_regex(val)
            elif kind == "ref":
                atom = "(?:" + self._rule(val, pilha) + ")"
            elif kind == "(":
                atom = "(?:" + self._alts(toks, pos, pilha) + ")"
                if pos[0] >= len(toks) or toks[pos[0]][0] != ")":
                    raise GbnfParseError("parêntese não fechado")
                pos[0] += 1
            else:
                raise GbnfParseError(f"token inesperado {kind!r}")
            while pos[0] < len(toks) and toks[pos[0]][0] in ("?", "*", "+"):
                atom = "(?:" + atom + ")" + toks[pos[0]][0]
                pos[0] += 1
            out.append(atom)
        return "".join(out)


def grammar_regex(texto: str) -> "re.Pattern":
    """Compila uma gramática GBNF (subconjunto usado aqui) para uma regex Python que valida a string inteira."""
    return _Gbnf(texto).regex()
