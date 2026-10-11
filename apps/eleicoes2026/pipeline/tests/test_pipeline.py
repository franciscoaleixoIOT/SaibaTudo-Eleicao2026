# -*- coding: utf-8 -*-
"""Testes do pipeline: agregação de resultados (schema real do TSE), URLs e fase eleitoral.
Uso: python -m unittest discover -s pipeline/tests -v
"""
import json
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import build  # noqa: E402
import common  # noqa: E402

# Cabeçalho REAL de votacao_candidato_munzona (verificado no arquivo de 2022 publicado pelo TSE)
HEADER = ('"DT_GERACAO";"HH_GERACAO";"ANO_ELEICAO";"CD_TIPO_ELEICAO";"NM_TIPO_ELEICAO";"NR_TURNO";"CD_ELEICAO";'
          '"DS_ELEICAO";"DT_ELEICAO";"TP_ABRANGENCIA";"SG_UF";"SG_UE";"NM_UE";"CD_MUNICIPIO";"NM_MUNICIPIO";'
          '"NR_ZONA";"CD_CARGO";"DS_CARGO";"SQ_CANDIDATO";"NR_CANDIDATO";"NM_CANDIDATO";"NM_URNA_CANDIDATO";'
          '"NM_SOCIAL_CANDIDATO";"CD_SITUACAO_CANDIDATURA";"DS_SITUACAO_CANDIDATURA";"CD_DETALHE_SITUACAO_CAND";'
          '"DS_DETALHE_SITUACAO_CAND";"CD_SITUACAO_JULGAMENTO";"DS_SITUACAO_JULGAMENTO";"CD_SITUACAO_CASSACAO";'
          '"DS_SITUACAO_CASSACAO";"CD_SITUACAO_DCONST_DIPLOMA";"DS_SITUACAO_DCONST_DIPLOMA";"TP_AGREMIACAO";'
          '"NR_PARTIDO";"SG_PARTIDO";"NM_PARTIDO";"NR_FEDERACAO";"NM_FEDERACAO";"SG_FEDERACAO";'
          '"DS_COMPOSICAO_FEDERACAO";"SQ_COLIGACAO";"NM_COLIGACAO";"DS_COMPOSICAO_COLIGACAO";'
          '"ST_VOTO_EM_TRANSITO";"QT_VOTOS_NOMINAIS";"NM_TIPO_DESTINACAO_VOTOS";"QT_VOTOS_NOMINAIS_VALIDOS";'
          '"CD_SIT_TOT_TURNO";"DS_SIT_TOT_TURNO"')


def linha(turno, uf, cargo, sq, nr, votos, sit, zona=1):
    campos = ['01/10/2026', '03:17:01', '2026', '2', 'Eleição Ordinária', str(turno), '6259', 'Eleição', '04/10/2026',
              'E', uf, uf, 'ESTADO', '1', 'MUN', str(zona), '3', cargo, sq, nr, 'NOME COMPLETO', 'NOME URNA', '#NULO',
              '12', 'APTO', '2', 'DEFERIDO', '-3', '#NE', '-3', '#NE', '-3', '#NE', 'PARTIDO ISOLADO',
              nr[:2], 'PT', 'PARTIDO', '-1', '#NULO#', '#NULO#', '#NULO#', '1', 'COL', 'PT', 'N', str(votos), 'Válido',
              str(votos), '1', sit]
    return ';'.join(f'"{c}"' for c in campos)


class ResultadosTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cache = Path(self.tmp.name)
        d = self.cache / 'extracted' / 'votacao_candidato_munzona'
        d.mkdir(parents=True)
        linhas = [HEADER,
                  linha(1, 'SP', 'Governador', '250001', '10', 600, 'ELEITO', zona=1),
                  linha(1, 'SP', 'Governador', '250001', '10', 400, 'ELEITO', zona=2),
                  linha(1, 'SP', 'Governador', '250002', '13', 300, 'NÃO ELEITO'),
                  linha(1, 'SP', 'Governador', '250003', '16', 100, '2º TURNO')]
        (d / 'votacao_candidato_munzona_2026_SP.csv').write_text('\n'.join(linhas), encoding='latin-1')
        # arquivo consolidado NÃO deve ser contado (evita somar votos em dobro)
        (d / 'votacao_candidato_munzona_2026_BRASIL.csv').write_text('\n'.join(linhas), encoding='latin-1')

    def tearDown(self):
        self.tmp.cleanup()

    def test_agrega_votos_por_candidato_e_calcula_percentual_majoritario(self):
        res, meta = build.carregar_resultados(self.cache, {'votacao_candidato_munzona': {'vazio': False}})
        self.assertEqual(res['250001']['1']['votos'], 1000)
        self.assertEqual(res['250001']['1']['situacao'], 'ELEITO')
        self.assertAlmostEqual(res['250001']['1']['percentual'], 71.43, places=2)  # 1000 / 1400
        self.assertEqual(res['250003']['1']['situacao'], '2º TURNO')
        self.assertEqual(meta['candidatos'], 3)

    def test_arquivo_vazio_do_tse_e_tratado_como_nao_publicado(self):
        res, meta = build.carregar_resultados(self.cache, {'votacao_candidato_munzona': {'vazio': True}})
        self.assertEqual(res, {})
        self.assertIsNone(meta)


