import type { VizSpec } from "./chart-image";

// Corre una pregunta contra el grafo LangGraph (mismo destino que el proxy
// /api/lg) y devuelve el texto final + el gráfico a dibujar, reutilizando la
// misma lógica de decisión que el frontend (a prueba de modelo).

const LG_URL = process.env.LANGGRAPH_INTERNAL_URL ?? "http://localhost:2024";
const GRAPH_ID = process.env.NEXT_PUBLIC_GRAPH_ID ?? "agent";

type Msg = {
  type?: string;
  role?: string;
  name?: string;
  content?: unknown;
  tool_calls?: { id?: string; name?: string; args?: Record<string, unknown> }[];
  tool_call_id?: string;
};

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${LG_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`LangGraph ${res.status} en ${path}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as Record<string, unknown>;
}

function textoDe(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === "string" ? p : ((p as { text?: string })?.text ?? "")))
      .join("");
  }
  return "";
}

// Quita las directivas invisibles del texto mostrado.
function limpiarTexto(t: string): string {
  return t
    .replace(/\[\[vizdata:\s*\{[\s\S]*?\}\s*\]\]/gi, "")
    .replace(/\[\[viz:[^\]]*\]\]/gi, "")
    .trim();
}

const num = (v: unknown): number => (v == null || v === "--" ? 0 : Number(v) || 0);

const BREAKDOWN_TOOLS = ["get_facultades_kpis", "get_sedes_kpis", "get_carreras"];
const CAT_KEYS = ["carrerafacultad", "carrerasede", "carreranombre", "carrera_nombre", "facultad", "sede", "nombre"];

// Extrae el VizSpec con las mismas prioridades que el frontend:
// 1) [[vizdata]] explícito · 2) comparativo de ≥2 get_estudiantes_kpis ·
// 3) un desglose (facultades/sedes/carreras).
function extraerSpec(finalText: string, msgs: Msg[]): VizSpec | null {
  // 1) vizdata explícito
  const vd = finalText.match(/\[\[vizdata:\s*(\{[\s\S]+?\})\s*\]\]/i);
  if (vd) {
    try {
      return JSON.parse(vd[1]) as VizSpec;
    } catch {
      /* JSON inválido: seguimos con fallbacks */
    }
  }

  // Correlacionar args de cada tool_call con su resultado.
  const argsById = new Map<string, Record<string, unknown>>();
  for (const m of msgs) {
    for (const c of m.tool_calls ?? []) if (c.id) argsById.set(c.id, c.args ?? {});
  }
  type Res = { name: string; data: unknown; args: Record<string, unknown> };
  const results: Res[] = [];
  for (const m of msgs) {
    if ((m.type ?? m.role) !== "tool") continue;
    try {
      const parsed = JSON.parse(textoDe(m.content));
      if (parsed?.ok && parsed.data != null) {
        results.push({
          name: m.name ?? "",
          data: parsed.data,
          args: m.tool_call_id ? (argsById.get(m.tool_call_id) ?? {}) : {},
        });
      }
    } catch {
      /* no JSON */
    }
  }

  // 2) comparativo de varias fichas de estudiantes (una por carrera/sede)
  const est = results.filter((r) => r.name === "get_estudiantes_kpis" && r.data);
  if (est.length >= 2) {
    const d = (r: Res) => (r.data ?? {}) as Record<string, unknown>;
    return {
      titulo: "Comparativo",
      categorias: est.map(
        (r, i) => String(r.args.carrera_nombre ?? r.args.carrera ?? r.args.facultad ?? r.args.sede ?? `Ítem ${i + 1}`),
      ),
      series: [
        { nombre: "Inscritos", valores: est.map((r) => num(d(r).inscritos)) },
        { nombre: "Matrículas nuevas", valores: est.map((r) => num(d(r).matriculas_nuevas)) },
      ],
    };
  }

  // 3) un desglose por categorías (facultades/sedes/carreras)
  const bd = [...results].reverse().find((r) => BREAKDOWN_TOOLS.includes(r.name) && Array.isArray(r.data));
  if (bd) {
    const rows = (bd.data as Record<string, unknown>[])
      .filter((row) => row && num(row.inscritos) > 0)
      .sort((a, b) => num(b.inscritos) - num(a.inscritos))
      .slice(0, 8);
    if (rows.length) {
      const catKey = CAT_KEYS.find((k) => k in rows[0]) ?? Object.keys(rows[0])[0];
      const tieneNuevos = rows.some((r) => r.nuevos != null);
      const series = [{ nombre: "Inscritos", valores: rows.map((r) => num(r.inscritos)) }];
      if (tieneNuevos) series.push({ nombre: "Matrículas nuevas", valores: rows.map((r) => num(r.nuevos)) });
      return { titulo: "Desglose", categorias: rows.map((r) => String(r[catKey] ?? "")), series };
    }
  }

  return null;
}

export type ReportResult = { texto: string; spec: VizSpec | null };

export async function runReport(pregunta: string): Promise<ReportResult> {
  const thread = await post("/threads", {});
  const threadId = thread.thread_id as string;
  const run = await post(`/threads/${threadId}/runs/wait`, {
    assistant_id: GRAPH_ID,
    input: { messages: [{ type: "human", content: pregunta }] },
  });
  if ((run as { __error__?: unknown }).__error__) {
    throw new Error(`El agente falló: ${JSON.stringify((run as { __error__: unknown }).__error__).slice(0, 200)}`);
  }
  const msgs = ((run as { messages?: Msg[] }).messages ?? []) as Msg[];
  const finalAi = [...msgs].reverse().find((m) => (m.type ?? m.role) === "ai" && !m.tool_calls?.length);
  const rawText = textoDe(finalAi?.content);
  return { texto: limpiarTexto(rawText), spec: extraerSpec(rawText, msgs) };
}
