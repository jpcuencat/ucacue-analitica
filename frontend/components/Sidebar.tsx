"use client";

import type { ThreadMeta } from "@/lib/types";

const SUGGESTED_QUESTIONS = [
  "¿Cuántos inscritos y matrículas nuevas hay en Sierra 2026?",
  "¿Cuál es la tasa de conversión de inscritos a matriculados este periodo?",
  "Desglosa los inscritos por sede",
  "¿Qué facultades tienen más inscritos en Sierra 2026?",
  "¿Cuál es la tasa de pérdida por cohorte desde el cohorte 20231?",
  "¿Cómo van las inscripciones de Sierra 2026 frente al año pasado?",
  "Muéstrame la evolución de inscripciones por periodo desde 2023",
  "¿Cuántos inscritos tiene la carrera de Medicina en Matriz Cuenca?",
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return d.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "ayer";
  if (diffDays < 7)   return `hace ${diffDays} días`;
  return d.toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit" });
}

type SidebarProps = {
  onSelect: (question: string) => void;
  threadId?: string;
  isLoading: boolean;
  onNewThread: () => void;
  threadsList: ThreadMeta[];
  onSwitchThread: (id: string) => void;
  onDeleteThread?: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
};

export function Sidebar({
  onSelect, threadId, isLoading, onNewThread, threadsList, onSwitchThread, onDeleteThread, isOpen, onClose,
}: SidebarProps) {
  return (
    <aside className={`sidebar${isOpen ? " sidebar--open" : ""}`}>

      {/* Botón cerrar — solo visible en móvil via CSS */}
      <button className="sidebar__close-btn" onClick={onClose} aria-label="Cerrar menú">✕</button>

      {/* Historial de conversaciones */}
      <div className="sidebar__section sidebar__section--history">
        <div className="sidebar__section-header">
          <h2 className="sidebar__heading">Conversaciones</h2>
          <button className="btn btn--new-chat" onClick={onNewThread} disabled={isLoading}>
            + Nueva
          </button>
        </div>

        {threadsList.length === 0 ? (
          <p className="sidebar__empty-history">Sin conversaciones aún.</p>
        ) : (
          <ul className="sidebar__history">
            {threadsList.map((t) => (
              <li key={t.id} className="sidebar__history-item">
                <button
                  className={`sidebar__history-btn${t.id === threadId ? " sidebar__history-btn--active" : ""}`}
                  onClick={() => onSwitchThread(t.id)}
                  disabled={isLoading}
                  title={t.title}
                >
                  <span className="sidebar__history-title">{t.title}</span>
                  <span className="sidebar__history-date">{formatDate(t.createdAt)}</span>
                </button>
                {onDeleteThread && (
                  <button
                    className="sidebar__history-delete"
                    onClick={(e) => { e.stopPropagation(); onDeleteThread(t.id); }}
                    disabled={isLoading}
                    title="Eliminar conversación"
                    aria-label="Eliminar conversación"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Preguntas sugeridas */}
      <div className="sidebar__section">
        <h2 className="sidebar__heading">Preguntas sugeridas</h2>
        <ul className="sidebar__questions">
          {SUGGESTED_QUESTIONS.map((q) => (
            <li key={q}>
              <button className="sidebar__question-btn" onClick={() => onSelect(q)} disabled={isLoading}>
                {q}
              </button>
            </li>
          ))}
        </ul>
      </div>

    </aside>
  );
}
