"use client";

import type { ToolCall } from "@/lib/types";

// Nombres amigables para las herramientas del dominio UCACUE
const TOOL_LABELS: Record<string, string> = {
  get_estudiantes_kpis: "KPIs de Estudiantes",
  get_sedes_kpis: "KPIs por Sede",
  get_facultades_kpis: "KPIs por Facultad",
  get_carreras: "Carreras",
  get_cohortes: "Cohortes",
  get_comparativo_periodo: "Comparativo de Periodo",
  get_inscripciones_historico: "Histórico de Inscripciones",
};

function asJson(value: unknown): string {
  if (value == null) return "null";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ToolCard({ toolCall }: { toolCall: ToolCall }) {
  const rawName = toolCall.name ?? toolCall.call?.name ?? "herramienta";
  const label = TOOL_LABELS[rawName] ?? rawName;
  const id = toolCall.callId ?? toolCall.id ?? toolCall.call?.id ?? "sin-id";
  const status =
    toolCall.status ??
    (toolCall.output || toolCall.result ? "finished" : "running");
  const input = toolCall.input ?? toolCall.args ?? toolCall.call?.args;
  const output = toolCall.output ?? toolCall.result;

  return (
    <div className="tool-card">
      <div className="tool-card__header">
        <span className="tool-card__icon">▶</span>
        <strong className="tool-card__name">{label}</strong>
        <span className={`status status--${status}`}>{status === "running" ? "ejecutando" : status === "error" ? "error" : "listo"}</span>
      </div>
      <p className="tool-card__id">ID: {id}</p>

      <details open={status === "running"}>
        <summary>Argumentos</summary>
        <pre>{asJson(input)}</pre>
      </details>

      {toolCall.error ? (
        <details open>
          <summary>Error</summary>
          <pre className="tool-card__error">{asJson(toolCall.error)}</pre>
        </details>
      ) : output != null ? (
        <details>
          <summary>Resultado</summary>
          <pre>{asJson(output)}</pre>
        </details>
      ) : null}
    </div>
  );
}
