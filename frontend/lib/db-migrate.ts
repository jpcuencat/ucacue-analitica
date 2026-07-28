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

  -- Rate limiting de login (OWASP A07): intentos fallidos por email+ip.
  CREATE TABLE IF NOT EXISTS login_attempts (
    id           BIGSERIAL   PRIMARY KEY,
    email        VARCHAR(255) NOT NULL,
    ip           VARCHAR(64)  NOT NULL,
    attempted_at TIMESTAMPTZ  DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_login_attempts_lookup
    ON login_attempts (email, ip, attempted_at);

  -- Envío de reportes a WhatsApp (Cloud API oficial).
  -- Destinatarios autorizados: teléfono en E.164 sin '+' (solo dígitos).
  CREATE TABLE IF NOT EXISTS wa_recipients (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre            VARCHAR(200) NOT NULL,
    telefono          VARCHAR(20)  UNIQUE NOT NULL,
    activo            BOOLEAN      NOT NULL DEFAULT TRUE,
    consentimiento_at TIMESTAMPTZ,
    created_by        VARCHAR(255),
    created_at        TIMESTAMPTZ  DEFAULT NOW()
  );

  -- Reportes programados: una pregunta que se corre y se envía en un horario.
  CREATE TABLE IF NOT EXISTS wa_reports (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre            VARCHAR(200) NOT NULL,
    pregunta          TEXT         NOT NULL,
    destinatarios     UUID[]       NOT NULL DEFAULT '{}',
    cron              VARCHAR(100),
    activo            BOOLEAN      NOT NULL DEFAULT TRUE,
    ultima_ejecucion  TIMESTAMPTZ,
    proxima_ejecucion TIMESTAMPTZ,
    created_by        VARCHAR(255),
    created_at        TIMESTAMPTZ  DEFAULT NOW()
  );

  -- Auditoría de cada envío (on-demand y programado).
  CREATE TABLE IF NOT EXISTS wa_send_log (
    id            BIGSERIAL   PRIMARY KEY,
    report_id     UUID        REFERENCES wa_reports(id) ON DELETE SET NULL,
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
