import { NextResponse, after } from "next/server";
import crypto from "node:crypto";
import { env } from "@/lib/env";
import { processWebhookPayload, saveFailedWebhook, drainQueue, logEvent, type WebhookBody } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ------------------------------------------------------------
// GET: handshake de verificação da Meta
// ------------------------------------------------------------
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === env.igVerifyToken && challenge) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

// ------------------------------------------------------------
// POST: eventos (comments / messages)
// ------------------------------------------------------------
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-hub-signature-256") || "";

  if (!verifySignature(raw, signature)) {
    return new Response("Assinatura inválida", { status: 401 });
  }

  // Responder rápido é obrigatório: a Meta desativa webhooks lentos.
  // O processamento pesado vai para after().
  after(async () => {
    let body: WebhookBody;
    try {
      body = JSON.parse(raw);
    } catch (err) {
      await logEvent({ kind: "erro", note: `JSON inválido: ${String(err).slice(0, 880)}` }).catch(() => {});
      return;
    }

    try {
      await processWebhookPayload(body);
    } catch (err) {
      // A Meta já recebeu 200 e não reenvia: guarda o payload para o cron reprocessar.
      console.error("webhook: falha ao processar evento", err);
      await saveFailedWebhook(body, err).catch((saveErr) => {
        // Último recurso: o payload fica no log da Vercel para reprocessar à mão.
        console.error("webhook: payload não salvo", String(saveErr), raw);
      });
      return;
    }

    try {
      await drainQueue(20); // envio praticamente instantâneo, com a trava atômica protegendo
    } catch (err) {
      // O cron drena a cada minuto; aqui só registramos.
      console.error("webhook: falha ao drenar a fila", err);
      await logEvent({ kind: "erro", note: String(err).slice(0, 900) }).catch(() => {});
    }
  });

  return NextResponse.json({ ok: true });
}

function verifySignature(raw: string, header: string): boolean {
  if (!header.startsWith("sha256=")) return false;
  const expected = crypto
    .createHmac("sha256", env.igAppSecret)
    .update(raw, "utf8")
    .digest("hex");
  const received = header.slice("sha256=".length);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(a, b);
}
