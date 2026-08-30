import { NextResponse } from "next/server";
import { cronAuthorized, isLoggedIn } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { getConfig } from "@/lib/engine";
import { refreshLongToken } from "@/lib/ig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function run(req: Request) {
  if (!cronAuthorized(req) && !(await isLoggedIn())) {
    return new Response("Não autorizado", { status: 401 });
  }

  const cfg = await getConfig();
  if (!cfg.access_token) {
    return NextResponse.json({ ok: false, note: "nenhuma conta conectada" });
  }

  try {
    const res = await refreshLongToken(cfg.access_token);
    const expiresAt = new Date(Date.now() + (res.expires_in || 5184000) * 1000).toISOString();
    await db()
      .from("config")
      .update({
        access_token: res.access_token,
        token_expires_at: expiresAt,
        token_refreshed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    return NextResponse.json({ ok: true, expires_at: expiresAt });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 400) }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
