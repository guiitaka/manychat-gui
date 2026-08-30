import crypto from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./env";

export const SESSION_COOKIE = "mcg_session";

// Token derivado da senha: se a senha muda, todas as sessões caem.
export function sessionToken(): string {
  return crypto.createHash("sha256").update(`mcg::${env.adminPassword}`).digest("hex");
}

export async function isLoggedIn(): Promise<boolean> {
  const jar = await cookies(); // Next 16: cookies() é assíncrono
  const value = jar.get(SESSION_COOKIE)?.value;
  if (!value) return false;
  const expected = sessionToken();
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Autorização das rotas de máquina (pg_cron do Supabase)
export function cronAuthorized(req: Request): boolean {
  const header = req.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const query = new URL(req.url).searchParams.get("key") || "";
  const provided = bearer || query;
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(env.cronSecret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
