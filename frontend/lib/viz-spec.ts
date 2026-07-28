import type { ToolChartData, VizSpec } from "@/components/ChartBlock";

// Convierte un ChartBlock (lo que se muestra en pantalla) al VizSpec plano
// {categorias, series} que entiende el renderizador PNG del servidor
// (lib/chart-image.ts, barras agrupadas). Así la imagen de WhatsApp coincide
// con el gráfico que el usuario ve, sin volver a correr el agente.

const n = (v: unknown): number => (v == null || v === "--" ? 0 : Number(v) || 0);
const asList = (d: unknown): Record<string, unknown>[] =>
  Array.isArray(d) ? (d as Record<string, unknown>[]) : [];

// Métrica pedida → clave de columna + etiqueta (igual que ChartBlock).
function metrica(metric?: string): { key: string; label: string } {
  const m = (metric ?? "inscritos").toLowerCase();
  if (m === "nuevos" || m === "matriculas" || m === "matriculados")
    return { key: "nuevos", label: "Matrículas nuevas" };
  return { key: "inscritos", label: "Inscritos" };
}

// Desglose (sedes/facultades): top 10 por la métrica, orden descendente.
function desglose(
  titulo: string,
  rows: Record<string, unknown>[],
  nameKey: string,
  m: { key: string; label: string },
): VizSpec | null {
  const filas = rows
    .map((d) => ({ name: String(d[nameKey] ?? ""), value: n(d[m.key]) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  if (!filas.length) return null;
  return {
    titulo,
    categorias: filas.map((r) => r.name),
    series: [{ nombre: m.label, valores: filas.map((r) => r.value) }],
  };
}

export function toVizSpec(cd: ToolChartData): VizSpec | null {
  const { toolName, data, metric, vizSpec } = cd;

  // Gráfico ya calculado por el agente / el frontend.
  if (toolName === "vizdata" && vizSpec) return vizSpec;
  if (!data) return null;

  const m = metrica(metric);

  if (toolName === "get_estudiantes_kpis") {
    const d = data as Record<string, unknown>;
    const pasos = [
      { name: "Inscritos", value: n(d.inscritos) },
      { name: "Reservas", value: n(d.reservas) },
      { name: "Matrículas", value: n(d.matriculas_nuevas) },
      { name: "Convalidadas", value: n(d.matriculas_convalidadas) },
    ].filter((s) => s.value > 0);
    if (pasos.length < 2) return null;
    return {
      titulo: "Embudo de conversión",
      categorias: pasos.map((s) => s.name),
      series: [{ nombre: "Estudiantes", valores: pasos.map((s) => s.value) }],
    };
  }

  if (toolName === "get_sedes_kpis") {
    // /api/sedes no expone "nuevos"; si piden esa métrica, cae a inscritos.
    const sm = m.key === "nuevos" ? metrica("inscritos") : m;
    return desglose(`${sm.label} por sede`, asList(data), "carrerasede", sm);
  }

  if (toolName === "get_facultades_kpis")
    return desglose(`${m.label} por facultad`, asList(data), "carrerafacultad", m);

  if (toolName === "get_carreras")
    return desglose(`${m.label} por carrera`, asList(data), "carreranombre", m);

  if (toolName === "get_inscripciones_historico") {
    const rows = [...asList(data)].reverse();
    if (!rows.length) return null;
    return {
      titulo: "Evolución por periodo",
      categorias: rows.map((d) => String(d.periodo_label ?? d.periodo ?? "")),
      series: [
        { nombre: "Inscritos", valores: rows.map((d) => n(d.inscritos)) },
        { nombre: "Matrículas", valores: rows.map((d) => n(d.matriculas_nuevas ?? d.nuevos ?? d.matriculas)) },
      ],
    };
  }

  if (toolName === "get_cohortes") {
    const rows = asList(data)
      .filter((d) => d.cohorte != null && d.tasa_perdida != null)
      .map((d) => ({ cohorte: String(d.cohorte), perdida: +(Math.abs(n(d.tasa_perdida)) * 100).toFixed(1) }))
      .slice(-10);
    if (!rows.length) return null;
    return {
      titulo: "Tasa de pérdida por cohorte (%)",
      categorias: rows.map((r) => r.cohorte),
      series: [{ nombre: "Pérdida %", valores: rows.map((r) => r.perdida) }],
    };
  }

  if (toolName === "get_comparativo_periodo") {
    const list = asList(data);
    const actual = list.find((d) => d.tipo === "actual") ?? list[0];
    const anterior = list.find((d) => d.tipo === "anterior") ?? list[1];
    if (!actual || !anterior) return null;
    return {
      titulo: "Comparativo de periodos",
      categorias: ["Inscritos", "Matriculados", "Reservas"],
      series: [
        {
          nombre: String(actual.periodo ?? "Actual"),
          valores: [n(actual.inscritos), n(actual.matriculados), n(actual.reservas)],
        },
        {
          nombre: String(anterior.periodo ?? "Anterior"),
          valores: [n(anterior.inscritos), n(anterior.matriculados), n(anterior.reservas)],
        },
      ],
    };
  }

  return null;
}
