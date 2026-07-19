#!/usr/bin/env bash
# Levanta los servers locales de desarrollo (LangGraph :2024 + Next.js :3000).
# Si ya están corriendo los baja primero y los vuelve a levantar limpios.
# Uso: bash scripts/dev-up.sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Bajando procesos existentes ==="
pkill -f "langgraph dev" 2>/dev/null && echo "  langgraph detenido" || echo "  langgraph no estaba corriendo"
pkill -f "next-server" 2>/dev/null && echo "  next detenido" || echo "  next no estaba corriendo"
pkill -f "next dev" 2>/dev/null || true
sleep 2

echo ""
echo "=== Levantando LangGraph (:2024) ==="
cd "$ROOT"
source .venv/bin/activate
nohup langgraph dev --port 2024 --no-browser > /tmp/langgraph-dev.log 2>&1 &
echo "  PID: $!"

echo ""
echo "=== Levantando Next.js (:3000) ==="
cd "$ROOT/frontend"
nohup pnpm dev > /tmp/next-dev.log 2>&1 &
echo "  PID: $!"

echo ""
echo "=== Verificando ==="
for i in $(seq 1 15); do
  # Puerto real de Next desde su log (puede moverse si el 3000 está ocupado
  # por otra app — verificar el 3000 a ciegas daría un falso positivo).
  PORT=$(grep -oE "Local: +http://localhost:[0-9]+" /tmp/next-dev.log 2>/dev/null | grep -oE "[0-9]+$" | head -1)
  LG=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://localhost:2024/docs 2>/dev/null || echo 000)
  FE=000
  [ -n "$PORT" ] && FE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "http://localhost:$PORT/widget-demo.html" 2>/dev/null || echo 000)
  if [ "$LG" = "200" ] && [ "$FE" = "200" ]; then
    echo "  langgraph :2024  → $LG ✓"
    echo "  next      :$PORT → $FE ✓"
    [ "$PORT" != "3000" ] && echo "  AVISO: el 3000 está ocupado por otra app — Next usa el $PORT"
    echo ""
    echo "Listo → http://localhost:$PORT/widget-demo.html"
    exit 0
  fi
  sleep 2
done

echo "  langgraph :2024 → $LG"
echo "  next      :${PORT:-3000} → $FE"
echo ""
echo "ALGO FALLÓ — revisar logs: /tmp/langgraph-dev.log y /tmp/next-dev.log"
exit 1
