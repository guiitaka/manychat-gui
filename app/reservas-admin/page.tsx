import Link from "next/link";
import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { fmt } from "@/lib/time";
import { RESERVATION_MODELS, type Reservation, type ReservationModel } from "@/lib/types";
import { markContacted, deleteReservation } from "./actions";

export const dynamic = "force-dynamic";

export default async function ReservasAdmin({
  searchParams,
}: {
  searchParams: Promise<{ modelo?: string }>;
}) {
  if (!(await isLoggedIn())) redirect("/login");
  const sp = await searchParams;
  const activeModel = RESERVATION_MODELS.includes(sp.modelo as ReservationModel)
    ? (sp.modelo as ReservationModel)
    : null;

  const { data, error } = await db()
    .from("reservations")
    .select("*")
    .order("created_at", { ascending: false });

  const reservations = (data || []) as unknown as Reservation[];
  const visible = activeModel ? reservations.filter((r) => r.model === activeModel) : reservations;

  const countByModel = (model: ReservationModel) =>
    reservations.filter((r) => r.model === model).length;

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:py-12">
      <div className="mb-8">
        <Link href="/" className="hint hover:underline">← Voltar ao painel</Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">Reservas de iPhone</h1>
        <p className="hint">
          Reservas feitas em{" "}
          <a href="/reservas" target="_blank" rel="noreferrer" className="hover:underline">/reservas</a>.
        </p>
      </div>

      {/* Contadores */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat label="Total" value={String(reservations.length)} />
        {RESERVATION_MODELS.map((m) => (
          <Stat key={m} label={m} value={String(countByModel(m))} />
        ))}
      </section>

      {/* Filtro por modelo */}
      <div className="flex flex-wrap gap-2 mb-6">
        <FilterLink label="Todos" active={!activeModel} href="/reservas-admin" />
        {RESERVATION_MODELS.map((m) => (
          <FilterLink
            key={m}
            label={m}
            active={activeModel === m}
            href={`/reservas-admin?modelo=${encodeURIComponent(m)}`}
          />
        ))}
      </div>

      {error && (
        <div className="card p-5 text-sm text-[var(--color-bad)]">Falha ao listar: {error.message}</div>
      )}

      {!error && visible.length === 0 && (
        <div className="card p-8 text-center text-sm text-[var(--color-muted)]">
          Nenhuma reserva ainda.
        </div>
      )}

      <ul className="space-y-2">
        {visible.map((r) => (
          <li key={r.id} className="card p-4 flex flex-wrap items-center gap-3">
            <StatusDot status={r.status} />
            <div className="flex-1 min-w-[200px]">
              <p className="font-medium text-sm">{r.name}</p>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <span className="tag text-[var(--color-brand)] border-[var(--color-brand)]/40">{r.model}</span>
                <a
                  href={`https://wa.me/${r.phone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hint !mt-0 hover:underline"
                >
                  {r.phone}
                </a>
              </div>
              <p className="hint !mt-1">{fmt(r.created_at)}</p>
            </div>
            <form action={markContacted}>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="status" value={r.status} />
              <button className="btn btn-ghost text-xs !px-2.5 !py-1.5" type="submit">
                {r.status === "contacted" ? "Marcar pendente" : "Marcar contatado"}
              </button>
            </form>
            <form action={deleteReservation}>
              <input type="hidden" name="id" value={r.id} />
              <button className="btn btn-danger text-xs !px-2.5 !py-1.5" type="submit">Excluir</button>
            </form>
          </li>
        ))}
      </ul>
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

function FilterLink({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      className={`tag ${active ? "text-[var(--color-brand)] border-[var(--color-brand)]/40" : ""}`}
    >
      {label}
    </Link>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === "contacted" ? "var(--color-ok)" : "var(--color-warn)";
  return <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />;
}