class RegrasTest(unittest.TestCase):
    def test_ask_generativo_desligado_por_padrao_no_manifesto(self):
        self.assertFalse(build.ask_no_cliente({}))
        for valor in ("0", "true", "yes", "", "on"):
            self.assertFalse(build.ask_no_cliente({"SAIBATUDO_ASK_ENABLED": valor}), valor)
        self.assertTrue(build.ask_no_cliente({"SAIBATUDO_ASK_ENABLED": "1"}))

    def test_melhoria_desligada_por_padrao_no_manifesto(self):
        self.assertFalse(build.melhoria_no_cliente({}))
        for valor in ("0", "true", "yes", "", "on"):
            self.assertFalse(build.melhoria_no_cliente({"SAIBATUDO_MELHORIA_ENABLED": valor}), valor)
        self.assertTrue(build.melhoria_no_cliente({"SAIBATUDO_MELHORIA_ENABLED": "1"}))

    def test_fase_eleitoral(self):
        f = build.fase_eleitoral
        self.assertEqual(f(date(2026, 10, 3)), 'PRE_ELEICAO')
        self.assertEqual(f(date(2026, 10, 4)), 'DIA_1T')
        self.assertEqual(f(date(2026, 10, 10)), 'ENTRE_TURNOS')
        self.assertEqual(f(date(2026, 10, 25)), 'DIA_2T')
        self.assertEqual(f(date(2026, 10, 26)), 'POS_ELEICAO')

    def test_normaliza_urls_de_redes_sociais(self):
        n = build.normalizar_url
        self.assertEqual(n('HTTPS://WWW.FACEBOOK.COM/LULA'), 'https://www.facebook.com/LULA')
        self.assertEqual(n('WWW.VOTETARCISIO10.COM.BR'), 'https://www.votetarcisio10.com.br')
        self.assertIsNone(n('sem ponto ou espaco'))
        self.assertIsNone(n(None))

    def test_placeholders_do_tse_viram_ausencia(self):
        for ph in ('#NE', '#NULO', '#NULO#', '-1', '-3', ''):
            self.assertIsNone(common.clean(ph))
        self.assertEqual(common.clean('0'), '0')
        self.assertEqual(common.to_float('1.234,56'), 1234.56)


class PacoteTest(unittest.TestCase):
    """Valida o pacote REAL versionado em data/eleicoes2026."""
    DIR = Path(__file__).resolve().parent.parent.parent / 'data' / 'eleicoes2026'

    def test_validacao_do_pacote_real(self):
        self.assertEqual(build.validar(self.DIR), [])

    def test_assinatura_do_pacote_real(self):
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
        from sign import verificar
        pub = self.DIR.parent.parent / 'pipeline' / 'data_signing_public.pem'
        self.assertTrue(verificar(self.DIR / 'manifest.json', pub))

    def test_nenhum_campo_pessoal_sensivel_publicado(self):
        proibidos = ('NR_CPF', 'cpf', 'tituloEleitor', 'NR_TITULO', 'email', 'DS_EMAIL')
        for f in (self.DIR / 'candidatos').glob('*.json'):
            texto = f.read_text(encoding='utf-8')
            for p in proibidos:
                self.assertNotIn(f'"{p}"', texto, f'{p} em {f.name}')

    def test_campos_inferidos_nao_existem(self):
        sp = json.loads((self.DIR / 'candidatos' / 'SP.json').read_text(encoding='utf-8'))
        for c in sp:
            for proibido in ('fichaLimpa', 'processosAdministrativos', 'reeleicao'):
                self.assertNotIn(proibido, c)


if __name__ == '__main__':
    unittest.main()
