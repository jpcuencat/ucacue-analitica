"""Puertos (contratos) que el dominio/aplicación exigen a la infraestructura.

Inversión de dependencias: la capa de aplicación depende de estas
abstracciones; los adaptadores concretos (HTTP, in-memory) las implementan
y se inyectan desde el Composition Root (langgraph_server._build_graph).
"""

from typing import Protocol


class PuertoDatosAcademicos(Protocol):
    """Acceso a los datos académicos de UCACUE con el patrón Result.

    Toda implementación debe devolver — nunca lanzar —
    {"ok": True, "data": ...} en éxito o {"ok": False, "error": str} en fallo.
    """

    def get(self, path: str, params: dict) -> dict:
        """GET lógico a un endpoint de datos (ej. "/api/estudiantes")."""
        ...
