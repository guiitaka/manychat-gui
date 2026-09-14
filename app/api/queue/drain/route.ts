import { NextResponse } from "next/server";
import { cronAuthorized, isLoggedIn } from "@/lib/auth";
import { drainQueue, reprocessFailedWebhooks } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(req: Request) {
  if (!cronAuthorized(req) && !(await isLoggedIn())) {
    return new Response("Não autorizado", { status: 401 });
  }
  const limit = Number(new URL(req.url).searchParams.get("limit") || 20);
  // Antes de drenar: webhooks que falharam viram itens na fila e já saem neste ciclo.
  const reprocessed = await reprocessFailedWebhooks().catch((err) => {
    console.error("drain: falha ao reprocessar webhooks", err);
    return 0;
  });
  const result = await drainQueue(Math.min(Math.max(limit, 1), 50));
  return NextResponse.json({ ...result, reprocessed });
}

export const GET = run;
export const POST = run;
