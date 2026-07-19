#!/usr/bin/env node
// Crea/actualiza la cuenta de revisión del TFM (para el tribunal).
// must_change_password = FALSE: el revisor entra directo, sin cambio forzado.
// La contraseña se pasa por entorno (NO se hardcodea, para no publicarla):
//   REVISION_PASSWORD=... node scripts/seed-revision.js
import pg from "pg";
import bcryptjs from "bcryptjs";

const EMAIL = process.env.REVISION_EMAIL ?? "revision.tfm@ucacue.edu.ec";
const PASSWORD = process.env.REVISION_PASSWORD;
if (!PASSWORD) { console.error("REVISION_PASSWORD no configurada."); process.exit(1); }

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL no configurada."); process.exit(1); }

const pool = new pg.Pool({ connectionString: url, max: 2 });
try {
  const hash = await bcryptjs.hash(PASSWORD, 12);
  await pool.query(
    `INSERT INTO users (email, password_hash, must_change_password)
     VALUES ($1, $2, FALSE)
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, must_change_password = FALSE`,
    [EMAIL, hash],
  );
  console.log(`Cuenta de revisión lista: ${EMAIL} (must_change_password=false)`);
} finally {
  await pool.end();
}
