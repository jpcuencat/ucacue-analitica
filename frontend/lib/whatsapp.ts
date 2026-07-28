// Cliente mínimo de la WhatsApp Cloud API (oficial, Meta).
// Patrón Result: nunca lanza hacia el caller; devuelve { ok, ... } para que
// el endpoint pueda registrar cada envío en wa_send_log sin try/catch disperso.

type WaConfig = {
  version: string;
  phoneId: string;
  token: string;
  templateName: string;
  templateLang: string;
};

// Lee y valida la configuración desde el entorno.
export function waConfig(): WaConfig {
  const version = process.env.WA_API_VERSION ?? "v21.0";
  const phoneId = process.env.WA_PHONE_NUMBER_ID ?? "";
  const token = process.env.WA_TOKEN ?? "";
  const templateName = process.env.WA_TEMPLATE_NAME ?? "";
  const templateLang = process.env.WA_TEMPLATE_LANG ?? "es";
  if (!phoneId || !token) {
    throw new Error("WhatsApp no configurado: faltan WA_PHONE_NUMBER_ID y/o WA_TOKEN.");
  }
  return { version, phoneId, token, templateName, templateLang };
}

// ¿Están las credenciales presentes? (para ocultar la feature en la UI si no).
export function waConfigurado(): boolean {
  return Boolean(process.env.WA_PHONE_NUMBER_ID && process.env.WA_TOKEN);
}

function graphBase(c: WaConfig): string {
  return `https://graph.facebook.com/${c.version}`;
}

// Extrae un mensaje de error legible de la respuesta de la Graph API.
function errorDeGraph(status: number, body: unknown): string {
  const e = (body as { error?: { message?: string; code?: number } })?.error;
  if (e?.message) return `Graph ${status}: ${e.message}${e.code ? ` (code ${e.code})` : ""}`;
  return `Graph ${status}: ${JSON.stringify(body).slice(0, 200)}`;
}

export type UploadResult = { ok: true; mediaId: string } | { ok: false; error: string };

// Sube una imagen (bytes) y devuelve su media id, reutilizable en un envío.
export async function uploadMedia(
  png: Buffer | Uint8Array,
  mimeType = "image/png",
): Promise<UploadResult> {
  try {
    const c = waConfig();
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mimeType);
    form.append(
      "file",
      new Blob([png as BlobPart], { type: mimeType }),
      "reporte.png",
    );
    const res = await fetch(`${graphBase(c)}/${c.phoneId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.token}` },
      body: form,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: errorDeGraph(res.status, json) };
    const id = (json as { id?: string }).id;
    if (!id) return { ok: false, error: "La subida no devolvió media id." };
    return { ok: true, mediaId: id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export type SendResult = { ok: true; messageId: string } | { ok: false; error: string };

// Envía la plantilla de reporte: header de imagen + una variable de cuerpo {{1}}.
// `imageMediaId` viene de uploadMedia(); `bodyText` es el resumen ejecutivo.
export async function sendReportTemplate(opts: {
  to: string;
  imageMediaId: string;
  bodyText: string;
  templateName?: string;
  languageCode?: string;
}): Promise<SendResult> {
  try {
    const c = waConfig();
    const name = opts.templateName ?? c.templateName;
    if (!name) return { ok: false, error: "Falta WA_TEMPLATE_NAME (nombre de la plantilla)." };
    const payload = {
      messaging_product: "whatsapp",
      to: opts.to,
      type: "template",
      template: {
        name,
        language: { code: opts.languageCode ?? c.templateLang },
        components: [
          { type: "header", parameters: [{ type: "image", image: { id: opts.imageMediaId } }] },
          { type: "body", parameters: [{ type: "text", text: opts.bodyText }] },
        ],
      },
    };
    return await postMessage(c, payload);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// Envía la plantilla `hello_world` (aprobada por Meta) — smoke test sin imagen.
export async function sendHelloWorld(to: string): Promise<SendResult> {
  try {
    const c = waConfig();
    return await postMessage(c, {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: { name: "hello_world", language: { code: "en_US" } },
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function postMessage(c: WaConfig, payload: unknown): Promise<SendResult> {
  const res = await fetch(`${graphBase(c)}/${c.phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: errorDeGraph(res.status, json) };
  const id = (json as { messages?: { id?: string }[] }).messages?.[0]?.id;
  if (!id) return { ok: false, error: "El envío no devolvió message id." };
  return { ok: true, messageId: id };
}
