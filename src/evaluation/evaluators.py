"""Evaluadores LangSmith para el Asistente Analítico UCACUE.

Cada función recibe (run, example) y devuelve {"key": str, "score": float | None}.

Evaluadores heurísticos (sin costo de LLM):
- eval_idioma_espanol   → respuesta está en español
- eval_usa_herramienta  → el agente llamó al menos una tool
- eval_herramienta_correcta → llamó a la tool esperada en el ejemplo

Evaluadores LLM-as-judge (usan gpt-4o-mini):
- eval_sin_alucinaciones → no inventó cifras
- eval_utilidad          → la respuesta es útil y clara (score 0-1)
"""

import os

from langchain_openai import ChatOpenAI
from langsmith.schemas import Example, Run
from pydantic import SecretStr

# ---------------------------------------------------------------------------
# Heurísticos
# ---------------------------------------------------------------------------

_SPANISH_MARKERS = {
    "el", "la", "los", "las", "de", "que", "en", "es", "un", "una",
    "del", "al", "por", "con", "para", "se", "no", "su", "son",
    "hay", "tiene", "fue", "año", "periodo",
}


def eval_idioma_espanol(run: Run, example: Example) -> dict:
    """1.0 si la respuesta está en español, 0.0 si no."""
    output = (run.outputs or {}).get("output", "")
    words = set(output.lower().split())
    hits = len(words & _SPANISH_MARKERS)
    return {"key": "idioma_espanol", "score": float(hits >= 3)}


def eval_usa_herramienta(run: Run, example: Example) -> dict:
    """1.0 si el agente llamó al menos una herramienta; 0.0 si respondió sin datos."""
    tools = (run.outputs or {}).get("tools_called", [])
    return {"key": "usa_herramienta", "score": float(len(tools) > 0)}


def eval_herramienta_correcta(run: Run, example: Example) -> dict:
    """1.0 si llamó a la tool esperada en el ejemplo; None si no hay referencia."""
    expected = (example.outputs or {}).get("expected_tool")
    if not expected:
        return {"key": "herramienta_correcta", "score": None}
    tools_called = (run.outputs or {}).get("tools_called", [])
    return {"key": "herramienta_correcta", "score": float(expected in tools_called)}


# ---------------------------------------------------------------------------
# LLM-as-judge
# ---------------------------------------------------------------------------

_PROMPT_ALUCINACION = """Eres un evaluador de calidad de un asistente de analítica académica universitaria.

Pregunta del usuario:
{input}

Herramientas llamadas por el agente: {tools}

Respuesta del agente:
{output}

Tarea: determina si el agente inventó alguna cifra o estadística que NO provenga de \
las herramientas listadas. El agente tiene prohibido inventar números; solo puede \
presentar datos obtenidos de las herramientas.

Si no se llamó ninguna herramienta pero la respuesta contiene cifras, responde SI.

Responde ÚNICAMENTE con SI (inventó datos) o NO (solo usó datos reales)."""

_PROMPT_UTILIDAD = """Eres un evaluador de calidad de un asistente de analítica académica universitaria.

Pregunta del usuario:
{input}

Respuesta del agente:
{output}

Evalúa la utilidad de la respuesta en una escala del 1 al 5:
1 = Inútil, no responde la pregunta o es incorrecta
2 = Parcialmente útil, con errores o datos incompletos importantes
3 = Útil pero le falta profundidad o claridad
4 = Buena respuesta, cubre lo esencial con claridad
5 = Excelente, completa, clara y bien interpretada

Responde ÚNICAMENTE con el número (1, 2, 3, 4 o 5)."""


def _judge_llm() -> ChatOpenAI:
    key = os.getenv("OPENAI_API_KEY", "")
    model = os.getenv("JUDGE_MODEL_NAME", "gpt-5.4-mini")
    return ChatOpenAI(api_key=SecretStr(key), model=model)


def eval_sin_alucinaciones(run: Run, example: Example) -> dict:
    """LLM-as-judge: 1.0 si no inventó cifras; 0.0 si alucinó datos."""
    output = (run.outputs or {}).get("output", "")
    tools = (run.outputs or {}).get("tools_called", [])
    input_q = (example.inputs or {}).get("message", "")

    if not output:
        return {"key": "sin_alucinaciones", "score": 0.0}

    prompt = _PROMPT_ALUCINACION.format(input=input_q, output=output, tools=tools or "ninguna")
    try:
        resp = _judge_llm().invoke(prompt)
        invented = resp.content.strip().upper().startswith("SI")
        return {"key": "sin_alucinaciones", "score": 0.0 if invented else 1.0}
    except Exception:
        return {"key": "sin_alucinaciones", "score": None}


def eval_utilidad(run: Run, example: Example) -> dict:
    """LLM-as-judge: utilidad de la respuesta normalizada a 0-1 (desde escala 1-5)."""
    output = (run.outputs or {}).get("output", "")
    input_q = (example.inputs or {}).get("message", "")

    if not output:
        return {"key": "utilidad", "score": 0.0}

    prompt = _PROMPT_UTILIDAD.format(input=input_q, output=output)
    try:
        resp = _judge_llm().invoke(prompt)
        digits = [c for c in resp.content.strip() if c.isdigit()]
        raw = int(digits[0]) if digits else 3
        raw = max(1, min(5, raw))
        return {"key": "utilidad", "score": round((raw - 1) / 4.0, 2)}
    except Exception:
        return {"key": "utilidad", "score": None}
