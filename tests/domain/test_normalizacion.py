"""Nivel 1 — Dominio: unit tests puros (sin red, sin dobles, sin mocks).

Prueban las invariantes del contrato de KPIs y la normalización
anti-corrupción directamente contra src.domain.
"""

from src.domain.normalizacion import (
    EstudiantesKPIs,
    coerce_num,
    normalizar_estudiantes,
)


def test_coerce_num_variants():
    assert coerce_num(None) is None
    assert coerce_num("--") is None
    assert coerce_num("12") == 12.0
    assert coerce_num(-0.162) == -0.162
    assert coerce_num("no-numero") is None


def test_normalizar_renombra_campos():
    raw = {
        "total_inscritos": 1063,
        "matriculas_convalidadas": "--",
        "total_repetidores_capacitaciones_medicas": None,
        "tasa_conversion_inscrito_matriculado": 0.13,
        "campo_desconocido": 99,  # debe ignorarse
    }
    out = normalizar_estudiantes(raw)
    assert out["inscritos"] == 1063.0
    assert out["convalidados"] is None      # "--" → None
    assert out["cap_medicas"] is None       # null → None
    assert out["tasa_conversion"] == 0.13
    assert "campo_desconocido" not in out
    # el contrato expone exactamente las claves del modelo
    assert set(out) == set(EstudiantesKPIs().model_dump())


def test_normalizar_entrada_no_dict():
    assert normalizar_estudiantes(None) == EstudiantesKPIs().model_dump()
