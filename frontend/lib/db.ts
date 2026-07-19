import { Pool } from "pg";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL no está configurada.");
    pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30_000 });
    pool.on("error", (err) => console.error("[db] Error en pool:", err.message));
  }
  return pool;
}
