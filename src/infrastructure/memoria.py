"""Adaptador in-memory del puerto PuertoDatosAcademicos.

'Infraestructura desechable': permite ejecutar los casos de uso y los tests
de aceptación en milisegundos, sin red ni credenciales. Cambiar entre este
adaptador y el HTTP real es una línea en el Composition Root o en un fixture.
"""

import copy


class AdaptadorInMemory:
    """Devuelve respuestas enlatadas por path y registra cada llamada.

    respuestas: {"/api/estudiantes": {"ok": True, "data": {...}}, ...}
    llamadas:   [(path, params), ...] — para asertar qué pidió el caso de uso.
    """

    def __init__(self, respuestas: dict[str, dict]):
        self._respuestas = respuestas
        self.llamadas: list[tuple[str, dict]] = []

    def get(self, path: str, params: dict) -> dict:
        self.llamadas.append((path, dict(params)))
        resp = self._respuestas.get(path)
        if resp is None:
            # Mismo patrón Result que el adaptador real: nunca lanza.
            return {"ok": False, "error": f"Sin datos enlatados para {path}."}
        # Copia profunda: los use cases normalizan/mutan la respuesta y las
        # respuestas enlatadas deben permanecer intactas entre llamadas.
        return copy.deepcopy(resp)
