"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AnyMessage } from "@/lib/types";
import { ChartBlock } from "@/components/ChartBlock";
import type { ToolChartData } from "@/components/ChartBlock";
import { WhatsAppModal } from "@/components/WhatsAppModal";
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

export function MessageBubble({ message, chartData, canSend = false }: Props) {
  const [waOpen, setWaOpen] = useState(false);
  const role = roleOf(message);
  // Ocultar las directivas [[vizdata: {...}]] y [[viz: ...]] del texto mostrado
  // (completas, o truncadas mientras llega el streaming).
  const text = contentToText(message.content, message.text)
    .replace(/\[\[vizdata:\s*\{[\s\S]*?\}\s*\]\]/gi, "")
    .replace(/\[\[vizdata:[\s\S]*$/i, "")
    .replace(/\[\[viz:[^\]]*\]\]/gi, "")
    .replace(/\[\[viz:[^\]]*$/i, "")
    .trimEnd();

  if (!text && role !== "tool") return null;
  if (role === "tool" && !text) return null;

  const isJson = text.trim().startsWith("{") || text.trim().startsWith("[");

  return (
    <article className={`bubble bubble--${role}`}>
      <div className="bubble__role">{ROLE_LABEL[role]}</div>
      {isJson ? (
        <pre className="bubble__json">{text}</pre>
      ) : (
        <div className="bubble__content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {text || "(sin contenido)"}
          </ReactMarkdown>
        </div>
      )}
      {role === "assistant" && chartData?.map((cd, i) => (
        <ChartBlock key={i} {...cd} />
      ))}
      {role === "assistant" && canSend && text.trim().length > 40 && (
        <div className="bubble__actions">
          <button className="btn--wa" onClick={() => setWaOpen(true)}>
            📲 Enviar a WhatsApp
          </button>
        </div>
      )}
      {waOpen && (
        <WhatsAppModal
          open={waOpen}
          onClose={() => setWaOpen(false)}
          texto={text}
          spec={chartData && chartData.length ? toVizSpec(chartData[0]) : null}
          titulo={(chartData && chartData.length ? toVizSpec(chartData[0])?.titulo : undefined) ?? undefined}
        />
      )}
    </article>
  );
}
