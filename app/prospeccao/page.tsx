import Link from "next/link";
import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { fmt } from "@/lib/time";
import type { ProspectRow } from "@/lib/types";
import { addProspects, removeProspect } from "./actions";

export const dynamic = "force-dynamic";

const LABEL: Record<ProspectRow["status"], string> = {
  abordado: "Abordado",
  em_conversa: "Em conversa",
  nutricao: "Nutrição",
  handoff: "Handoff (Gui)",
  opt_out: "Pediu para parar",
};

// Fora do componente: o lint de pureza do React não aceita Date.now() no render.
const isPaused = (r: ProspectRow) => !!r.paused_until && new Date(r.paused_until).getTime() > Date.now();

export default async function Prospeccao() {
  if (!(await isLoggedIn())) redirect("/login");

  const { data, error } = await db()
    .from("prospects")
    .select("*")
    .order("updated_at", { ascending: false });
  const rows = (data || []) as unknown as ProspectRow[];
  const count = (s: ProspectRow["status"]) => rows.filter((r) => r.status === s).length;

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:py-12">
      <div className="mb-8">
        <Link href="/" className="hint hover:underline">← Voltar ao painel</Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">Prospecção ativa</h1>
        <p className="hint">
          Só quem está nesta lista conversa com o bot de prospecção (depois de responder à DM de abertura).
          Qualquer outra pessoa que mandar DM não recebe resposta daqui.
        </p>
      </div>

      <section className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {(Object.keys(LABEL) as ProspectRow["status"][]).map((s) => (
          <div key={s} className="card p-4">
            <p className="text-2xl font-semibold tabular-nums">{count(s)}</p>
            <p className="hint !mt-1">{LABEL[s]}</p>
          </div>
        ))}
      </section>

      <section className="card p-5 mb-6">
        <form action={addProspects} className="space-y-3">
          <label className="label" htmlFor="handles">Cadastrar quem recebeu a DM de abertura</label>
          <textarea
            id="handles"
            name="handles"
            rows={2}
            className="field"
            placeholder="@fulano, @ciclano (um ou vários, separados por espaço, vírgula ou linha)"
          />
          <button className="btn" type="submit">Adicionar à lista</button>
        </form>
      </section>

      {error && (
        <div className="card p-5 text-sm text-[var(--color-bad)]">Falha ao listar: {error.message}</div>
      )}
      {!error && rows.length === 0 && (
        <div className="card p-8 text-center text-sm text-[var(--color-muted)]">Ninguém na lista ainda.</div>
      )}

      <ul className="space-y-2">
        {rows.map((r) => {
          const a = r.answers as Record<string, string | undefined>;
          const paused = isPaused(r);
          return (
            <li
              key={r.id}
              className={`card p-4 flex flex-wrap items-start gap-3 ${r.status === "handoff" ? "border-[var(--color-brand)]/60" : ""}`}
            >
              <div className="flex-1 min-w-[220px]">
                <p className="font-medium text-sm">
                  <a href={`https://instagram.com/${r.username}`} target="_blank" rel="noreferrer" className="hover:underline">
                    @{r.username}
                  </a>{" "}
                  <span className="hint">· {LABEL[r.status]} · passo {r.step}</span>
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {r.tags.map((t) => (
                    <span key={t} className="tag">{t}</span>
                  ))}
                </div>
                {(a.modelo_atual || a.modelo_desejado || a.preferencia) && (
                  <p className="hint !mt-1.5">
                    {a.modelo_atual && <>Atual: {a.modelo_atual}. </>}
                    {a.modelo_desejado && <>Quer: {a.modelo_desejado}. </>}
                    {a.preferencia && <>Prefere: {a.preferencia}.</>}
                  </p>
                )}
                {a.ultima_msg && <p className="hint !mt-1">Última msg: “{a.ultima_msg}”</p>}
                <p className="hint !mt-1">
                  Abordado {fmt(r.contacted_at)} · última resposta {fmt(r.last_inbound_at)}
                  {paused && <> · bot pausado até {fmt(r.paused_until)}</>}
                </p>
              </div>
              <form action={removeProspect}>
                <input type="hidden" name="id" value={r.id} />
                <button className="btn btn-danger text-xs !px-2.5 !py-1.5" type="submit">Remover</button>
              </form>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
