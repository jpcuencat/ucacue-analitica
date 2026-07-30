# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Asistente de Analítica Académica UCACUE: a Spanish-language conversational agent + embeddable widget that surfaces enrollment ("inscripciones") KPIs from UCACUE's academic API. The code, prompts, and UI are in Spanish — keep new strings in Spanish.

**Stack — LangChain vs LangGraph (not alternatives; LangGraph builds ON LangChain):**
- **LangChain** provides the primitives: the 7 `@tool` functions, `ChatOpenAI` + `bind_tools`, message types.
- **LangGraph** provides the orchestration: the llm↔tools graph, checkpoints (conversation persistence) and the server (`langgraph dev`) the frontend consumes.

**Entry points:**
- **Production**: `langgraph_server.py` (LangGraph server :2024) + `frontend/` (Next.js 15 widget/chat, embeds cross-site via iframe).
- **Evaluation**: `evaluate.py` — LangSmith eval harness that drives `UCACUEAgent` (`src/agent/api_agent.py`) over a dataset. Note: the original Fase-1 Gradio UI (`app.py`, `src/interface/`) was removed from the repo; `UCACUEAgent` survives only for evaluation and tests.

The agent wires up **7 LangChain tools** over the UCACUE API (see `src/tools/ucacue_tools.py`):
- `get_estudiantes_kpis` (`/api/estudiantes`) — aggregate KPIs (the original Fase-1 tool).
- `get_sedes_kpis` (`/api/sedes`), `get_facultades_kpis` (`/api/facultades`), `get_carreras` (`/api/carreras`, with `selector`/`buscar`) — breakdowns by sede/facultad/carrera in a single call.
- `get_cohortes` (`/api/cohortes`) — retention/loss; **the only source of `tasa_perdida`** (which `/api/estudiantes` returns `null`).
- `get_comparativo_periodo` (`/api/comparativo-periodo`) — period-vs-period at the same cutoff.
- `get_inscripciones_historico` (`/api/inscripciones-historico`) — time series.

The **chat** can use all 7 (the LLM picks per the `SYSTEM_PROMPT` tool descriptions). Note `/api/sedes` is NOT period-filterable. See `docs/openapi.yaml` for the full API.

## Commands

```bash
# Setup
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Run producción local (LangGraph :2024 + Next.js — detecta el puerto real)
bash scripts/dev-up.sh

# Tests (24; los e2e se saltan si los servers no están arriba)
python -m pytest tests/
cd frontend && npx tsc --noEmit   # typecheck frontend

# Evaluación del agente con LangSmith
python evaluate.py

# Deploy (requiere DEPLOY_HOST/DEPLOY_PATH en .env)
bash scripts/deploy.sh
```

## Configuration

Requires a `.env` (gitignored) with:
- `OPENAI_API_KEY` — required; startup fails without it.
- `UCACUE_API_KEY` — required; sent as `x-api-key` header to the UCACUE API.
- `UCACUE_API_URL` — optional, defaults to the Azure middleware `https://powerbi-middleware-ucacue-cff3g2csgpf9ebdz.centralus-01.azurewebsites.net` (if set to a plain-HTTP URL, the app logs a warning that the key travels in cleartext).
- `MODEL_NAME` — optional, defaults to `gpt-5-mini`.
- `LOG_LEVEL` — optional, defaults to `INFO`.

Frontend (`frontend/.env.local`): `JWT_SECRET`, `DATABASE_URL`, `AUTH_USERS`
(solo semilla para `seed-users.js`; la fuente de verdad del login es la tabla
`users`), `ADMIN_EMAILS` (acceso a `/admin`), `CLAVE_INICIAL_DEFAULT` (clave que
asignan las altas/reseteos) y las de WhatsApp: `WA_PHONE_NUMBER_ID`, `WA_TOKEN`,
`WA_TEMPLATE_NAME`, `WA_TEMPLATE_LANG`, `WA_API_VERSION`.
Producción/deploy (`.env`): `POSTGRES_PASSWORD`, `TUNNEL_TOKEN`, `DEPLOY_HOST`,
`DEPLOY_PATH`, `PUBLIC_API_URL`.

`scripts/deploy.sh` **no copia** los archivos de entorno al servidor (los
locales apuntan a otra base y romperían producción): verifica que existan y
aborta si faltan.

## Architecture

**Production flow**: Next.js widget (iframe) → `/api/lg` proxy → LangGraph server (`langgraph_server.py`, graph llm↔tools + playbook injected per turn) → tools via injected port → UCACUE API (Azure). Users/threads metadata in PostgreSQL; conversation checkpoints in the `langgraph-data` Docker volume (ADR-001).

