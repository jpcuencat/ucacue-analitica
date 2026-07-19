import { headers } from "next/headers";

// HTTPS detection behind proxies: Cloudflare tunnel may send x-forwarded-proto
// (possibly a list, e.g. "https,http") and/or cf-visitor: {"scheme":"https"}.
// Chrome treats localhost as a secure context, so it also counts as secure.
export async function isSecureRequest(): Promise<boolean> {
  const hdrs = await headers();
  const host = hdrs.get("host") ?? "";
  const xfp = hdrs.get("x-forwarded-proto") ?? "";
  const cfVisitor = hdrs.get("cf-visitor") ?? "";
  const secure =
    xfp.split(",").some((p) => p.trim() === "https") ||
    cfVisitor.includes("https") ||
    /^localhost(:\d+)?$/.test(host);
  console.log(
    `[auth-cookie] host=${host} xfp=${xfp || "-"} cf-visitor=${cfVisitor || "-"} → secure=${secure}`,
  );
  return secure;
}

// Atributos de cookie de sesión/autenticación coherentes en toda la app:
// SameSite=None + Secure + Partitioned para iframes cross-site cuando hay HTTPS.
export function authCookieOptions(secure: boolean, maxAge: number) {
  return {
    httpOnly: true,
    sameSite: secure ? ("none" as const) : ("lax" as const),
    secure,
    partitioned: secure,
    maxAge,
    path: "/",
  };
}
