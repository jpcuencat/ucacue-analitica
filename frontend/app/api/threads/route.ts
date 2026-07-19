import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getUserIdByEmail } from "@/lib/db-users";
import { getPool } from "@/lib/db";

async function getAuthUserId(): Promise<string | null> {
  try {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    if (!token) {
      console.warn("[threads] Sin cookie ucacue_session");
      return null;
    }
    const payload = await verifyToken(token);
    if (!payload?.email) {
      console.warn("[threads] Token inválido o expirado");
      return null;
    }
    const userId = await getUserIdByEmail(payload.email as string);
    if (!userId) {
      console.warn("[threads] Usuario no encontrado en DB:", payload.email);
    }
    return userId;
  } catch (err) {
    console.error("[threads] Error en getAuthUserId:", (err as Error).message);
    return null;
  }
}

export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { rows } = await getPool().query<{ id: string; title: string; created_at: string }>(
    `SELECT id, title, created_at
     FROM threads
     WHERE user_id = $1
     ORDER BY updated_at DESC
     LIMIT 50`,
    [userId],
  );

  return NextResponse.json(
    rows.map((r) => ({ id: r.id, title: r.title, createdAt: r.created_at })),
  );
}

export async function POST(req: Request) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, title } = (await req.json()) as { id: string; title?: string };
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  await getPool().query(
    `INSERT INTO threads (id, user_id, title, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (id) DO UPDATE SET title = $3, updated_at = NOW()`,
    [id, userId, (title ?? "Nueva conversación").slice(0, 500)],
  );

  return NextResponse.json({ ok: true });
}
