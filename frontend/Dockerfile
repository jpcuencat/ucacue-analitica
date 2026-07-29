# ── Etapa 1: dependencias ──────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ── Etapa 2: build ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app

# Variables incrustadas en el bundle durante next build
ARG NEXT_PUBLIC_API_URL=http://localhost:3000/api/lg
ARG NEXT_PUBLIC_GRAPH_ID=agent
ARG LANGGRAPH_INTERNAL_URL=http://localhost:2024
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_GRAPH_ID=$NEXT_PUBLIC_GRAPH_ID
ENV LANGGRAPH_INTERNAL_URL=$LANGGRAPH_INTERNAL_URL
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ── Etapa 3: runner ────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Fuentes para @napi-rs/canvas (render de gráficos a PNG). Sin esto, en Alpine
# el texto del gráfico sale vacío (solo se dibujan las barras).
RUN apk add --no-cache fontconfig font-dejavu && fc-cache -f

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static    ./.next/static
# seed-users.js para "docker compose exec frontend node scripts/seed-users.js"
# pg queda externo en el standalone, pero bcryptjs se empaqueta en los chunks
# de Next y no existe como paquete → copiarlo desde la etapa deps.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=deps --chown=nextjs:nodejs \
     /app/node_modules/.pnpm/bcryptjs@*/node_modules/bcryptjs \
     ./node_modules/bcryptjs

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
