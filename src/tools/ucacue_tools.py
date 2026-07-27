"""
Herramientas LangChain para la API UCACUE (capa de aplicación / use cases).

Cada @tool orquesta una consulta: delega el HTTP al adaptador de
infraestructura (src.infrastructure) y la traducción de campos al contrato
de dominio (src.domain). Todas devuelven el patrón Result: nunca lanzan —
{"ok": True, "data": ...} o {"ok": False, "error": ...}.
"""

import logging
from typing import Optional

from langchain_core.tools import tool

from src.domain.normalizacion import (
    PERIODO_COHORTE_DEFAULT,
    EstudiantesKPIs,
    coerce_num,
    normalizar_estudiantes,
)
from src.domain.puertos import PuertoDatosAcademicos
from src.infrastructure.ucacue_api import DEFAULT_API_URL, AdaptadorApiUcacue, api_get

logger = logging.getLogger(__name__)

# Puerto inyectable (inversión de dependencias): por defecto el adaptador
# HTTP real; el Composition Root o los tests pueden sustituirlo
# (ej. AdaptadorInMemory) sin tocar los casos de uso.
_puerto: PuertoDatosAcademicos = AdaptadorApiUcacue()


def configurar_puerto(puerto: PuertoDatosAcademicos) -> None:
    """Inyecta la implementación del puerto de datos (Composition Root/tests)."""
    global _puerto
    _puerto = puerto


def puerto_actual() -> PuertoDatosAcademicos:
    return _puerto


# _normalizar_estudiantes se usa abajo en get_estudiantes_kpis.
# _coerce_num y _api_get son alias de compatibilidad hacia src.domain /
# src.infrastructure (los tests actuales usan esos módulos directamente).
_coerce_num = coerce_num
_normalizar_estudiantes = normalizar_estudiantes
_api_get = api_get

__all__ = [
    "DEFAULT_API_URL",
    "PERIODO_COHORTE_DEFAULT",
    "EstudiantesKPIs",
    "get_estudiantes_kpis",
    "get_sedes_kpis",
    "get_facultades_kpis",
    "get_carreras",
    "get_cohortes",
    "get_comparativo_periodo",
    "get_inscripciones_historico",
]


@tool
def get_estudiantes_kpis(
    periodo: Optional[str] = None,
    sede: Optional[str] = None,
    facultad: Optional[str] = None,
    carrera: Optional[str] = None,
    carrera_nombre: Optional[str] = None,
    modalidad: Optional[str] = None,
) -> dict:
    """
    Obtiene los KPIs de estudiantes del Resumen Ejecutivo de Gestión de UCACUE
    desde el endpoint /api/estudiantes.

    Devuelve: inscritos, reservas, matriculas_nuevas, convalidados, pendientes,
    repetidores_regulares, cap_medicas, tasa_conversion, tasa_conv_reservas,
    dias_prom_pago, tasa_perdida.

    Parámetros (todos opcionales; vacío = total general):
    - periodo: código AAAAN (ej. "20261"=Sierra2026, "20252"=Costa2025).
    - sede: "MATRIZ CUENCA" | "SEDE AZOGUES" | "SEDE MACAS" |
            "EXTENSION SAN PABLO DE LA TRONCAL" | "EXTENSION CAÑAR"
    - facultad: nombre completo de la facultad (CARRERAFACULTAD).
    - carrera: código técnico de carrera (CARRERAID).
    - carrera_nombre: nombre visible de carrera (recomendado para filtrar).
    - modalidad: PRESENCIAL | DISTANCIA | HÍBRIDO | EN LÍNEA | SEMIPRESENCIAL |
                 MODALIDAD DUAL | VIRTUAL.

    Nota: tasa_perdida no la expone este endpoint (vive en /api/cohortes);
    puede venir como null.
    """
    resp = _puerto.get(
        "/api/estudiantes",
        {
            "periodo": periodo,
            "sede": sede,
            "facultad": facultad,
            "carrera": carrera,
            "carrera_nombre": carrera_nombre,
            "modalidad": modalidad,
        },
    )
    if resp.get("ok"):
        resp["data"] = _normalizar_estudiantes(resp.get("data") or {})
    return resp


def _ocultar_pagados(resp: dict) -> dict:
    """Elimina 'pagados' de los desgloses antes de devolverlos.

    `pagados` (=Total_Pagos) NO es un subconjunto de inscritos: incluye
    repetidores y otros flujos de pago, así que puede superar a inscritos y
    confunde en respuestas de inscripciones. Se retira de forma determinista
    para que el agente nunca lo presente. HTTP intacto; solo se filtra la vista.
    """
    data = resp.get("data")
    if isinstance(data, list):
        for row in data:
            if isinstance(row, dict):
                row.pop("pagados", None)
    return resp


@tool
def get_sedes_kpis() -> dict:
    """Totales de inscritos y carreras por SEDE (una fila por sede).

    Úsala para responder "desglose por sede" o comparar sedes en UNA sola
    llamada. No requiere parámetros.
    """
    return _ocultar_pagados(_puerto.get("/api/sedes", {}))


