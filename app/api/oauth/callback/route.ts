import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { db } from "@/lib/supabase";
import { exchangeCodeForShortToken, exchangeForLongToken, getMe, subscribeApp } from "@/lib/ig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const error = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (error) return fail(error);

  // A Meta devolve o code com um "#_" grudado no fim.
  const code = (url.searchParams.get("code") || "").replace(/#_$/, "");
  if (!code) return fail("Nenhum code recebido do Instagram");

  try {
    const redirectUri = `${env.appUrl}/api/oauth/callback`;

    const short = await exchangeCodeForShortToken(code, redirectUri);
    const long = await exchangeForLongToken(short.access_token);
    const me = await getMe(long.access_token);

    const igUserId = String(me.user_id || me.id || short.user_id);
    const expiresAt = new Date(Date.now() + (long.expires_in || 5184000) * 1000).toISOString();

    await db()
      .from("config")
      .update({
        ig_user_id: igUserId,
        ig_username: me.username ?? null,
        ig_name: me.name ?? null,
        profile_picture_url: me.profile_picture_url ?? null,
        access_token: long.access_token,
        token_expires_at: expiresAt,
        token_refreshed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    // Assina os webhooks da conta (comments + messages)
    let subscribeNote = "ok";
    try {
      await subscribeApp(igUserId, long.access_token);
    } catch (e) {
      subscribeNote = String(e).slice(0, 200);
    }

    const done = new URL(`${env.appUrl}/`);
    done.searchParams.set("conectado", me.username || igUserId);
    if (subscribeNote !== "ok") done.searchParams.set("aviso", subscribeNote);
    return NextResponse.redirect(done.toString());
  } catch (e) {
    return fail(String(e));
  }
}

function fail(msg: string) {
  const url = new URL(`${env.appUrl}/`);
  url.searchParams.set("erro", msg.slice(0, 300));
  return NextResponse.redirect(url.toString());
}
