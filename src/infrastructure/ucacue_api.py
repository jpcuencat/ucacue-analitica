"""Adaptador HTTP hacia la API UCACUE (capa de infraestructura).

Implementa el puerto de datos académicos: un GET autenticado con el patrón
Result — nunca lanza excepciones hacia las capas superiores; devuelve
{"ok": True, "data": ...} o {"ok": False, "error": <mensaje seguro>}.
"""

import json
import logging
import os
import time

import requests

logger = logging.getLogger(__name__)

# URL por defecto de la API UCACUE (única fuente; se re-exporta desde
# src/tools/ucacue_tools.py y la usan los tests de contrato).
DEFAULT_API_URL = "https://powerbi-middleware-ucacue-cff3g2csgpf9ebdz.centralus-01.azurewebsites.net"

# Sesión HTTP reutilizable (mantiene conexiones keep-alive entre llamadas).
_session = requests.Session()


class AdaptadorApiUcacue:
    """Adaptador de producción del puerto PuertoDatosAcademicos (HTTP real)."""

    def get(self, path: str, params: dict) -> dict:
        return api_get(path, params)


def api_get(path: str, params: dict) -> dict:
    """GET autenticado a la API UCACUE, con log estructurado de observabilidad.

    En éxito devuelve la envoltura propia del API ({"ok": True, "filtros": ...,
    "data": {...}}); en error devuelve {"ok": False, "error": <mensaje seguro>}.
    El detalle técnico se registra solo en logs (no se expone al LLM/usuario).

    Observabilidad (ADR-005): por ser el punto único de salida a datos, cada
    consulta emite un JSON con endpoint, filtros, resultado y duración —
    `docker compose logs langgraph` se vuelve el stream de uso/errores/latencia.
    """
    inicio = time.monotonic()
    resultado = _api_get_interno(path, params)
    logger.info(
        "consulta_api %s",
        json.dumps(
            {
                "evento": "consulta_api",
                "endpoint": path,
                "filtros": {k: v for k, v in params.items() if v is not None},
                "ok": bool(resultado.get("ok")),
                "error": resultado.get("error"),
                "duracion_ms": round((time.monotonic() - inicio) * 1000),
            },
            ensure_ascii=False,
            default=str,
        ),
    )
    return resultado


def _api_get_interno(path: str, params: dict) -> dict:
    base_url = os.getenv("UCACUE_API_URL", DEFAULT_API_URL).rstrip("/")
    api_key = os.getenv("UCACUE_API_KEY", "")
    if not api_key:
        logger.error("UCACUE_API_KEY no configurada; no se realiza la petición.")
        return {"ok": False, "error": "La API UCACUE no está configurada."}

    # Eliminar parámetros None para no enviar query params vacíos.
    clean_params = {k: v for k, v in params.items() if v is not None}
    resp = None
    try:
        resp = _session.get(
            f"{base_url}{path}",
            params=clean_params,
            headers={"x-api-key": api_key},
            timeout=15,
        )
        resp.raise_for_status()
        # El API ya responde con su envoltura {"ok": True, "data": {...}}.
        return resp.json()
    except requests.exceptions.HTTPError:
        status = resp.status_code if resp is not None else "?"
        body = resp.text[:300] if resp is not None else ""
        logger.error("Error HTTP %s en %s: %s", status, path, body)
        return {"ok": False, "error": f"El servidor respondió con un error (HTTP {status})."}
    except requests.exceptions.RequestException as e:
        logger.error("Error de conexión con la API UCACUE en %s: %s", path, e)
        return {"ok": False, "error": "No se pudo conectar con la API UCACUE."}
