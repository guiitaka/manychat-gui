import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
].join(",");

export async function GET() {
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", env.igAppId);      // ID do app do INSTAGRAM
  url.searchParams.set("redirect_uri", `${env.appUrl}/api/oauth/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  return NextResponse.redirect(url.toString());
}
