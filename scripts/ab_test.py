"""A/B testing de modelos sobre el dataset de evaluación LangSmith (item 8).

Corre evaluate.py para cada modelo y muestra un comparativo de resultados.
Los experimentos quedan en LangSmith para comparación visual.

Uso:
    python scripts/ab_test.py
    python scripts/ab_test.py --modelos gpt-5.2 gpt-5.4-mini
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
load_dotenv(override=True)

MODELOS_DEFAULT = [
    os.getenv("MODEL_NAME", "gpt-5.2"),
    os.getenv("JUDGE_MODEL_NAME", "gpt-5.4-mini"),
]


def run_evaluation(model: str) -> int:
    """Corre evaluate.py con el modelo indicado. Retorna el código de salida."""
    print(f"\n{'='*56}")
    print(f"  Evaluando modelo: {model}")
    print("="*56)
    result = subprocess.run(
        [sys.executable, "evaluate.py"],
        env={**os.environ, "MODEL_NAME": model},
        cwd=str(ROOT),
    )
    return result.returncode


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="A/B test de modelos en LangSmith")
    parser.add_argument(
        "--modelos", nargs="+", default=MODELOS_DEFAULT,
        metavar="MODELO",
        help="Modelos a comparar (espacio entre cada nombre)",
    )
    args = parser.parse_args()

    modelos = args.modelos
    if len(modelos) < 2:
        print("Se necesitan al menos 2 modelos para comparar.")
        sys.exit(1)

    print(f"\nComparando {len(modelos)} modelos: {', '.join(modelos)}")
    print("Cada ejecución genera un experimento separado en LangSmith.\n")

    exit_codes: dict[str, int] = {}
    for model in modelos:
        exit_codes[model] = run_evaluation(model)

    print(f"\n{'='*56}")
    print("  Resumen A/B test")
    print("="*56)
    for model, code in exit_codes.items():
        status = "✅ Pasó umbrales" if code == 0 else "❌ Falló umbrales"
        print(f"  {model:<30} {status}")

    print("\nComparativo detallado:")
    print("  smith.langchain.com → Datasets → ucacue-analitica-eval → Compare experiments")
