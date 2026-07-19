"""Nivel 3 — Contrato del adaptador HTTP (AdaptadorApiUcacue vía use cases).

Verifica lo que TODO adaptador del puerto debe garantizar: envoltura Result,
mensajes de error seguros (sin filtrar cuerpos internos), manejo de
credenciales ausentes y mapeo correcto de parámetros al transporte.
"""

import responses

from src.tools.ucacue_tools import (
    DEFAULT_API_URL,
    PERIODO_COHORTE_DEFAULT,
    get_carreras,
    get_cohortes,
    get_estudiantes_kpis,
    get_facultades_kpis,
    get_sedes_kpis,
)

API = f"{DEFAULT_API_URL}/api/estudiantes"


@responses.activate
def test_api_get_exito_envuelve_ok_y_normaliza(monkeypatch):
    monkeypatch.setenv("UCACUE_API_KEY", "k")
    responses.add(
        responses.GET, API,
        json={"ok": True, "filtros": {}, "data": {"total_inscritos": 800}},
        status=200,
    )
    r = get_estudiantes_kpis.invoke({"periodo": "20261"})
    assert r["ok"] is True
    assert r["data"]["inscritos"] == 800.0


@responses.activate
def test_api_get_http_error_es_mensaje_seguro(monkeypatch):
    monkeypatch.setenv("UCACUE_API_KEY", "k")
    responses.add(responses.GET, API, body="<html>stacktrace interno</html>", status=404)
    r = get_estudiantes_kpis.invoke({})
    assert r["ok"] is False
    assert "404" in r["error"]
    assert "stacktrace" not in r["error"]  # no se filtra el cuerpo interno


def test_api_get_sin_key(monkeypatch):
    monkeypatch.delenv("UCACUE_API_KEY", raising=False)
    r = get_estudiantes_kpis.invoke({})
    assert r["ok"] is False


@responses.activate
def test_sedes_y_facultades_desglose(monkeypatch):
    monkeypatch.setenv("UCACUE_API_KEY", "k")
    responses.add(responses.GET, f"{DEFAULT_API_URL}/api/sedes",
                  json={"ok": True, "total": 1,
                        "data": [{"carrerasede": "MATRIZ CUENCA", "inscritos": 800}]},
                  status=200)
    responses.add(responses.GET, f"{DEFAULT_API_URL}/api/facultades",
                  json={"ok": True, "filtros": {}, "total": 1,
                        "data": [{"carrerafacultad": "FAC X", "inscritos": 200}]},
                  status=200)
    rs = get_sedes_kpis.invoke({})
    assert rs["ok"] and rs["data"][0]["carrerasede"] == "MATRIZ CUENCA"
    rf = get_facultades_kpis.invoke({"periodo": "20261"})
    assert rf["ok"] and rf["data"][0]["inscritos"] == 200


@responses.activate
def test_carreras_selector_envia_buscar(monkeypatch):
    monkeypatch.setenv("UCACUE_API_KEY", "k")
    responses.add(responses.GET, f"{DEFAULT_API_URL}/api/carreras",
                  json={"ok": True, "total": 0, "data": []}, status=200)
    get_carreras.invoke({"selector": True, "buscar": "medicina"})
    qs = responses.calls[0].request.url
    assert "selector=true" in qs and "buscar=medicina" in qs


@responses.activate
def test_cohortes_default_hasta_periodo(monkeypatch):
    """Sin hasta_periodo, la tool debe acotar al último periodo consolidado
    (evita el artefacto de pérdida -100% al medir en un periodo incompleto)."""
    monkeypatch.setenv("UCACUE_API_KEY", "k")
    responses.add(responses.GET, f"{DEFAULT_API_URL}/api/cohortes",
                  json={"ok": True, "resumen": [], "matriz": []}, status=200)
    get_cohortes.invoke({"cohorte": "20231"})
    assert f"hasta_periodo={PERIODO_COHORTE_DEFAULT}" in responses.calls[0].request.url
