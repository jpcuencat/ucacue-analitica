# ADR-003: El agente decide la visualización (directiva [[viz:]])

Fecha: 2026-07-13
Estado: Aceptado

## Contexto

El frontend graficaba TODOS los resultados de tools de cada turno. Con el
prompt analista (que hace llamadas extra de contexto) cada respuesta traía
varios gráficos sin criterio que confundían en lugar de aportar.

## Opciones consideradas

1. Heurísticas en el frontend (cap de gráficos, reglas por tool)
2. El LLM decide la presentación y lo comunica con una directiva en su
   respuesta ([[viz: nombre_tool]]), que el frontend obedece

## Decisión

Opción 2. El system prompt define criterios (dato puntual → texto;
2-8 categorías → gráfico; >8 categorías o multi-métrica → tabla markdown;
serie temporal → línea) y el agente emite como máximo UNA directiva.
El frontend renderiza solo el gráfico indicado y oculta la directiva.

## Justificación

- El mismo modelo que analizó los datos es quien mejor sabe cómo
  presentarlos; las heurísticas de frontend no ven la intención.
- Las llamadas proactivas de contexto dejan de generar gráficos huérfanos.
- Las tablas salen gratis vía markdown, sin código nuevo.

## Consecuencias

### Positivas
- Máximo un gráfico por respuesta, siempre pertinente.
- Fallback seguro: sin directiva (o tool inexistente) → solo texto.

### Negativas
- La calidad de la decisión depende del modelo: un cambio de MODEL_NAME
  puede requerir reafinar los criterios del prompt.
- Contrato implícito prompt↔frontend (el regex de [[viz:]]) que debe
  mantenerse sincronizado en ambos lados.

## Referencias

- frontend/components/Chat.tsx (parseo) y MessageBubble.tsx (ocultamiento).
