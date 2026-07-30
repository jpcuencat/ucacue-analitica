"use client";

import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AnyMessage } from "@/lib/types";
import { ChartBlock } from "@/components/ChartBlock";
import type { ToolChartData } from "@/components/ChartBlock";
import { toVizSpec } from "@/lib/viz-spec";

function contentToText(content: unknown, fallback?: string): string {
  if (typeof fallback === "string" && fallback.trim()) return fallback;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const p = part as Record<string, unknown>;
          if (typeof p.text === "string") return p.text;
          if (typeof p.content === "string") return p.content;
        }
        return "";
      })
      .join("");
  }
  if (content == null) return "";
  return JSON.stringify(content, null, 2);
}

function roleOf(message: AnyMessage): "user" | "assistant" | "tool" {
  const raw = (message.role ?? message.type ?? "assistant").toLowerCase();
  if (raw.includes("human") || raw === "user") return "user";
  if (raw.includes("tool")) return "tool";
  return "assistant";
}

const ROLE_LABEL: Record<string, string> = { user: "Tú", assistant: "Asistente", tool: "Herramienta" };

type Props = { message: AnyMessage; chartData?: ToolChartData[]; canSend?: boolean };

type WaState = "idle" | "sending" | "sent" | "error";

export function MessageBubble({ message, chartData, canSend = false }: Props) {
  const [waState, setWaState] = useState<WaState>("idle");
  const [waMsg, setWaMsg] = useState<string>("");
  const chartRef = useRef<HTMLDivElement>(null);
  const role = roleOf(message);
  // Ocultar las directivas [[vizdata: {...}]] y [[viz: ...]] del texto mostrado
  // (completas, o truncadas mientras llega el streaming).
  const text = contentToText(message.content, message.text)
    .replace(/\[\[vizdata:\s*\{[\s\S]*?\}\s*\]\]/gi, "")
    .replace(/\[\[vizdata:[\s\S]*$/i, "")
    .replace(/\[\[viz:[^\]]*\]\]/gi, "")
    .replace(/\[\[viz:[^\]]*$/i, "")
    .trimEnd();

  // Cuando el usuario pide solo el gráfico, el modelo puede responder ÚNICAMENTE
  // con la directiva [[viz: ...]]; al ocultarla el texto queda vacío. En ese caso
  // NO descartamos la burbuja: hay que mostrar el gráfico igual.
  const hasChart = role === "assistant" && (chartData?.length ?? 0) > 0;
  if (!text && !hasChart) return null;
  if (role === "tool" && !text) return null;

  const isJson = text.trim().startsWith("{") || text.trim().startsWith("[");

  return (
    <article className={`bubble bubble--${role}`}>
      <div className="bubble__role">{ROLE_LABEL[role]}</div>
      {isJson ? (
        <pre className="bubble__json">{text}</pre>
      ) : text ? (
        <div className="bubble__content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      ) : null}
      {role === "assistant" && chartData && chartData.length > 0 && (
        <div ref={chartRef}>
          {chartData.map((cd, i) => (
            <ChartBlock key={i} {...cd} />
          ))}
        </div>
      )}
      {role === "assistant" && canSend && text.trim().length > 40 && (
        <div className="bubble__actions">
          <button
            className="btn--wa"
            disabled={waState === "sending"}
            onClick={async () => {
              setWaState("sending");
              setWaMsg("");
              const spec = chartData && chartData.length ? toVizSpec(chartData[0]) : null;
              // Captura el gráfico TAL CUAL se ve en el chat (recharts) como PNG.
              // Si falla, el servidor cae al render canvas (spec) o tarjeta de texto.
              let imagePng: string | null = null;
              if (chartRef.current) {
                try {
                  // width/height explícitos: sin esto la leyenda de recharts,
                  // que desborda el contenedor, sale recortada.
                  const el = chartRef.current;
                  imagePng = await toPng(el, {
                    pixelRatio: 2,
                    backgroundColor: "#ffffff",
                    cacheBust: true,
                    width: el.scrollWidth,
                    height: el.scrollHeight + 8,
                  });
                } catch { /* captura falló → fallback en el servidor */ }
              }
              try {
                const res = await fetch("/api/reports/send", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ texto: text, spec, titulo: spec?.titulo, imagePng }),
                });
                const body = await res.json().catch(() => ({}));
                if (!res.ok || !body.ok) {
                  setWaState("error");
                  setWaMsg(body.error ?? "No se pudo enviar.");
                } else {
                  setWaState("sent");
                  setWaMsg("Enviado a tu WhatsApp ✓");
                }
              } catch (e) {
                setWaState("error");
                setWaMsg((e as Error).message);
              }
            }}
          >
            {waState === "sending" ? "Enviando…" : waState === "sent" ? "✓ Enviado" : "📲 Enviar a WhatsApp"}
          </button>
          {waMsg && (
            <span className={`bubble__wa-status bubble__wa-status--${waState}`}>{waMsg}</span>
          )}
        </div>
      )}
    </article>
  );
}
