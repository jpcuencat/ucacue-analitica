import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getUserIdByEmail } from "@/lib/db-users";
import { getPool } from "@/lib/db";

async function getAuthUserId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload?.email) return null;
  return getUserIdByEmail(payload.email as string);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  await getPool().query(
    "DELETE FROM threads WHERE id = $1 AND user_id = $2",
    [id, userId],
  );

  return NextResponse.json({ ok: true });
}
