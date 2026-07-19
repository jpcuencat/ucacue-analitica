import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";

// /cambiar-clave valida su propio token de propósito (no la sesión).
const PUBLIC_PATHS = ["/login", "/cambiar-clave", "/widget-demo.html", "/api/"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // GET "/" without ?widget=true: redirect to the landing page.
  // Exception: iframe embeds that don't include ?widget=true get it added automatically
  // so the chat always loads in widget mode regardless of how the host app sets the src.
  if (
    req.method === "GET" &&
    pathname === "/" &&
    req.nextUrl.searchParams.get("widget") !== "true"
  ) {
    const dest = req.headers.get("Sec-Fetch-Dest");
    if (dest === "iframe") {
      return NextResponse.redirect(new URL("/?widget=true", req.url));
    }
    return NextResponse.redirect(new URL("/widget-demo.html", req.url));
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyToken(token) : null;

  if (!payload) {
    // All other protected routes (including /?widget=true): show login
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname + req.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/lg).*)"],
};
