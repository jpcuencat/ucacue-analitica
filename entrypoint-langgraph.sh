#!/bin/sh
# Codifica POSTGRES_PASSWORD y expone POSTGRES_URI para langgraph dev.
# NOTA (ADR-000): el runtime open-source de langgraph dev es in-memory y
# NO persiste vía POSTGRES_URI. La persistencia real la da el volumen
# Docker langgraph-data:/app/.langgraph_api (ADR-001). Esto queda por si
# se migra a un runtime que sí lo honre.
set -e

if [ -n "$POSTGRES_PASSWORD" ]; then
    ENCODED=$(python3 -c \
        "import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=''))" \
        "$POSTGRES_PASSWORD")
    export POSTGRES_URI="postgresql://ucacue_app:${ENCODED}@postgres:5432/ucacue"
    echo "[entrypoint] POSTGRES_URI configurado (nota: langgraph dev no lo usa para persistir; ver ADR-000)"
else
    echo "[entrypoint] POSTGRES_PASSWORD no definido — langgraph usará almacenamiento en memoria"
fi

exec langgraph dev --host 0.0.0.0 --port 2024 --no-browser
