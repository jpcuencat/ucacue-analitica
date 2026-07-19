"""Evaluación online de trazas de producción y alertas de degradación (items 5 y 6).

Uso:
    python scripts/eval_online.py              # evalúa últimas 24h + resumen semanal
    python scripts/eval_online.py --horas 48   # últimas 48h
    python scripts/eval_online.py --solo-alertas

Variables de entorno opcionales:
    ALERT_THRESHOLD   → umbral de utilidad para alerta (default 0.60)
    ALERT_EMAIL       → si está definido, envía email cuando degrada
    SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS → configuración SMTP
"""

import argparse
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv(override=True)

from types import SimpleNamespace

from langsmith import Client

from src.evaluation.evaluators import eval_sin_alucinaciones, eval_utilidad

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

PROJECT = "ucacue-analitica"
ALERT_THRESHOLD = float(os.getenv("ALERT_THRESHOLD", "0.60"))
ALERT_EMAIL = os.getenv("ALERT_EMAIL")

# Métricas a revisar en alertas semanales y su umbral mínimo.
WEEKLY_THRESHOLDS = {
    "utilidad": ALERT_THRESHOLD,
    "sin_alucinaciones": 0.80,
    "user_feedback": 0.70,
}


# ── Alertas ──────────────────────────────────────────────────────────────────

def _send_alert(subject: str, body: str) -> None:
    """Notifica por email si ALERT_EMAIL está configurado; sino a stderr."""
    logger.warning("ALERTA: %s — %s", subject, body)
    if not ALERT_EMAIL:
        return
    import smtplib
    from email.message import EmailMessage
    try:
        msg = EmailMessage()
        msg["Subject"] = f"⚠️ UCACUE Analítica — {subject}"
        msg["From"] = os.getenv("SMTP_USER", ALERT_EMAIL)
        msg["To"] = ALERT_EMAIL
        msg.set_content(body)
        with smtplib.SMTP(os.getenv("SMTP_HOST", "smtp.gmail.com"),
                          int(os.getenv("SMTP_PORT", "587"))) as s:
            s.starttls()
            s.login(os.getenv("SMTP_USER", ""), os.getenv("SMTP_PASS", ""))
            s.send_message(msg)
        logger.info("Alerta enviada a %s", ALERT_EMAIL)
    except Exception as e:  # noqa: BLE001
        logger.error("No se pudo enviar email: %s", e)


# ── Evaluación online ─────────────────────────────────────────────────────────

def eval_online(hours_back: int = 24) -> int:
    """Aplica evaluadores LLM-as-judge a las trazas de producción recientes.

    Retorna el número de runs evaluados.
    """
    client = Client()
    since = datetime.now(timezone.utc) - timedelta(hours=hours_back)

    runs = list(client.list_runs(
        project_name=PROJECT,
        start_time=since,
        run_type="llm",
        is_root=True,
        limit=200,
    ))

    if not runs:
        print(f"Sin trazas nuevas en las últimas {hours_back}h.")
        return 0

    print(f"\nEvaluando {len(runs)} trazas de las últimas {hours_back}h...")
    def _extract_text(run) -> str:
        """Extrae el texto final del output independientemente del tipo de run."""
        out = run.outputs or {}
        if "output" in out:
            return str(out["output"])
        # Formato LLM: generations[[{text: "..."}]]
        gens = out.get("generations", [])
        if gens and gens[0]:
            g = gens[0][0]
            return g.get("text", "") if isinstance(g, dict) else str(g)
        return ""

    evaluated = 0
    for run in runs:
        text = _extract_text(run)
        if not text:
            continue
        # Construye un run sintético con el output en el formato que esperan los evaluadores
        synthetic_run = SimpleNamespace(
            inputs=run.inputs or {},
            outputs={"output": text, "tools_called": []},
            id=run.id,
        )
        example = SimpleNamespace(inputs=run.inputs or {}, outputs={})
        for fn in (eval_sin_alucinaciones, eval_utilidad):
            try:
                result = fn(synthetic_run, example)
                if result.get("score") is not None:
                    client.create_feedback(
                        run_id=str(run.id),
                        key=result["key"],
                        score=result["score"],
                        source_info={"source": "eval_online", "evaluator": fn.__name__},
                    )
            except Exception as e:  # noqa: BLE001
                logger.debug("Error evaluando run %s con %s: %s", run.id, fn.__name__, e)
        evaluated += 1

    print(f"Evaluación online completada: {evaluated}/{len(runs)} runs procesados.")
    return evaluated


# ── Resumen semanal + alertas ─────────────────────────────────────────────────

def check_weekly_alerts() -> None:
    """Revisa promedios de la última semana y dispara alertas si alguno degrada."""
    client = Client()
    since = datetime.now(timezone.utc) - timedelta(days=7)

    print("\n── Resumen semanal de calidad ──────────────────────")
    for metric, threshold in WEEKLY_THRESHOLDS.items():
        try:
            fb = list(client.list_feedback(
                project_name=PROJECT,
                key=metric,
                min_created_at=since,
            ))
            scores = [f.score for f in fb if f.score is not None]
            if not scores:
                print(f"  ⚠️  {metric}: sin datos esta semana")
                continue
            avg = sum(scores) / len(scores)
            ok = avg >= threshold
            print(f"  {'✅' if ok else '❌'} {metric}: {avg:.2f}  "
                  f"(umbral ≥ {threshold}, n={len(scores)})")
            if not ok:
                _send_alert(
                    f"Calidad degradada: {metric}",
                    f"Promedio semanal de '{metric}' = {avg:.2f} < {threshold} "
                    f"(n={len(scores)} evaluaciones). "
                    f"Revisa: https://smith.langchain.com → proyecto {PROJECT}",
                )
        except Exception as e:  # noqa: BLE001
            logger.warning("No se pudo leer feedback de '%s': %s", metric, e)


# ── Punto de entrada ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluación online UCACUE")
    parser.add_argument("--horas", type=int, default=24,
                        help="Horas hacia atrás a evaluar (default 24)")
    parser.add_argument("--solo-alertas", action="store_true",
                        help="Solo resumen semanal, sin evaluar nuevas trazas")
    args = parser.parse_args()

    if not args.solo_alertas:
        eval_online(hours_back=args.horas)
    check_weekly_alerts()
