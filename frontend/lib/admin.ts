import { randomBytes } from "crypto";

// Administradores autorizados a gestionar usuarios. Lista por env ADMIN_EMAILS
// (correos separados por coma); por defecto solo la cuenta de analítica.
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.ADMIN_EMAILS ?? "jdatosanalitica@ucacue.edu.ec";
  const admins = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email.trim().toLowerCase());
}

// Clave temporal aleatoria que cumple la política (10+ chars, mayúscula,
// minúscula y dígito). El prefijo/sufijo garantizan la política; la entropía
// real vive en el bloque aleatorio del medio.
export function genTempPassword(): string {
  const medio = randomBytes(9).toString("base64").replace(/[+/=]/g, "").slice(0, 10);
  return `Ua${medio}7`;
}

// Normaliza el correo para evitar el bug de sensibilidad a mayúsculas en el
// login (WHERE email = $1). Siempre se guarda en minúsculas y sin espacios.
export function normalizarEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
