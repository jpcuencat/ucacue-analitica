"use client";

import {
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useStream } from "@langchain/langgraph-sdk/react";
import { MessageBubble } from "@/components/MessageBubble";
import { Sidebar } from "@/components/Sidebar";
import type { AnyMessage, ThreadMeta, ToolCall } from "@/lib/types";
import type { ToolChartData } from "@/components/ChartBlock";
import { apiDeleteThread, apiGetThreads, apiUpsertThread } from "@/lib/threads-client";

// Derived at runtime from window.location so HTTP/HTTPS matches the page origin.
// Avoids mixed-content blocking when the app is embedded via HTTPS (Cloudflare tunnel).
const API_URL =
  typeof window !== "undefined"
    ? `${window.location.origin}/api/lg`
    : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/lg");
const GRAPH_ID = process.env.NEXT_PUBLIC_GRAPH_ID ?? "agent";

const threadKey = (e?: string) => e ? `ucacue_thread_${e}` : "ucacue_thread_anonymous";

// Pool de preguntas: cada conversación nueva carga un subconjunto aleatorio
// (WIDGET_QUESTION_COUNT). Todas dan contexto (periodo, métricas, gráfico) para
// que el agente arranque mostrando análisis, no una cifra suelta.
const QUESTION_POOL = [
  "Compara las carreras de [facultad] por inscritos y matrículas nuevas en Sierra 2026, con gráfico",
  "¿Qué facultades lideran las matrículas en Sierra 2026 y cuáles están rezagadas? Muéstralo en gráfico",
  "¿Cómo van las inscripciones de Sierra 2026 frente a Sierra 2025 a esta misma fecha?",
  "Analiza la tasa de pérdida por cohorte e identifica dónde deberíamos preocuparnos",
  "Muéstrame la evolución histórica de inscripciones y si el periodo actual va por buen camino",
  "Desglosa inscritos y matrículas por sede en Sierra 2026 e identifica la brecha, con gráfico",
  "¿Cuál es la tasa de conversión de inscrito a matriculado en Sierra 2026 y cómo se compara con el periodo anterior?",
  "Compara las facultades de [sede] por inscritos en Sierra 2026, con gráfico",
  "Dame el detalle por carrera de [facultad] en Sierra 2026, con gráfico",
  "¿Qué sede tiene la mejor conversión de inscritos a matriculados en Sierra 2026?",
  "¿Cuántos inscritos y reservas hay en Sierra 2026 y qué porcentaje ya se matriculó?",
  "Compara la retención por cohorte entre carreras y señala las de mayor deserción",
];

const WIDGET_QUESTION_COUNT = 6;

// Fisher-Yates: subconjunto aleatorio sin repetición.
function pickRandom<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return d.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "ayer";
  if (diffDays < 7)  return `hace ${diffDays} días`;
  return d.toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit" });
}

