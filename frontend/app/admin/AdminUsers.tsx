"use client";

import { useCallback, useEffect, useState } from "react";

type AdminUser = {
  id: string;
  email: string;
  must_change_password: boolean;
  created_at: string;
};

type CredResult = { email: string; tempPassword: string; accion: "alta" | "reset" };

export function AdminUsers({ adminEmail }: { adminEmail: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState("");
  const [busy, setBusy] = useState(false);
  const [cred, setCred] = useState<CredResult | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("No se pudo cargar la lista de usuarios.");
      setUsers((await res.json()) as AdminUser[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function agregar() {
    const email = nuevo.trim();
    if (!email) return;
    setBusy(true);
    setError(null);
    setCred(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "No se pudo crear el usuario.");
      setCred({ email: body.email, tempPassword: body.tempPassword, accion: "alta" });
      setNuevo("");
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resetear(email: string) {
    if (!window.confirm(`¿Generar una nueva clave temporal para ${email}?`)) return;
    setBusy(true);
    setError(null);
    setCred(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "No se pudo resetear.");
      setCred({ email: body.email, tempPassword: body.tempPassword, accion: "reset" });
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function eliminar(email: string) {
    if (!window.confirm(`¿Eliminar a ${email}? Se borrarán también sus conversaciones.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users?email=${encodeURIComponent(email)}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "No se pudo eliminar.");
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-shell">
      <header className="admin-head">
        <div>
          <h1 className="admin-title">Administración de usuarios</h1>
          <p className="admin-sub">Sesión: {adminEmail}</p>
        </div>
        <a className="admin-back" href="/">← Volver al asistente</a>
      </header>

      {error && <div className="admin-error">{error}</div>}

      {cred && (
        <div className="admin-cred">
          <p className="admin-cred__title">
            {cred.accion === "alta" ? "Usuario creado" : "Clave reseteada"} — envíale estos datos:
          </p>
          <p className="admin-cred__row"><span>Correo:</span> <code>{cred.email}</code></p>
          <p className="admin-cred__row"><span>Clave temporal:</span> <code>{cred.tempPassword}</code></p>
          <p className="admin-cred__hint">
            En su primer ingreso deberá cambiarla (mínimo 10 caracteres con mayúscula, minúscula y número).
            Esta clave no se vuelve a mostrar.
          </p>
          <button className="btn" onClick={() => setCred(null)}>Entendido</button>
        </div>
      )}

      <div className="admin-add">
        <input
          className="admin-add__input"
          type="email"
          placeholder="nombre@ucacue.edu.ec"
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void agregar(); }}
          disabled={busy}
        />
        <button className="btn btn--primary" onClick={agregar} disabled={busy || !nuevo.trim()}>
          + Agregar usuario
        </button>
      </div>

      {loading ? (
        <p className="admin-loading">Cargando usuarios…</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr><th>Correo</th><th>Estado</th><th>Alta</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>
                  {u.must_change_password
                    ? <span className="admin-badge admin-badge--pend">Clave temporal</span>
                    : <span className="admin-badge admin-badge--ok">Activa</span>}
                </td>
                <td className="admin-date">{new Date(u.created_at).toLocaleDateString("es-EC")}</td>
                <td className="admin-actions">
                  <button className="admin-link" onClick={() => resetear(u.email)} disabled={busy}>
                    Resetear clave
                  </button>
                  {u.email.toLowerCase() !== adminEmail.toLowerCase() && (
                    <button className="admin-link admin-link--danger" onClick={() => eliminar(u.email)} disabled={busy}>
                      Eliminar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
