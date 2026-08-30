import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") || "");

  if (password !== env.adminPassword) {
    return NextResponse.redirect(new URL("/login?erro=1", env.appUrl), { status: 303 });
  }

  const res = NextResponse.redirect(new URL("/", env.appUrl), { status: 303 });
  res.cookies.set(SESSION_COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
