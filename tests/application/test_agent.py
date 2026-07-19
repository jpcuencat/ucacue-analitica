"""Tests del agente: stateless, historial acotado y fallback de rondas.

La LLM se reemplaza por un doble para no llamar a OpenAI.
"""

from langchain_core.messages import AIMessage, HumanMessage

from src.agent.api_agent import UCACUEAgent


class FakeLLM:
    """Doble de la LLM: devuelve respuestas predefinidas en orden."""

    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = 0

    def invoke(self, messages):
        r = self._responses[min(self.calls, len(self._responses) - 1)]
        self.calls += 1
        return r


def _agent(**kw) -> UCACUEAgent:
    return UCACUEAgent(api_key="test-key", **kw)


def test_chat_respuesta_simple():
    a = _agent()
    a.llm = FakeLLM([AIMessage(content="Hola")])
    text, tool_data, hist = a.chat("¿hola?", [])
    assert text == "Hola"
    assert tool_data == {}
    assert len(hist) == 2  # human + ai


def test_chat_no_muta_historial_entrante():
    a = _agent()
    a.llm = FakeLLM([AIMessage(content="ok")])
    prev = [HumanMessage(content="a"), AIMessage(content="b")]
    _, _, hist = a.chat("c", prev)
    assert hist[-2].content == "c"
    assert hist[-1].content == "ok"
    assert len(prev) == 2  # el historial entrante no se modifica


def test_chat_acota_a_ventana_de_memoria():
    a = _agent(memory_window=1)  # conserva 2 mensajes
    a.llm = FakeLLM([AIMessage(content="x")])
    long_hist = [HumanMessage(content=str(i)) for i in range(10)]
    _, _, hist = a.chat("nuevo", long_hist)
    assert len(hist) == 2


def test_chat_fallback_tras_max_rondas():
    a = _agent()
    tc = [{"name": "desconocida", "args": {}, "id": "1"}]
    a.llm = FakeLLM([AIMessage(content="", tool_calls=tc)])  # siempre pide tool
    text, tool_data, _ = a.chat("loop", [])
    assert "No pude completar" in text
    assert "desconocida" in tool_data  # registró el intento fallido
