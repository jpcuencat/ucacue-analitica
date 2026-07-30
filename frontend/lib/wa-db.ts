import { getPool } from "./db";

// Normaliza un teléfono a E.164 sin '+': deja solo dígitos.
// (La Cloud API acepta el número con o sin '+'; guardamos sin él.)
export function normalizarTelefono(raw: string): string {
  return (raw ?? "").replace(/\D/g, "");
}

// Registro de auditoría de cada envío.
export type SendLogEntry = {
  pregunta?: string | null;
  telefono: string;
  estado: "enviado" | "error";
  waMessageId?: string | null;
  error?: string | null;
};

export async function logSend(e: SendLogEntry): Promise<void> {
  await getPool().query(
    `INSERT INTO wa_send_log (pregunta, telefono, estado, wa_message_id, error)
     VALUES ($1, $2, $3, $4, $5)`,
    [e.pregunta ?? null, e.telefono, e.estado, e.waMessageId ?? null, e.error ?? null],
  );
}