**Envío a WhatsApp** (`frontend/lib/whatsapp.ts` + `app/api/reports/send/route.ts`): el botón de cada respuesta manda resumen + gráfico al WhatsApp del **propio** usuario (`users.telefono`), y solo aparece si `users.wa_view = TRUE` (default `FALSE`). La imagen es la captura del gráfico del chat (`html-to-image`) que el servidor normaliza con `normalizarParaWhatsApp` (fondo opaco + 1.91:1, formato del header de plantilla); si falla, cae al render `@napi-rs/canvas` (`lib/chart-image.ts`). Las variables de plantilla de Meta **no admiten saltos de línea** → el texto se colapsa a una línea (máx. 900 chars). Auditoría en `wa_send_log`. Los reportes programados aún no están implementados.

**Administración de usuarios** (`app/admin/` + `app/api/admin/users/route.ts`): alta, reseteo y baja del login sin SSH, restringido a `ADMIN_EMAILS`. Asigna `CLAVE_INICIAL_DEFAULT` con `must_change_password = TRUE`. Ojo: `lib/auth.ts` solo cae al fallback `AUTH_USERS` si la DB **lanza excepción** — un usuario ausente de la tabla `users` simplemente no entra.

**Clean Architecture layers** (ADR-002): `src/domain/` (contracts, normalization, `PuertoDatosAcademicos` Protocol — pure) ← `src/tools/` (7 `@tool` use cases, consume the injected port, Result pattern) ← `src/infrastructure/` (`AdaptadorApiUcacue` HTTP real, `AdaptadorInMemory` for tests). Composition Root: `langgraph_server._build_graph()`.

**Evaluation flow**: `evaluate.py` → `UCACUEAgent` → same tools → LangSmith scorers.

- `src/agent/api_agent.py` — `UCACUEAgent`, usado hoy por `evaluate.py` y los
  tests (no por una UI). Compiles its own internal LangGraph graph (llm↔tools,
  `MemorySaver`, `recursion_limit: 11` ≈ 5 tool rounds; on exhaustion returns a
  "No pude completar..." fallback with the tool_data gathered so far — never a
  silent empty reply). **The agent is stateless**: `chat(message, history) ->
  (reply, tool_data, new_history)` — history is passed in/out by the caller.
  The `llm` property allows injecting test doubles (late binding — no graph
  recompile). The OpenAI key is wrapped in `SecretStr`. Note: `temperature` is
  only passed when explicitly set (the `gpt-5` family rejects non-default
  temperatures).

- `src/tools/ucacue_tools.py` — the 7 LangChain `@tool` use cases; they call the injected port (`configurar_puerto`/`puerto_actual`) and normalize via `src/domain/normalizacion.py` (`FIELD_MAP` + `normalizar_estudiantes` — the single seam to touch if the API's field names change; HTTP lives in `src/infrastructure/ucacue_api.py`). Tools always return a dict; on error they return `{"ok": False, "error": ...}` rather than raising. Successful responses are `{"ok": True, "data": {...}}`. `None` params are stripped before the request. Caveats from the live API: `tasa_perdida` is **not** provided by `/api/estudiantes` (arrives `null`; it lives in `/api/cohortes`), and `matriculas_convalidadas` can arrive as the string `"--"` — coerced to `None` by the domain. `periodo` accepts both the `AAAAN` code (`"20261"`) and the visible name (`"Sierra - 2026"`).

- Charts en producción: `frontend/components/ChartBlock.tsx` (recharts). El
  agente decide qué graficar con la directiva `[[viz: tool]]` (ADR-003). La
  antigua capa Plotly de Gradio (`src/interface/charts.py`) fue eliminada.

## Domain conventions

- **Period codes** are `AAAAN` where N=1 is SIERRA, N=2 is COSTA (e.g. `20261` = Sierra 2026, the current/active period; `20252` = Costa 2025).
- **Rates** from the API are decimals (`0.50` = 50%) — multiply by 100 when displaying.
- **`tasa_perdida` is negative** to denote student loss (e.g. `-0.162` = 16.2% loss); chart code uses `abs()`.
- Sedes: `MATRIZ CUENCA`, `SEDE AZOGUES`, `SEDE MACAS`, `EXTENSION SAN PABLO DE LA TRONCAL`, `EXTENSION CAÑAR`.
- The model must never invent figures — it always calls the tool for real data (enforced via the system prompt).
