# ADR-001: Persistencia de conversaciones con volumen Docker

Fecha: 2026-07-13
Estado: Aceptado

## Contexto

`langgraph dev` (runtime in-memory) perdía todas las conversaciones en cada
reinicio o deploy del contenedor: los metadatos de threads quedaban huérfanos
en PostgreSQL y el chat se trababa en "procesando" con threadIds muertos.

## Opciones consideradas

1. Servidor propio FastAPI + `PostgresSaver` (checkpoints reales en Postgres)
2. LangGraph Platform self-hosted (runtime Postgres oficial)
3. Volumen Docker sobre la persistencia nativa de `langgraph dev`
   (archivos pickle en `.langgraph_api/`)

## Decisión

Opción 3: montar el volumen `langgraph-data` en `/app/.langgraph_api`.

## Justificación

- El runtime Postgres oficial exige licencia/API key de LangSmith
  (dependencia rechazada explícitamente por el proyecto).
- El servidor FastAPI propio implica reimplementar la API que consume
  `@langchain/langgraph-sdk` (threads, runs/stream SSE) — semanas de trabajo.
- `langgraph dev` ya persiste a disco con un flush periódico; el problema
  era solo que el directorio vivía en la capa efímera del contenedor.
- Verificado E2E: las conversaciones sobreviven `restart` y `--force-recreate`.

## Consecuencias

### Positivas
- Persistencia real con un cambio de 3 líneas en docker-compose.
- Sin dependencias nuevas ni servicios adicionales.

### Negativas
- Un kill abrupto (SIGKILL) puede perder los últimos segundos no flusheados.
- Almacenamiento de un solo nodo: no apto para multi-instancia. Si se
  necesita escalar, migrar a la opción 1 (los metadatos ya están en Postgres).

## Referencias

- Fix complementario: el frontend limpia threadIds huérfanos (404) del
  localStorage — `frontend/components/Chat.tsx`.
