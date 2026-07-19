# ADR-004: Embed cross-site — cookies Partitioned y túnel con nombre

Fecha: 2026-07-15
Estado: Aceptado

## Contexto

El widget debe embeberse vía iframe en sitios de otros orígenes
(analitica.ucacue.edu.ec). Dos bloqueantes: la sesión (cookie) se rechaza
como third-party en iframes cross-site, y la URL del quick tunnel de
Cloudflare cambiaba en cada reinicio.

## Opciones consideradas

Cookies: SameSite=Lax (solo same-origin) · SameSite=None; Secure ·
SameSite=None; Secure; Partitioned (CHIPS).
URL: quick tunnel (efímera) · túnel Cloudflare con nombre (token) ·
subdominio institucional con reverse proxy propio.

## Decisión

- Cookies de sesión y de cambio de contraseña con
  `SameSite=None; Secure; Partitioned` cuando la petición llega por HTTPS
  (detección vía x-forwarded-proto y cf-visitor en
  `frontend/lib/request-security.ts`); `Lax` como fallback en HTTP directo.
- Túnel Cloudflare con nombre (`TUNNEL_TOKEN` en .env): URL estable con
  HTTPS automático y conexiones redundantes.

## Justificación

- `Partitioned` (CHIPS) mantiene la sesión en navegadores que bloquean
  cookies de terceros (Safari, Firefox, Chrome estricto); sin ella el
  login dentro del iframe no persiste.
- El túnel con nombre no requiere que IT publique puertos ni certificados.
- Verificado E2E cross-site real: host en un origen, chat en otro —
  login, persistencia de sesión y auto-apertura del widget (postMessage).

## Consecuencias

### Positivas
- El snippet de embed funciona en cualquier sitio host sin configuración.
- La URL de producción sobrevive reinicios y deploys.

### Negativas
- Dependencia de Cloudflare para el dominio público (mitigable migrando a
  subdominio institucional: solo cambia el hostname del túnel).
- Los atributos de cookie deben mantenerse idénticos en login, logout y
  cambio de contraseña (centralizado en authCookieOptions()).

## Referencias

- docs/widget-embed-snippet.html — snippet entregable para el sitio host.
