import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import {
  listRecipients,
  createRecipient,
  setRecipientActive,
  deleteRecipient,
} from "@/lib/wa-db";

async function authEmail(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyToken(token) : null;
  return (payload?.email as string) ?? null;
}

// Lista de destinatarios autorizados.
export async function GET() {
  if (!(await authEmail())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return NextResponse.json(await listRecipients());
}

// Alta (o reactivación) de un destinatario.
export async function POST(req: Request) {
  const email = await authEmail();
  if (!email) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { nombre, telefono } = (await req.json().catch(() => ({}))) as { nombre?: string; telefono?: string };
  try {
    const r = await createRecipient(nombre ?? "", telefono ?? "", email);
    return NextResponse.json(r);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

// Activar/desactivar.
export async function PATCH(req: Request) {
  if (!(await authEmail())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id, activo } = (await req.json().catch(() => ({}))) as { id?: string; activo?: boolean };
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  await setRecipientActive(id, Boolean(activo));
  return NextResponse.json({ ok: true });
}

// Eliminar.
export async function DELETE(req: Request) {
  if (!(await authEmail())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  await deleteRecipient(id);
  return NextResponse.json({ ok: true });
}
