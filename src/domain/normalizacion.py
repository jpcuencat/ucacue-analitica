"""Contrato de dominio de los KPIs académicos y su normalización.

Anti-corrupción entre la nomenclatura del API UCACUE y el vocabulario
interno que consumen los gráficos y el agente. Este es el ÚNICO seam a
tocar si el API cambia sus nombres de campos.
"""

import logging
from typing import Any, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# Último periodo con datos consolidados para medir RETENCIÓN de cohortes.
# Si /api/cohortes se llama sin `hasta_periodo`, el API mide en un periodo
# especial/incompleto (p. ej. "2026X") donde nro_actual=0 y toda tasa_perdida
# sale -100%. Acotar al último periodo cerrado evita ese artefacto.
# ACTUALIZAR al cierre de cada ciclo académico.
PERIODO_COHORTE_DEFAULT = "20252"

# Mapeo de los campos del endpoint /api/estudiantes a los nombres que consumen
# los gráficos (charts.py) y el prompt del agente. Centralizar el remapeo aquí
# mantiene estable el resto de la app aunque cambie la nomenclatura del API.
FIELD_MAP = {
    "total_inscritos": "inscritos",
    "reservas": "reservas",
    "matriculas_nuevas": "matriculas_nuevas",
    "matriculas_convalidadas": "convalidados",
    "total_repetidores_regulares": "repetidores_regulares",
    "total_repetidores_capacitaciones_medicas": "cap_medicas",
    "matriculas_pendientes": "pendientes",
    "tasa_conversion_inscrito_matriculado": "tasa_conversion",
    "tasa_conversion_reservas_matriculado": "tasa_conv_reservas",
    "promedio_dias_inscrito_matriculado": "dias_prom_pago",
    "tasa_perdida": "tasa_perdida",
}


def coerce_num(val: Any) -> Optional[float]:
    """Coacciona valores del API a float. None y placeholders ('--') → None."""
    if val is None or val == "--":
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


class EstudiantesKPIs(BaseModel):
    """Contrato tipado de los KPIs de estudiantes que consume la app.

    Valida y documenta la forma de los datos tras normalizar /api/estudiantes.
    Los gráficos consumen este modelo vía model_dump() (charts._n tolera None).
    """

    inscritos: Optional[float] = None
    reservas: Optional[float] = None
    matriculas_nuevas: Optional[float] = None
    convalidados: Optional[float] = None
    repetidores_regulares: Optional[float] = None
    cap_medicas: Optional[float] = None
    pendientes: Optional[float] = None
    tasa_conversion: Optional[float] = None
    tasa_conv_reservas: Optional[float] = None
    dias_prom_pago: Optional[float] = None
    # tasa_perdida no la expone /api/estudiantes (vive en /api/cohortes); suele ser None.
    tasa_perdida: Optional[float] = Field(default=None)


def normalizar_estudiantes(data: dict) -> dict:
    """Traduce y valida los campos de /api/estudiantes al contrato interno."""
    if not isinstance(data, dict):
        return EstudiantesKPIs().model_dump()
    mapped = {dest: coerce_num(data.get(src)) for src, dest in FIELD_MAP.items()}
    extra = set(data) - set(FIELD_MAP)
    if extra:
        logger.debug("Campos de /api/estudiantes no mapeados (ignorados): %s", extra)
    return EstudiantesKPIs(**mapped).model_dump()
