# Seguridad — OWASP Top 10:2025 aplicado

Evaluación del Asistente de Analítica Académica contra el **OWASP Top
10:2025** (el material del máster, `6.5.4-OWASP-Top-10-Aplicado.pdf`, usa
la numeración 2021; aquí se usa la de 2025). Estado: ✅ cubierto ·
⚠️ parcial · ❌ pendiente.

| # (2025) | Categoría | Estado |
|---|---|---|
| A01 | Broken Access Control | ✅ |
| A02 | Security Misconfiguration | ⚠️ |
| A03 | Software Supply Chain Failures | ⚠️ |
| A04 | Cryptographic Failures | ✅ |
| A05 | Injection | ✅ |
| A06 | Insecure Design | ✅ |
| A07 | Authentication Failures | ✅ |
| A08 | Software/Data Integrity Failures | ✅ |
| A09 | Logging & Monitoring Failures | ✅ |
| A10 | Mishandling of Exceptional Conditions (nuevo) | ✅ |

## A01 — Broken Access Control ✅
- Rutas protegidas por `middleware.ts` (verifica el JWT de sesión; sin él
  redirige a /login). Rutas públicas explícitas (login, cambiar-clave,
  widget-demo, /api/).
- Aislamiento por usuario: `/api/threads` y DELETE filtran por `user_id`
  del token — un usuario no puede ver ni borrar hilos de otro (probado:
  el DELETE con id ajeno no afecta filas).
- La cookie de sesión es `HttpOnly` (no accesible desde JS).

## A02 — Security Misconfiguration ⚠️
- ✅ Errores no filtran internos: `api_get` devuelve mensajes seguros
  ("HTTP 404"), el detalle solo va a logs.
- ✅ Secretos fuera del código (ver A04).
- ⚠️ `Content-Security-Policy: frame-ancestors *` es deliberadamente
  amplio para permitir el embed cross-site. Aceptable para un widget
  público de solo-consulta; endurecer a la lista de dominios
  institucionales cuando estén definidos.
- ❌ Faltan headers de endurecimiento (`X-Content-Type-Options`,
  `Referrer-Policy`). HSTS lo maneja Cloudflare en el borde.

## A03 — Software Supply Chain Failures ⚠️
- ✅ Dependencias fijadas: `pnpm-lock.yaml` (frozen en el build Docker) y
  `requirements.txt`.
- ⚠️ Auditoría no automatizada. Recomendado: `pnpm audit` / `pip-audit`
  periódico (sin CI hoy; correrlo manual antes de releases).

## A04 — Cryptographic Failures ✅
- Contraseñas: **bcrypt cost 12** (`lib/db-users.ts`, `seed-users.js`).
  Nunca en texto plano.
- Sesión: JWT firmado HS256 con `JWT_SECRET` (≥32 chars, validado al
  arrancar), expiración 8h.
- Transporte: HTTPS vía túnel Cloudflare; cookies `Secure` + `Partitioned`
  tras HTTPS (ADR-004).
- Secretos en `.env`/`.env.local` gitignorados; **verificado que ningún
  secreto está en la historia de git** (contraseñas, TUNNEL_TOKEN, API keys).

## A05 — Injection ✅
- **Todas** las queries usan parámetros `$1, $2` (pg) — 8 usos, cero
  interpolación de strings en SQL. Inmune a SQL injection.
- La API de datos UCACUE recibe filtros como query params tipados; los
  `None` se eliminan antes de la petición.
- Render de mensajes: markdown vía `react-markdown` (escapa HTML por
  defecto, sin `dangerouslySetInnerHTML`).

## A06 — Insecure Design ✅
- Arquitectura por capas con puerto/adaptadores (ADR-002): la lógica de
  negocio no depende de infraestructura.
- Patrón Result: los errores son valores tipados, no excepciones que
  escapan al usuario.
- Cambio de contraseña obligatorio en el primer acceso, con token de
  propósito único (no emite sesión hasta completarlo).

## A07 — Authentication Failures ✅
- ✅ bcrypt, JWT con expiración, cambio forzado de clave inicial, política
  de contraseña (10+ chars, may/min/dígito) en `/cambiar-clave`.
- ✅ **Rate limiting** (`lib/rate-limit.ts`): bloquea tras 5 intentos
  fallidos por email+IP en ventana de 15 min (PostgreSQL, sobrevive
  reinicios; fail-open si la DB no está disponible). La IP real se toma
  de `cf-connecting-ip`/`x-forwarded-for`.

## A08 — Software/Data Integrity Failures ✅
- Sesión firmada (JWT) — un token manipulado se rechaza en `verifyToken`.
- Build reproducible (lockfiles); imagen Docker standalone.

## A09 — Logging & Monitoring Failures ✅
- Log estructurado JSON de cada consulta de datos (ADR-005): endpoint,
  filtros, ok/error, duración. Log `[auth-cookie]` en el flujo de sesión.
- `scripts/metricas-uso.sh` para adopción y resumen de errores/latencia.
- Límite honesto: sin alertas automáticas (pull, no push).

## A10 — Mishandling of Exceptional Conditions (nuevo en 2025) ✅
- Patrón Result de punta a punta: adaptadores y tools nunca lanzan hacia
  arriba; devuelven `{ok: false, error}`.
- El agente nunca responde vacío: fallback explícito al agotar rondas de
  tool-calling. Los threads huérfanos (404) se limpian en el cliente.
- Mensajes de error al usuario sin stack traces ni rutas internas.

## Pendientes priorizados

1. ✅ **Rate limiting en login** (A07) — implementado en PostgreSQL.
2. ✅ **Headers de endurecimiento** (A02) — `X-Content-Type-Options` y
   `Referrer-Policy` en `next.config.mjs`.
3. **Auditoría de dependencias** (A03) — `pnpm audit`/`pip-audit` en el
   checklist de release (manual, sin CI).
4. **CSP más estricto** (A02) — acotar `frame-ancestors` a los dominios
   institucionales cuando se confirmen.
5. **Deploy pendiente**: rate limiting, headers y observabilidad (ADR-005)
   están en git pero aún no desplegados al 201 (SSH sin respuesta).
