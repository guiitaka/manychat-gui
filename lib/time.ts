// O servidor roda em UTC. Toda exibição é travada em America/Sao_Paulo.
export const TZ = "America/Sao_Paulo";

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const full = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  dateStyle: "short",
  timeStyle: "short",
});

export function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return dateTime.format(new Date(iso));
}

export function fmtFull(iso: string | null | undefined): string {
  if (!iso) return "—";
  return full.format(new Date(iso));
}

export function relative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return diff > 0 ? `há ${min} min` : `em ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return diff > 0 ? `há ${h}h` : `em ${h}h`;
  const d = Math.round(h / 24);
  return diff > 0 ? `há ${d}d` : `em ${d}d`;
}

// Quanto falta da janela de 24h aberta pela última resposta da pessoa
export function windowLeft(lastReplyAt: string | null | undefined): string {
  if (!lastReplyAt) return "fechada";
  const left = 24 * 3600_000 - (Date.now() - new Date(lastReplyAt).getTime());
  if (left <= 0) return "fechada";
  const h = Math.floor(left / 3600_000);
  const m = Math.floor((left % 3600_000) / 60000);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}
