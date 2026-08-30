import { env, IG_GRAPH, IG_API_VERSION } from "./env";

const BASE = `${IG_GRAPH}/${IG_API_VERSION}`;

export class IgError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Instagram API ${status}: ${body.slice(0, 500)}`);
    this.status = status;
    this.body = body;
  }
}

async function parse(res: Response) {
  const text = await res.text();
  if (!res.ok) throw new IgError(res.status, text);
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

// ---------- OAuth ----------

// 1) code -> token curto
export async function exchangeCodeForShortToken(code: string, redirectUri: string) {
  const form = new URLSearchParams({
    client_id: env.igAppId,
    client_secret: env.igAppSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  return parse(res) as Promise<{ access_token: string; user_id: string | number; permissions?: string[] }>;
}

// 2) token curto -> token longo (60 dias)
export async function exchangeForLongToken(shortToken: string) {
  const url = new URL(`${IG_GRAPH}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", env.igAppSecret);
  url.searchParams.set("access_token", shortToken);
  const res = await fetch(url, { method: "GET" });
  return parse(res) as Promise<{ access_token: string; token_type: string; expires_in: number }>;
}

// 3) renovação semanal do token longo
export async function refreshLongToken(longToken: string) {
  const url = new URL(`${IG_GRAPH}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", longToken);
  const res = await fetch(url, { method: "GET" });
  return parse(res) as Promise<{ access_token: string; token_type: string; expires_in: number }>;
}

// ---------- Perfil ----------

export async function getMe(token: string) {
  const url = new URL(`${BASE}/me`);
  url.searchParams.set("fields", "user_id,username,name,profile_picture_url");
  url.searchParams.set("access_token", token);
  const res = await fetch(url, { cache: "no-store" });
  return parse(res) as Promise<{
    user_id: string;
    username: string;
    name?: string;
    profile_picture_url?: string;
    id?: string;
  }>;
}

// Assina os webhooks na conta (feito no callback do login)
export async function subscribeApp(igUserId: string, token: string) {
  const url = new URL(`${BASE}/${igUserId}/subscribed_apps`);
  url.searchParams.set("subscribed_fields", "comments,messages");
  url.searchParams.set("access_token", token);
  const res = await fetch(url, { method: "POST" });
  return parse(res);
}

export async function listMedia(igUserId: string, token: string, limit = 40) {
  const url = new URL(`${BASE}/${igUserId}/media`);
  url.searchParams.set("fields", "id,media_type,media_url,thumbnail_url,caption,permalink,timestamp");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", token);
  const res = await fetch(url, { cache: "no-store" });
  return parse(res) as Promise<{ data: Array<Record<string, string>> }>;
}

// ---------- Envio ----------

type Recipient = { comment_id: string } | { id: string };

export async function sendMessage(
  igUserId: string,
  token: string,
  recipient: Recipient,
  message: Record<string, unknown>
) {
  const url = new URL(`${BASE}/${igUserId}/messages`);
  url.searchParams.set("access_token", token);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient, message }),
  });
  return parse(res);
}

// Texto simples, com botão opcional de resposta rápida (abre a janela de 24h quando tocado)
export function textMessage(text: string, quickReplyLabel?: string | null, payload?: string) {
  const message: Record<string, unknown> = { text };
  if (quickReplyLabel) {
    message.quick_replies = [
      {
        content_type: "text",
        title: quickReplyLabel.slice(0, 20),
        payload: payload || "AUTOMATION_REPLY",
      },
    ];
  }
  return message;
}

// Template de botão com URL (o cartão com o link)
export function buttonMessage(text: string, url: string, buttonTitle: string) {
  return {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text,
        buttons: [{ type: "web_url", url, title: (buttonTitle || "Abrir").slice(0, 20) }],
      },
    },
  };
}

// Resposta pública no próprio comentário
export async function replyToComment(commentId: string, token: string, message: string) {
  const url = new URL(`${BASE}/${commentId}/replies`);
  url.searchParams.set("message", message);
  url.searchParams.set("access_token", token);
  const res = await fetch(url, { method: "POST" });
  return parse(res);
}
