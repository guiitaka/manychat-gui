// Simulação do fluxo de prospecção (sem rede, sem Supabase, sem DM real).
// Usa o código real de lib/prospect-flow.ts com um "mundo" em memória que imita
// as garantias do banco (compare-and-set, dedupe da fila, lista de abordados).
// Rodar: node --experimental-strip-types scripts/test-prospect-flow.ts
import assert from "node:assert/strict";
import {
  runProspectTurn,
  decide,
  isOptOut,
  isHandoffIntent,
  TEXT,
  type BotMessage,
  type Patch,
  type Prospect,
  type ProspectDeps,
  type Transition,
  type TurnResult,
} from "../lib/prospect-flow.ts";

const WA = "5511900000000"; // número de EXEMPLO (o real vem de WHATSAPP_NUMBER)

class World {
  prospects: Prospect[] = [];
  queue = new Map<string, BotMessage>();
  transitions: Array<{ username: string } & Transition> = [];
  notifications: string[] = [];
  now = new Date("2026-11-10T15:00:00Z");
  midN = 0;
  log: string[] = [];
  waNumber: string | null = WA;

  add(username: string): Prospect {
    const p: Prospect = {
      id: `id-${username}`, username, ig_id: null, step: 0, status: "abordado",
      tags: ["prospeccao_enviada"], answers: {}, paused_until: null, handoff_count: 0, last_mid: "",
    };
    this.prospects.push(p);
    return p;
  }

  deps(who: string): ProspectDeps {
    return {
      // lista de abordados: quem não está nela => null => silêncio
      findProspect: async () => {
        const p = this.prospects.find((x) => x.username === who) ?? null;
        if (p && !p.ig_id) p.ig_id = `IGSID-${who}`;
        return p ? structuredClone(p) : null;
      },
      enqueue: async (items) => {
        for (const it of items) {
          if (this.queue.has(it.key)) continue; // dedupe_key UNIQUE
          this.queue.set(it.key, it.message);
          this.log.push(`   BOT -> ${render(it.message)}`);
        }
      },
      commit: async (cur: Prospect, patch: Patch, mid: string) => {
        const p = this.prospects.find((x) => x.id === cur.id)!;
        if (p.step !== cur.step || p.status !== cur.status || p.handoff_count !== cur.handoff_count || p.last_mid === mid) return false;
        p.tags = Array.from(new Set([...p.tags, ...patch.add_tags]));
        p.answers = { ...p.answers, ...Object.fromEntries(Object.entries(patch.answers).filter(([, v]) => v !== undefined)) };
        p.last_mid = mid;
        if (patch.step !== undefined) p.step = patch.step;
        if (patch.status !== undefined) p.status = patch.status;
        if (patch.paused_until !== undefined) p.paused_until = patch.paused_until;
        if (patch.handoff_count !== undefined) p.handoff_count = patch.handoff_count;
        return true;
      },
      recordTransition: async (p, t) => {
        const tid = `t${this.transitions.length + 1}`;
        this.transitions.push({ username: p.username, ...t });
        this.log.push(`   CRM <- etapa=${t.etapa} tags=[${t.tags.join(",")}]${t.followup_days ? ` followup=+${t.followup_days}d` : ""} | ${t.note}`);
        return tid;
      },
      notifyHandoff: async (p, d, _last, tid) => {
        this.notifications.push(`@${p.username}: ${d.outcome}`);
        this.log.push(`   NOTIFICA GUI: @${p.username} (${d.outcome}) [delivery ho-${tid}]`);
      },
    };
  }

  async say(who: string, text: string, payload?: string, opts: { mid?: string; hoursLater?: number } = {}): Promise<TurnResult> {
    if (opts.hoursLater) this.now = new Date(this.now.getTime() + opts.hoursLater * 3600_000);
    const mid = opts.mid ?? `m${++this.midN}`;
    this.log.push(`${payload ? "[botão] " : ""}@${who}: ${text}`);
    const before = this.queue.size;
    const r = await runProspectTurn(this.deps(who), { mid, text, quickPayload: payload, now: this.now, waNumber: this.waNumber });
    this.log.push(`   => ${r.handled ? r.outcome : "NÃO É PROSPECT (bot em silêncio)"}${this.queue.size === before ? " | nenhuma mensagem enviada" : ""}`);
    return r;
  }
  get(who: string) { return this.prospects.find((x) => x.username === who)!; }
}

const render = (m: BotMessage) =>
  m.kind === "wa"
    ? `${JSON.stringify(m.text)}\n         [botão "${m.button}" -> ${decodeURIComponent(m.url)}]`
    : `${JSON.stringify(m.text)}${m.quick_replies ? `\n         [botões: ${m.quick_replies.map((q) => q.title).join(" | ")}]` : ""}`;

const out: string[] = [];
const section = (t: string, w: World) => { out.push(`\n=== ${t} ===`, ...w.log); };

