// Administradores autorizados a gestionar usuarios. Lista por env ADMIN_EMAILS
// (correos separados por coma); por defecto solo la cuenta de analítica.
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.ADMIN_EMAILS ?? "jdatosanalitica@ucacue.edu.ec";
  const admins = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email.trim().toLowerCase());
}

// Clave inicial default para altas y reseteos. El usuario entra con esta y en
// su primer ingreso el sistema lo obliga a cambiarla (must_change_password).
// Se lee de env (CLAVE_INICIAL_DEFAULT en .env.local) para NO exponer la clave
// real en el repositorio; el fallback es un placeholder que igual cumple la
// política (10+ chars, mayúscula, minúscula y dígito) por si el env falta.
export const CLAVE_INICIAL_DEFAULT =
  process.env.CLAVE_INICIAL_DEFAULT ?? "CambiarClaveUCACUE1";

// Normaliza el correo para evitar el bug de sensibilidad a mayúsculas en el
// login (WHERE email = $1). Siempre se guarda en minúsculas y sin espacios.
export function normalizarEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
