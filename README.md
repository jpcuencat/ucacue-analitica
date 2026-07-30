# Asistente de Analítica Académica UCACUE

Agente conversacional + widget embebible que responde preguntas sobre
inscripciones y matrículas de la Universidad Católica de Cuenca con datos
reales, análisis ejecutivo y visualizaciones. Construido con LangGraph
(tool-calling sobre OpenAI), Next.js 15 y PostgreSQL.

Además del chat, incluye:

- **Envío de reportes a WhatsApp** — un botón en cada respuesta manda el
  resumen + el gráfico al WhatsApp del propio usuario (API oficial de Meta).
- **Pantalla `/admin`** — alta, reseteo y baja de usuarios de login sin SSH.

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
  primer acceso, historial de conversaciones en PostgreSQL, envío de
  reportes a WhatsApp y administración de usuarios (`/admin`).
- **Evaluación**: `evaluate.py` + `src/agent/` + `src/evaluation/` — harness
  de LangSmith que corre `UCACUEAgent` sobre un dataset. La UI Gradio original
  (Fase 1) fue eliminada del repo; el agente sobrevive solo para evaluación
  y tests. La interfaz de producción es el widget Next.js.

```
Usuario → widget (iframe) → Next.js (/api/lg proxy) → LangGraph → tools
                             │      ↓                        ↓
                             │  PostgreSQL            API UCACUE (Azure)
                             │  (usuarios, threads,   vía puerto + adaptador
                             │   log de envíos)
                             └→ WhatsApp Cloud API (resumen + gráfico en PNG)
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
├── app/             # Rutas: chat, login, cambiar-clave, admin,
│                    #   api/{threads, reports/send, admin/users, wa*}
├── components/      # Chat, MessageBubble, ChartBlock (recharts)
└── lib/             # auth (JWT), db (pg), db-migrate, db-users, admin,
                     #   threads-client, request-security, rate-limit,
                     #   whatsapp (Cloud API), wa-db, chart-image (PNG),
                     #   viz-spec, report-runner
tests/
├── domain/          # Unit puros (sin mocks)
├── application/     # Aceptación con Fake/Spy + agente
├── contracts/       # Adaptador HTTP + contrato tool↔OpenAPI
└── e2e/             # Smoke contra servidores reales (auto-skip)
```

## Reportes por WhatsApp

Cada respuesta del asistente ofrece un botón **«Enviar a WhatsApp»** que manda
el resumen ejecutivo + el gráfico al número del propio usuario.

- **Quién lo ve**: solo usuarios con `users.wa_view = TRUE` (por defecto
  `FALSE`). El destino es su `users.telefono` — no se eligen destinatarios.
- **La imagen**: se captura el gráfico tal cual se ve en el chat
  (`html-to-image`) y el servidor la normaliza a fondo blanco opaco y
  proporción 1.91:1, la que WhatsApp usa en el header de plantilla. Si la
  captura falla, cae al render de servidor (`@napi-rs/canvas`).
- **El texto**: las variables de plantilla de WhatsApp **no admiten saltos de
  línea**, así que la respuesta se reduce a un resumen de una línea (máx. 900
  caracteres); el detalle va en la imagen.
- **Requisito de Meta**: los mensajes iniciados por el negocio exigen una
  plantilla aprobada (header de imagen + una variable de cuerpo). Con el número
  de prueba, además, cada destinatario debe registrarse en la lista blanca de
  la app; con un número propio verificado esa restricción desaparece.
- **Auditoría**: cada envío queda en `wa_send_log`.

`GET/POST/PATCH/DELETE /api/wa-recipients` y la tabla `wa_recipients` existen
pero **hoy no los usa la interfaz** (quedaron de un diseño previo con selección
de destinatarios); junto con `wa_reports` están reservados para los reportes
programados, que aún no se implementan.

## Administración de usuarios (`/admin`)

Pantalla para gestionar el login sin entrar por SSH: alta, reseteo de clave y
baja. Solo accesible a los correos de `ADMIN_EMAILS`. Las altas y reseteos
asignan `CLAVE_INICIAL_DEFAULT` con `must_change_password = TRUE`, de modo que
el usuario debe cambiarla en su primer ingreso.

## Testing

```bash
source .venv/bin/activate
python -m pytest tests/          # suite completa (e2e se salta sin servers)
bash scripts/dev-up.sh && python -m pytest tests/e2e/   # e2e incluido
cd frontend && npx tsc --noEmit  # typecheck del frontend
```

Pirámide de testing en Clean Architecture: dominio sin mocks,
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

Frontend: `frontend/.env.local`

| Variable | Uso |
|---|---|
| `JWT_SECRET` | Firma de la cookie de sesión (mín. 32 caracteres) |
| `DATABASE_URL` | PostgreSQL (usuarios, threads, envíos) |
| `AUTH_USERS` | Semilla `correo:clave,…` para `seed-users.js`; **no** es la fuente de verdad del login (lo es la tabla `users`) |
| `ADMIN_EMAILS` | Correos con acceso a `/admin` (default: `jdatosanalitica@ucacue.edu.ec`) |
| `CLAVE_INICIAL_DEFAULT` | Clave que asigna `/admin` en altas y reseteos |
| `WA_PHONE_NUMBER_ID` / `WA_TOKEN` | Credenciales de WhatsApp Cloud API |
| `WA_TEMPLATE_NAME` / `WA_TEMPLATE_LANG` | Plantilla aprobada por Meta y su idioma |
| `WA_API_VERSION` | Versión de la Graph API (default `v21.0`) |

## Deploy

```bash
bash scripts/deploy.sh   # sube código, reconstruye contenedores y siembra usuarios
```

El script **no sobrescribe** `.env` ni `frontend/.env.local` del servidor (los
locales apuntan a otra base y romperían producción): verifica que existan y
aborta si faltan. En un servidor nuevo hay que copiarlos a mano una vez.

Producción: Docker Compose (postgres + langgraph + frontend + cloudflared).
Las conversaciones persisten en el volumen `langgraph-data`; los usuarios y
metadatos de threads en el volumen `postgres-data`. La imagen del frontend
instala `fontconfig` + `font-dejavu`: sin fuentes, el texto de los gráficos
que se envían por WhatsApp saldría vacío en Alpine.

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