export function Chat({ userEmail, isWidget = false, canSend = false }: { userEmail?: string; isWidget?: boolean; canSend?: boolean }) {
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [threadsList, setThreadsList] = useState<ThreadMeta[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [widgetHistoryOpen, setWidgetHistoryOpen] = useState(false);
  // Subconjunto inicial determinista (evita mismatch de hidratación SSR/CSR);
  // se baraja tras montar y en cada conversación nueva.
  const [suggestions, setSuggestions] = useState<string[]>(
    () => QUESTION_POOL.slice(0, WIDGET_QUESTION_COUNT),
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const key = threadKey(userEmail);

  const refreshThreads = useCallback(async () => {
    const list = await apiGetThreads();
    setThreadsList(list);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(key);
    if (stored) {
      // Verify the thread still exists in LangGraph (lost on container restart with inmem).
      // If 404, discard the stale ID so the next submit creates a fresh thread.
      fetch(`${API_URL}/threads/${stored}/state`)
        .then(res => {
          if (res.status === 404) {
            window.localStorage.removeItem(key);
            setThreadId(undefined);
          } else {
            setThreadId(stored);
          }
        })
        .catch(() => setThreadId(stored));
    }
    void refreshThreads();
  }, [key, refreshThreads]);

  // Tell the outer frame the chat is ready (e.g., after a login redirect inside the iframe).
  // The host page listens for this message and auto-opens the widget if it was closed.
  // targetOrigin "*" porque el host puede ser cualquier sitio que nos embeba
  // (cross-site); el mensaje no contiene datos sensibles.
  useEffect(() => {
    if (isWidget && window.self !== window.top) {
      window.parent.postMessage({ type: "ucacue-widget-ready" }, "*");
    }
  }, [isWidget]);

  const pendingTitleRef = useRef<string | null>(null);

  const handleThreadId = useCallback((id: string) => {
    setThreadId(id);
    window.localStorage.setItem(key, id);
    const title = pendingTitleRef.current ?? "Nueva conversación";
    pendingTitleRef.current = null;
    void apiUpsertThread(id, title).then(() => refreshThreads());
  }, [key, refreshThreads]);

  const stream = useStream<{ messages: AnyMessage[] }>({
    apiUrl: API_URL,
    assistantId: GRAPH_ID,
    threadId,
    messagesKey: "messages",
    onThreadId: handleThreadId,
  });

  const messages = (stream.messages ?? []) as AnyMessage[];
  const toolCalls: ToolCall[] = (stream as any).toolCalls ?? []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { isLoading } = stream;

  // Baraja las sugerencias en cada conversación vacía (montaje inicial y cada
  // vez que se abre una nueva) para que no siempre salgan las mismas.
  const isEmptyConversation = messages.length === 0;
  useEffect(() => {
    if (isEmptyConversation) setSuggestions(pickRandom(QUESTION_POOL, WIDGET_QUESTION_COUNT));
  }, [threadId, isEmptyConversation]);

  const streamRef = useRef(stream);
  streamRef.current = stream;
  const inputRef = useRef(input);
  inputRef.current = input;

  const handleSubmit = useCallback(async () => {
    const text = inputRef.current.trim();
    if (!text || streamRef.current.isLoading) return;
    setInput("");

    if ((streamRef.current.messages ?? []).length === 0) {
      const title = text.length > 48 ? text.slice(0, 46) + "…" : text;
      if (threadId) {
        void apiUpsertThread(threadId, title).then(() => refreshThreads());
      } else {
        pendingTitleRef.current = title;
      }
    }

    await streamRef.current.submit(
      { messages: [{ type: "human", content: text }] },
      { streamMode: ["messages"] },
    );
  }, [threadId, refreshThreads]);

  const chartsByMsgIndex = useMemo<Map<number, ToolChartData[]>>(() => {
    const map = new Map<number, ToolChartData[]>();
    type Pending = { toolName: string; data: unknown; args?: Record<string, unknown> };
    let pending: Pending[] = [];
    let lastHuman = ""; // texto del último turno del usuario (para saber si pidió gráfico)
    const callArgs = new Map<string, Record<string, unknown>>(); // tool_call_id → args

    const num = (v: unknown) => (v == null || v === "--" ? 0 : Number(v) || 0);

    // ¿El usuario pidió explícitamente un gráfico en su mensaje?
    const userWantsChart = (t: string) =>
      /gr[aá]fic|graf[ií]|visualiz|diagrama|chart|barras|curva|torta|pastel/i.test(t);
    const breakdownTools = ["get_facultades_kpis", "get_sedes_kpis", "get_carreras"];

    // Si en el turno hubo VARIAS llamadas a get_estudiantes_kpis (ej. una por
    // carrera), construimos el gráfico comparativo desde los resultados —
    // sin depender de que el modelo emita [[vizdata]] (a prueba de modelo).
    const comparativoEstudiantes = (results: Pending[]): ToolChartData | null => {
      const rows = results.filter((p) => p.toolName === "get_estudiantes_kpis" && p.data);
      if (rows.length < 2) return null;
      const categorias = rows.map((r, idx) => {
        const a = r.args ?? {};
        return String(a.carrera_nombre ?? a.carrera ?? a.facultad ?? a.sede ?? `Ítem ${idx + 1}`);
      });
      const d = (r: Pending) => (r.data ?? {}) as Record<string, unknown>;
      const spec = {
        titulo: "Comparativo por carrera",
        categorias,
        series: [
          { nombre: "Inscritos", valores: rows.map((r) => num(d(r).inscritos)) },
          { nombre: "Matrículas nuevas", valores: rows.map((r) => num(d(r).matriculas_nuevas)) },
        ],
      };
      return { toolName: "vizdata", data: null, vizSpec: spec };
    };

    messages.forEach((msg, i) => {
      const type = (msg.type ?? msg.role ?? "").toLowerCase();
      // Registrar args de cada tool_call para correlacionarlos con su resultado.
      const calls = (msg.tool_calls ?? []) as { id?: string; args?: Record<string, unknown> }[];
      calls.forEach((c) => { if (c.id) callArgs.set(c.id, c.args ?? {}); });

      if (type === "tool") {
        const raw = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.ok && parsed.data != null) {
            const id = (msg as { tool_call_id?: string }).tool_call_id;
            pending.push({ toolName: msg.name ?? "", data: parsed.data, args: id ? callArgs.get(id) : undefined });
          }
        } catch { /* no JSON */ }
      } else if (type === "ai" && !msg.tool_calls?.length) {
        // El agente decide qué graficar. [[vizdata: {json}]] (datos que calculó)
        // tiene prioridad; luego [[viz: tool campo=x]] (un resultado crudo).
        const text = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
        let chart: ToolChartData[] | null = null;

        // 1) [[vizdata: {json}]] — la data la compuso el modelo.
        const vd = text.match(/\[\[vizdata:\s*(\{[\s\S]+?\})\s*\]\]/i);
        if (vd) {
          try {
            chart = [{ toolName: "vizdata", data: null, vizSpec: JSON.parse(vd[1]) }];
          } catch { /* JSON inválido: seguimos a los fallbacks */ }
        }

        // 2) [[viz: tool campo=x]] — un resultado crudo elegido por el modelo.
        if (!chart && pending.length > 0) {
          const wanted = [...text.matchAll(/\[\[viz:\s*([a-z_]+)(?:\s+campo=([a-z_]+))?\s*\]\]/gi)]
            .map((m) => ({ tool: m[1], metric: m[2] }));
          const w = wanted.find((x) => pending.some((p) => p.toolName === x.tool));
          if (w?.tool === "get_estudiantes_kpis") {
            // Varias fichas de estudiantes → comparativo; una sola → embudo.
            const comp = comparativoEstudiantes(pending);
            if (comp) chart = [comp];
            else {
              const single = [...pending].reverse().find((p) => p.toolName === w.tool);
              if (single) chart = [{ toolName: single.toolName, data: single.data, metric: w.metric }];
            }
          } else if (w) {
            const match = [...pending].reverse().find((p) => p.toolName === w.tool);
            if (match) chart = [{ toolName: match.toolName, data: match.data, metric: w.metric }];
          }
        }

        // 3) A prueba de modelo: el usuario pidió gráfico pero el modelo no
        //    emitió (o emitió mal) la directiva. Graficamos con la data del
        //    turno igual: comparativo de carreras > desglose > histórico > embudo.
        if (!chart && pending.length > 0 && userWantsChart(lastHuman)) {
          const metric = /matr[ií]cul|nuevos/i.test(lastHuman) ? "nuevos" : undefined;
          const comp = comparativoEstudiantes(pending);
          if (comp) chart = [comp];
          else {
            const pick =
              [...pending].reverse().find((p) => breakdownTools.includes(p.toolName)) ??
              [...pending].reverse().find((p) => p.toolName === "get_inscripciones_historico") ??
              [...pending].reverse().find((p) => p.toolName === "get_estudiantes_kpis");
            if (pick) chart = [{ toolName: pick.toolName, data: pick.data, metric }];
          }
        }

        if (chart) map.set(i, chart);
        pending = [];
      } else if (type === "human") {
        lastHuman = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
        pending = [];
      }
    });
    return map;
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSubmit(); }
  }

  function handleSuggestion(question: string) { setInput(question); }

  function newThread() {
    window.localStorage.removeItem(key);
    setThreadId(undefined);
  }

  function switchThread(id: string) {
    window.localStorage.setItem(key, id);
    setThreadId(id);
  }

  function deleteThread(id: string) {
    void apiDeleteThread(id).then(async () => {
      if (threadId === id) {
        window.localStorage.removeItem(key);
        setThreadId(undefined);
      }
      await refreshThreads();
    });
  }

  return (
    <div className={`shell${isWidget ? " shell--widget" : ""}`}>
      {!isWidget && (
        <div
          className={`sidebar-overlay${sidebarOpen ? " sidebar-overlay--visible" : ""}`}
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {!isWidget && (
        <Sidebar
          onSelect={handleSuggestion}
          threadId={threadId}
          isLoading={isLoading}
          onNewThread={newThread}
          threadsList={threadsList}
          onSwitchThread={switchThread}
          onDeleteThread={deleteThread}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      )}

      <main className="main">
        {!isWidget && (
          <button
            className="btn--menu"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Abrir menú lateral"
          >
            ☰
          </button>
        )}

        {isWidget && (
          <div className="widget-bar">
            <button
              className="widget-bar__toggle"
              onClick={() => setWidgetHistoryOpen((v) => !v)}
            >
              🗂 {threadsList.length > 0 ? `${threadsList.length} conv.` : "Historial"}
              <span className="widget-bar__arrow">{widgetHistoryOpen ? "▲" : "▼"}</span>
            </button>
            <button className="widget-bar__new" onClick={newThread} disabled={isLoading}>
              + Nueva
            </button>
            {widgetHistoryOpen && (
              <ul className="widget-history">
                {threadsList.length === 0 ? (
                  <li className="widget-history__empty">Sin conversaciones aún.</li>
                ) : threadsList.map((t) => (
                  <li key={t.id} className="widget-history__item">
                    <button
                      className={`widget-history__btn${t.id === threadId ? " widget-history__btn--active" : ""}`}
                      onClick={() => { switchThread(t.id); setWidgetHistoryOpen(false); }}
                      disabled={isLoading}
                    >
                      <span className="widget-history__title">{t.title}</span>
                      <span className="widget-history__date">{formatDate(t.createdAt)}</span>
                    </button>
                    <button
                      className="widget-history__delete"
                      onClick={(e) => { e.stopPropagation(); deleteThread(t.id); }}
                      disabled={isLoading}
                    >✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <section className="messages">
          {messages.length === 0 ? (
            <div className="empty">
              <p>Selecciona una pregunta sugerida o escribe tu consulta.</p>
              <p className="empty__hint">
                El asistente consulta datos reales de UCACUE.
                {isWidget && " Reemplaza lo que está entre [corchetes] con la facultad o sede que quieras."}
              </p>
              {isWidget && (
                <ul className="widget-suggestions">
                  {suggestions.map((q) => (
                    <li key={q}>
                      <button
                        className="widget-suggestion-btn"
                        onClick={() => setInput(q)}
                        disabled={isLoading}
                      >{q}</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            messages.map((msg, i) => {
              const t = (msg.type ?? msg.role ?? "").toLowerCase();
              if (t === "tool") return null;
              if (t === "ai" && msg.tool_calls?.length) return null;
              return (
                <MessageBubble
                  key={msg.id ?? i}
                  message={msg}
                  chartData={chartsByMsgIndex.get(i)}
                  canSend={canSend}
                />
              );
            })
          )}
          {isLoading && (
            <div className="typing-indicator" aria-label="El asistente está procesando">
              <span /><span /><span />
            </div>
          )}
          <div ref={messagesEndRef} />
        </section>

        <form className="composer" onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }}>
          <textarea
            className="composer__input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe tu pregunta… (Enter para enviar, Shift+Enter para nueva línea)"
            rows={2}
            disabled={isLoading}
          />
          {isLoading && (
            <span className="composer__status">
              {toolCalls.length > 0 ? "Consultando datos…" : "Generando respuesta…"}
            </span>
          )}
          <button className="btn btn--primary" type="submit" disabled={isLoading || !input.trim()}>
            {isLoading ? "Procesando…" : "Enviar"}
          </button>
        </form>
      </main>
    </div>
  );
}
