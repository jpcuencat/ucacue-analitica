import { getPool } from "./db";

const SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ  DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS threads (
    id         VARCHAR(255) PRIMARY KEY,
    user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      VARCHAR(500) NOT NULL DEFAULT 'Nueva conversación',
    created_at TIMESTAMPTZ  DEFAULT NOW(),
    updated_at TIMESTAMPTZ  DEFAULT NOW()
  );

  -- Cambio de contraseña obligatorio en el primer acceso.
  ALTER TABLE users ADD COLUMN IF NOT EXISTS
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE;

  -- Envío a WhatsApp por usuario: wa_view habilita el botón "Enviar a WhatsApp"
  -- (default FALSE = nadie lo ve); telefono es el ÚNICO destino de ese usuario
  -- (su propio número, E.164 sin '+').
  ALTER TABLE users ADD COLUMN IF NOT EXISTS wa_view BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS telefono VARCHAR(20);

  -- Rate limiting de login (OWASP A07): intentos fallidos por email+ip.
  CREATE TABLE IF NOT EXISTS login_attempts (
    id           BIGSERIAL   PRIMARY KEY,
    email        VARCHAR(255) NOT NULL,
    ip           VARCHAR(64)  NOT NULL,
    attempted_at TIMESTAMPTZ  DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_login_attempts_lookup
    ON login_attempts (email, ip, attempted_at);

  -- Auditoría de cada envío de reporte por WhatsApp (Cloud API oficial).
  -- El destino de cada envío es users.telefono; no hay lista de destinatarios.
  CREATE TABLE IF NOT EXISTS wa_send_log (
    id            BIGSERIAL   PRIMARY KEY,
    pregunta      TEXT,
    telefono      VARCHAR(20) NOT NULL,
    estado        VARCHAR(20) NOT NULL,
    wa_message_id VARCHAR(120),
    error         TEXT,
    sent_at       TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_wa_send_log_sent
    ON wa_send_log (sent_at DESC);
`;

let migrated = false;

export async function runMigrations(): Promise<void> {
  if (migrated) return;
  try {
    await getPool().query(SQL);
    migrated = true;
    console.log("[db] Migraciones aplicadas.");
  } catch (err) {
    console.error("[db] Error en migraciones (no fatal — usando auth por env):", (err as Error).message);
  }
}
