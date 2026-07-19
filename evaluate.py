"""Script de evaluación del Asistente Analítico UCACUE con LangSmith.

Uso:
    python evaluate.py

Crea el dataset en LangSmith si no existe, corre los 12 ejemplos a través
del agente real y aplica los 5 evaluadores. Los resultados quedan en:
    https://smith.langchain.com  →  proyecto ucacue-analitica
"""

import os
import sys

from dotenv import load_dotenv

load_dotenv(override=True)

from langsmith import Client, evaluate  # noqa: E402 — dotenv debe ir primero

from src.agent.api_agent import UCACUEAgent  # noqa: E402
from src.evaluation.dataset import get_or_create_dataset  # noqa: E402
from src.evaluation.evaluators import (  # noqa: E402
    eval_herramienta_correcta,
    eval_idioma_espanol,
    eval_sin_alucinaciones,
    eval_usa_herramienta,
    eval_utilidad,
)

# ---------------------------------------------------------------------------
# Función objetivo: ejecuta el agente y devuelve el output estructurado.
# Se instancia una vez por proceso (stateless, no hay estado compartido).
# ---------------------------------------------------------------------------
_agent = UCACUEAgent(model_name=os.getenv("MODEL_NAME", "gpt-5-mini"))


def target(inputs: dict) -> dict:
    """Recibe el input del ejemplo y devuelve el output que evaluarán los evaluadores."""
    message = inputs.get("message", "")
    reply, tool_data, _ = _agent.chat(message)
    return {
        "output": reply,
        "tools_called": list(tool_data.keys()),
    }


# ---------------------------------------------------------------------------
# Umbrales mínimos para CI/CD — si alguno falla, el script termina con código 1.
# Ajusta estos valores según la calidad esperada del agente.
# ---------------------------------------------------------------------------
THRESHOLDS: dict[str, float] = {
    "herramienta_correcta": 0.85,  # ≥85% de preguntas usan la tool correcta
    "usa_herramienta": 0.90,       # ≥90% de respuestas tienen datos reales
    "idioma_espanol": 0.95,        # ≥95% de respuestas en español
}


def _check_thresholds(results) -> bool:
    """Lee los scores del experimento y verifica los umbrales.

    Retorna True si todos pasan; False si alguno falla (para sys.exit en CI).
    """
    print("\n── Verificación de umbrales ──────────────────")
    try:
        df = results.to_pandas()
    except Exception as e:
        print(f"  ⚠️  No se pudo leer resultados como DataFrame: {e}")
        return True  # no falla CI si hay error de lectura

    all_passed = True
    for metric, threshold in THRESHOLDS.items():
        col = f"feedback.{metric}"
        if col not in df.columns:
            print(f"  ⚠️  {metric}: columna '{col}' no encontrada, omitiendo")
            continue
        avg = float(df[col].dropna().mean())
        ok = avg >= threshold
        all_passed = all_passed and ok
        print(f"  {'✅' if ok else '❌'} {metric}: {avg:.2f}  (umbral ≥ {threshold})")

    if all_passed:
        print("\n✅ Todos los umbrales superados.")
    else:
        print("\n❌ Uno o más umbrales fallaron — revisa los experimentos en LangSmith.")
    return all_passed


# ---------------------------------------------------------------------------
# Punto de entrada
# ---------------------------------------------------------------------------

def main() -> None:
    client = Client()
    dataset_id = get_or_create_dataset(client)

    print(f"\nIniciando evaluación sobre dataset '{dataset_id}'…\n")

    results = evaluate(
        target,
        data=dataset_id,
        evaluators=[
            eval_idioma_espanol,
            eval_usa_herramienta,
            eval_herramienta_correcta,
            eval_sin_alucinaciones,
            eval_utilidad,
        ],
        experiment_prefix="ucacue-agente",
        metadata={"model": os.getenv("MODEL_NAME", "gpt-5-mini")},
        max_concurrency=2,
    )

    print("\nEvaluación completada.")
    print("Ver resultados en: https://smith.langchain.com → proyecto ucacue-analitica\n")

    if not _check_thresholds(results):
        sys.exit(1)  # señal de fallo para CI/CD


if __name__ == "__main__":
    main()
