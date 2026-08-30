import Link from "next/link";
import { saveAutomation, deleteAutomation } from "../actions";
import type { Automation, Media } from "@/lib/types";

export default function AutomationForm({
  automation,
  media,
  mediaError,
}: {
  automation?: Automation;
  media: Media[];
  mediaError?: string;
}) {
  const a = automation;
  const isNew = !a;

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:py-12">
      <div className="flex items-center justify-between gap-4 mb-8">
        <div>
          <Link href="/" className="hint hover:underline">← Voltar ao painel</Link>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">
            {isNew ? "Nova automação" : a!.name}
          </h1>
        </div>
        {!isNew && (
          <form action={deleteAutomation}>
            <input type="hidden" name="id" value={a!.id} />
            <button className="btn btn-danger" type="submit">Excluir</button>
          </form>
        )}
      </div>

      <form action={saveAutomation} className="space-y-6">
        {!isNew && <input type="hidden" name="id" value={a!.id} />}

        {/* 1. Básico */}
        <section className="card p-5 space-y-4">
          <SectionTitle n={1} title="O básico" />

          <div>
            <label className="label" htmlFor="name">Nome da automação</label>
            <input id="name" name="name" className="field" defaultValue={a?.name ?? ""} placeholder="Ex.: PDF do post de terça" required />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" name="active" defaultChecked={a ? a.active : true} className="h-4 w-4 accent-[var(--color-brand)]" />
            <span className="text-sm">Automação ativa</span>
          </label>
        </section>

        {/* 2. Gatilho */}
        <section className="card p-5 space-y-4">
          <SectionTitle n={2} title="Quando disparar" />

          <div className="grid sm:grid-cols-3 gap-2">
            <Check name="trigger_comment" label="Comentário em post/reels" defaultChecked={a ? a.trigger_comment : true} />
            <Check name="trigger_story" label="Resposta a story" defaultChecked={a?.trigger_story ?? false} />
            <Check name="trigger_dm" label="DM direta" defaultChecked={a?.trigger_dm ?? false} />
          </div>

          <div className="grid sm:grid-cols-[1fr_180px] gap-4">
            <div>
              <label className="label" htmlFor="keywords">Palavras-chave (separadas por vírgula)</label>
              <input id="keywords" name="keywords" className="field" defaultValue={(a?.keywords || []).join(", ")} placeholder="pdf, quero, eu quero" />
              <p className="hint">Ignora acentos e maiúsculas. “PDF!” casa com “pdf”.</p>
            </div>
            <div>
              <label className="label" htmlFor="match_type">Tipo de match</label>
              <select id="match_type" name="match_type" className="field" defaultValue={a?.match_type ?? "contains"}>
                <option value="contains">Contém a palavra</option>
                <option value="exact">Texto exato</option>
                <option value="any">Qualquer comentário</option>
              </select>
            </div>
          </div>
        </section>

        {/* 3. Post */}
        <section className="card p-5">
          <SectionTitle n={3} title="Em qual post" />
          <p className="hint !mt-0 mb-4">Deixe em “todos” para valer em qualquer publicação.</p>

          {mediaError ? (
            <p className="text-sm text-[var(--color-warn)]">
              Não consegui listar seus posts ({mediaError}). Conecte o Instagram no painel para ver as miniaturas.
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
              <label className="cursor-pointer">
                <input type="radio" name="media_id" value="" defaultChecked={!a?.media_id} className="sr-only peer" />
                <div className="aspect-square rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] grid place-items-center text-center text-xs text-[var(--color-muted)] peer-checked:border-[var(--color-brand)] peer-checked:text-[var(--color-brand)] px-2">
                  Todos os posts
                </div>
              </label>

              {media.map((m) => (
                <label key={m.id} className="cursor-pointer" title={m.caption?.slice(0, 120) || m.id}>
                  <input type="radio" name="media_id" value={m.id} defaultChecked={a?.media_id === m.id} className="sr-only peer" />
                  <div className="aspect-square rounded-lg overflow-hidden border border-[var(--color-line)] peer-checked:border-[var(--color-brand)] peer-checked:ring-2 peer-checked:ring-[var(--color-brand)]/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.thumbnail_url || m.media_url || ""}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                </label>
              ))}
            </div>
          )}
        </section>

        {/* 4. Resposta pública */}
        <section className="card p-5">
          <SectionTitle n={4} title="Resposta pública no comentário (opcional)" />
          <label className="label mt-4" htmlFor="public_replies">Uma variação por linha — o app sorteia</label>
          <textarea
            id="public_replies"
            name="public_replies"
            rows={3}
            className="field font-[inherit]"
            defaultValue={(a?.public_replies || []).join("\n")}
            placeholder={"Mandei no seu direct! 💛\nOlha lá o direct 👀\nTe mandei agora, confere aí!"}
          />
          <p className="hint">Variar o texto evita que o Instagram leia como spam.</p>
        </section>

        {/* 5. DM de boas-vindas */}
        <section className="card p-5 space-y-4">
          <SectionTitle n={5} title="A DM de boas-vindas" />
          <p className="hint !mt-0">
            Esta é a resposta privada ao comentário. É a única mensagem que <strong>fura a janela de 24h</strong>.
            Ela precisa terminar com um convite para a pessoa tocar no botão — é o toque dela que abre a janela para o resto.
          </p>

          <div>
            <label className="label" htmlFor="welcome_dm">Texto</label>
            <textarea
              id="welcome_dm"
              name="welcome_dm"
              rows={4}
              className="field"
              defaultValue={a?.welcome_dm ?? ""}
              placeholder={"Oi! Vi seu comentário 💛\n\nTenho o material pronto pra te mandar. Toca no botão abaixo que eu já te envio o link!"}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="quick_reply_label">Botão de resposta rápida (máx. 20 caracteres)</label>
            <input id="quick_reply_label" name="quick_reply_label" maxLength={20} className="field" defaultValue={a?.quick_reply_label ?? ""} placeholder="QUERO O PDF" />
            <p className="hint">Quando a pessoa toca, a janela de 24h abre e os follow-ups abaixo entram na fila.</p>
          </div>
        </section>

        {/* 6. Follow-up: link */}
        <section className="card p-5 space-y-4">
          <SectionTitle n={6} title="Follow-up 1 — a mensagem com o link" />

          <div>
            <label className="label" htmlFor="link_message">Texto</label>
            <textarea id="link_message" name="link_message" rows={3} className="field" defaultValue={a?.link_message ?? ""} placeholder="Aqui está! É só clicar no botão. Se puder, me segue aqui pra não perder os próximos 🙌" />
          </div>

          <div className="grid sm:grid-cols-[1fr_200px_140px] gap-4">
            <div>
              <label className="label" htmlFor="link_url">URL</label>
              <input id="link_url" name="link_url" type="url" className="field" defaultValue={a?.link_url ?? ""} placeholder="https://..." />
            </div>
            <div>
              <label className="label" htmlFor="link_button_label">Rótulo do botão</label>
              <input id="link_button_label" name="link_button_label" maxLength={20} className="field" defaultValue={a?.link_button_label ?? "Baixar agora"} />
            </div>
            <div>
              <label className="label" htmlFor="link_delay_minutes">Atraso (min)</label>
              <input id="link_delay_minutes" name="link_delay_minutes" type="number" min={0} className="field" defaultValue={a?.link_delay_minutes ?? 0} />
            </div>
          </div>
        </section>

        {/* 7. Lembrete */}
        <section className="card p-5 space-y-4">
          <SectionTitle n={7} title="Follow-up 2 — o lembrete (opcional)" />
          <p className="hint !mt-0">
            A API não avisa se a pessoa clicou no link, então o lembrete dispara por tempo. Só sai se a janela de 24h ainda estiver aberta.
          </p>

          <div className="grid sm:grid-cols-[1fr_160px] gap-4">
            <div>
              <label className="label" htmlFor="reminder_message">Texto</label>
              <textarea id="reminder_message" name="reminder_message" rows={2} className="field" defaultValue={a?.reminder_message ?? ""} placeholder="Passando só pra lembrar do material que te mandei 😊 conseguiu abrir?" />
            </div>
            <div>
              <label className="label" htmlFor="reminder_delay_minutes">Atraso (min)</label>
              <input id="reminder_delay_minutes" name="reminder_delay_minutes" type="number" min={0} className="field" defaultValue={a?.reminder_delay_minutes ?? 1440} />
              <p className="hint">1440 = 24h</p>
            </div>
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button type="submit" className="btn btn-primary">Salvar automação</button>
          <Link href="/" className="btn btn-ghost">Cancelar</Link>
        </div>
      </form>
    </main>
  );
}

function SectionTitle({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="flex items-center gap-2.5 text-sm font-semibold">
      <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--color-panel-2)] text-[11px] text-[var(--color-muted)]">{n}</span>
      {title}
    </h2>
  );
}

function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3 py-2.5">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4 accent-[var(--color-brand)]" />
      <span className="text-sm">{label}</span>
    </label>
  );
}
