import { getPool } from "./db";

// Rate limiting de login (OWASP A07): bloquea fuerza bruta limitando
// intentos fallidos por combinación email+IP en una ventana de tiempo.
// Fail-open: si la DB no está disponible, no bloquea el login (coherente
// con el resto de la app, que cae a auth por env cuando no hay DB).

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

export async function isRateLimited(email: string, ip: string): Promise<boolean> {
  try {
    const { rows } = await getPool().query<{ count: string }>(
      `SELECT count(*) AS count FROM login_attempts
       WHERE email = $1 AND ip = $2
         AND attempted_at > NOW() - make_interval(mins => $3)`,
      [email, ip, WINDOW_MINUTES],
    );
    return Number(rows[0]?.count ?? 0) >= MAX_ATTEMPTS;
  } catch {
    return false;
  }
}

export async function recordFailedAttempt(email: string, ip: string): Promise<void> {
  try {
    await getPool().query(
      "INSERT INTO login_attempts (email, ip) VALUES ($1, $2)",
      [email, ip],
    );
  } catch { /* best-effort */ }
}

export async function clearAttempts(email: string, ip: string): Promise<void> {
  try {
    await getPool().query(
      "DELETE FROM login_attempts WHERE email = $1 AND ip = $2",
      [email, ip],
    );
  } catch { /* best-effort */ }
}
