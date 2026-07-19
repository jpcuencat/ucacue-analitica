# Architecture Decision Records

Decisiones de arquitectura del proyecto con su contexto y justificación
("el porqué"). Plantilla: [template.md](template.md).

Reglas: escribir el ADR al tomar la decisión (no semanas después),
máximo ~1 página, enfocado en el porqué (el cómo va en la documentación),
y **nunca eliminar** un ADR — al cambiar una decisión se marca
Deprecado/Reemplazado enlazando al nuevo.

## Activos

- [ADR-001](001-persistencia-conversaciones.md) — Persistencia de conversaciones con volumen Docker
- [ADR-002](002-puerto-adaptadores.md) — Inversión de dependencias con puerto y adaptadores
- [ADR-003](003-agente-decide-visualizacion.md) — El agente decide la visualización (directiva [[viz:]])
- [ADR-004](004-embed-cross-site.md) — Embed cross-site: cookies Partitioned y túnel con nombre
- [ADR-005](005-testear-vs-observar.md) — Estrategia testing vs observabilidad (etapa MVP)

## Reemplazados

- [ADR-000](000-persistencia-postgres-uri.md) — Persistencia vía POSTGRES_URI — Reemplazado por ADR-001
