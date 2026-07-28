import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { sendHelloWorld, waConfigurado } from "@/lib/whatsapp";
import { logSend, normalizarTelefono } from "@/lib/wa-db";

// Smoke test de la tubería de WhatsApp: envía la plantilla `hello_world`
// (aprobada por Meta) a un número. Sirve para validar credenciales/token
// ANTES de que se apruebe la plantilla de reporte propia.
// Uso: POST /api/wa/test  { "to": "5939XXXXXXXX" }
export async function POST(req: Request) {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyToken(token) : null;
  if (!payload?.email) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!waConfigurado()) {
    return NextResponse.json(
      { error: "WhatsApp no configurado (faltan WA_PHONE_NUMBER_ID / WA_TOKEN)." },
      { status: 503 },
    );
  }

  const { to } = (await req.json().catch(() => ({}))) as { to?: string };
  const telefono = normalizarTelefono(to ?? "");
  if (telefono.length < 8) {
    return NextResponse.json(
      { error: "Número inválido. Usa formato internacional, ej. 5939XXXXXXXX." },
      { status: 400 },
    );
  }

  const result = await sendHelloWorld(telefono);
  await logSend({
    pregunta: "[smoke test hello_world]",
    telefono,
    estado: result.ok ? "enviado" : "error",
    waMessageId: result.ok ? result.messageId : null,
    error: result.ok ? null : result.error,
  });

  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true, messageId: result.messageId });
}
