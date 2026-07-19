"""Tests de aceptación con el adaptador in-memory (sin red, milisegundos).

Demuestran la inversión de dependencias: los casos de uso (tools) corren
contra el puerto PuertoDatosAcademicos con datos enlatados — cambiar de
HTTP real a memoria es una línea en el fixture, no un refactor.
"""

import pytest

from src.infrastructure.memoria import AdaptadorInMemory
from src.tools import ucacue_tools

ENLATADAS = {
    "/api/estudiantes": {
        "ok": True,
        "data": {
            "total_inscritos": 100,
            "reservas": 10,
            "matriculas_nuevas": "25",          # numérico como string → float
            "matriculas_convalidadas": "--",     # placeholder del API → None
            "tasa_conversion_inscrito_matriculado": 0.5,
        },
    },
    "/api/sedes": {
        "ok": True,
        "data": [
            {"carrerasede": "MATRIZ CUENCA", "inscritos": 60, "pagados": 30, "carreras": 40},
            {"carrerasede": "SEDE AZOGUES", "inscritos": 40, "pagados": 20, "carreras": 25},
        ],
    },
}


@pytest.fixture
def puerto_memoria():
    """Sustituye el adaptador HTTP por el in-memory y lo restaura al salir."""
    previo = ucacue_tools.puerto_actual()
    memoria = AdaptadorInMemory(ENLATADAS)
    ucacue_tools.configurar_puerto(memoria)
    yield memoria
    ucacue_tools.configurar_puerto(previo)


def test_estudiantes_normaliza_contra_memoria(puerto_memoria):
    r = ucacue_tools.get_estudiantes_kpis.invoke({"periodo": "20261"})
    assert r["ok"] is True
    # Normalización del dominio aplicada sobre el dato del puerto:
    assert r["data"]["inscritos"] == 100.0
    assert r["data"]["matriculas_nuevas"] == 25.0     # string → float
    assert r["data"]["convalidados"] is None          # "--" → None
    assert r["data"]["tasa_conversion"] == 0.5        # campo remapeado
    # El caso de uso pidió exactamente lo que debía al puerto:
    path, params = puerto_memoria.llamadas[0]
    assert path == "/api/estudiantes"
    assert params["periodo"] == "20261"


def test_sedes_pasa_datos_del_puerto(puerto_memoria):
    r = ucacue_tools.get_sedes_kpis.invoke({})
    assert r["ok"] is True
    assert [s["carrerasede"] for s in r["data"]] == ["MATRIZ CUENCA", "SEDE AZOGUES"]


def test_cohortes_aplica_periodo_consolidado_por_defecto(puerto_memoria):
    ucacue_tools.get_cohortes.invoke({})
    path, params = puerto_memoria.llamadas[-1]
    assert path == "/api/cohortes"
    # Regla de negocio: sin hasta_periodo se acota al último periodo cerrado.
    assert params["hasta_periodo"] == ucacue_tools.PERIODO_COHORTE_DEFAULT


def test_endpoint_sin_datos_devuelve_result_error(puerto_memoria):
    # Patrón Result de punta a punta: sin datos enlatados NO se lanza excepción.
    r = ucacue_tools.get_inscripciones_historico.invoke({})
    assert r["ok"] is False
    assert "error" in r


def test_respuestas_enlatadas_no_se_mutan(puerto_memoria):
    ucacue_tools.get_estudiantes_kpis.invoke({})
    ucacue_tools.get_estudiantes_kpis.invoke({})
    # La normalización muta la respuesta recibida; el enlatado debe seguir crudo.
    assert ENLATADAS["/api/estudiantes"]["data"]["total_inscritos"] == 100
