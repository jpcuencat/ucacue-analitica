import { compare, hash } from "bcryptjs";
import { getPool } from "./db";

export async function validatePassword(email: string, password: string): Promise<boolean> {
  const { rows } = await getPool().query<{ password_hash: string }>(
    "SELECT password_hash FROM users WHERE email = $1 LIMIT 1",
    [email],
  );
  if (!rows.length) return false;
  return compare(password, rows[0].password_hash);
}

export async function createUser(email: string, password: string): Promise<void> {
  const password_hash = await hash(password, 12);
  await getPool().query(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [email, password_hash],
  );
}

export async function mustChangePassword(email: string): Promise<boolean> {
  const { rows } = await getPool().query<{ must_change_password: boolean }>(
    "SELECT must_change_password FROM users WHERE email = $1 LIMIT 1",
    [email],
  );
  return rows[0]?.must_change_password ?? false;
}

export async function changePassword(email: string, newPassword: string): Promise<void> {
  const password_hash = await hash(newPassword, 12);
  await getPool().query(
    `UPDATE users
     SET password_hash = $2, must_change_password = FALSE
     WHERE email = $1`,
    [email, password_hash],
  );
}

export async function getUserIdByEmail(email: string): Promise<string | null> {
  const { rows } = await getPool().query<{ id: string }>(
    "SELECT id FROM users WHERE email = $1 LIMIT 1",
    [email],
  );
  return rows[0]?.id ?? null;
}

// ─── Administración de usuarios (pantalla /admin) ───

export type AdminUser = {
  id: string;
  email: string;
  must_change_password: boolean;
  created_at: string;
};

export async function listUsers(): Promise<AdminUser[]> {
  const { rows } = await getPool().query<AdminUser>(
    "SELECT id, email, must_change_password, created_at FROM users ORDER BY email ASC",
  );
  return rows;
}

// Alta: NO pisa a un usuario existente (DO NOTHING). Devuelve si se creó.
export async function adminCreateUser(email: string, tempPassword: string): Promise<"created" | "exists"> {
  const password_hash = await hash(tempPassword, 12);
  const res = await getPool().query(
    `INSERT INTO users (email, password_hash, must_change_password)
     VALUES ($1, $2, TRUE)
     ON CONFLICT (email) DO NOTHING`,
    [email, password_hash],
  );
  return res.rowCount ? "created" : "exists";
}

// Reseteo: fija una nueva clave temporal y vuelve a exigir cambio.
export async function adminResetPassword(email: string, tempPassword: string): Promise<boolean> {
  const password_hash = await hash(tempPassword, 12);
  const res = await getPool().query(
    `UPDATE users SET password_hash = $2, must_change_password = TRUE WHERE email = $1`,
    [email, password_hash],
  );
  return Boolean(res.rowCount);
}

export async function adminDeleteUser(email: string): Promise<boolean> {
  const res = await getPool().query("DELETE FROM users WHERE email = $1", [email]);
  return Boolean(res.rowCount);
}
