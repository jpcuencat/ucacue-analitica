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

const WIDGET_QUESTIONS = [
  "¿Cuántos inscritos y matrículas nuevas hay en Sierra 2026?",
  "¿Cuál es la tasa de conversión este periodo?",
  "Desglosa los inscritos por sede",
  "¿Qué facultades tienen más inscritos?",
  "¿Cuál es la tasa de pérdida por cohorte?",
  "¿Cómo van las inscripciones vs el año pasado?",
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return d.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "ayer";
  if (diffDays < 7)  return `hace ${diffDays} días`;
  return d.toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit" });
}

export function Chat({ userEmail, isWidget = false }: { userEmail?: string; isWidget?: boolean }) {
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [threadsList, setThreadsList] = useState<ThreadMeta[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [widgetHistoryOpen, setWidgetHistoryOpen] = useState(false);
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
    let pending: ToolChartData[] = [];
    messages.forEach((msg, i) => {
      const type = (msg.type ?? msg.role ?? "").toLowerCase();
      if (type === "tool") {
        const raw = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.ok && parsed.data != null)
            pending.push({ toolName: msg.name ?? "", data: parsed.data });
        } catch { /* no JSON */ }
      } else if (type === "ai" && !msg.tool_calls?.length && pending.length > 0) {
        // El agente decide qué graficar vía la directiva [[viz: tool]] en su
        // respuesta. Sin directiva no se muestra ningún gráfico (usará tabla o texto).
        const text = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
        const wanted = [...text.matchAll(/\[\[viz:\s*([a-z_]+)\s*\]\]/gi)].map((m) => m[1]);
        if (wanted.length > 0) {
          // Máximo un gráfico: el último resultado de la primera tool indicada.
          const match = [...pending].reverse().find((p) => wanted.includes(p.toolName));
          if (match) map.set(i, [match]);
        }
        pending = [];
      } else if (type === "human") {
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
              <p className="empty__hint">El asistente consulta datos reales de UCACUE.</p>
              {isWidget && (
                <ul className="widget-suggestions">
                  {WIDGET_QUESTIONS.map((q) => (
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
              return <MessageBubble key={msg.id ?? i} message={msg} chartData={chartsByMsgIndex.get(i)} />;
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
