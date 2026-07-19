# AGENTS.md — Guía para agentes de IA

Asistente de Analítica Académica UCACUE: agente conversacional (LangGraph +
OpenAI) con widget embebible (Next.js 15) sobre datos de matrículas.
**Todo el código, prompts, docs y strings de UI van en español.**

Stack: LangGraph orquesta (grafo llm↔tools, persistencia, servidor); las
herramientas son primitivas `@tool` de **LangChain** (LangGraph se construye
sobre LangChain, no lo reemplaza). La UI de producción es el widget Next.js.
`UCACUEAgent` (`src/agent/`) ya no tiene UI: lo usan `evaluate.py` (harness
LangSmith) y los tests. La UI Gradio original (Fase 1) fue eliminada del repo.

## Comandos

```bash
bash scripts/dev-up.sh                    # levantar servers locales (verifica puertos reales)
source .venv/bin/activate && python -m pytest tests/   # suite (24 tests; e2e se salta sin servers)
cd frontend && npx tsc --noEmit           # typecheck frontend
bash scripts/deploy.sh                    # deploy (requiere DEPLOY_HOST/DEPLOY_PATH en .env)
```

## Reglas del proyecto

1. **Arquitectura por capas** (no romperla): `src/domain/` puro →
   `src/tools/` (use cases) consumen el puerto inyectado → adaptadores en
   `src/infrastructure/`. El único punto de acoplamiento concreto es el
   Composition Root (`langgraph_server.py::_build_graph`).
2. **Patrón Result**: las tools y adaptadores nunca lanzan — devuelven
   `{"ok": True, "data": ...}` o `{"ok": False, "error": ...}`.
3. **Tests en su nivel**: `tests/domain` (sin mocks) · `tests/application`
   (dobles in-memory) · `tests/contracts` · `tests/e2e`. La suite debe
   quedar en verde antes de commitear.
4. **Docs en el mismo commit** que el cambio de comportamiento
   (README, ADRs en `docs/adr/`, docstrings).
5. **Secretos**: nunca en archivos versionados — viven en `.env` y
   `frontend/.env.local` (gitignorados). No commitear IPs de servidores
   ni dominios de túneles.
6. Los datos del periodo activo son parciales: comparaciones entre
   periodos siempre al mismo corte (ver `src/agent/playbook.md`).

## Conocimiento detallado

- `CLAUDE.md` — arquitectura completa, convenciones de dominio y trampas
  del API (fuente principal; léelo antes de cambios grandes)
- `README.md` — inicio rápido, estructura, configuración
- `docs/adr/` — el porqué de las decisiones (leer antes de revertir una)
- `src/agent/playbook.md` — técnicas del agente analista (se inyecta al
  system prompt en runtime; para enseñarle algo nuevo, edítalo)
