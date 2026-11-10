// Teste simulado (sem rede, sem Supabase, sem DM real) dos 3 casos pedidos.
// Rodar: node --experimental-strip-types scripts/test-follow-gate.ts
import assert from "node:assert/strict";
import { fetchFollowStatus, runFollowGate, VIP_EVENT, MAX_ASK_FOLLOW_PER_DAY } from "../lib/follow-check.ts";
import type { FollowGateDeps } from "../lib/follow-check.ts";

const BASE = "https://graph.instagram.test/v99.0";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function makeDeps(fakeFetch: typeof fetch, opts: { confirmed?: boolean; asked?: number; token?: string | null } = {}) {
  const calls = { confirm: 0, ask: 0, logs: [] as Array<[string, string, string | undefined]> };
  const deps: FollowGateDeps = {
    check: () => fetchFollowStatus(BASE, "IGSID1", opts.token === undefined ? "TOKEN" : opts.token, fakeFetch),
    alreadyConfirmed: async () => opts.confirmed ?? false,
    askedLast24h: async () => opts.asked ?? 0,
    enqueueConfirm: async () => { calls.confirm++; return 1; },
    enqueueAskFollow: async () => { calls.ask++; },
    log: async (k, n, u) => { calls.logs.push([k, n, u]); },
  };
  return { deps, calls };
}

let urlSeen = "";
const spy = (res: () => Response | Promise<Response>): typeof fetch =>
  (async (input: RequestInfo | URL) => { urlSeen = String(input); return res(); }) as typeof fetch;

const results: string[] = [];
async function t(name: string, fn: () => Promise<void>) {
  await fn();
  results.push(`OK  ${name}`);
}

await t("1) SEGUE -> libera follow-ups (Fechou! Você tá na lista VIP…), registra vip_confirmado", async () => {
  const { deps, calls } = makeDeps(spy(() => json({ username: "prodyang", is_user_follow_business: true })));
  assert.equal(await runFollowGate(deps), "confirmed");
  assert.equal(calls.confirm, 1); assert.equal(calls.ask, 0);
  assert.deepEqual(calls.logs[0].slice(0, 1), [VIP_EVENT.confirmed]);
  assert.equal(calls.logs[0][2], "prodyang");
  assert.match(urlSeen, /fields=username%2Cis_user_follow_business/);
});

await t("2) NÃO SEGUE -> pede para seguir com botão de novo, nada liberado", async () => {
  const { deps, calls } = makeDeps(spy(() => json({ username: "fulano", is_user_follow_business: false })));
  assert.equal(await runFollowGate(deps), "asked");
  assert.equal(calls.confirm, 0); assert.equal(calls.ask, 1);
  assert.equal(calls.logs[0][0], VIP_EVENT.notFollowing);
});

await t("3a) ERRO DA API (HTTP 500) -> trata como não segue, loga erro, nada liberado", async () => {
  const { deps, calls } = makeDeps(spy(() => new Response("boom", { status: 500 })));
  assert.equal(await runFollowGate(deps), "asked");
  assert.equal(calls.confirm, 0); assert.equal(calls.ask, 1);
  assert.equal(calls.logs[0][0], VIP_EVENT.checkError);
  assert.match(calls.logs[0][1], /HTTP 500/);
});

await t("3b) CAMPO AUSENTE na resposta -> trata como não segue", async () => {
  const { deps, calls } = makeDeps(spy(() => json({ username: "x" })));
  assert.equal(await runFollowGate(deps), "asked");
  assert.equal(calls.confirm, 0);
  assert.match(calls.logs[0][1], /campo is_user_follow_business ausente/);
});

await t("3c) REDE CAIU (fetch lança) -> trata como não segue", async () => {
  const { deps, calls } = makeDeps((async () => { throw new TypeError("fetch failed"); }) as typeof fetch);
  assert.equal(await runFollowGate(deps), "asked");
  assert.equal(calls.confirm, 0);
  assert.match(calls.logs[0][1], /falha de rede/);
});

await t("3d) SEM TOKEN -> trata como não segue (nem chama a API)", async () => {
  let called = false;
  const { deps, calls } = makeDeps(spy(() => { called = true; return json({}); }), { token: null });
  assert.equal(await runFollowGate(deps), "asked");
  assert.equal(called, false); assert.equal(calls.confirm, 0);
});

await t("3e) valor não-booleano ('true' string) NÃO libera", async () => {
  const { deps, calls } = makeDeps(spy(() => json({ is_user_follow_business: "true" })));
  assert.equal(await runFollowGate(deps), "asked");
  assert.equal(calls.confirm, 0);
});

await t("4) token nunca aparece nas mensagens de erro/log", async () => {
  const { deps, calls } = makeDeps(spy(() => new Response("bad", { status: 400 })), { token: "SEGREDO123" });
  await runFollowGate(deps);
  assert.ok(!calls.logs.some(([, n]) => n.includes("SEGREDO123")));
});

await t("5) já confirmado antes -> não chama API nem reenvia", async () => {
  let called = false;
  const { deps, calls } = makeDeps(spy(() => { called = true; return json({}); }), { confirmed: true });
  assert.equal(await runFollowGate(deps), "already_confirmed");
  assert.equal(called, false); assert.equal(calls.confirm + calls.ask, 0);
});

await t(`6) limite de ${MAX_ASK_FOLLOW_PER_DAY} pedidos/24h -> suprime o pedido (anti-spam)`, async () => {
  const { deps, calls } = makeDeps(spy(() => json({ is_user_follow_business: false })), { asked: MAX_ASK_FOLLOW_PER_DAY });
  assert.equal(await runFollowGate(deps), "ask_suppressed");
  assert.equal(calls.ask, 0); assert.equal(calls.logs[0][0], VIP_EVENT.askSuppressed);
});

console.log(results.join("\n"));
console.log(`\n${results.length} cenários passaram`);
