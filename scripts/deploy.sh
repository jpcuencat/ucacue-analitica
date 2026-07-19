#!/usr/bin/env bash
# Deploy script — ejecutar desde una terminal con acceso SSH al servidor
# Uso: bash scripts/deploy.sh
set -e

LOCAL="$(cd "$(dirname "$0")/.." && pwd)"

# Destino del deploy — definir en .env (gitignorado):
#   DEPLOY_HOST=usuario@servidor
#   DEPLOY_PATH=/ruta/en/el/servidor
# (no se hace source del .env: contiene contraseñas con caracteres especiales)
HOST="${DEPLOY_HOST:-$(grep -E '^DEPLOY_HOST=' "$LOCAL/.env" 2>/dev/null | cut -d= -f2-)}"
REMOTE="${DEPLOY_PATH:-$(grep -E '^DEPLOY_PATH=' "$LOCAL/.env" 2>/dev/null | cut -d= -f2-)}"
if [ -z "$HOST" ] || [ -z "$REMOTE" ]; then
  echo "ERROR: definir DEPLOY_HOST y DEPLOY_PATH en $LOCAL/.env"
  exit 1
fi

echo "=== Subiendo archivos ==="
scp "$LOCAL/docker-compose.yml" "$LOCAL/.env" "$HOST:$REMOTE/"

# Backend Python (LangGraph)
scp "$LOCAL/requirements.txt" \
    "$LOCAL/langgraph.json" \
    "$LOCAL/langgraph_server.py" \
    "$LOCAL/Dockerfile.langgraph" \
    "$LOCAL/entrypoint-langgraph.sh" \
    "$HOST:$REMOTE/"
ssh "$HOST" "mkdir -p $REMOTE/src/tools $REMOTE/src/agent $REMOTE/src/interface"
scp -r "$LOCAL/src/" "$HOST:$REMOTE/"

ssh "$HOST" "mkdir -p $REMOTE/frontend/app/api/threads $REMOTE/frontend/scripts $REMOTE/frontend/lib"

scp "$LOCAL/frontend/middleware.ts" \
    "$LOCAL/frontend/instrumentation.ts" \
    "$LOCAL/frontend/next.config.mjs" \
    "$LOCAL/frontend/package.json" \
    "$LOCAL/frontend/pnpm-lock.yaml" \
    "$LOCAL/frontend/Dockerfile" \
    "$LOCAL/frontend/.env.local" \
    "$HOST:$REMOTE/frontend/"

scp "$LOCAL/frontend/app/globals.css" \
    "$LOCAL/frontend/app/layout.tsx" \
    "$HOST:$REMOTE/frontend/app/"

ssh "$HOST" "mkdir -p $REMOTE/frontend/app/login"
scp "$LOCAL/frontend/app/login/action.ts" \
    "$LOCAL/frontend/app/login/page.tsx" \
    "$HOST:$REMOTE/frontend/app/login/"

scp "$LOCAL/frontend/lib/auth.ts" \
    "$LOCAL/frontend/lib/db.ts" \
    "$LOCAL/frontend/lib/db-migrate.ts" \
    "$LOCAL/frontend/lib/db-users.ts" \
    "$LOCAL/frontend/lib/request-security.ts" \
    "$LOCAL/frontend/lib/rate-limit.ts" \
    "$LOCAL/frontend/lib/threads-client.ts" \
    "$HOST:$REMOTE/frontend/lib/"

# Cambio de contraseña obligatorio (primer acceso)
ssh "$HOST" "mkdir -p $REMOTE/frontend/app/cambiar-clave"
scp "$LOCAL/frontend/app/cambiar-clave/action.ts" \
    "$LOCAL/frontend/app/cambiar-clave/page.tsx" \
    "$HOST:$REMOTE/frontend/app/cambiar-clave/"

scp "$LOCAL/frontend/components/Chat.tsx" \
    "$LOCAL/frontend/components/Sidebar.tsx" \
    "$LOCAL/frontend/components/LogoutButton.tsx" \
    "$LOCAL/frontend/components/MessageBubble.tsx" \
    "$LOCAL/frontend/components/ChartBlock.tsx" \
    "$HOST:$REMOTE/frontend/components/"

scp "$LOCAL/frontend/app/api/threads/route.ts" \
    "$HOST:$REMOTE/frontend/app/api/threads/"

# scp no tolera corchetes — usar nombre escapado
scp "$LOCAL/frontend/app/api/threads/[id]/route.ts" \
    "$HOST:$REMOTE/frontend/app/api/threads/[id]/route.ts" 2>/dev/null || \
  ssh "$HOST" "cat > $REMOTE/frontend/app/api/threads/\[id\]/route.ts" < \
    "$LOCAL/frontend/app/api/threads/[id]/route.ts"

scp "$LOCAL/frontend/scripts/seed-users.js" \
    "$LOCAL/frontend/scripts/seed-revision.js" \
    "$HOST:$REMOTE/frontend/scripts/"

ssh "$HOST" "mkdir -p $REMOTE/frontend/public"
scp "$LOCAL/frontend/public/widget-demo.html" "$HOST:$REMOTE/frontend/public/"

echo ""
echo "=== Levantando contenedores ==="
ssh "$HOST" "cd $REMOTE && docker compose up --build -d"

echo ""
echo "=== Esperando que postgres sea healthy ==="
ssh "$HOST" "cd $REMOTE && for i in \$(seq 1 12); do
  STATUS=\$(docker compose ps postgres --format '{{.Status}}' 2>/dev/null)
  echo \"  postgres: \$STATUS\"
  echo \"\$STATUS\" | grep -q 'healthy' && break
  sleep 5
done"

echo ""
echo "=== Sembrando usuarios ==="
ssh "$HOST" "cd $REMOTE && docker compose exec -T frontend node scripts/seed-users.js"

echo ""
echo "=== Estado final ==="
ssh "$HOST" "cd $REMOTE && docker compose ps"

echo ""
echo "=== URL Cloudflare Tunnel ==="
ssh "$HOST" "cd $REMOTE && docker compose logs cloudflared 2>&1 | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1"

echo ""
echo "Listo → http://${HOST#*@}:6069"
echo "Widget  → ver URL de Cloudflare arriba (cámbia al reiniciar)"
