import { createHmac } from "node:crypto";

// Aviso de handoff ao OpenBot (webhook assinado). Sem imports de app de propósito:
// roda isolado nos testes (scripts/test-handoff-webhook.ts).
//
// Request: POST JSON
//   { type: "prospect_handoff", occurredAt: <ISO>, data: { username, aparelho_atual,
//     modelo_desejado, motivo, ultima_mensagem, wa_link } }
// Headers:
//   x-openbot-timestamp   unix em segundos
//   x-openbot-delivery-id único por evento (aqui: id da transição), [A-Za-z0-9._:-], até 256
//   x-openbot-signature   "sha256=" + hex(HMAC-SHA256(secret, `${timestamp}.${deliveryId}.${rawBody}`))
// Respostas: 202 aceito · 200 duplicado (ok) · 503 tentar depois (1 retry curto) · 401/400 só loga.

export type HandoffData = {
  username: string;
  aparelho_atual: string;
  modelo_desejado: string;
  motivo: string;
  ultima_mensagem: string;
  wa_link: string;
};

export type HandoffConfig = { url: string | null; secret: string | null };
export type HandoffResult = "sent" | "duplicate" | "skipped" | "retry_failed" | "rejected" | "error";

export const HANDOFF_TIMEOUT_MS = 4000;
export const HANDOFF_RETRY_DELAY_MS = 800;

const ID_OK = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;

// Garante um delivery id válido (começa com letra/dígito, só [A-Za-z0-9._:-], <= 256).
export function normalizeDeliveryId(id: string): string {
  const cleaned = String(id).replace(/[^A-Za-z0-9._:-]/g, "-").replace(/^[^A-Za-z0-9]+/, "").slice(0, 256);
  return ID_OK.test(cleaned) ? cleaned : `d${Date.now()}`;
}

export function signHandoff(secret: string, timestamp: string, deliveryId: string, rawBody: string): string {
  return "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${deliveryId}.${rawBody}`).digest("hex");
}

const cut = (s: string | undefined | null, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export function buildHandoffRequest(
  secret: string,
  deliveryId: string,
  data: HandoffData,
  now: Date
): { rawBody: string; headers: Record<string, string> } {
  const clean: HandoffData = {
    username: cut(data.username, 60),
    aparelho_atual: cut(data.aparelho_atual, 120),
    modelo_desejado: cut(data.modelo_desejado, 120),
    motivo: cut(data.motivo, 300),
    ultima_mensagem: cut(data.ultima_mensagem, 300),
    wa_link: data.wa_link ?? "",
  };
  const rawBody = JSON.stringify({ type: "prospect_handoff", occurredAt: now.toISOString(), data: clean });
  const id = normalizeDeliveryId(deliveryId);
  const timestamp = String(Math.floor(now.getTime() / 1000));
  return {
    rawBody,
    headers: {
      "Content-Type": "application/json",
      "x-openbot-timestamp": timestamp,
      "x-openbot-delivery-id": id,
      "x-openbot-signature": signHandoff(secret, timestamp, id, rawBody),
    },
  };
}

async function postOnce(url: string, rawBody: string, headers: Record<string, string>, fetchImpl: typeof fetch) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HANDOFF_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { method: "POST", headers, body: rawBody, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Nunca lança e nunca derruba o webhook do Instagram. Sem URL/segredo: não envia ("skipped").
export async function sendHandoffWebhook(
  cfg: HandoffConfig,
  input: { deliveryId: string; data: HandoffData; now?: Date },
  deps: { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; log?: (msg: string) => void } = {}
): Promise<HandoffResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = deps.log ?? ((m: string) => console.error(m));
  if (!cfg.url || !cfg.secret) return "skipped";

  try {
    // Timestamp novo a cada tentativa (a assinatura cobre o timestamp).
    for (let attempt = 1; attempt <= 2; attempt++) {
      const { rawBody, headers } = buildHandoffRequest(cfg.secret, input.deliveryId, input.data, input.now ?? new Date());
      const res = await postOnce(cfg.url, rawBody, headers, fetchImpl);
      if (res.status === 202) return "sent";
      if (res.status === 200) return "duplicate";
      if (res.status === 503) {
        if (attempt === 1) { await sleep(HANDOFF_RETRY_DELAY_MS); continue; }
        log(`[handoff-webhook] 503 de novo após o retry (delivery ${headers["x-openbot-delivery-id"]}); desisti`);
        return "retry_failed";
      }
      log(`[handoff-webhook] resposta ${res.status} (delivery ${headers["x-openbot-delivery-id"]}); ${res.status === 401 || res.status === 400 ? "rejeitado" : "inesperado"}`);
      return res.status === 401 || res.status === 400 ? "rejected" : "error";
    }
    return "error";
  } catch (err) {
    log(`[handoff-webhook] falha de rede: ${String(err).slice(0, 200)}`);
    return "error";
  }
}
