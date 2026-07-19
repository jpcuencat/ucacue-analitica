---
description: Levanta los servers locales de desarrollo (baja los existentes y los deja arriba verificados)
allowed-tools: Bash(bash scripts/dev-up.sh), Bash(tail:*), Bash(curl:*)
---

Levanta los servers locales de desarrollo del proyecto ejecutando:

```bash
bash scripts/dev-up.sh
```

El script hace todo el ciclo: detecta procesos existentes (`langgraph dev` y
`next-server`/`next dev`), los baja, levanta ambos de nuevo en segundo plano
(LangGraph en :2024 con el venv del proyecto, Next.js en :3000 con pnpm) y
verifica con curl que ambos respondan 200 antes de declarar éxito.

Reglas:
1. Ejecuta el script y muestra su salida al usuario tal cual.
2. Si termina con "Listo", confirma las dos URLs: http://localhost:3000/widget-demo.html
   (widget) y http://localhost:2024/docs (API LangGraph).
3. Si termina con "ALGO FALLÓ", lee las últimas 30 líneas de
   /tmp/langgraph-dev.log y /tmp/next-dev.log, diagnostica la causa
   (puerto ocupado, venv roto, dependencia faltante) y corrígela antes de
   reintentar. No declares éxito sin los dos 200.
