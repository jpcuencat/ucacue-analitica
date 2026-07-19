import { cookies } from "next/headers";
import { COOKIE_NAME, verifyToken } from "@/lib/auth";
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
  return <Chat userEmail={email} isWidget={isWidget} />;
}
