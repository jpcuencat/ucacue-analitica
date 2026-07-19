# Asistente de Analítica Académica UCACUE

Agente conversacional + widget embebible que responde preguntas sobre
inscripciones y matrículas de la Universidad Católica de Cuenca con datos
reales, análisis ejecutivo y visualizaciones. Construido con LangGraph
(tool-calling sobre OpenAI), Next.js 15 y PostgreSQL.

## Inicio rápido

```bash
# Backend (LangGraph :2024) + Frontend (Next.js :3000)
bash scripts/dev-up.sh

# O manualmente:
source .venv/bin/activate && langgraph dev --port 2024 --no-browser
cd frontend && pnpm dev
```

Widget de prueba: http://localhost:3000/widget-demo.html

## Arquitectura

**LangChain vs LangGraph** (no son alternativas — LangGraph se construye
sobre LangChain): LangChain aporta las primitivas (las 7 herramientas
`@tool`, `ChatOpenAI`, mensajes); LangGraph aporta la orquestación (el
grafo llm↔tools, la persistencia por checkpoints y el servidor que
consume el frontend).

Clean Architecture con inversión de dependencias (ver `docs/adr/`):

- **Dominio** (`src/domain/`): contratos tipados (Pydantic), normalización
  anti-corrupción y puertos (Protocol). Sin dependencias de infraestructura.
- **Aplicación** (`src/tools/`): 7 use cases (@tool LangChain) que consumen
  el puerto de datos inyectado. Patrón Result de punta a punta: nunca lanzan.
- **Infraestructura** (`src/infrastructure/`): adaptador HTTP real
  (API UCACUE en Azure) y adaptador in-memory para tests.
- **Composition Root**: `langgraph_server.py::_build_graph()` — único punto
  que acopla implementaciones concretas e inyecta el system prompt analista
  (+ `src/agent/playbook.md`, técnicas aprendidas que se cargan por turno).
- **Frontend** (`frontend/`): Next.js App Router. Chat en modo widget
  (iframe cross-site), login con cambio de contraseña obligatorio en el
  primer acceso, historial de conversaciones en PostgreSQL.
- **Evaluación**: `evaluate.py` + `src/agent/` + `src/evaluation/` — harness
  de LangSmith que corre `UCACUEAgent` sobre un dataset. La UI Gradio original
  (Fase 1) fue eliminada del repo; el agente sobrevive solo para evaluación
  y tests. La interfaz de producción es el widget Next.js.

```
Usuario → widget (iframe) → Next.js (/api/lg proxy) → LangGraph → tools
                                ↓                        ↓
                            PostgreSQL             API UCACUE (Azure)
                       (usuarios, threads)      vía puerto + adaptador
```

## Estructura

```
src/
├── domain/          # Contratos, normalización, puertos (puro)
├── infrastructure/  # Adaptadores: HTTP real, in-memory
├── tools/           # Use cases (7 tools LangChain)
├── agent/           # UCACUEAgent (evaluate.py/tests) + playbook.md
└── evaluation/      # Dataset y evaluadores LangSmith
frontend/
├── app/             # Rutas: chat, login, cambiar-clave, api/threads
├── components/      # Chat, MessageBubble, ChartBlock (recharts)
└── lib/             # auth (JWT), db (pg), threads-client, request-security
tests/
├── domain/          # Unit puros (sin mocks)
├── application/     # Aceptación con Fake/Spy + agente
├── contracts/       # Adaptador HTTP + contrato tool↔OpenAPI
└── e2e/             # Smoke contra servidores reales (auto-skip)
```

## Testing

```bash
source .venv/bin/activate
python -m pytest tests/          # suite completa (e2e se salta sin servers)
bash scripts/dev-up.sh && python -m pytest tests/e2e/   # e2e incluido
cd frontend && npx tsc --noEmit  # typecheck del frontend
```

Pirámide según `docs/Testing-en-Clean-Architecture.pdf`: dominio sin mocks,
aceptación con adaptador in-memory (cambiar de HTTP real a memoria es una
línea en el fixture), contratos del adaptador y smoke E2E.

## Configuración

Variables en `.env` (gitignorado):

| Variable | Uso |
|---|---|
| `OPENAI_API_KEY` | LLM del agente (requerida) |
| `UCACUE_API_KEY` / `UCACUE_API_URL` | API de datos académicos |
| `MODEL_NAME` | Modelo OpenAI (default `gpt-5-mini`) |
| `POSTGRES_PASSWORD` | Postgres de producción (docker-compose) |
| `TUNNEL_TOKEN` | Túnel Cloudflare con nombre (URL estable) |
| `DEPLOY_HOST` / `DEPLOY_PATH` / `PUBLIC_API_URL` | Destino del deploy |

Frontend: `frontend/.env.local` (`JWT_SECRET`, `AUTH_USERS`, `DATABASE_URL`).

## Deploy

```bash
bash scripts/deploy.sh   # sube archivos, reconstruye contenedores y siembra usuarios
```

Producción: Docker Compose (postgres + langgraph + frontend + cloudflared).
Las conversaciones persisten en el volumen `langgraph-data`; los usuarios y
metadatos de threads en el volumen `postgres-data`.

## Documentación

- `docs/resumen-ejecutivo.md` — resumen para dirección (qué, por qué, resultados)
- `docs/openapi.yaml` — contrato de la API de datos UCACUE (consumida)
- `docs/api/api-propia.md` — endpoints propios del frontend (threads, proxy)
- `docs/componentes.md` — componentes React: props, variantes y ejemplos
- `docs/adr/` — decisiones de arquitectura (ADRs)
- `docs/widget-embed-snippet.html` — snippet para embeber el widget
- `CLAUDE.md` — guía del repo para asistentes de código

## Contribuir

Docs as Code: cualquier cambio de comportamiento actualiza README/ADRs/
docstrings **en el mismo commit**. Los tests van en el nivel que corresponda
(`tests/domain|application|contracts|e2e`) y la suite debe quedar en verde.
