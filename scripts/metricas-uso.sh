#!/usr/bin/env bash
# Reporte de adopción del asistente (observabilidad sin infra nueva, ADR-005).
# Queries de SOLO LECTURA sobre threads/users del Postgres de producción.
# Uso: bash scripts/metricas-uso.sh
set -e

LOCAL="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${DEPLOY_HOST:-$(grep -E '^DEPLOY_HOST=' "$LOCAL/.env" 2>/dev/null | cut -d= -f2-)}"
REMOTE="${DEPLOY_PATH:-$(grep -E '^DEPLOY_PATH=' "$LOCAL/.env" 2>/dev/null | cut -d= -f2-)}"
if [ -z "$HOST" ] || [ -z "$REMOTE" ]; then
  echo "ERROR: definir DEPLOY_HOST y DEPLOY_PATH en $LOCAL/.env"
  exit 1
fi

PSQL="docker compose exec -T postgres psql -U ucacue_app -d ucacue -P pager=off"
run() { ssh "$HOST" "cd $REMOTE && $PSQL -c \"$1\""; }

echo "=== Adopción: usuarios activos ==="
run "SELECT count(DISTINCT user_id) AS usuarios_activos_30d,
            (SELECT count(*) FROM users)  AS usuarios_habilitados
     FROM threads WHERE updated_at > NOW() - INTERVAL '30 days';"

echo ""
echo "=== Conversaciones por semana (últimas 8) ==="
run "SELECT date_trunc('week', created_at)::date AS semana, count(*) AS conversaciones
     FROM threads GROUP BY 1 ORDER BY 1 DESC LIMIT 8;"

echo ""
echo "=== Top usuarios (30 días) ==="
run "SELECT u.email, count(*) AS conversaciones, max(t.updated_at)::date AS ultima_actividad
     FROM threads t JOIN users u ON u.id = t.user_id
     WHERE t.updated_at > NOW() - INTERVAL '30 days'
     GROUP BY u.email ORDER BY 2 DESC LIMIT 10;"

echo ""
echo "=== Qué preguntan (últimas 20 consultas) ==="
run "SELECT created_at::date AS fecha, left(title, 60) AS consulta
     FROM threads ORDER BY created_at DESC LIMIT 20;"

echo ""
echo "=== Errores y latencia del API (últimas 24h, log estructurado) ==="
ssh "$HOST" "cd $REMOTE && docker compose logs langgraph --since 24h 2>&1 | grep -o '{\"evento\": \"consulta_api\".*}' | python3 -c '
import sys, json
consultas = [json.loads(l) for l in sys.stdin if l.strip()]
if not consultas:
    print(\"  sin consultas registradas en 24h\")
else:
    errores = [c for c in consultas if not c[\"ok\"]]
    lat = sorted(c[\"duracion_ms\"] for c in consultas)
    print(f\"  consultas: {len(consultas)} | errores: {len(errores)}\")
    print(f\"  latencia ms — p50: {lat[len(lat)//2]} | max: {lat[-1]}\")
    from collections import Counter
    for ep, n in Counter(c[\"endpoint\"] for c in consultas).most_common():
        print(f\"  {ep}: {n}\")
'"
