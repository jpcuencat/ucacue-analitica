"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid, Legend,
  FunnelChart, Funnel, LabelList,
} from "recharts";

export type VizSpec = {
  titulo?: string;
  categorias?: string[];
  series?: { nombre: string; valores: number[] }[];
};

export type ToolChartData = {
  toolName: string;
  data: unknown;
  metric?: string;
  vizSpec?: VizSpec;
};

// Métrica a graficar en desgloses por sede/facultad → columna y título.
const METRICAS: Record<string, { key: string; label: string }> = {
  inscritos:    { key: "inscritos", label: "Inscritos" },
  nuevos:       { key: "nuevos",    label: "Matrículas nuevas" },
  matriculas:   { key: "nuevos",    label: "Matrículas nuevas" },
  matriculados: { key: "nuevos",    label: "Matrículas nuevas" },
};

const C_BLUE  = "#003366";
const C_GOLD  = "#E8A020";
const C_LIGHT = "#4a7abf";
const C_MUTED = "#6b7a99";

const n = (v: unknown): number =>
  v == null || v === "--" ? 0 : Number(v) || 0;

const fmtNum = (v: unknown) => (v as number).toLocaleString("es-EC");
const fmtPct = (v: unknown) => `${(v as number).toFixed(1)}%`;

/* ─── Embudo de conversión (get_estudiantes_kpis) ─── */
function FunnelKpi({ data }: { data: Record<string, unknown> }) {
  const COLORS = [C_BLUE, C_LIGHT, C_GOLD, "#9db8d9"];
  const steps = [
    { name: "Inscritos",    value: n(data.inscritos),               fill: COLORS[0] },
    { name: "Reservas",     value: n(data.reservas),                fill: COLORS[1] },
    { name: "Matrículas",   value: n(data.matriculas_nuevas),       fill: COLORS[2] },
    { name: "Convalidadas", value: n(data.matriculas_convalidadas), fill: COLORS[3] },
  ].filter((s) => s.value > 0);

  if (steps.length < 2) return null;

  return (
    <div className="chart-block">
      <p className="chart-block__title">Embudo de conversión</p>
      <ResponsiveContainer width="100%" height={220}>
        <FunnelChart>
          <Tooltip formatter={fmtNum} />
          <Funnel dataKey="value" data={steps} isAnimationActive={false}>
            <LabelList dataKey="name" position="right"
                       style={{ fill: C_MUTED, fontSize: 12 }} />
            <LabelList dataKey="value" position="center"
                       style={{ fill: "#fff", fontSize: 13, fontWeight: 600 }}
                       formatter={fmtNum} />
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Barras horizontales genéricas ─── */
function HBarChart({
  title, data, nameKey, valueKey, color = C_BLUE,
}: {
  title: string;
  data: Record<string, unknown>[];
  nameKey: string;
  valueKey: string;
  color?: string;
}) {
  const rows = data
    .map((d) => ({ name: String(d[nameKey] ?? ""), value: n(d[valueKey]) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  if (!rows.length) return null;
  const truncate = (s: string) => s.length > 34 ? s.slice(0, 32) + "…" : s;

  return (
    <div className="chart-block">
      <p className="chart-block__title">{title}</p>
      <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 34 + 20)}>
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 48 }}>
          <XAxis type="number" tick={{ fontSize: 11 }}
                 tickFormatter={(v) => (v as number).toLocaleString("es-EC")} />
          <YAxis type="category" dataKey="name" width={190}
                 tick={{ fontSize: 10 }} tickFormatter={truncate} />
          <Tooltip formatter={fmtNum} />
          <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} isAnimationActive={false}
               label={{ position: "right", fontSize: 11, formatter: fmtNum }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Serie temporal (get_inscripciones_historico) ─── */
function HistoricoChart({ data }: { data: Record<string, unknown>[] }) {
  const rows = [...data].reverse().map((d) => ({
    periodo: String(d.periodo_label ?? d.periodo ?? ""),
    inscritos: n(d.inscritos),
    matriculas: n(d.matriculas_nuevas ?? d.nuevos ?? d.matriculas),
  }));
  if (!rows.length) return null;

  return (
    <div className="chart-block">
      <p className="chart-block__title">Evolución por periodo</p>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={rows} margin={{ left: 8, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e6f0" />
          <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }}
                 tickFormatter={(v) => (v as number).toLocaleString("es-EC")} />
          <Tooltip formatter={fmtNum} />
          <Legend />
          <Area type="monotone" dataKey="inscritos" name="Inscritos"
                stroke={C_BLUE} fill="#ccdcf0" strokeWidth={2} dot={false}
                isAnimationActive={false} />
          <Area type="monotone" dataKey="matriculas" name="Matrículas"
                stroke={C_GOLD} fill="#fdecc6" strokeWidth={2} dot={false}
                isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Pérdida por cohorte (get_cohortes) ─── */
function CohortesChart({ data }: { data: Record<string, unknown>[] }) {
  const rows = data
    .filter((d) => d.cohorte != null && d.tasa_perdida != null)
    .map((d) => ({
      cohorte: String(d.cohorte),
      perdida: +(Math.abs(n(d.tasa_perdida)) * 100).toFixed(1),
    }))
    .slice(-10);
  if (!rows.length) return null;

  return (
    <div className="chart-block">
      <p className="chart-block__title">Tasa de pérdida por cohorte (%)</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows} margin={{ left: 8, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e6f0" />
          <XAxis dataKey="cohorte" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 11 }} unit="%" />
          <Tooltip formatter={fmtPct} />
          <Bar dataKey="perdida" name="Pérdida" fill={C_GOLD} radius={[4, 4, 0, 0]}
               isAnimationActive={false}
               label={{ position: "top", fontSize: 10, formatter: fmtPct }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Comparativo de periodos ─── */
// El API devuelve una lista de 2 filas con `tipo` "actual"/"anterior" y
// campos inscritos / matriculados / reservas (no un dict base/comparado).
function ComparativoChart({ data }: { data: Record<string, unknown>[] }) {
  const list = Array.isArray(data) ? data : [];
  const actual = list.find((d) => d.tipo === "actual") ?? list[0];
  const anterior = list.find((d) => d.tipo === "anterior") ?? list[1];
  if (!actual || !anterior) return null;

  const rows = [
    { label: "Inscritos",    actual: n(actual.inscritos),    anterior: n(anterior.inscritos) },
    { label: "Matriculados", actual: n(actual.matriculados), anterior: n(anterior.matriculados) },
    { label: "Reservas",     actual: n(actual.reservas),     anterior: n(anterior.reservas) },
  ];

  const lblActual = String(actual.periodo ?? "Actual");
  const lblAnterior = String(anterior.periodo ?? "Anterior");

  return (
    <div className="chart-block">
      <p className="chart-block__title">Comparativo de periodos</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows} margin={{ left: 8, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e6f0" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 11 }}
                 tickFormatter={(v) => (v as number).toLocaleString("es-EC")} />
          <Tooltip formatter={fmtNum} />
          <Legend />
          <Bar dataKey="actual" name={lblActual} fill={C_BLUE} radius={[4, 4, 0, 0]}
               isAnimationActive={false} />
          <Bar dataKey="anterior" name={lblAnterior} fill={C_GOLD} radius={[4, 4, 0, 0]}
               isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Gráfico a partir de datos que el agente calculó ([[vizdata: ...]]) ─── */
// Barras horizontales agrupadas: categorías (ej. carreras) × N series
// (ej. inscritos, matrículas nuevas). Sirve para comparar datos derivados
// de varias llamadas, no un único resultado crudo de tool.
function VizDataChart({ spec }: { spec: VizSpec }) {
  const cats = (spec.categorias ?? []).map(String);
  const series = (spec.series ?? []).filter((s) => s && Array.isArray(s.valores));
  if (!cats.length || !series.length) return null;

  const rows = cats.map((c, i) => {
    const row: Record<string, unknown> = { name: c };
    series.forEach((s) => { row[s.nombre] = n(s.valores[i]); });
    return row;
  });
  const COLORS = [C_BLUE, C_GOLD, C_LIGHT, C_MUTED];
  const truncate = (s: string) => (s.length > 26 ? s.slice(0, 24) + "…" : s);

  return (
    <div className="chart-block">
      <p className="chart-block__title">{spec.titulo ?? "Comparativo"}</p>
      <ResponsiveContainer width="100%" height={Math.max(200, cats.length * 40 + 40)}>
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e6f0" />
          <XAxis type="number" tick={{ fontSize: 11 }}
                 tickFormatter={(v) => (v as number).toLocaleString("es-EC")} />
          <YAxis type="category" dataKey="name" width={160}
                 tick={{ fontSize: 10 }} tickFormatter={truncate} />
          <Tooltip formatter={fmtNum} />
          <Legend />
          {series.map((s, i) => (
            <Bar key={s.nombre} dataKey={s.nombre} fill={COLORS[i % COLORS.length]}
                 radius={[0, 4, 4, 0]} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Selector principal ─── */
export function ChartBlock({ toolName, data, metric, vizSpec }: ToolChartData) {
  if (toolName === "vizdata" && vizSpec) return <VizDataChart spec={vizSpec} />;
  if (!data) return null;

  const m = METRICAS[(metric ?? "inscritos").toLowerCase()] ?? METRICAS.inscritos;

  if (toolName === "get_estudiantes_kpis")
    return <FunnelKpi data={data as Record<string, unknown>} />;

  if (toolName === "get_sedes_kpis") {
    const list = Array.isArray(data) ? data : [];
    // /api/sedes no expone "nuevos"; si piden esa métrica, cae a inscritos.
    const sm = m.key === "nuevos" ? METRICAS.inscritos : m;
    return <HBarChart title={`${sm.label} por sede`} data={list as Record<string, unknown>[]}
                      nameKey="carrerasede" valueKey={sm.key} color={C_BLUE} />;
  }

  if (toolName === "get_facultades_kpis") {
    const list = Array.isArray(data) ? data : [];
    return <HBarChart title={`${m.label} por facultad`} data={list as Record<string, unknown>[]}
                      nameKey="carrerafacultad" valueKey={m.key} color={C_LIGHT} />;
  }

  if (toolName === "get_inscripciones_historico") {
    const list = Array.isArray(data) ? data : [];
    return <HistoricoChart data={list as Record<string, unknown>[]} />;
  }

  if (toolName === "get_cohortes") {
    const list = Array.isArray(data) ? data : [];
    return <CohortesChart data={list as Record<string, unknown>[]} />;
  }

  if (toolName === "get_comparativo_periodo") {
    const list = Array.isArray(data) ? data : [];
    return <ComparativoChart data={list as Record<string, unknown>[]} />;
  }

  return null;
}
