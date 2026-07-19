"""Dataset de evaluación en LangSmith para el Asistente Analítico UCACUE.

Ejemplos de entrada:  {"message": "<pregunta>"}
Ejemplos de salida:   {"expected_tool": "<nombre_herramienta>"}  (opcional)

Ejecutar get_or_create_dataset() al inicio de evaluate.py para asegurar
que el dataset exista antes de correr la evaluación.
"""

from langsmith import Client

DATASET_NAME = "ucacue-analitica-eval"

# Preguntas representativas del dominio UCACUE con la herramienta esperada.
EXAMPLES = [
    {
        "inputs": {"message": "¿Cuántos estudiantes inscritos hay en el periodo 20261?"},
        "outputs": {"expected_tool": "get_estudiantes_kpis"},
    },
    {
        "inputs": {"message": "Dame los KPIs generales del periodo Sierra 2026"},
        "outputs": {"expected_tool": "get_estudiantes_kpis"},
    },
    {
        "inputs": {"message": "¿Cuántos inscritos tiene la Sede Azogues este periodo?"},
        "outputs": {"expected_tool": "get_estudiantes_kpis"},
    },
    {
        "inputs": {"message": "¿Cuál es la tasa de deserción o pérdida por cohorte?"},
        "outputs": {"expected_tool": "get_cohortes"},
    },
    {
        "inputs": {"message": "Muéstrame la retención de estudiantes del cohorte 20231"},
        "outputs": {"expected_tool": "get_cohortes"},
    },
    {
        "inputs": {"message": "¿Cómo vamos en inscripciones comparado con el año pasado?"},
        "outputs": {"expected_tool": "get_comparativo_periodo"},
    },
    {
        "inputs": {"message": "¿Cuántos teníamos inscritos a esta misma fecha en 20251?"},
        "outputs": {"expected_tool": "get_comparativo_periodo"},
    },
    {
        "inputs": {"message": "Dame la evolución histórica de inscripciones por periodo"},
        "outputs": {"expected_tool": "get_inscripciones_historico"},
    },
    {
        "inputs": {"message": "Muéstrame la tendencia de matrículas en los últimos periodos"},
        "outputs": {"expected_tool": "get_inscripciones_historico"},
    },
    {
        "inputs": {"message": "¿Cuál es el desglose de inscritos por sede?"},
        "outputs": {"expected_tool": "get_sedes_kpis"},
    },
    {
        "inputs": {"message": "¿Qué facultad tiene más inscripciones en el periodo 20261?"},
        "outputs": {"expected_tool": "get_facultades_kpis"},
    },
    {
        "inputs": {"message": "¿Cuántos inscritos tiene la carrera de Medicina?"},
        "outputs": {"expected_tool": "get_carreras"},
    },
]


def get_or_create_dataset(client: Client) -> str:
    """Devuelve el ID del dataset existente o lo crea con los ejemplos base."""
    datasets = list(client.list_datasets(dataset_name=DATASET_NAME))
    if datasets:
        ds = datasets[0]
        print(f"Dataset encontrado: '{ds.name}'  (id={ds.id})")
        return str(ds.id)

    ds = client.create_dataset(
        dataset_name=DATASET_NAME,
        description="Ejemplos de evaluación del Asistente Analítico UCACUE",
    )
    for ex in EXAMPLES:
        client.create_example(
            inputs=ex["inputs"],
            outputs=ex["outputs"],
            dataset_id=ds.id,
        )
    print(f"Dataset creado: '{ds.name}'  con {len(EXAMPLES)} ejemplos  (id={ds.id})")
    return str(ds.id)
