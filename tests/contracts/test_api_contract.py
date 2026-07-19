"""Contrato tool↔API: cada tool debe exponer EXACTAMENTE los parámetros que
documenta docs/openapi.yaml para su endpoint.

Falla si una tool añade un parámetro inexistente o se olvida uno documentado,
evitando el drift que causó datos incompletos (p. ej. faltar `cohorte`).
"""

import pathlib
import re

from src.tools.ucacue_tools import (
    get_carreras,
    get_cohortes,
    get_comparativo_periodo,
    get_estudiantes_kpis,
    get_facultades_kpis,
    get_inscripciones_historico,
    get_sedes_kpis,
)

SPEC = pathlib.Path(__file__).resolve().parents[2] / "docs" / "openapi.yaml"

# (tool, endpoint documentado).
TOOL_ENDPOINT = [
    (get_estudiantes_kpis, "/api/estudiantes"),
    (get_sedes_kpis, "/api/sedes"),
    (get_facultades_kpis, "/api/facultades"),
    (get_carreras, "/api/carreras"),
    (get_cohortes, "/api/cohortes"),
    (get_comparativo_periodo, "/api/comparativo-periodo"),
    (get_inscripciones_historico, "/api/inscripciones-historico"),
]


def _ref_name_map(lines: list[str]) -> dict[str, str]:
    """components.parameters: clave_de_$ref -> nombre real del parámetro."""
    names: dict[str, str] = {}
    in_section = False
    key = None
    for ln in lines:
        if re.match(r"^  parameters:\s*$", ln):
            in_section = True
            continue
        if in_section:
            if re.match(r"^  \S", ln):  # fin de components.parameters
                break
            mk = re.match(r"^    (\w+):\s*$", ln)
            if mk:
                key = mk.group(1)
            mn = re.search(r"^\s+name:\s*([\w_]+)", ln)
            if mn and key and key not in names:
                names[key] = mn.group(1)
    return names


def _documented_params(endpoint: str, lines: list[str], refs: dict[str, str]) -> set[str]:
    params: set[str] = set()
    cur = None
    in_params = False
    for ln in lines:
        m = re.match(r"^  (/api/[\w\-]+):", ln)
        if m:
            cur = m.group(1)
            in_params = False
            continue
        if cur != endpoint:
            continue
        if re.match(r"^      parameters:", ln):
            in_params = True
            continue
        if re.match(r"^      responses:", ln):
            in_params = False
        if in_params:
            mn = re.search(r"-\s*name:\s*([\w_]+)", ln)
            if mn:
                params.add(mn.group(1))
            mr = re.search(r"parameters/(\w+)'", ln)
            if mr:
                params.add(refs.get(mr.group(1), mr.group(1)))
    return params


def test_tools_match_documented_params():
    lines = SPEC.read_text().splitlines()
    refs = _ref_name_map(lines)
    problemas = []
    for tool, endpoint in TOOL_ENDPOINT:
        documented = _documented_params(endpoint, lines, refs)
        actual = set(tool.args.keys())
        if actual != documented:
            problemas.append(
                f"{tool.name} ({endpoint}): "
                f"faltan={sorted(documented - actual)} "
                f"sobran={sorted(actual - documented)}"
            )
    assert not problemas, "Drift tool↔spec:\n" + "\n".join(problemas)