@tool
def get_facultades_kpis(
    periodo: Optional[str] = None, sede: Optional[str] = None
) -> dict:
    """Totales por FACULTAD en UNA sola llamada (fila por facultad, DESC por inscritos).

    Úsala para "desglose por facultad".
    - periodo: código AAAAN (ej. "20261").
    - sede: nombre de sede; vacío = todas.
    """
    return _ocultar_pagados(_puerto.get("/api/facultades", {"periodo": periodo, "sede": sede}))


@tool
def get_carreras(
    periodo: Optional[str] = None,
    sede: Optional[str] = None,
    facultad: Optional[str] = None,
    selector: Optional[bool] = None,
    buscar: Optional[str] = None,
) -> dict:
    """Lista de CARRERAS con totales, o selector para confirmar una carrera.

    - "Desglose por carrera": llama sin selector (totales por carrera).
    - Carrera mencionada de forma aproximada: usa selector=True y buscar="texto",
      muestra las opciones y CONFIRMA con el usuario antes de filtrar
      /api/estudiantes por carrera_nombre. No uses textos aproximados directos.
    - periodo: código AAAAN; sede/facultad: nombres; vacío = todas.
    """
    params = {
        "periodo": periodo,
        "sede": sede,
        "facultad": facultad,
        "buscar": buscar,
    }
    if selector:
        params["selector"] = "true"  # el API espera el booleano como texto
    return _ocultar_pagados(_puerto.get("/api/carreras", params))


@tool
def get_cohortes(
    carrera: Optional[str] = None,
    sede: Optional[str] = None,
    facultad: Optional[str] = None,
    modalidad: Optional[str] = None,
    cohorte: Optional[str] = None,
    hasta_periodo: Optional[str] = None,
) -> dict:
    """Permanencia y deserción por COHORTE; incluye `tasa_perdida` (que NO da /api/estudiantes).

    Úsala para preguntas de pérdida/retención/deserción. Devuelve `resumen`
    (una fila por cohorte con nro_inicial, nro_actual, tasa_perdida) y `matriz`.
    `tasa_perdida` negativa = pérdida (ej. -0.162 = 16.2%).
    - cohorte: código AAAAN del cohorte MÍNIMO a incluir (COHORTENUMERICO >= valor; ej. "20231").
    - hasta_periodo: código AAAAN del periodo MÁXIMO a incluir (PERIODONUMERICO <= valor;
      ej. "20252"). Si se omite, se usa el último periodo consolidado
      (PERIODO_COHORTE_DEFAULT) para evitar medir en un periodo incompleto, lo
      que devolvería pérdida -100% en todos los cohortes.
    """
    return _puerto.get(
        "/api/cohortes",
        {
            "carrera": carrera,
            "sede": sede,
            "facultad": facultad,
            "modalidad": modalidad,
            "cohorte": cohorte,
            "hasta_periodo": hasta_periodo or PERIODO_COHORTE_DEFAULT,
        },
    )


@tool
def get_comparativo_periodo(
    periodo: str,
    periodo_anterior: Optional[str] = None,
    fecha_corte: Optional[str] = None,
    ciclo: Optional[str] = None,
    sede: Optional[str] = None,
    facultad: Optional[str] = None,
    carrera_nombre: Optional[str] = None,
) -> dict:
    """Compara KPIs de un periodo vs otro al MISMO corte (inscritos, matriculados,
    repetidores, reservas).

    Úsala para "¿cómo vamos vs el año pasado?" o "¿cuántos teníamos a esta fecha?".
    - periodo: requerido (código AAAAN o nombre "Sierra - 2026").
    - periodo_anterior: opcional; si se omite, el API resta un año al ciclo.
    - fecha_corte: "YYYY-MM-DD" opcional (mismo día/mes para ambos periodos).
    - ciclo: "Todos" | "SIERRA" | "COSTA" (filtro adicional de ciclo).
    - sede / facultad / carrera_nombre: filtros opcionales.
    Devuelve `data`: lista de 2 filas (una con tipo "actual", otra "anterior"),
    cada una con periodo, fecha_corte, inscritos, matriculados, repetidores,
    reservas.
    """
    return _puerto.get(
        "/api/comparativo-periodo",
        {
            "periodo": periodo,
            "periodo_anterior": periodo_anterior,
            "fecha_corte": fecha_corte,
            "ciclo": ciclo,
            "sede": sede,
            "facultad": facultad,
            "carrera_nombre": carrera_nombre,
        },
    )


@tool
def get_inscripciones_historico(
    ciclo: Optional[str] = None,
    sede: Optional[str] = None,
    facultad: Optional[str] = None,
    desde: Optional[str] = None,
) -> dict:
    """Serie temporal de inscripciones/matrículas POR PERIODO (tendencia histórica).

    Úsala para "evolución/tendencia/histórico de inscripciones". Devuelve `data`:
    una fila por periodo con inscritos, pagados, nuevos y tasa_conversion.
    - ciclo: "SIERRA" | "COSTA" (por defecto incluye ambos).
    - desde: año de inicio (4 dígitos, ej. "2019"); sede/facultad opcionales.
    """
    return _puerto.get(
        "/api/inscripciones-historico",
        {"ciclo": ciclo, "sede": sede, "facultad": facultad, "desde": desde},
    )
