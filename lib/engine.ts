import { db } from "./supabase";
import { matches, pickRandom } from "./match";
import {
  sendMessage,
  replyToComment,
  textMessage,
  buttonMessage,
  IgError,
} from "./ig";
import type { Automation, Config, Contact, Followup, QueueItem } from "./types";

// Limites práticos da Meta que respeitamos por conta própria.
export const HOURLY_DM_CAP = 200;   // ~200 DMs automáticas por hora
export const SEND_INTERVAL_MS = 500; // ~2 envios por segundo
const MAX_ATTEMPTS = 3;
const WINDOW_HOURS = 24;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------
// Leitura básica
// ------------------------------------------------------------
export async function getConfig(): Promise<Config> {
  const { data, error } = await db().from("config").select("*").eq("id", 1).single();
  if (error) throw new Error(`config: ${error.message}`);
  return data as unknown as Config;
}

export async function activeAutomations(): Promise<Automation[]> {
  const { data, error } = await db()
    .from("automations")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`automations: ${error.message}`);
  return (data || []) as unknown as Automation[];
}

export async function logEvent(row: {
  kind: string;
  ig_id?: string | null;
  username?: string | null;
  text?: string | null;
  comment_id?: string | null;
  media_id?: string | null;
  matched_automation_id?: string | null;
  note?: string | null;
  raw?: unknown;
}) {
  await db().from("events").insert({ ...row, raw: row.raw ?? null });
}

export async function upsertContact(igId: string, username?: string | null): Promise<Contact> {
  const { data, error } = await db()
    .from("contacts")
    .upsert(
      { ig_id: igId, ...(username ? { username } : {}), updated_at: new Date().toISOString() },
      { onConflict: "ig_id" }
    )
    .select("*")
    .single();
  if (error) throw new Error(`contacts: ${error.message}`);
  return data as unknown as Contact;
}

// ------------------------------------------------------------
// Fila
// ------------------------------------------------------------
type EnqueueInput = {
  kind: QueueItem["kind"];
  automation_id?: string | null;
  contact_id?: string | null;
  recipient_comment_id?: string | null;
  recipient_ig_id?: string | null;
  comment_id?: string | null;
  payload: QueueItem["payload"];
  requires_window: boolean;
  delay_minutes?: number;
  dedupe_key: string;
};

export async function enqueue(input: EnqueueInput) {
  const runAfter = new Date(Date.now() + (input.delay_minutes || 0) * 60_000).toISOString();
  // dedupe_key é UNIQUE: se já existe, ignoramos silenciosamente.
  const { error } = await db()
    .from("queue")
    .upsert(
      {
        kind: input.kind,
        automation_id: input.automation_id ?? null,
        contact_id: input.contact_id ?? null,
        recipient_comment_id: input.recipient_comment_id ?? null,
        recipient_ig_id: input.recipient_ig_id ?? null,
        comment_id: input.comment_id ?? null,
        payload: input.payload,
        requires_window: input.requires_window,
        run_after: runAfter,
        dedupe_key: input.dedupe_key,
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true }
    );
  if (error) throw new Error(`queue: ${error.message}`);
}

async function enqueueFollowups(contact: Contact, automationId: string) {
  const { data } = await db()
    .from("followups")
    .select("*")
    .eq("automation_id", automationId)
    .order("step", { ascending: true });
  const followups = (data || []) as unknown as Followup[];

  for (const f of followups) {
    await enqueue({
      kind: f.kind,
      automation_id: automationId,
      contact_id: contact.id,
      recipient_ig_id: contact.ig_id,
      payload: f.payload,
      requires_window: true,
      delay_minutes: f.delay_minutes,
      dedupe_key: `fu:${contact.id}:${automationId}:${f.step}`,
    });
  }
  return followups.length;
}

