"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  signToken,
  signPasswordChangeToken,
  validateCredentials,
  COOKIE_NAME,
  PWC_COOKIE_NAME,
} from "@/lib/auth";
import { isSecureRequest, authCookieOptions } from "@/lib/request-security";
import { isRateLimited, recordFailedAttempt, clearAttempts } from "@/lib/rate-limit";
import { headers } from "next/headers";

// IP real del cliente detrás del túnel Cloudflare (cf-connecting-ip) o
// proxy genérico (x-forwarded-for); "unknown" si no hay ninguno.
async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"
  );
}

export async function loginAction(formData: FormData) {
  const email = (formData.get("email") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";
  const from = (formData.get("from") as string | null) ?? "/";

  const ip = await clientIp();

  // Rate limiting (OWASP A07): frena la fuerza bruta antes de validar.
  if (await isRateLimited(email, ip)) {
    redirect(`/login?error=rate&from=${encodeURIComponent(from)}`);
  }

  if (!await validateCredentials(email, password)) {
    await recordFailedAttempt(email, ip);
    redirect(`/login?error=1&from=${encodeURIComponent(from)}`);
  }

  // Login correcto: limpiar el historial de intentos de esa combinación.
  await clearAttempts(email, ip);

  const jar = await cookies();
  const secure = await isSecureRequest();

  // Primer acceso: forzar cambio de contraseña ANTES de emitir la sesión.
  // Si la DB no está disponible (fallback a env), no se bloquea el ingreso.
  let requiresChange = false;
  try {
    const { mustChangePassword } = await import("@/lib/db-users");
    requiresChange = await mustChangePassword(email);
  } catch {
    requiresChange = false;
  }

  if (requiresChange) {
    const pwcToken = await signPasswordChangeToken(email);
    jar.set(PWC_COOKIE_NAME, pwcToken, authCookieOptions(secure, 60 * 15));
    redirect(`/cambiar-clave?from=${encodeURIComponent(from.startsWith("/") ? from : "/")}`);
  }

  const token = await signToken(email);
  // SameSite=None + Secure + Partitioned is required for cross-site iframe embedding.
  jar.set(COOKIE_NAME, token, authCookieOptions(secure, 60 * 60 * 8));

  redirect(from.startsWith("/") ? from : "/");
}

export async function logoutAction(formData: FormData) {
  const from = (formData.get("from") as string | null) ?? "/";
  const jar = await cookies();
  // Must match the same attributes used at login — Chrome rejects a Set-Cookie
  // without SameSite=None in a cross-origin iframe even when deleting (Max-Age=0).
  const secure = await isSecureRequest();
  jar.set(COOKIE_NAME, "", authCookieOptions(secure, 0));
  redirect(`/login?from=${encodeURIComponent(from.startsWith("/") ? from : "/")}`);
}
