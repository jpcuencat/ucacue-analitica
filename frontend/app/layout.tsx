import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { COOKIE_NAME, verifyToken } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-base",
  display: "swap",
});

export const metadata: Metadata = {
  title: "UCACUE Analytics — Asistente Académico",
  description:
    "Asistente conversacional para analítica académica de la Universidad Católica de Cuenca",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyToken(token) : null;
  const email = payload?.email as string | undefined;

  return (
    <html lang="es">
      <body className={roboto.variable}>
        <div className="app-root">
          <header className="app-header">
            <span className="app-header__subtitle">Asistente Académico</span>
            {email && (
              <div className="app-header__user">
                <span className="app-header__email">{email}</span>
                <LogoutButton />
              </div>
            )}
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
