import { db } from "./supabase";
import { env } from "./env";
import { getIgUsername } from "./ig";
import {
  runProspectTurn,
  type Decision,
  type Patch,
  type Prospect,
  type ProspectDeps,
  type Transition,
  type TurnResult,
} from "./prospect-flow";
import type { Config, Contact } from "./types";
import type { EnqueueInput } from "./engine";

// Cola entre o fluxo puro (prospect-flow.ts) e o Supabase/fila/Instagram.

type Ctx = {
  senderId: string;
  mid: string;
  text: string;
  quickPayload?: string;
  timestamp?: number;
  contact: Contact;
  cfg: Config;
  enqueue: (input: EnqueueInput) => Promise<void>;
  upsertContact: (igId: string, username?: string | null) => Promise<Contact>;
  logEvent: (row: { kind: string; ig_id?: string | null; username?: string | null; note?: string | null; matched_automation_id?: string | null; raw?: unknown }) => Promise<void>;
};

const definedOnly = <T extends Record<string, unknown>>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

function asProspect(row: Record<string, unknown>): Prospect {
  return {
    id: row.id as string,
    username: row.username as string,
    ig_id: (row.ig_id as string | null) ?? null,
    step: row.step as number,
    status: row.status as Prospect["status"],
    tags: (row.tags as string[]) ?? [],
    answers: (row.answers as Prospect["answers"]) ?? {},
    paused_until: (row.paused_until as string | null) ?? null,
    handoff_count: (row.handoff_count as number) ?? 0,
    last_mid: (row.last_mid as string) ?? "",
  };
}

// Aviso opcional ao Gui (POST JSON). Falha aqui nunca derruba o webhook.
async function postHandoffWebhook(body: unknown) {
  const url = env.handoffWebhookUrl;
  if (!url) return;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const secret = env.handoffWebhookSecret;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(secret ? { Authorization: `Bearer ${secret}` } : {}) },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) console.error(`[prospects] webhook de handoff respondeu ${res.status}`);
  } catch (err) {
    console.error(`[prospects] webhook de handoff falhou: ${String(err).slice(0, 200)}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function handleProspectMessage(ctx: Ctx): Promise<TurnResult> {
  const { senderId, cfg } = ctx;

  const deps: ProspectDeps = {
    // ig_id conhecido -> direto. Senão, só tenta casar o @ se existir alguém aguardando
    // (ig_id nulo): conversa de amigo/cliente não gasta chamada de API nem vira prospect.
    findProspect: async () => {
      const byId = await db().from("prospects").select("*").eq("ig_id", senderId).maybeSingle();
      if (byId.error) throw new Error(`prospects: ${byId.error.message}`);
      if (byId.data) return asProspect(byId.data);

      const waiting = await db().from("prospects").select("id").is("ig_id", null).limit(1);
      if (waiting.error) throw new Error(`prospects: ${waiting.error.message}`);
      if (!waiting.data || waiting.data.length === 0) return null;

      let username = ctx.contact.username?.toLowerCase() ?? null;
      if (!username) {
        username = await getIgUsername(senderId, cfg.access_token);
        if (!username) return null; // sem @ confirmado = não é prospect (silêncio)
        await ctx.upsertContact(senderId, username);
      }

      const found = await db()
        .from("prospects")
        .select("*")
        .eq("username", username.toLowerCase())
        .is("ig_id", null)
        .maybeSingle();
      if (found.error) throw new Error(`prospects: ${found.error.message}`);
      if (!found.data) return null;

      const bound = await db()
        .from("prospects")
        .update({ ig_id: senderId, updated_at: new Date().toISOString() })
        .eq("id", found.data.id)
        .is("ig_id", null)
        .select("*")
        .maybeSingle();
      if (bound.error) throw new Error(`prospects: ${bound.error.message}`);
      return bound.data ? asProspect(bound.data) : null;
    },

    enqueue: async (items) => {
      for (const it of items) {
        const m = it.message;
        await ctx.enqueue(
          m.kind === "wa"
            ? {
                kind: "link",
                contact_id: ctx.contact.id,
                recipient_ig_id: senderId,
                payload: { text: m.text, url: m.url, button: m.button },
                requires_window: true,
                delay_minutes: it.delayMinutes,
                dedupe_key: it.key,
              }
            : {
                kind: "welcome_dm",
                contact_id: ctx.contact.id,
                recipient_ig_id: senderId,
                payload: { text: m.text, quick_replies: m.quick_replies ? [...m.quick_replies] : undefined },
                requires_window: true,
                delay_minutes: it.delayMinutes,
                dedupe_key: it.key,
              }
        );
      }
    },

    commit: async (p: Prospect, patch: Patch, mid: string) => {
      const nowIso = new Date().toISOString();
      const upd: Record<string, unknown> = {
        tags: Array.from(new Set([...p.tags, ...patch.add_tags])),
        answers: { ...p.answers, ...definedOnly(patch.answers) },
        last_mid: mid,
        last_inbound_at: nowIso,
        updated_at: nowIso,
      };
      if (patch.step !== undefined) upd.step = patch.step;
      if (patch.status !== undefined) upd.status = patch.status;
      if (patch.paused_until !== undefined) upd.paused_until = patch.paused_until;
      if (patch.handoff_count !== undefined) upd.handoff_count = patch.handoff_count;

      const { data, error } = await db()
        .from("prospects")
        .update(upd)
        .eq("id", p.id)
        .eq("step", p.step)
        .eq("status", p.status)
        .eq("handoff_count", p.handoff_count)
        .neq("last_mid", mid)
        .select("id");
      if (error) throw new Error(`prospects: ${error.message}`);
      return (data || []).length > 0;
    },

    recordTransition: async (p: Prospect, t: Transition) => {
      const followup = t.followup_days
        ? new Date(Date.now() + t.followup_days * 86_400_000).toISOString().slice(0, 10)
        : null;
      const { error } = await db().from("prospect_transitions").insert({
        prospect_id: p.id,
        username: p.username,
        etapa: t.etapa,
        tags: t.tags,
        note: t.note,
        proximo_followup: followup,
      });
      if (error) throw new Error(`prospect_transitions: ${error.message}`);
    },

    notifyHandoff: async (p: Prospect, d: Decision, lastText: string) => {
      await ctx.logEvent({
        kind: "prospect_handoff",
        ig_id: senderId,
        username: p.username,
        note: `@${p.username}: ${d.transition?.note ?? "handoff"}`,
      });
      await postHandoffWebhook({
        type: "prospect_handoff",
        username: p.username,
        outcome: d.outcome,
        last_message: lastText.slice(0, 300),
        answers: { ...p.answers, ...definedOnly(d.patch.answers) },
        at: new Date().toISOString(),
      });
    },
  };

  return runProspectTurn(deps, {
    mid: ctx.mid,
    text: ctx.text,
    quickPayload: ctx.quickPayload?.startsWith("PF:") ? ctx.quickPayload : undefined,
    now: new Date(Math.min(ctx.timestamp || Date.now(), Date.now())),
    waNumber: env.whatsappNumber,
  });
}
