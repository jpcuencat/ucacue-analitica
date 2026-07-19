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
