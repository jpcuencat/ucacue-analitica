"""Capa de dominio: contratos, invariantes y reglas de negocio puras.

Sin dependencias de infraestructura (HTTP, LLM, UI) — solo el vocabulario
del negocio académico y la normalización hacia el contrato interno.
"""

from .normalizacion import (
    FIELD_MAP,
    PERIODO_COHORTE_DEFAULT,
    EstudiantesKPIs,
    coerce_num,
    normalizar_estudiantes,
)

__all__ = [
    "FIELD_MAP",
    "PERIODO_COHORTE_DEFAULT",
    "EstudiantesKPIs",
    "coerce_num",
    "normalizar_estudiantes",
]
