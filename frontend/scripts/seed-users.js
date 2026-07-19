#!/usr/bin/env node
// Seed AUTH_USERS env var into the users table.
// Usage: node --env-file=.env.local scripts/seed-users.js

import pg from "pg";
import bcryptjs from "bcryptjs";

const { Pool } = pg;
const { hash } = bcryptjs;

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL no configurada."); process.exit(1); }

const raw = process.env.AUTH_USERS ?? "";
if (!raw.trim()) { console.error("AUTH_USERS vacía — nada que sembrar."); process.exit(0); }

const pairs = raw.split(",").map((s) => {
  const [email, ...rest] = s.trim().split(":");
  return { email: email.trim(), password: rest.join(":").trim() };
}).filter((p) => p.email && p.password);

if (!pairs.length) { console.error("AUTH_USERS no tiene pares email:password válidos."); process.exit(1); }

const pool = new Pool({ connectionString: url, max: 2 });
try {
  for (const { email, password } of pairs) {
    const password_hash = await hash(password, 12);
    // DO NOTHING: nunca pisar la contraseña de un usuario existente
    // (pudo haberla cambiado en su primer acceso vía /cambiar-clave).
    const res = await pool.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2)
       ON CONFLICT (email) DO NOTHING`,
      [email, password_hash],
    );
    console.log(res.rowCount ? `  ok: ${email}` : `  ya existía (sin cambios): ${email}`);
  }
  console.log("Seed completado.");
} finally {
  await pool.end();
}