// ------------------------------------------------------------
// Evento: COMENTÁRIO
// ------------------------------------------------------------
export async function handleComment(value: Record<string, any>, cfg: Config) {
  const commentId: string | undefined = value?.id;
  const text: string = value?.text ?? "";
  const from = value?.from ?? {};
  const mediaId: string | undefined = value?.media?.id;

  // Ignora comentários da própria conta (inclusive as nossas respostas públicas).
  if (!from?.id || from.id === cfg.ig_user_id) {
    await logEvent({ kind: "comment", ig_id: from?.id, text, comment_id: commentId, media_id: mediaId, note: "ignorado: comentário da própria conta", raw: value });
    return;
  }
  if (!commentId) return;

  const automations = await activeAutomations();
  const automation = automations.find(
    (a) => a.trigger_comment && (!a.media_id || a.media_id === mediaId) && matches(a, text)
  );

  if (!automation) {
    await logEvent({ kind: "comment", ig_id: from.id, username: from.username, text, comment_id: commentId, media_id: mediaId, note: "sem automação correspondente", raw: value });
    return;
  }

  const contact = await upsertContact(from.id, from.username);
  await db().from("contacts").update({ last_automation_id: automation.id }).eq("id", contact.id);

  // Resposta pública opcional (sorteia entre as variações)
  const publicText = pickRandom(automation.public_replies || []);
  if (publicText) {
    await enqueue({
      kind: "public_reply",
      automation_id: automation.id,
      contact_id: contact.id,
      comment_id: commentId,
      payload: { text: publicText },
      requires_window: false,
      dedupe_key: `pub:${commentId}`,
    });
  }

  // Resposta privada: FURA a janela de 24h. 1x por comentário, válida por 7 dias.
  await enqueue({
    kind: "private_reply",
    automation_id: automation.id,
    contact_id: contact.id,
    recipient_comment_id: commentId,
    payload: {
      text: automation.welcome_dm,
      quick_reply: automation.quick_reply_label || undefined,
    },
    requires_window: false,
    dedupe_key: `pr:${commentId}`,
  });

  await logEvent({ kind: "comment", ig_id: from.id, username: from.username, text, comment_id: commentId, media_id: mediaId, matched_automation_id: automation.id, note: `enfileirado: ${automation.name}`, raw: value });
}

