"use client";

import { useCallback, useEffect, useState } from "react";
import type { VizSpec } from "@/components/ChartBlock";

type Recipient = { id: string; nombre: string; telefono: string; activo: boolean };

type SendResult = { nombre: string; telefono: string; ok: boolean; error?: string };

type Props = {
  open: boolean;
  onClose: () => void;
  texto: string;
  spec: VizSpec | null;
  titulo?: string;
};

// Modal para enviar la respuesta del agente a destinatarios de WhatsApp.
// Permite elegir destinatarios, dar de alta nuevos y disparar el envío
// on-demand (POST /api/reports/send con el texto+gráfico ya calculados).
export function WhatsAppModal({ open, onClose, texto, spec, titulo }: Props) {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SendResult[] | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoTel, setNuevoTel] = useState("");
  const [manage, setManage] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/wa-recipients");
      if (!res.ok) throw new Error("No se pudo cargar la lista de destinatarios.");
      setRecipients((await res.json()) as Recipient[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setResults(null);
      setError(null);
      setSelected(new Set());
      void cargar();
    }
  }, [open, cargar]);

  if (!open) return null;

  const activos = recipients.filter((r) => r.activo);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function agregar() {
    const nombre = nuevoNombre.trim();
    const telefono = nuevoTel.trim();
    if (!nombre || !telefono) return;
    setError(null);
    try {
      const res = await fetch("/api/wa-recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, telefono }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "No se pudo agregar.");
      setNuevoNombre("");
      setNuevoTel("");
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function cambiarActivo(r: Recipient) {
    await fetch("/api/wa-recipients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, activo: !r.activo }),
    });
    await cargar();
  }

  async function eliminar(r: Recipient) {
    if (!window.confirm(`¿Eliminar a ${r.nombre} (${r.telefono})?`)) return;
    await fetch(`/api/wa-recipients?id=${encodeURIComponent(r.id)}`, { method: "DELETE" });
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(r.id);
      return next;
    });
    await cargar();
  }

  async function enviar() {
    if (selected.size === 0) return;
    setSending(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/reports/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientIds: [...selected],
          texto,
          spec,
          titulo,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Falló el envío.");
      setResults(body.resultados as SendResult[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="wa-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="wa-modal" onClick={(e) => e.stopPropagation()}>
        <header className="wa-modal__head">
          <h3>📲 Enviar a WhatsApp</h3>
          <button className="wa-modal__close" onClick={onClose} aria-label="Cerrar">✕</button>
        </header>

        <p className="wa-modal__hint">
          Se enviará el resumen de esta respuesta {spec ? "con el gráfico" : "como tarjeta de texto"}.
          {" "}Elige a quién.
        </p>

        {error && <div className="wa-modal__error">{error}</div>}

        {results ? (
          <div className="wa-results">
            <p className="wa-results__title">
              Enviados {results.filter((r) => r.ok).length}/{results.length}
            </p>
            <ul>
              {results.map((r, i) => (
                <li key={i} className={r.ok ? "wa-results__ok" : "wa-results__err"}>
                  {r.ok ? "✓" : "✕"} {r.nombre} ({r.telefono})
                  {!r.ok && r.error ? ` — ${r.error}` : ""}
                </li>
              ))}
            </ul>
            <button className="btn btn--primary" onClick={onClose}>Cerrar</button>
          </div>
        ) : (
          <>
            {loading ? (
              <p className="wa-modal__loading">Cargando destinatarios…</p>
            ) : activos.length === 0 && !manage ? (
              <p className="wa-modal__empty">
                No hay destinatarios. Agrega uno abajo.
              </p>
            ) : (
              <ul className="wa-list">
                {(manage ? recipients : activos).map((r) => (
                  <li key={r.id} className="wa-list__item">
                    {manage ? (
                      <>
                        <span className="wa-list__info">
                          <strong>{r.nombre}</strong>
                          <span className="wa-list__tel">{r.telefono}</span>
                        </span>
                        <button
                          className={`wa-chip ${r.activo ? "wa-chip--on" : "wa-chip--off"}`}
                          onClick={() => cambiarActivo(r)}
                        >{r.activo ? "Activo" : "Inactivo"}</button>
                        <button className="wa-list__del" onClick={() => eliminar(r)} aria-label="Eliminar">🗑</button>
                      </>
                    ) : (
                      <label className="wa-list__label">
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r.id)}
                        />
                        <span className="wa-list__info">
                          <strong>{r.nombre}</strong>
                          <span className="wa-list__tel">{r.telefono}</span>
                        </span>
                      </label>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div className="wa-add">
              <input
                className="wa-add__input"
                placeholder="Nombre"
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
              />
              <input
                className="wa-add__input"
                placeholder="Teléfono (ej. 5939XXXXXXXX)"
                value={nuevoTel}
                onChange={(e) => setNuevoTel(e.target.value)}
              />
              <button className="btn" onClick={agregar} disabled={!nuevoNombre.trim() || !nuevoTel.trim()}>
                + Agregar
              </button>
            </div>

            <footer className="wa-modal__foot">
              <button className="wa-modal__manage" onClick={() => setManage((v) => !v)}>
                {manage ? "← Volver a enviar" : "Gestionar destinatarios"}
              </button>
              {!manage && (
                <button
                  className="btn btn--primary"
                  onClick={enviar}
                  disabled={sending || selected.size === 0}
                >
                  {sending ? "Enviando…" : `Enviar${selected.size ? " a " + selected.size : ""}`}
                </button>
              )}
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
