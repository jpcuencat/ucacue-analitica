# API propia del frontend

Endpoints que expone la app Next.js. Complementa a `docs/openapi.yaml`
(la API UCACUE de datos académicos que el agente consume).

Autenticación: **cookie de sesión** `ucacue_session` (JWT HttpOnly emitida
en el login). No se usan Bearer tokens: el navegador adjunta la cookie.
Sin rate limits propios (aplican los del servidor).

---

## GET /api/threads — historial de conversaciones del usuario

- **Auth**: cookie de sesión requerida.
- **Request**: sin parámetros.
- **Response** `200` (JSON): últimas 50 conversaciones del usuario,
  ordenadas por actividad reciente.

```json
[
  { "id": "019f4deb-7e5b-...", "title": "¿Cuántos inscritos hay?", "createdAt": "2026-07-10T21:25:07.160Z" }
]
```

- **Errores**: `401 {"error": "No autorizado"}` sin cookie válida.
- **Ejemplo**:

```bash
curl -b "ucacue_session=<jwt>" http://localhost:3000/api/threads
```

## POST /api/threads — crear/renombrar conversación (upsert)

- **Auth**: cookie de sesión requerida.
- **Request** (JSON): `{ "id": string, "title"?: string }` — `id` es el
  thread_id de LangGraph; `title` se trunca a 500 caracteres
  (default "Nueva conversación").
- **Response** `200`: `{ "ok": true }`.
- **Errores**: `400 {"error": "id requerido"}` · `401` sin sesión.
- **Ejemplo**:

```bash
curl -b "ucacue_session=<jwt>" -X POST http://localhost:3000/api/threads \
  -H "Content-Type: application/json" \
  -d '{"id": "019f...", "title": "Inscritos por sede"}'
```

## DELETE /api/threads/{id} — eliminar conversación

- **Auth**: cookie de sesión requerida. Solo borra threads del propio
  usuario (filtra por user_id — un id ajeno no borra nada y responde ok).
- **Response** `200`: `{ "ok": true }`.
- **Errores**: `401` sin sesión.

## /api/lg/* — proxy al servidor LangGraph

Rewrite de Next.js (`next.config.mjs`) hacia el LangGraph interno
(`LANGGRAPH_INTERNAL_URL`). Expone la API estándar de LangGraph Server que
consume `@langchain/langgraph-sdk`; las rutas usadas por el chat:

| Ruta | Uso |
|---|---|
| `POST /api/lg/threads` | crear thread |
| `GET /api/lg/threads/{id}/state` | estado/mensajes (404 si el thread no existe — el frontend limpia el localStorage con eso) |
| `POST /api/lg/threads/{id}/runs/stream` | ejecutar el agente (SSE) |

El contrato completo es el de LangGraph Server (ver `http://localhost:2024/docs`
con los servers locales arriba — documentación interactiva autogenerada).

## Server Actions (no son endpoints REST)

El login, logout y cambio de contraseña son **Server Actions** de Next.js
(`app/login/action.ts`, `app/cambiar-clave/action.ts`): reciben FormData por
POST interno del framework y responden con redirects + Set-Cookie
(`SameSite=None; Secure; Partitioned` tras HTTPS — ver ADR-004).
