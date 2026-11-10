// Teste do aviso de handoff ao OpenBot: assinatura (vetor calculado à parte com Python/hmac),
// formato do request e tratamento das respostas 202/200/503/401/400/rede.
// Rodar: node --experimental-strip-types scripts/test-handoff-webhook.ts
import assert from "node:assert/strict";
import {
  buildHandoffRequest, normalizeDeliveryId, sendHandoffWebhook, signHandoff,
  type HandoffData,
} from "../lib/handoff-webhook.ts";

const out: string[] = [];
const ok = (n: string) => out.push(`OK  ${n}`);

// 1) Vetor de referência: HMAC-SHA256 calculado FORA deste código (python hmac)
const VEC = "a926c72e1d9050ad558cfc599f11cecc0cc038fb4c99ae749f95aba637575e1d";
const body = '{"type":"prospect_handoff","occurredAt":"2026-11-10T16:00:00.000Z","data":{"username":"lead_exemplo"}}';
assert.equal(
  signHandoff("segredo-de-teste", "1794326400", "ho-3f1c2b9e-0000-4000-8000-123456789abc", body),
  "sha256=" + VEC
);
ok("assinatura bate com o vetor de referência (HMAC-SHA256 de `timestamp.deliveryId.rawBody`, prefixo sha256=)");

// 2) Qualquer byte alterado muda a assinatura (corpo, id, timestamp, segredo)
const base = signHandoff("s", "1", "a", "b");
assert.notEqual(base, signHandoff("s", "1", "a", "c")); assert.notEqual(base, signHandoff("s", "1", "x", "b"));
assert.notEqual(base, signHandoff("s", "2", "a", "b")); assert.notEqual(base, signHandoff("t", "1", "a", "b"));
ok("corpo, delivery id, timestamp ou segredo diferentes => assinatura diferente");

// 3) Formato do request
const data: HandoffData = {
  username: "lead_exemplo", aparelho_atual: "iPhone 13", modelo_desejado: "16 Pro de 256",
  motivo: "Qualificado (prefere lacrado); handoff para o WhatsApp", ultima_mensagem: "Prefiro lacrado",
  wa_link: "https://wa.me/5511900000000?text=Fala%20Gui",
};
const now = new Date("2026-11-10T16:00:00Z");
const req = buildHandoffRequest("segredo", "ho-abc-123", data, now);
const parsed = JSON.parse(req.rawBody);
assert.deepEqual(Object.keys(parsed), ["type", "occurredAt", "data"]);
assert.equal(parsed.type, "prospect_handoff"); assert.equal(parsed.occurredAt, "2026-11-10T16:00:00.000Z");
assert.deepEqual(Object.keys(parsed.data), ["username", "aparelho_atual", "modelo_desejado", "motivo", "ultima_mensagem", "wa_link"]);
assert.equal(req.headers["x-openbot-timestamp"], String(Math.floor(now.getTime() / 1000)));
assert.equal(req.headers["x-openbot-delivery-id"], "ho-abc-123");
assert.equal(req.headers["x-openbot-signature"], signHandoff("segredo", req.headers["x-openbot-timestamp"], "ho-abc-123", req.rawBody));
ok("request: JSON {type, occurredAt, data{6 campos}} + headers timestamp / delivery-id / signature corretos");

// 4) delivery id sempre válido
for (const [inp, exp] of [["ho-uuid-1", "ho-uuid-1"], ["-_x", "x"], ["a b/c", "a-b-c"], ["é!ok", "ok"]] as const) assert.equal(normalizeDeliveryId(inp), exp);
assert.match(normalizeDeliveryId("x".repeat(400)), /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/);
assert.equal(normalizeDeliveryId("x".repeat(400)).length, 256);
ok("delivery id normalizado: começa com letra/dígito, só [A-Za-z0-9._:-], máx. 256");

// 5) Respostas do OpenBot
const cfg = { url: "https://exemplo.test/hook", secret: "segredo" };
const mk = (...statuses: number[]) => {
  const calls: Array<{ headers: Record<string, string>; body: string }> = [];
  const f = (async (_u: unknown, init: RequestInit) => {
    calls.push({ headers: init.headers as Record<string, string>, body: String(init.body) });
    const s = statuses[Math.min(calls.length - 1, statuses.length - 1)];
    if (s === 0) throw new TypeError("fetch failed");
    return new Response("", { status: s });
  }) as unknown as typeof fetch;
  return { f, calls };
};
const logs: string[] = [];
const deps = (f: typeof fetch) => ({ fetchImpl: f, sleep: async () => {}, log: (m: string) => logs.push(m) });
const run = (f: typeof fetch) => sendHandoffWebhook(cfg, { deliveryId: "ho-1", data, now }, deps(f));

{ const { f, calls } = mk(202); assert.equal(await run(f), "sent"); assert.equal(calls.length, 1); ok("202 aceito => 'sent', 1 chamada"); }
{ const { f, calls } = mk(200); assert.equal(await run(f), "duplicate"); assert.equal(calls.length, 1); ok("200 duplicado => ok, sem retry"); }
{ const { f, calls } = mk(503, 202); assert.equal(await run(f), "sent"); assert.equal(calls.length, 2); assert.equal(calls[0].headers["x-openbot-delivery-id"], calls[1].headers["x-openbot-delivery-id"]); ok("503 depois 202 => 1 retry curto, mesmo delivery id"); }
{ const { f, calls } = mk(503, 503); assert.equal(await run(f), "retry_failed"); assert.equal(calls.length, 2); ok("503 duas vezes => desiste após 1 retry (sem travar)"); }
{ const { f, calls } = mk(401); logs.length = 0; assert.equal(await run(f), "rejected"); assert.equal(calls.length, 1); assert.ok(logs.some((l) => l.includes("401"))); ok("401 => loga o erro, sem retry"); }
{ const { f, calls } = mk(400); logs.length = 0; assert.equal(await run(f), "rejected"); assert.equal(calls.length, 1); assert.ok(logs.some((l) => l.includes("400"))); ok("400 => loga o erro, sem retry"); }
{ const { f } = mk(0); assert.equal(await run(f), "error"); ok("rede caiu => 'error', não lança"); }
{ const { f, calls } = mk(202); assert.equal(await sendHandoffWebhook({ url: null, secret: null }, { deliveryId: "x", data, now }, deps(f)), "skipped"); assert.equal(calls.length, 0); ok("sem URL/segredo => não envia (skipped)"); }
{ const { f, calls } = mk(202); assert.equal(await sendHandoffWebhook({ url: cfg.url, secret: null }, { deliveryId: "x", data, now }, deps(f)), "skipped"); assert.equal(calls.length, 0); ok("só URL sem segredo => não envia (skipped)"); }
{ logs.length = 0; const { f } = mk(500); assert.equal(await run(f), "error"); assert.ok(!logs.join(" ").includes("segredo")); ok("segredo nunca aparece nos logs"); }

console.log(out.join("\n"));
console.log(`\n${out.length} verificações do webhook passaram`);
