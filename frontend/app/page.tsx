import { cookies } from "next/headers";
import { COOKIE_NAME, verifyToken } from "@/lib/auth";
import { getWaProfile } from "@/lib/db-users";
import { Chat } from "@/components/Chat";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ widget?: string }>;
}) {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyToken(token) : null;
  const email = payload?.email as string | undefined;
  const params = await searchParams;
  const isWidget = params.widget === "true";

  // Botón "Enviar a WhatsApp": solo si el usuario tiene wa_view=TRUE en la DB.
  let canSend = false;
  if (email) {
    try {
      canSend = (await getWaProfile(email))?.waView ?? false;
    } catch {
      canSend = false; // DB no disponible → sin botón
    }
  }

  return <Chat userEmail={email} isWidget={isWidget} canSend={canSend} />;
}
