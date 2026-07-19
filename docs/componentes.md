# Componentes del frontend

Documentación de componentes React (estilo Storybook docs). Decisión de
alcance: con 5 componentes internos no se instala Storybook — los tipos
TypeScript son la fuente de verdad y esta guía cubre props, variantes y
ejemplos. Si el design system crece (>10 componentes reutilizables),
migrar a Storybook con `tags: ['autodocs']`.

---

## Chat

Contenedor principal del chat: streaming con LangGraph SDK, historial de
conversaciones, sugerencias y render de gráficos dirigido por el agente.

| Prop | Tipo | Requerida | Descripción |
|---|---|---|---|
| `userEmail` | `string` | no | Email de la sesión; clave del threadId en localStorage (`ucacue_thread_<email>`) |
| `isWidget` | `boolean` | no (default `false`) | Modo widget: sin sidebar, barra compacta de historial, sugerencias, postMessage `ucacue-widget-ready` al host |

**Variantes**: escritorio (sidebar completo) · widget (iframe 460×650).

```tsx
<Chat userEmail={email} isWidget />
```

Comportamientos clave: limpia threadIds huérfanos (404 del proxy `/api/lg`),
parsea la directiva `[[viz: tool]]` del agente para decidir el único gráfico
a mostrar (ADR-003).

## MessageBubble

Burbuja de un mensaje (usuario/asistente/herramienta) con markdown (GFM:
tablas, listas) y gráficos adjuntos. Oculta la directiva `[[viz: ...]]`.

| Prop | Tipo | Requerida | Descripción |
|---|---|---|---|
| `message` | `AnyMessage` | sí | Mensaje LangChain (`type`/`role`: human, ai, tool) |
| `chartData` | `ToolChartData[]` | no | Gráficos a renderizar bajo el mensaje (solo rol assistant) |

**Variantes**: `bubble--user` · `bubble--assistant` · `bubble--tool` ·
contenido JSON (render `<pre>`) vs markdown.

## ChartBlock

Selector de gráfico según la tool que produjo los datos (recharts).

| Prop | Tipo | Requerida | Descripción |
|---|---|---|---|
| `toolName` | `string` | sí | Tool de origen — decide el tipo de gráfico |
| `data` | `unknown` | sí | El `data` del Result de la tool |

**Mapeo tool → gráfico**:

| toolName | Gráfico |
|---|---|
| `get_estudiantes_kpis` | Embudo de conversión |
| `get_sedes_kpis` / `get_facultades_kpis` | Barras horizontales (campos `carrerasede`/`carrerafacultad`) |
| `get_inscripciones_historico` | Área/línea por periodo |
| `get_cohortes` | Barras de tasa de pérdida |
| `get_comparativo_periodo` | Barras agrupadas actual vs anterior |
| otro | `null` (no renderiza) |

## Sidebar

Panel lateral de escritorio: sugerencias, lista de conversaciones y acciones.

| Prop | Tipo | Requerida | Descripción |
|---|---|---|---|
| `onSelect` | `(pregunta: string) => void` | sí | Click en una sugerencia |
| `threadId` | `string \| undefined` | sí | Conversación activa (resalta) |
| `isLoading` | `boolean` | sí | Deshabilita acciones durante el streaming |
| `onNewThread` | `() => void` | sí | Nueva conversación |
| `threadsList` | `ThreadMeta[]` | sí | Historial (`{id, title, createdAt}`) |
| `onSwitchThread` / `onDeleteThread` | `(id: string) => void` | sí | Cambiar / eliminar |
| `isOpen` / `onClose` | `boolean` / `() => void` | sí | Estado responsive (overlay móvil) |

## LogoutButton

Sin props. Formulario que invoca la Server Action `logoutAction`
(borra la cookie con los mismos atributos del login y redirige a /login).

---

## Widget embebible (integración externa)

No es un componente React: es el snippet `docs/widget-embed-snippet.html`
(botón flotante + iframe + auto-apertura vía postMessage). Ver ADR-004.
