"""Nivel 3 — E2E/Smoke contra los servidores reales (composition root completo).

Requiere los servers locales arriba (bash scripts/dev-up.sh); si no están,
los tests se saltan (skip) en lugar de fallar. No consume tokens del LLM:
verifica infraestructura, persistencia y rutas — no la calidad de respuestas.
"""

import os

import pytest
import requests

LANGGRAPH = os.getenv("E2E_LANGGRAPH_URL", "http://localhost:2024")
FRONTEND = os.getenv("E2E_FRONTEND_URL", "http://localhost:3000")


def _up(url: str) -> bool:
    try:
        requests.get(url, timeout=3)
        return True
    except requests.RequestException:
        return False


langgraph_up = pytest.mark.skipif(
    not _up(f"{LANGGRAPH}/docs"), reason="LangGraph no está arriba (scripts/dev-up.sh)"
)
frontend_up = pytest.mark.skipif(
    not _up(f"{FRONTEND}/widget-demo.html"), reason="Frontend no está arriba (scripts/dev-up.sh)"
)


@langgraph_up
def test_langgraph_crea_thread_y_persiste_estado():
    r = requests.post(f"{LANGGRAPH}/threads", json={}, timeout=10)
    assert r.status_code == 200
    thread_id = r.json()["thread_id"]

    # El estado del thread recién creado debe ser recuperable (persistencia).
    s = requests.get(f"{LANGGRAPH}/threads/{thread_id}/state", timeout=10)
    assert s.status_code == 200


@langgraph_up
def test_langgraph_thread_inexistente_devuelve_404():
    s = requests.get(
        f"{LANGGRAPH}/threads/00000000-0000-0000-0000-000000000000/state", timeout=10
    )
    assert s.status_code == 404  # el frontend depende de este 404 para
    # limpiar threadIds huérfanos del localStorage


@frontend_up
def test_widget_demo_publica():
    r = requests.get(f"{FRONTEND}/widget-demo.html", timeout=10)
    assert r.status_code == 200
    assert "widget" in r.text.lower()


@frontend_up
def test_login_publico_y_chat_protegido():
    r = requests.get(f"{FRONTEND}/login", timeout=10)
    assert r.status_code == 200

    # Sin cookie de sesión, /?widget=true debe redirigir al login.
    r = requests.get(f"{FRONTEND}/?widget=true", timeout=10, allow_redirects=False)
    assert r.status_code in (302, 307)
    assert "/login" in r.headers.get("location", "")


@frontend_up
def test_raiz_redirige_a_widget_demo():
    # GET / sin ?widget=true (y sin Sec-Fetch-Dest: iframe) → página demo.
    r = requests.get(f"{FRONTEND}/", timeout=10, allow_redirects=False)
    assert r.status_code in (302, 307)
    assert "widget-demo" in r.headers.get("location", "")
