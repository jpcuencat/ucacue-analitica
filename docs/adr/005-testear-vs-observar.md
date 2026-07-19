# ADR-005: Estrategia testing vs observabilidad (etapa MVP)

Fecha: 2026-07-18
Estado: Aceptado

## Contexto

Los tests predicen problemas conocidos; la observabilidad descubre los
desconocidos. El proyecto está en etapa MVP (26 usuarios, primer periodo
de uso real): según la matriz del material del máster
(docs/Testear-menos-vs-Observar-mas.pdf), en esta fase la prioridad es
OBSERVAR > TESTEAR (~60/40). Tras completar la pirámide de tests, la
observabilidad era el lado débil: no sabíamos qué se pregunta, qué
falla ni cuánto tarda en producción.

## Opciones consideradas

1. APM/error tracking completo (Sentry o similar)
2. Observabilidad ligera con lo existente: log estructurado en el punto
   único de salida a datos + métricas de adopción desde PostgreSQL
3. No observar (solo tests)

## Decisión

Opción 2:
- **Log estructurado en el puerto**: `api_get` (adaptador HTTP, por donde
  pasa TODA consulta de datos) emite un JSON por llamada — endpoint,
  filtros, ok/error, duración ms. `docker compose logs langgraph` es el
  stream de uso, errores y latencia.
- **Métricas de adopción sin infra nueva**: `scripts/metricas-uso.sh`
  reporta usuarios activos, conversaciones/semana, top usuarios y qué
  preguntan (la tabla `threads` ya registra todo) + resumen de
  errores/latencia del log estructurado.
- **Testing enfocado** (ya existente): pirámide completa para el
  comportamiento definido — contratos, normalización, reglas de negocio.

## Justificación

- El puerto del ADR-002 hace que UN punto instrumentado cubra el 100%
  de las consultas de datos (beneficio directo de la arquitectura).
- Los datos de adopción ya existían en Postgres; solo faltaba leerlos.
- APM completo es sobre-ingeniería para 26 usuarios y añade un tercero
  (coste, datos fuera de la institución).

## Consecuencias

### Positivas
- Se pueden responder "¿quién lo usa?, ¿qué preguntan?, ¿qué falla?,
  ¿qué tan rápido?" sin dependencias nuevas.
- Alimenta el punto pendiente del resumen ejecutivo (medir impacto real).

### Negativas
- Sin alertas automáticas: hay que correr el script/mirar logs (pull,
  no push).
- Los logs viven en el contenedor (se pierden al recrearlo; las métricas
  de adopción no — están en Postgres).
- Rebalancear hacia más testing/APM al pasar a etapa de crecimiento.

## Referencias

- scripts/metricas-uso.sh · src/infrastructure/ucacue_api.py (api_get)
- ADR-002 (el puerto que hace posible instrumentar un solo punto)
