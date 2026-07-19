import type { ThreadMeta } from "@/lib/types";

// Puerto del historial de conversaciones (lado cliente): los componentes
// hablan con este módulo, nunca con fetch/rutas directamente. Best-effort:
// en error devuelve valores neutros — la UI nunca se rompe por el historial.

export async function apiGetThreads(): Promise<ThreadMeta[]> {
  try {
    const res = await fetch("/api/threads");
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

export async function apiUpsertThread(id: string, title: string): Promise<void> {
  try {
    await fetch("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title }),
    });
  } catch { /* best-effort */ }
}

export async function apiDeleteThread(id: string): Promise<void> {
  try {
    await fetch(`/api/threads/${id}`, { method: "DELETE" });
  } catch { /* best-effort */ }
}
