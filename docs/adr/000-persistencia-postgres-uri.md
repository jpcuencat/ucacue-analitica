# ADR-000: Persistencia de conversaciones vía POSTGRES_URI

Fecha: 2026-07-10 (registrado retroactivamente)
Estado: **Reemplazado por [ADR-001](001-persistencia-conversaciones.md)**

## Contexto

Las conversaciones se perdían al reiniciar el contenedor LangGraph.
Primera hipótesis: configurar la persistencia oficial de LangGraph
apuntando al PostgreSQL existente del servidor de producción.

## Opciones consideradas

1. `PostgresSaver` como checkpointer custom en `builder.compile()`
2. Variable `POSTGRES_URI` (documentada como la vía oficial) inyectada
   por un entrypoint que URL-encodea la contraseña

## Decisión (original)

Opción 2: `entrypoint-langgraph.sh` construía `POSTGRES_URI` y la
exportaba antes de arrancar `langgraph dev`.

## Por qué se reemplazó

Verificación en producción: los threads devolvían 404 tras reiniciar el
contenedor. Causa raíz: el runtime open-source de `langgraph dev` es
**solo in-memory** (`langgraph_runtime_inmem`); el runtime Postgres que
honra `POSTGRES_URI` es exclusivo de la plataforma de pago (LangSmith).
La opción 1 falla explícitamente: `langgraph dev` rechaza checkpointers
custom con `GraphLoadError`.

La solución real —persistir el directorio `.langgraph_api/` (pickles) en
un volumen Docker— quedó registrada en ADR-001.

## Lección

Validar la persistencia con el ciclo completo (escribir → reiniciar →
leer) antes de dar por buena una configuración: el server arrancaba sin
errores y logueaba "POSTGRES_URI configurado", pero no persistía nada.

## Referencias

- Commits del intento: 767009f, fa2f0f0, 25f2f86
- Verificación del fallo y solución definitiva: ADR-001
