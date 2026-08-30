import Link from "next/link";
import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { fmt, fmtFull, relative } from "@/lib/time";
import type { Automation, Config } from "@/lib/types";
import { toggleAutomation, disconnectAccount, drainNow, retryQueueItem } from "./actions";

export const dynamic = "force-dynamic";

type Row = Record<string, any>;

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ conectado?: string; erro?: string; aviso?: string }>;
}) {
  if (!(await isLoggedIn())) redirect("/login");
  const sp = await searchParams;

  const supabase = db();
  const [cfgRes, autosRes, eventsRes, queueRes, contactsRes, sentRes, pendingRes] = await Promise.all([
    supabase.from("config").select("*").eq("id", 1).single(),
    supabase.from("automations").select("*").order("created_at", { ascending: false }),
    supabase.from("events").select("*").order("created_at", { ascending: false }).limit(12),
    supabase.from("queue").select("*").order("created_at", { ascending: false }).limit(12),
    supabase.from("contacts").select("id", { count: "exact", head: true }),
    supabase
      .from("queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("sent_at", new Date(Date.now() - 86400000).toISOString()),
    supabase.from("queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  const cfg = (cfgRes.data || {}) as unknown as Config;
  const automations = (autosRes.data || []) as unknown as Automation[];
  const events = (eventsRes.data || []) as unknown as Row[];
  const queue = (queueRes.data || []) as unknown as Row[];

  const connected = Boolean(cfg.access_token && cfg.ig_user_id);
  const activeCount = automations.filter((a) => a.active).length;

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:py-12">
      <header className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Automações do Instagram</h1>
          <p className="hint">Comentário vira DM. Sem mensalidade, rodando em plano grátis.</p>
        </div>
        <div className="flex items-center gap-2">
          <form action={drainNow}>
            <button className="btn btn-ghost" type="submit">Drenar fila agora</button>
          </form>
          <Link href="/materiais" className="btn btn-ghost">Materiais</Link>
          <Link href="/automacoes/nova" className="btn btn-primary">+ Nova automação</Link>
        </div>
      </header>

      {sp.conectado && <Banner tone="ok">Conta @{sp.conectado} conectada com sucesso.</Banner>}
      {sp.aviso && <Banner tone="warn">Conectou, mas a assinatura do webhook avisou: {sp.aviso}</Banner>}
      {sp.erro && <Banner tone="bad">Falha ao conectar: {sp.erro}</Banner>}

      {/* Conta conectada */}
      <section className="card p-5 mb-6">
        {connected ? (
          <div className="flex flex-wrap items-center gap-4">
            {cfg.profile_picture_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cfg.profile_picture_url} alt="" className="h-12 w-12 rounded-full border border-[var(--color-line)]" />
            ) : (
              <div className="h-12 w-12 rounded-full bg-[var(--color-panel-2)]" />
            )}
            <div className="flex-1 min-w-[200px]">
              <p className="font-semibold">@{cfg.ig_username}</p>
              <p className="hint !mt-0">
                Token válido até {fmtFull(cfg.token_expires_at)} · renovado {relative(cfg.token_refreshed_at)}
              </p>
            </div>
            <form action={disconnectAccount}>
              <button className="btn btn-danger" type="submit">Desconectar</button>
            </form>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-semibold">Nenhuma conta conectada</p>
              <p className="hint !mt-0">Autorize o app para começar a receber comentários e enviar DMs.</p>
            </div>
            <a href="/api/oauth/start" className="btn btn-primary">Conectar Instagram</a>
          </div>
        )}
      </section>

      {/* Números */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <Stat label="Automações ativas" value={`${activeCount}/${automations.length}`} />
        <Stat label="Contatos" value={String(contactsRes.count ?? 0)} />
        <Stat label="Na fila" value={String(pendingRes.count ?? 0)} />
        <Stat label="Enviadas 24h" value={String(sentRes.count ?? 0)} />
      </section>

      {/* Automações */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-3">Automações</h2>
        {automations.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-sm text-[var(--color-soft)]">Nenhuma automação ainda.</p>
            <Link href="/automacoes/nova" className="btn btn-primary mt-4">Criar a primeira</Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {automations.map((a) => (
              <li key={a.id} className="card p-4 flex flex-wrap items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${a.active ? "bg-[var(--color-ok)]" : "bg-[var(--color-line)]"}`} />
                <div className="flex-1 min-w-[220px]">
                  <Link href={`/automacoes/${a.id}`} className="font-medium hover:underline">{a.name}</Link>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {a.trigger_comment && <span className="tag">comentário</span>}
                    {a.trigger_story && <span className="tag">story</span>}
                    {a.trigger_dm && <span className="tag">dm</span>}
                    {a.media_id && <span className="tag">post específico</span>}
                    {(a.keywords || []).slice(0, 4).map((k) => (
                      <span key={k} className="tag text-[var(--color-brand)] border-[var(--color-brand)]/40">{k}</span>
                    ))}
                  </div>
                </div>
                <form action={toggleAutomation}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="active" value={String(!a.active)} />
                  <button className="btn btn-ghost" type="submit">{a.active ? "Pausar" : "Ativar"}</button>
                </form>
                <Link href={`/automacoes/${a.id}`} className="btn btn-ghost">Editar</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Fila + Eventos */}
      <div className="grid lg:grid-cols-2 gap-6">
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-3">Fila de envio</h2>
          <div className="card divide-y divide-[var(--color-line)]">
            {queue.length === 0 && <p className="p-5 text-sm text-[var(--color-muted)]">Nada na fila ainda.</p>}
            {queue.map((q) => (
              <div key={q.id} className="p-3.5 flex items-start gap-3">
                <StatusDot status={q.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{kindLabel(q.kind)}</p>
                  <p className="hint !mt-0.5 truncate">{q.payload?.text || q.last_error || "—"}</p>
                  <p className="hint !mt-0.5">{q.status} · {fmt(q.sent_at || q.run_after)}</p>
                </div>
                {(q.status === "failed" || q.status === "skipped") && (
                  <form action={retryQueueItem}>
                    <input type="hidden" name="id" value={q.id} />
                    <button className="btn btn-ghost text-xs !px-2 !py-1" type="submit">Repetir</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-3">Eventos recebidos</h2>
          <div className="card divide-y divide-[var(--color-line)]">
            {events.length === 0 && (
              <p className="p-5 text-sm text-[var(--color-muted)]">
                Nada ainda. Depois de publicar o app na Meta, comente a palavra-chave de outra conta.
              </p>
            )}
            {events.map((e) => (
              <div key={e.id} className="p-3.5">
                <div className="flex items-center gap-2">
                  <span className="tag">{e.kind}</span>
                  <span className="hint !mt-0">{e.username ? `@${e.username}` : e.ig_id || "—"}</span>
                  <span className="hint !mt-0 ml-auto">{fmt(e.created_at)}</span>
                </div>
                {e.text && <p className="text-sm mt-1.5 text-[var(--color-soft)] line-clamp-2">“{e.text}”</p>}
                {e.note && <p className="hint">{e.note}</p>}
              </div>
            ))}
          </div>
        </section>
      </div>

      <footer className="mt-10 flex gap-4 text-xs text-[var(--color-muted)]">
        <Link href="/privacidade" className="hover:underline">Política de privacidade</Link>
        <Link href="/exclusao-de-dados" className="hover:underline">Exclusão de dados</Link>
        <span className="ml-auto">Horários em America/Sao_Paulo</span>
      </footer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="hint !mt-1">{label}</p>
    </div>
  );
}

function Banner({ tone, children }: { tone: "ok" | "warn" | "bad"; children: React.ReactNode }) {
  const color = tone === "ok" ? "var(--color-ok)" : tone === "warn" ? "var(--color-warn)" : "var(--color-bad)";
  return (
    <div className="card p-3.5 mb-4 text-sm" style={{ borderColor: color, color }}>
      {children}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    sent: "var(--color-ok)",
    pending: "var(--color-warn)",
    sending: "var(--color-warn)",
    failed: "var(--color-bad)",
    skipped: "var(--color-muted)",
  };
  return <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: map[status] || "var(--color-line)" }} />;
}

function kindLabel(kind: string) {
  return (
    {
      private_reply: "Resposta privada (fura 24h)",
      public_reply: "Resposta pública no comentário",
      welcome_dm: "DM de boas-vindas",
      link: "DM com o link",
      reminder: "Lembrete",
    } as Record<string, string>
  )[kind] || kind;
}
