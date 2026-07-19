import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const COOKIE_NAME = "ucacue_session";
// Cookie de propósito único para el cambio de contraseña obligatorio:
// NO es una sesión — solo autoriza a completar el cambio, y expira rápido.
const PWC_COOKIE_NAME = "ucacue_pwchange";
const EXPIRY = "8h";
const PWC_EXPIRY = "15m";

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET debe tener al menos 32 caracteres.");
  }
  return new TextEncoder().encode(secret);
}

export async function signToken(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload;
  } catch {
    return null;
  }
}

// Token de propósito único: autoriza SOLO a completar el cambio de contraseña.
// El claim purpose evita que se use como sesión (verifyToken de sesión no lo
// distingue, pero el middleware nunca ve esta cookie — vive en PWC_COOKIE_NAME).
export async function signPasswordChangeToken(email: string): Promise<string> {
  return new SignJWT({ email, purpose: "password_change" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(PWC_EXPIRY)
    .sign(getSecret());
}

export async function verifyPasswordChangeToken(token: string): Promise<string | null> {
  const payload = await verifyToken(token);
  if (!payload || payload.purpose !== "password_change") return null;
  return typeof payload.email === "string" ? payload.email : null;
}

// Valida contra DB (bcrypt). Si la DB no está disponible, cae a AUTH_USERS en env.
export async function validateCredentials(email: string, password: string): Promise<boolean> {
  try {
    const { validatePassword } = await import("./db-users");
    return await validatePassword(email, password);
  } catch {
    // Fallback a env vars si la DB no está disponible
    const multi = process.env.AUTH_USERS ?? "";
    if (multi) {
      return multi.split(",").some((pair) => {
        const [u, p] = pair.trim().split(":");
        return u === email && p === password;
      });
    }
    return email === process.env.AUTH_USER && password === process.env.AUTH_PASSWORD;
  }
}

export { COOKIE_NAME, PWC_COOKIE_NAME };