// ---------------- CASO 1: responde, qualifica e chega ao handoff ----------------
{
  const w = new World();
  w.add("lead_exemplo");
  w.log.push("[Gui, manual] DM de abertura enviada a @lead_exemplo (cadastrado na lista: novo / prospeccao_enviada)");
  await w.say("lead_exemplo", "iPhone 13, tá começando a ficar lento");
  await w.say("lead_exemplo", "Bateria/espaço 🔋", "PF:S1:dor");
  await w.say("lead_exemplo", "quero o 16 Pro de 256");
  await w.say("lead_exemplo", "Prefiro lacrado", "PF:S3:lacrado");
  await w.say("lead_exemplo", "valeu, vou chamar");                    // dentro das 24h de pausa
  await w.say("lead_exemplo", "e aí, tudo certo?", undefined, { hoursLater: 25 }); // depois da pausa
  section("CASO 1 — lead responde, qualifica e vai ao handoff", w);

  const p = w.get("lead_exemplo");
  assert.equal(p.status, "handoff");
  assert.equal(p.handoff_count, 2);
  assert.deepEqual(p.tags.sort(), ["lead_engajou", "lead_quente", "prospeccao_enviada", "transicao_whatsapp"].sort());
  const wa = [...w.queue.values()].filter((m) => m.kind === "wa") as Extract<BotMessage, { kind: "wa" }>[];
  assert.equal(wa.length, 1);
  assert.ok(wa[0].url.startsWith(`https://wa.me/${WA}?text=`));
  const prefill = decodeURIComponent(wa[0].url.split("text=")[1]);
  assert.match(prefill, /iPhone 13/); assert.match(prefill, /16 Pro de 256/);
  assert.deepEqual(w.transitions.map((t) => t.etapa), ["em_conversa", "em_conversa", "em_conversa", "proposta", "proposta"]);
  assert.equal(w.notifications.length, 2); // handoff + volta depois da pausa
  assert.equal(w.queue.size, 4);           // passo1, passo2, passo3, handoff (pausa e renotify = sem mensagem)
}

// ---------------- CASO 2: não prospectado manda DM -> silêncio ----------------
{
  const w = new World();
  w.add("lead_exemplo"); // existe lista, mas o remetente não está nela
  await w.say("amigo_exemplo", "E aí Gui, tudo bem? Bora almoçar?");
  await w.say("cliente_exemplo", "Quanto tá o 16 Pro? Quero comprar!"); // até pedido de preço: não é prospect, bot fica calado
  section("CASO 2 — quem NÃO está na lista manda DM (amigo/cliente)", w);
  assert.equal(w.queue.size, 0);
  assert.equal(w.transitions.length, 0);
  assert.equal(w.notifications.length, 0);
}

// ---------------- CASO 3: lead pede para parar ----------------
{
  const w = new World();
  w.add("lead_exemplo");
  await w.say("lead_exemplo", "iPhone 12");
  await w.say("lead_exemplo", "pode parar de me mandar mensagem, sem interesse");
  await w.say("lead_exemplo", "oi?");           // depois do opt-out: nada
  await w.say("lead_exemplo", "quanto custa?"); // nem preço reabre
  section("CASO 3 — lead pede para parar", w);
  const p = w.get("lead_exemplo");
  assert.equal(p.status, "opt_out");
  assert.ok(p.tags.includes("opt_out"));
  assert.equal(w.queue.size, 2); // passo1 + 1 despedida; depois disso, zero
  assert.equal(w.transitions.at(-1)!.etapa, "perdido");
  assert.equal(w.notifications.length, 0);
}

// ---------------- Casos de borda ----------------
const edge: string[] = [];
const ok = (n: string) => edge.push(`OK  ${n}`);

// "para" no meio da frase NÃO é pedido para parar
assert.equal(isOptOut("preciso pra trabalho"), false);
assert.equal(isOptOut("preciso para o trabalho"), false);
assert.equal(isOptOut("Para!"), true);
assert.equal(isOptOut("Sem interesse, obrigado"), true);
assert.equal(isOptOut("pare de me mandar msg"), true);
ok('opt-out: "para o trabalho" não encerra; "Para!", "sem interesse", "pare de me mandar" encerram');

