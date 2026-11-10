// Checagem "a pessoa segue o perfil?" + porta de decisão da automação com
// require_follow. Sem imports de runtime de propósito: roda isolado nos testes
// (scripts/test-follow-gate.ts).

export type FollowCheck =
  | { status: "follows"; username?: string }
  | { status: "not_follows"; username?: string }
  | { status: "error"; error: string };

// GET /{igsid}?fields=username,is_user_follow_business (User Profile API).
// Qualquer coisa diferente de um booleano explícito é "error", nunca "follows".
export async function fetchFollowStatus(
  base: string,
  igId: string,
  token: string | null | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<FollowCheck> {
  if (!token) return { status: "error", error: "sem access_token na config" };
  try {
    const url = new URL(`${base}/${igId}`);
    url.searchParams.set("fields", "username,is_user_follow_business");
    url.searchParams.set("access_token", token);
    const res = await fetchImpl(url, { cache: "no-store" });
    const text = await res.text();
    if (!res.ok) {
      // o corpo da resposta da Meta não traz o token; a URL não entra na mensagem.
      return { status: "error", error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    let json: { username?: string; is_user_follow_business?: unknown };
    try {
      json = JSON.parse(text);
    } catch {
      return { status: "error", error: `resposta não é JSON: ${text.slice(0, 200)}` };
    }
    const username = typeof json.username === "string" ? json.username : undefined;
    if (typeof json.is_user_follow_business !== "boolean") {
      return { status: "error", error: "campo is_user_follow_business ausente na resposta" };
    }
    return json.is_user_follow_business
      ? { status: "follows", username }
      : { status: "not_follows", username };
  } catch (err) {
    return { status: "error", error: `falha de rede: ${String(err).slice(0, 200)}` };
  }
}

// Máximo de pedidos "segue o perfil" por pessoa/automação em 24h (anti-spam:
// o botão "Já segui" pode ser tocado de novo, mas não infinitamente).
export const MAX_ASK_FOLLOW_PER_DAY = 5;

export const VIP_EVENT = {
  confirmed: "vip_confirmado",
  notFollowing: "vip_nao_segue",
  checkError: "vip_checagem_erro",
  askSuppressed: "vip_pedido_suprimido",
} as const;

export type FollowGateDeps = {
  check: () => Promise<FollowCheck>;
  alreadyConfirmed: () => Promise<boolean>;
  askedLast24h: () => Promise<number>;
  enqueueConfirm: () => Promise<number>; // follow-ups da automação ("Fechou! Você tá na lista…")
  enqueueAskFollow: () => Promise<void>; // pedido para seguir + botão "Já segui"
  log: (kind: string, note: string, username?: string) => Promise<void>;
};

export type FollowGateOutcome = "already_confirmed" | "confirmed" | "asked" | "ask_suppressed";

export async function runFollowGate(deps: FollowGateDeps): Promise<FollowGateOutcome> {
  if (await deps.alreadyConfirmed()) return "already_confirmed";

  const result = await deps.check();

  if (result.status === "follows") {
    const n = await deps.enqueueConfirm();
    await deps.log(VIP_EVENT.confirmed, `segue o perfil — ${n} follow-up(s) enfileirado(s)`, result.username);
    return "confirmed";
  }

  // não segue OU erro/campo ausente: nunca confirma sem a checagem positiva.
  const username = result.status === "not_follows" ? result.username : undefined;
  const kind = result.status === "error" ? VIP_EVENT.checkError : VIP_EVENT.notFollowing;
  const note =
    result.status === "error"
      ? `checagem falhou, tratado como não segue: ${result.error}`
      : "não segue o perfil";

  if (result.status === "error") console.error(`[follow-gate] ${note}`);

  if ((await deps.askedLast24h()) >= MAX_ASK_FOLLOW_PER_DAY) {
    await deps.log(VIP_EVENT.askSuppressed, `${note}; limite de ${MAX_ASK_FOLLOW_PER_DAY} pedidos/24h atingido`, username);
    return "ask_suppressed";
  }

  await deps.enqueueAskFollow();
  await deps.log(kind, note, username);
  return "asked";
}
