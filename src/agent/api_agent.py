"""Agente conversacional UCACUE — implementado con LangGraph StateGraph.

El agente es stateless por diseño: la conversación vive en el checkpointer de
LangGraph (InMemorySaver, por thread_id de sesión). La UI Next.js gestiona los
threads vía /api/threads; el agente recibe y devuelve mensajes por turno.
"""

import json
import logging
import os
import uuid
from datetime import datetime
from typing import Any, Optional

from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.errors import GraphRecursionError
from langgraph.graph import END, StateGraph
from langgraph.graph.message import MessagesState
from langgraph.prebuilt import ToolNode
from pydantic import SecretStr

from src.tools import (
    get_carreras,
    get_cohortes,
    get_comparativo_periodo,
    get_estudiantes_kpis,
    get_facultades_kpis,
    get_inscripciones_historico,
    get_sedes_kpis,
)

logger = logging.getLogger(__name__)

History = list[BaseMessage]

# Cache del SYSTEM_PROMPT: se carga una vez (desde Hub o local).
_cached_prompt: Optional[str] = None


def _get_system_prompt() -> str:
    """Devuelve el SYSTEM_PROMPT desde LangSmith Hub o el local como fallback.

    Activar Hub: LANGSMITH_HUB_PROMPT=ucacue-analitica/system-prompt en .env
    El resultado se cachea en memoria para no hacer una llamada HTTP por turno.
    """
    global _cached_prompt
    if _cached_prompt is not None:
        return _cached_prompt

    hub_ref = os.getenv("LANGSMITH_HUB_PROMPT")
    if hub_ref:
        try:
            from langsmith import Client as LSClient
            template = LSClient().pull_prompt(hub_ref)
            if hasattr(template, "messages") and template.messages:
                _cached_prompt = template.messages[0].prompt.template
                logger.info("SYSTEM_PROMPT cargado desde Hub: %s", hub_ref)
                return _cached_prompt
        except Exception as e:  # noqa: BLE001
            logger.warning("Hub pull falló (%s) — usando SYSTEM_PROMPT local.", e)

    _cached_prompt = SYSTEM_PROMPT
    return _cached_prompt


# Resultado de un turno: texto de respuesta, datos de tool por nombre, historial nuevo.
ChatResult = tuple[str, dict[str, Any], History]

SYSTEM_PROMPT = """Eres el Asistente de Analítica Académica de la UCACUE.
Tienes acceso a datos en tiempo real mediante esta herramienta:

- get_estudiantes_kpis: KPIs AGREGADOS del periodo (inscritos, reservas,
  matrículas nuevas, convalidados, pendientes, repetidores, tasas de conversión
  y pérdida, días promedio de pago). Filtra por periodo, sede, facultad,
  carrera y modalidad. Devuelve UN total por combinación de filtros.
- get_sedes_kpis: desglose POR SEDE en una sola llamada. OJO: NO filtra por
  periodo (devuelve totales de TODOS los periodos). Para "por sede de un
  periodo concreto", llama get_estudiantes_kpis una vez por cada sede y aclara
  el periodo; usa get_sedes_kpis solo para totales históricos/generales.
- get_facultades_kpis: desglose POR FACULTAD en una sola llamada (filtra por
  periodo y sede opcionales).
- get_carreras: desglose POR CARRERA, o selector para confirmar una carrera
  mencionada de forma aproximada (selector=True, buscar="texto"): muestra las
  opciones, CONFIRMA con el usuario y recién entonces filtra por carrera_nombre.

- get_cohortes: permanencia/deserción por cohorte; ES LA FUENTE de tasa_perdida
  (que get_estudiantes_kpis no provee). Úsala para pérdida/retención/deserción.
  NO pases hasta_periodo salvo que el usuario pida un corte concreto: por
  defecto la tool usa el último periodo consolidado. Medir en el periodo activo
  (incompleto) daría pérdida -100% falsa en todos los cohortes.
- get_comparativo_periodo: compara un periodo vs otro al mismo corte
  (¿cómo vamos vs el año pasado?, ¿cuántos teníamos a esta fecha?).
- get_inscripciones_historico: serie temporal por periodo (evolución/tendencia).

Elige la herramienta según la pregunta: agregados → get_estudiantes_kpis;
desglose por sede/facultad/carrera → la de desglose (una sola llamada);
pérdida/deserción → get_cohortes; comparar periodos → get_comparativo_periodo;
tendencia/histórico → get_inscripciones_historico.

Formato de periodos AAAAN (N=1 SIERRA, N=2 COSTA):
  20261 = Sierra 2026 (ACTUAL) · 20252 = Costa 2025 · 20251 = Sierra 2025

Sedes: MATRIZ CUENCA · SEDE AZOGUES · SEDE MACAS ·
       EXTENSION SAN PABLO DE LA TRONCAL · EXTENSION CAÑAR

Reglas:
1. Usa siempre la herramienta para obtener datos reales, nunca inventes cifras.
2. Tasas vienen en decimal (0.50 = 50%). Conviértelas al presentar.
3. tasa_perdida negativa = pérdida de estudiantes (ej. -0.162 = 16.2%).
   Puede venir como null/sin dato en este endpoint; en ese caso indícalo.
4. Si un valor llega como null o "--", trátalo como dato no disponible.
5. Responde en español.
Fecha actual: {current_time}
"""


