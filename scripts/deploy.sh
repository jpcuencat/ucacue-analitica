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

# Los archivos de entorno del SERVIDOR no se sobrescriben: los locales apuntan
# a otra base (DATABASE_URL de desarrollo) y pisarlos rompe producción. Se
# verifica que existan; en un servidor nuevo hay que copiarlos a mano una vez.
echo "=== Verificando entorno en el servidor ==="
for f in ".env" "frontend/.env.local"; do
  if ! ssh "$HOST" "test -f $REMOTE/$f"; then
    echo "ERROR: falta $REMOTE/$f en el servidor."
    echo "       Cópialo manualmente la primera vez (revisa DATABASE_URL, JWT_SECRET,"
    echo "       AUTH_USERS, WA_*, CLAVE_INICIAL_DEFAULT, ADMIN_EMAILS) y reintenta."
    exit 1
  fi
done
echo "  ok: .env y frontend/.env.local presentes (no se sobrescriben)"

echo "=== Sincronizando código (rsync) ==="

# Directorios completos con --delete: lo que se elimina del repo se elimina del
# servidor. Antes había una lista manual de archivos y cada alta/baja rompía el
# deploy (un scp a un archivo inexistente, o código huérfano que no compilaba).
#
# OJO: nunca se sincroniza `frontend/` ni la raíz del repo como directorio —
# ahí viven `.env` y `frontend/.env.local` del servidor, que no se tocan.
# Además se excluyen por nombre, como segunda barrera.
EXCLUIR=(
  --exclude='.env' --exclude='.env.local' --exclude='.env.*'
  --exclude='__pycache__/' --exclude='*.pyc'
  --exclude='node_modules/' --exclude='.next/' --exclude='*.tsbuildinfo'
)

for d in src frontend/app frontend/lib frontend/components frontend/scripts frontend/public; do
  echo "  $d/"
  rsync -az --delete "${EXCLUIR[@]}" "$LOCAL/$d/" "$HOST:$REMOTE/$d/"
done

# Archivos sueltos de la raíz y de frontend/ (sin --delete: son directorios que
# contienen también la configuración del servidor).
echo "  archivos raíz + frontend/"
rsync -az "$LOCAL/docker-compose.yml" \
          "$LOCAL/requirements.txt" \
          "$LOCAL/langgraph.json" \
          "$LOCAL/langgraph_server.py" \
          "$LOCAL/Dockerfile.langgraph" \
          "$LOCAL/entrypoint-langgraph.sh" \
          "$HOST:$REMOTE/"
rsync -az "$LOCAL/frontend/middleware.ts" \
          "$LOCAL/frontend/instrumentation.ts" \
          "$LOCAL/frontend/next.config.mjs" \
          "$LOCAL/frontend/package.json" \
          "$LOCAL/frontend/pnpm-lock.yaml" \
          "$LOCAL/frontend/Dockerfile" \
          "$HOST:$REMOTE/frontend/"

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