// ------------------------------------------------------------
// Evento: MENSAGEM (DM comum, resposta a story, toque no botão)
// ------------------------------------------------------------
export async function handleMessaging(m: Record<string, any>, cfg: Config) {
  const senderId: string | undefined = m?.sender?.id;
  const message = m?.message ?? {};
  const mid: string = message?.mid || `${senderId}:${m?.timestamp || Date.now()}`;
  const text: string = message?.text ?? "";
  const isEcho = Boolean(message?.is_echo);
  const storyReply = message?.reply_to?.story;
  const quickPayload: string | undefined = message?.quick_reply?.payload;

  // Mensagens que nós mesmos enviamos voltam como echo.
  if (isEcho || !senderId || senderId === cfg.ig_user_id) return;

  const kind = storyReply ? "story_reply" : "message";
  const contact = await upsertContact(senderId);

  // Qualquer mensagem da pessoa ABRE a janela de 24h.
  await db()
    .from("contacts")
    .update({ last_reply_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", contact.id);
  contact.last_reply_at = new Date().toISOString();

  // 1) A mensagem em si dispara uma automação de story/DM?
  const automations = await activeAutomations();
  const triggered = automations.find(
    (a) => (storyReply ? a.trigger_story : a.trigger_dm) && matches(a, text)
  );

  if (triggered) {
    await db().from("contacts").update({ last_automation_id: triggered.id }).eq("id", contact.id);
    // A conversa já está aberta (a pessoa mandou mensagem), então a DM é permitida.
    await enqueue({
      kind: "welcome_dm",
      automation_id: triggered.id,
      contact_id: contact.id,
      recipient_ig_id: senderId,
      payload: { text: triggered.welcome_dm, quick_reply: triggered.quick_reply_label || undefined },
      requires_window: true,
      dedupe_key: `wd:${mid}`,
    });
    await logEvent({ kind, ig_id: senderId, text, matched_automation_id: triggered.id, note: `enfileirado: ${triggered.name}`, raw: m });
    return;
  }

  // 2) A pessoa respondeu (tocou no botão ou escreveu): dispara os follow-ups.
  const fromPayload = quickPayload?.startsWith("AUTO:") ? quickPayload.slice(5) : null;
  const automationId = fromPayload || contact.last_automation_id;

  if (automationId) {
    const n = await enqueueFollowups(contact, automationId);
    await logEvent({ kind, ig_id: senderId, text, matched_automation_id: automationId, note: `janela aberta — ${n} follow-up(s) enfileirado(s)`, raw: m });
    return;
  }

  await logEvent({ kind, ig_id: senderId, text, note: "sem automação associada", raw: m });
}

// ------------------------------------------------------------
// Worker: drena a fila
// ------------------------------------------------------------
export type DrainResult = {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  throttled: boolean;
  note?: string;
};

export async function drainQueue(limit = 20): Promise<DrainResult> {
  const result: DrainResult = { claimed: 0, sent: 0, skipped: 0, failed: 0, throttled: false };

  const cfg = await getConfig();
  if (!cfg.access_token || !cfg.ig_user_id) {
    result.note = "nenhuma conta do Instagram conectada";
    return result;
  }

  const { data: hourly } = await db().rpc("dm_sent_last_hour");
  const sentLastHour = Number(hourly ?? 0);
  if (sentLastHour >= HOURLY_DM_CAP) {
    result.throttled = true;
    result.note = `limite horário atingido (${sentLastHour}/${HOURLY_DM_CAP})`;
    return result;
  }

  const budget = Math.max(1, Math.min(limit, HOURLY_DM_CAP - sentLastHour));
  const { data, error } = await db().rpc("claim_queue_items", { p_limit: budget });
  if (error) throw new Error(`claim_queue_items: ${error.message}`);

  const items = (data || []) as unknown as QueueItem[];
  result.claimed = items.length;
  if (items.length === 0) return result;

  const windowCutoff = Date.now() - WINDOW_HOURS * 3600_000;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    try {
      // Janela de 24h: só vale para DM normal. Resposta privada e pública furam.
      if (item.requires_window && item.contact_id) {
        const { data: c } = await db()
          .from("contacts")
          .select("last_reply_at")
          .eq("id", item.contact_id)
          .single();
        const lastReply = (c as unknown as { last_reply_at: string | null } | null)?.last_reply_at;
        if (!lastReply || new Date(lastReply).getTime() < windowCutoff) {
          await db()
            .from("queue")
            .update({ status: "skipped", last_error: "janela de 24h fechada" })
            .eq("id", item.id);
          result.skipped++;
          continue;
        }
      }

      await sendQueueItem(item, cfg);

      await db()
        .from("queue")
        .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null })
        .eq("id", item.id);
      result.sent++;
    } catch (err) {
      const msg = err instanceof IgError ? err.message : String(err);
      const giveUp = item.attempts >= MAX_ATTEMPTS;
      await db()
        .from("queue")
        .update({
          status: giveUp ? "failed" : "pending",
          last_error: msg.slice(0, 900),
          run_after: new Date(Date.now() + 2 * 60_000).toISOString(),
          claimed_at: null,
        })
        .eq("id", item.id);
      if (giveUp) result.failed++;
    }

    if (i < items.length - 1) await sleep(SEND_INTERVAL_MS); // ~2 envios/s
  }

  return result;
}

async function sendQueueItem(item: QueueItem, cfg: Config) {
  const token = cfg.access_token as string;
  const igUserId = cfg.ig_user_id as string;
  const p = item.payload || {};

  if (item.kind === "public_reply") {
    if (!item.comment_id) throw new Error("public_reply sem comment_id");
    await replyToComment(item.comment_id, token, p.text || "");
    return;
  }

  const recipient = item.recipient_comment_id
    ? { comment_id: item.recipient_comment_id }
    : { id: item.recipient_ig_id as string };

  if (!item.recipient_comment_id && !item.recipient_ig_id) {
    throw new Error("item sem destinatário");
  }

  if (item.kind === "link" && p.url) {
    await sendMessage(igUserId, token, recipient, buttonMessage(p.text || "", p.url, p.button || "Abrir"));
    return;
  }

  const payloadTag = item.automation_id ? `AUTO:${item.automation_id}` : "AUTOMATION_REPLY";
  await sendMessage(igUserId, token, recipient, textMessage(p.text || "", p.quick_reply, payloadTag));
}
