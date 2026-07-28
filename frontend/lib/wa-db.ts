import { getPool } from "./db";

// Destinatarios autorizados para recibir reportes por WhatsApp.
export type Recipient = {
  id: string;
  nombre: string;
  telefono: string; // E.164 sin '+', solo dígitos
  activo: boolean;
};

// Normaliza un teléfono a E.164 sin '+': deja solo dígitos.
// (La Cloud API acepta el número con o sin '+'; guardamos sin él.)
export function normalizarTelefono(raw: string): string {
  return (raw ?? "").replace(/\D/g, "");
}

export async function listRecipients(soloActivos = false): Promise<Recipient[]> {
  const where = soloActivos ? "WHERE activo = TRUE" : "";
  const { rows } = await getPool().query<Recipient>(
    `SELECT id, nombre, telefono, activo
       FROM wa_recipients ${where}
      ORDER BY nombre ASC`,
  );
  return rows;
}

export async function getRecipientsByIds(ids: string[]): Promise<Recipient[]> {
  if (!ids.length) return [];
  const { rows } = await getPool().query<Recipient>(
    `SELECT id, nombre, telefono, activo
       FROM wa_recipients
      WHERE id = ANY($1::uuid[]) AND activo = TRUE`,
    [ids],
  );
  return rows;
}

export async function createRecipient(
  nombre: string,
  telefono: string,
  createdBy?: string,
): Promise<Recipient> {
  const tel = normalizarTelefono(telefono);
  if (!nombre.trim()) throw new Error("El nombre es obligatorio.");
  if (tel.length < 8) throw new Error("Teléfono inválido (usa formato internacional).");
  const { rows } = await getPool().query<Recipient>(
    `INSERT INTO wa_recipients (nombre, telefono, created_by, consentimiento_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (telefono) DO UPDATE SET nombre = EXCLUDED.nombre, activo = TRUE
     RETURNING id, nombre, telefono, activo`,
    [nombre.trim(), tel, createdBy ?? null],
  );
  return rows[0];
}

export async function setRecipientActive(id: string, activo: boolean): Promise<void> {
  await getPool().query(`UPDATE wa_recipients SET activo = $2 WHERE id = $1`, [id, activo]);
}

export async function deleteRecipient(id: string): Promise<void> {
  await getPool().query(`DELETE FROM wa_recipients WHERE id = $1`, [id]);
}

// Registro de auditoría de cada envío.
export type SendLogEntry = {
  reportId?: string | null;
  pregunta?: string | null;
  telefono: string;
  estado: "enviado" | "error";
  waMessageId?: string | null;
  error?: string | null;
};

export async function logSend(e: SendLogEntry): Promise<void> {
  await getPool().query(
    `INSERT INTO wa_send_log (report_id, pregunta, telefono, estado, wa_message_id, error)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [e.reportId ?? null, e.pregunta ?? null, e.telefono, e.estado, e.waMessageId ?? null, e.error ?? null],
  );
}
