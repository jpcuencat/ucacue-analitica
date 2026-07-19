"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  signToken,
  verifyPasswordChangeToken,
  validateCredentials,
  COOKIE_NAME,
  PWC_COOKIE_NAME,
} from "@/lib/auth";
import { isSecureRequest, authCookieOptions } from "@/lib/request-security";

// Política mínima: 10+ caracteres con mayúscula, minúscula y dígito.
function passwordPolicyError(pwd: string): string | null {
  if (pwd.length < 10) return "corta";
  if (!/[A-Z]/.test(pwd) || !/[a-z]/.test(pwd) || !/[0-9]/.test(pwd)) return "debil";
  return null;
}

export async function changePasswordAction(formData: FormData) {
  const current = (formData.get("current") as string | null) ?? "";
  const nueva = (formData.get("nueva") as string | null) ?? "";
  const confirmar = (formData.get("confirmar") as string | null) ?? "";
  const from = (formData.get("from") as string | null) ?? "/";
  const safeFrom = from.startsWith("/") ? from : "/";
  const back = (code: string) =>
    redirect(`/cambiar-clave?error=${code}&from=${encodeURIComponent(safeFrom)}`);

  // Autorización: solo con el token de propósito emitido en el login.
  const jar = await cookies();
  const pwcToken = jar.get(PWC_COOKIE_NAME)?.value;
  const email = pwcToken ? await verifyPasswordChangeToken(pwcToken) : null;
  if (!email) {
    redirect(`/login?from=${encodeURIComponent(safeFrom)}`);
  }

  // Re-verificar la contraseña actual (el token solo prueba el login previo).
  if (!await validateCredentials(email, current)) back("actual");
  if (nueva !== confirmar) back("confirmacion");
  const policy = passwordPolicyError(nueva);
  if (policy) back(policy);
  if (nueva === current) back("igual");

  const { changePassword } = await import("@/lib/db-users");
  await changePassword(email, nueva);

  // Recién ahora se emite la sesión real; el token de propósito se invalida.
  const secure = await isSecureRequest();
  jar.set(PWC_COOKIE_NAME, "", authCookieOptions(secure, 0));
  jar.set(COOKIE_NAME, await signToken(email), authCookieOptions(secure, 60 * 60 * 8));

  redirect(safeFrom);
}
