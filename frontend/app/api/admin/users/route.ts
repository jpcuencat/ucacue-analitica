import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { isAdmin, genTempPassword, normalizarEmail } from "@/lib/admin";
import {
  listUsers,
  adminCreateUser,
  adminResetPassword,
  adminDeleteUser,
} from "@/lib/db-users";

// Solo administradores (ADMIN_EMAILS) pueden gestionar usuarios.
async function requireAdmin(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyToken(token) : null;
  // Solo un token de SESIÓN real (firmado, sin claim `purpose`). Descarta
  // tokens de propósito único como el de cambio de clave, que también llevan email.
  if (!payload || payload.purpose) return null;
  const email = (payload.email as string) ?? null;
  return isAdmin(email) ? email : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  return NextResponse.json(await listUsers());
}

// Alta: crea la cuenta con clave temporal aleatoria (se devuelve UNA vez).
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  const correo = normalizarEmail(email ?? "");
  if (!EMAIL_RE.test(correo)) return NextResponse.json({ error: "Correo inválido." }, { status: 400 });

  const tempPassword = genTempPassword();
  const estado = await adminCreateUser(correo, tempPassword);
  if (estado === "exists") {
    return NextResponse.json({ error: "Ese usuario ya existe. Usa 'Resetear clave' si quieres una nueva." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, email: correo, tempPassword });
}

// Resetear clave: nueva temporal + must_change_password = TRUE.
export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  const correo = normalizarEmail(email ?? "");
  if (!correo) return NextResponse.json({ error: "email requerido" }, { status: 400 });

  const tempPassword = genTempPassword();
  const ok = await adminResetPassword(correo, tempPassword);
  if (!ok) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true, email: correo, tempPassword });
}

export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const correo = normalizarEmail(searchParams.get("email") ?? "");
  if (!correo) return NextResponse.json({ error: "email requerido" }, { status: 400 });
  if (correo === admin.toLowerCase()) {
    return NextResponse.json({ error: "No puedes eliminar tu propia cuenta de administrador." }, { status: 400 });
  }
  const ok = await adminDeleteUser(correo);
  if (!ok) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