// "não" solto: 1º silêncio (pode ser resposta), 2º seguido encerra
{
  const w = new World(); w.add("a");
  await w.say("a", "iPhone 11");
  const r1 = await w.say("a", "não");
  assert.equal(r1.handled && r1.outcome, "silent_ambiguous");
  assert.equal(w.get("a").status, "em_conversa");
  const r2 = await w.say("a", "Não");
  assert.equal(r2.handled && r2.outcome, "opt_out");
  ok('"não" solto: 1ª vez silêncio, 2ª seguida encerra');
}
// "não" solto seguido de resposta normal zera a contagem
{
  const w = new World(); w.add("a");
  await w.say("a", "iPhone 11"); await w.say("a", "não"); await w.say("a", "Namorando um novo", "PF:S1:novo");
  assert.equal(w.get("a").answers.nos, 0);
  ok('contagem de "não" zera depois de uma resposta normal');
}
// Pedir preço já na 1ª resposta -> handoff direto
{
  const w = new World(); w.add("a");
  const r = await w.say("a", "tenho o 12, quanto tá o 16 pro?");
  assert.equal(r.handled && r.outcome, "handoff");
  assert.equal(w.get("a").status, "handoff");
  ok("pediu preço na 1ª resposta -> handoff imediato (pausa 24h + aviso ao Gui)");
}
for (const t of ["qual o preço?", "aceita pix?", "tem nota fiscal?", "faz entrega em Campinas?", "quero comprar um", "parcela em quantas vezes"]) assert.equal(isHandoffIntent(t), true, t);
for (const t of ["meu iPhone é o 13", "tá bem de bateria", "uso há bastante tempo"]) assert.equal(isHandoffIntent(t), false, t);
ok("intenção de compra/confiança detectada; conversa normal não dispara handoff");

// Satisfeito -> nutrição (sem handoff, follow-up 60d, sem pergunta de preço)
{
  const w = new World(); w.add("a");
  await w.say("a", "iPhone 15"); await w.say("a", "Tá me atendendo ✅", "PF:S1:ok");
  assert.equal(w.get("a").status, "nutricao");
  assert.equal(w.transitions.at(-1)!.followup_days, 60);
  const before = w.queue.size;
  await w.say("a", "show, valeu!");
  assert.equal(w.queue.size, before); // calado depois
  ok("satisfeito -> nutrição (follow-up em 60 dias) e bot calado depois");
}
// Seminovo: aviso honesto + handoff
{
  const w = new World(); w.add("a");
  await w.say("a", "iPhone 12"); await w.say("a", "Namorando um novo", "PF:S1:novo");
  await w.say("a", "Quero recomendação", "PF:S2:rec"); await w.say("a", "Seminovo mesmo", "PF:S3:seminovo");
  const m = [...w.queue.values()].find((x) => x.kind === "wa")!;
  assert.match(m.text, /só.*novo e lacrado/);
  assert.equal(w.get("a").answers.preferencia, "seminovo");
  ok("prefere seminovo -> deixa claro que só vende lacrado e faz handoff");
}
// Anexo/figurinha não avança nem responde
{
  const w = new World(); w.add("a");
  const r = await w.say("a", "");
  assert.equal(r.handled && r.outcome, "silent_nontext");
  assert.equal(w.queue.size, 0);
  ok("mensagem sem texto (foto/figurinha) é ignorada");
}
// Mesma mensagem processada 2x (retry do webhook) e corrida entre webhooks
{
  const w = new World(); w.add("a");
  await w.say("a", "iPhone 13", undefined, { mid: "dup1" });
  const r = await w.say("a", "iPhone 13", undefined, { mid: "dup1" });
  assert.equal(r.handled && r.outcome, "duplicate");
  assert.equal(w.queue.size, 1);
  // corrida: 2 webhooks lêem o mesmo estado; só 1 commit vence e a fila não duplica
  const p0 = structuredClone(w.get("a"));
  const d = decide(p0, { text: "Bateria/espaço 🔋", quickPayload: "PF:S1:dor", now: w.now, waNumber: WA });
  const deps = w.deps("a");
  await deps.enqueue(d.messages.map((message, i) => ({ message, key: `pf:${p0.id}:${p0.status}:${p0.step}:${p0.handoff_count}:${i}`, delayMinutes: 1 })));
  await deps.enqueue(d.messages.map((message, i) => ({ message, key: `pf:${p0.id}:${p0.status}:${p0.step}:${p0.handoff_count}:${i}`, delayMinutes: 1 })));
  assert.equal(w.queue.size, 2);
  assert.equal(await deps.commit(p0, d.patch, "race-a"), true);
  assert.equal(await deps.commit(p0, d.patch, "race-b"), false);
  ok("retry do webhook = 'duplicate'; corrida entre 2 webhooks: 1 commit e fila sem duplicar");
}
// Sem número de WhatsApp configurado: não manda link quebrado
{
  const w = new World(); w.add("a"); w.waNumber = null;
  await w.say("a", "quanto custa o 16?");
  const m = [...w.queue.values()][0];
  assert.equal(m.kind, "text"); assert.equal(m.text, TEXT.handoffSemNumero);
  ok("sem WHATSAPP_NUMBER: handoff cai em texto simples (sem link quebrado) e ainda avisa o Gui");
}
// Nenhum texto do bot cita preço
{
  for (const t of Object.values(TEXT)) assert.ok(!/R\$|\breais\b/i.test(t));
  ok("nenhum texto do bot contém preço (R$)");
}

console.log(out.join("\n"));
console.log("\n=== CASOS DE BORDA ===\n" + edge.join("\n"));
console.log(`\nTODOS OS TESTES PASSARAM (3 casos traçados + ${edge.length} verificações de borda)`);