def _should_continue(state: MessagesState) -> str:
    """Edge condicional: si el último mensaje tiene tool_calls → tools, si no → END."""
    last = state["messages"][-1]
    if getattr(last, "tool_calls", None):
        return "tools"
    return END


class UCACUEAgent:
    """Agente UCACUE implementado con LangGraph StateGraph + InMemorySaver.

    Interfaz pública idéntica al agente anterior:
        reply, tool_data, new_history = agent.chat(message, history)

    Internamente se construye un StateGraph con:
    - llm_node: invoca ChatOpenAI con bind_tools (los 7 tools UCACUE).
    - tools_node: ToolNode de langgraph.prebuilt (ejecuta las tools).
    - Edge condicional: tool_calls presentes → tools_node → llm_node; si no → END.
    - InMemorySaver como checkpointer para checkpointing nativo por thread.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: str = "gpt-5-mini",
        temperature: Optional[float] = None,
        memory_window: int = 10,
    ) -> None:
        key = api_key or os.getenv("OPENAI_API_KEY")
        if not key:
            raise ValueError("OPENAI_API_KEY es requerida.")

        self.memory_window = memory_window

        self._tools = [
            get_estudiantes_kpis,
            get_sedes_kpis,
            get_facultades_kpis,
            get_carreras,
            get_cohortes,
            get_comparativo_periodo,
            get_inscripciones_historico,
        ]

        # Algunos modelos (p. ej. la familia gpt-5) solo aceptan el temperature
        # por defecto; solo se envía si se especifica explícitamente.
        llm_kwargs: dict[str, Any] = {
            "api_key": SecretStr(key),
            "model": model_name,
        }
        if temperature is not None:
            llm_kwargs["temperature"] = temperature

        llm = ChatOpenAI(**llm_kwargs)
        self._llm_with_tools = llm.bind_tools(self._tools)

        # Checkpointer con memoria en proceso (un thread por sesión de usuario).
        self._checkpointer = MemorySaver()

        # Identificador de thread para esta instancia. Si se necesita aislar
        # sesiones concurrentes, la UI puede pasar su propio thread_id.
        self._thread_id = str(uuid.uuid4())

        # Compilar el grafo una sola vez.
        self._graph = self._build_graph()

    @property
    def llm(self):
        """LLM con tools enlazadas. Setter pensado para inyectar dobles en tests:
        llm_node lee self._llm_with_tools en cada invocación (late binding),
        así que no hace falta recompilar el grafo."""
        return self._llm_with_tools

    @llm.setter
    def llm(self, value) -> None:
        self._llm_with_tools = value

    def _build_graph(self):
        """Construye y compila el StateGraph LangGraph."""

        def llm_node(state: MessagesState) -> dict:
            """Invoca el LLM con tools enlazadas."""
            response = self._llm_with_tools.invoke(state["messages"])
            return {"messages": [response]}

        tools_node = ToolNode(self._tools)

        builder = StateGraph(MessagesState)
        builder.add_node("llm", llm_node)
        builder.add_node("tools", tools_node)

        builder.set_entry_point("llm")
        builder.add_conditional_edges("llm", _should_continue, {"tools": "tools", END: END})
        builder.add_edge("tools", "llm")

        return builder.compile(checkpointer=self._checkpointer)

    def _extract_tool_data(self, messages: list[BaseMessage]) -> dict[str, Any]:
        """Extrae tool_data del último turno a partir de los ToolMessages del estado.

        Devuelve un dict {tool_name: result_obj} con la misma semántica que el
        agente anterior: si una tool se llamó varias veces, el valor es una
        lista de {"result": ..., "args": ...}.
        """
        tool_data: dict[str, Any] = {}

        # Buscar el último bloque de AIMessage con tool_calls y los ToolMessages
        # que le siguen (pueden estar intercalados en multi-step).
        # Estrategia: recorrer en orden y mantener un mapa de tool_call_id → args.
        id_to_name_args: dict[str, tuple[str, dict]] = {}
        for msg in messages:
            if isinstance(msg, AIMessage) and getattr(msg, "tool_calls", None):
                for tc in msg.tool_calls:
                    id_to_name_args[tc["id"]] = (tc["name"], dict(tc.get("args") or {}))

        for msg in messages:
            if not isinstance(msg, ToolMessage):
                continue
            entry = id_to_name_args.get(msg.tool_call_id)
            if entry is None:
                continue
            name, args = entry
            try:
                result_obj = json.loads(msg.content)
            except (json.JSONDecodeError, TypeError):
                result_obj = {"content": msg.content}

            if name in tool_data:
                prev = tool_data[name]
                if isinstance(prev, list):
                    prev.append({"result": result_obj, "args": args})
                else:
                    tool_data[name] = [
                        {"result": prev, "args": {}},
                        {"result": result_obj, "args": args},
                    ]
            else:
                tool_data[name] = result_obj

        return tool_data

    def chat(
        self,
        message: str,
        history: Optional[History] = None,
        thread_id: Optional[str] = None,
    ) -> ChatResult:
        """Procesa un turno con LangGraph. No muta estado de instancia (salvo checkpointer).

        Devuelve (respuesta, datos_de_tool_por_nombre, historial_actualizado).

        El checkpointer de LangGraph gestiona los ciclos internos de tool-calling.

        thread_id: identificador de sesión. Si se omite usa el del agente (sesión única).
        La UI futura puede pasar un UUID por usuario para aislar checkpoints concurrentes.
        """
        history = list(history or [])

        # Construir el system prompt con la fecha actual.
        system_text = _get_system_prompt().format(
            current_time=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        )

        # Ventana de memoria: SystemMessage + historial reciente + nuevo mensaje.
        input_messages: list[BaseMessage] = [
            SystemMessage(content=system_text),
            *history[-self.memory_window * 2:],
            HumanMessage(content=message),
        ]

        config = {
            "configurable": {"thread_id": thread_id or self._thread_id},
            # Tope de rondas de tool-calling (~5 rondas llm→tools). Si el modelo
            # sigue pidiendo tools al llegar aquí, se responde con fallback en
            # lugar de iterar sin fin (comportamiento documentado en CLAUDE.md).
            "recursion_limit": 11,
        }

        try:
            # Invocar el grafo con los mensajes del turno actual.
            # LangGraph ejecuta llm_node → (tools_node → llm_node)* → END.
            result_state = self._graph.invoke(
                {"messages": input_messages},
                config=config,
            )
        except GraphRecursionError:
            # Rondas agotadas: rescatar lo consultado hasta ahora del checkpointer.
            logger.warning("Rondas de tool-calling agotadas; devolviendo fallback.")
            try:
                snapshot = self._graph.get_state(config)
                partial_msgs = snapshot.values.get("messages", [])
            except Exception:  # noqa: BLE001
                partial_msgs = []
            fallback = (
                "No pude completar la consulta tras varios intentos de obtener "
                "los datos. Intenta reformular la pregunta."
            )
            new_history = history + [
                HumanMessage(content=message),
                AIMessage(content=fallback),
            ]
            new_history = new_history[-self.memory_window * 2:]
            return fallback, self._extract_tool_data(partial_msgs), new_history
        except Exception as e:  # noqa: BLE001
            logger.error("Error en el grafo LangGraph: %s", e, exc_info=True)
            fallback = (
                "No pude procesar tu consulta en este momento. "
                "Vuelve a intentarlo o reformula la pregunta."
            )
            new_history = history + [
                HumanMessage(content=message),
                AIMessage(content=fallback),
            ]
            new_history = new_history[-self.memory_window * 2:]
            return fallback, {}, new_history

        state_messages: list[BaseMessage] = result_state.get("messages", [])

        # La respuesta final es el último AIMessage sin tool_calls.
        final = None
        for msg in reversed(state_messages):
            if isinstance(msg, AIMessage) and not getattr(msg, "tool_calls", None):
                final = str(msg.content).strip() if msg.content else None
                break
        if final is None:
            # El grafo terminó sin respuesta textual (p. ej. quedó pidiendo
            # tools): nunca devolver una respuesta vacía en silencio.
            hubo_tools = any(isinstance(m, ToolMessage) for m in state_messages)
            final = (
                "No pude completar la consulta tras varios intentos de obtener "
                "los datos. Intenta reformular la pregunta."
                if hubo_tools
                else "Sin respuesta."
            )

        # Extraer tool_data del estado completo del grafo.
        tool_data = self._extract_tool_data(state_messages)

        new_history = history + [
            HumanMessage(content=message),
            AIMessage(content=final),
        ]
        new_history = new_history[-self.memory_window * 2:]

        return final, tool_data, new_history
