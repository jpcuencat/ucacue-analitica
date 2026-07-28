import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { waConfigurado, uploadMedia, sendReportTemplate } from "@/lib/whatsapp";
import { getRecipientsByIds, logSend } from "@/lib/wa-db";
import { runReport, type ReportResult } from "@/lib/report-runner";
import { renderBarChartPNG, renderTextCardPNG, type VizSpec } from "@/lib/chart-image";

type Body = {
  recipientIds?: string[];
  pregunta?: string;
  texto?: string; // respuesta ya calculada en el cliente (on-demand)
  spec?: VizSpec | null;
  titulo?: string;
};

// Las variables de plantilla de WhatsApp no admiten saltos de línea ni tabs;
// reducimos la respuesta a un resumen en una sola línea (el detalle va en la
// imagen). Preferimos la "Lectura ejecutiva" si existe.
function resumenParaWhatsApp(texto: string): string {
  let t = texto;
  const m = texto.match(/lectura ejecutiva:?\s*([\s\S]*?)(?:\n\s*\n|⚠️|$)/i);
  if (m && m[1].trim().length > 30) t = m[1];
  return t
    .replace(/^\s*\|.*\|\s*$/gm, "") // filas de tablas markdown
    .replace(/\*\*(.+?)\*\*/g, "*$1*") // **negrita** → *negrita*
    .replace(/[#`>]/g, "")
    .replace(/\s*\n\s*/g, " ") // sin saltos de línea
    .replace(/ {2,}/g, " ")
    .trim()
    .slice(0, 900);
}

export async function POST(req: Request) {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyToken(token) : null;
  if (!payload?.email) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!waConfigurado()) {
    return NextResponse.json(
      { error: "WhatsApp no configurado (faltan WA_PHONE_NUMBER_ID / WA_TOKEN)." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const ids = body.recipientIds ?? [];
  if (!ids.length) return NextResponse.json({ error: "Elige al menos un destinatario." }, { status: 400 });

  const destinatarios = await getRecipientsByIds(ids);
  if (!destinatarios.length) {
    return NextResponse.json({ error: "Ningún destinatario válido/activo." }, { status: 400 });
  }

  // Texto + gráfico: usar lo ya calculado (on-demand) o correr el agente.
  let result: ReportResult;
  if (body.texto && body.texto.trim()) {
    result = { texto: body.texto, spec: body.spec ?? null };
  } else if (body.pregunta && body.pregunta.trim()) {
    try {
      result = await runReport(body.pregunta);
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 502 });
    }
  } else {
    return NextResponse.json({ error: "Falta 'texto' o 'pregunta'." }, { status: 400 });
  }

  const titulo = body.titulo ?? result.spec?.titulo ?? "Reporte de Analítica UCACUE";
  const cuerpo = resumenParaWhatsApp(result.texto) || "Reporte de analítica académica.";

  // Imagen: el gráfico si hay spec; si no, una tarjeta de texto.
  const png = result.spec
    ? renderBarChartPNG({ ...result.spec, titulo })
    : renderTextCardPNG(titulo, result.texto);

  const up = await uploadMedia(png);
  if (!up.ok) return NextResponse.json({ error: `No se pudo subir la imagen: ${up.error}` }, { status: 502 });

  // Enviar a cada destinatario (la media se reutiliza).
  const resultados = [];
  for (const d of destinatarios) {
    const r = await sendReportTemplate({ to: d.telefono, imageMediaId: up.mediaId, bodyText: cuerpo });
    await logSend({
      pregunta: body.pregunta ?? "[on-demand]",
      telefono: d.telefono,
      estado: r.ok ? "enviado" : "error",
      waMessageId: r.ok ? r.messageId : null,
      error: r.ok ? null : r.error,
    });
    resultados.push({ nombre: d.nombre, telefono: d.telefono, ok: r.ok, error: r.ok ? undefined : r.error });
  }

  const enviados = resultados.filter((r) => r.ok).length;
  return NextResponse.json({ ok: enviados > 0, enviados, total: resultados.length, resultados });
}
