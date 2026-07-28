import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, verifyToken } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { AdminUsers } from "./AdminUsers";

// Pantalla de administración de usuarios. Solo accesible para ADMIN_EMAILS;
// cualquier otro (o sin sesión) se redirige al inicio.
export default async function AdminPage() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyToken(token) : null;
  // Token de sesión real (sin claim `purpose`); nunca un token de cambio de clave.
  const email = payload && !payload.purpose ? ((payload.email as string) ?? null) : null;
  if (!isAdmin(email)) redirect("/");

  return <AdminUsers adminEmail={email as string} />;
}
