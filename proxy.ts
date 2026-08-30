import { NextResponse, type NextRequest } from "next/server";

// Next 16: o antigo middleware.ts virou proxy.ts.
// Aqui só barramos a entrada; a validação forte do cookie acontece no servidor.
const PUBLIC = ["/login", "/privacidade", "/exclusao-de-dados", "/api"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  if (!req.cookies.get("mcg_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
