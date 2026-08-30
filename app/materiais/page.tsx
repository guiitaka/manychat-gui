import Link from "next/link";
import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import { listMaterials, humanSize } from "@/lib/storage";
import { fmt } from "@/lib/time";
import { uploadMaterial, deleteMaterial } from "../actions";
import CopyButton from "./CopyButton";

export const dynamic = "force-dynamic";

export default async function Materiais({
  searchParams,
}: {
  searchParams: Promise<{ enviado?: string; erro?: string }>;
}) {
  if (!(await isLoggedIn())) redirect("/login");
  const sp = await searchParams;

  let materials: Awaited<ReturnType<typeof listMaterials>> = [];
  let listError = "";
  try {
    materials = await listMaterials();
  } catch (e) {
    listError = String(e).slice(0, 200);
  }

  const total = materials.reduce((s, m) => s + m.size, 0);

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:py-12">
      <div className="mb-8">
        <Link href="/" className="hint hover:underline">← Voltar ao painel</Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">Materiais</h1>
        <p className="hint">
          Envie o PDF, imagem ou áudio uma vez. O link público sai pronto para colar na automação.
        </p>
      </div>

      {sp.enviado && (
        <div className="card p-3.5 mb-4 text-sm" style={{ borderColor: "var(--color-ok)", color: "var(--color-ok)" }}>
          <strong>{sp.enviado}</strong> enviado. O link já está na lista abaixo.
        </div>
      )}
      {sp.erro && (
        <div className="card p-3.5 mb-4 text-sm" style={{ borderColor: "var(--color-bad)", color: "var(--color-bad)" }}>
          {sp.erro}
        </div>
      )}

      {/* Upload */}
      <form action={uploadMaterial} className="card p-5 mb-8">
        <label className="label" htmlFor="file">Enviar novo material</label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            id="file"
            name="file"
            type="file"
            required
            className="field flex-1 min-w-[240px] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-panel)] file:px-3 file:py-1.5 file:text-sm file:text-[var(--color-soft)] file:cursor-pointer cursor-pointer"
          />
          <button type="submit" className="btn btn-primary">Enviar</button>
        </div>
        <p className="hint">
          Até 25 MB. O nome vira minúsculo e sem acento (um link com espaço quebra em vários apps).
          Enviar um arquivo com o mesmo nome <strong>substitui</strong> o anterior — e as automações que já usam
          aquele link passam a entregar o arquivo novo, sem precisar editar nada.
        </p>
      </form>

      {/* Lista */}
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          {materials.length} material{materials.length === 1 ? "" : "is"}
        </h2>
        {materials.length > 0 && (
          <span className="hint !mt-0">{humanSize(total)} de 1 GB usados</span>
        )}
      </div>

      {listError && (
        <div className="card p-5 text-sm text-[var(--color-bad)]">Falha ao listar: {listError}</div>
      )}

      {!listError && materials.length === 0 && (
        <div className="card p-8 text-center text-sm text-[var(--color-muted)]">
          Nenhum material ainda. Envie o primeiro acima.
        </div>
      )}

      <ul className="space-y-2">
        {materials.map((m) => (
          <li key={m.name} className="card p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-lg" aria-hidden>{icon(m.mime, m.name)}</span>
              <div className="flex-1 min-w-[200px]">
                <p className="font-medium text-sm break-all">{m.name}</p>
                <p className="hint !mt-0.5">{humanSize(m.size)} · enviado {fmt(m.createdAt)}</p>
              </div>
              <CopyButton text={m.url} />
              <a href={m.url} target="_blank" rel="noreferrer" className="btn btn-ghost text-xs !px-2.5 !py-1.5">Abrir</a>
              <form action={deleteMaterial}>
                <input type="hidden" name="name" value={m.name} />
                <button type="submit" className="btn btn-danger text-xs !px-2.5 !py-1.5">Excluir</button>
              </form>
            </div>
            <input
              readOnly
              value={m.url}
              className="field mt-3 text-xs text-[var(--color-muted)]"
            />
          </li>
        ))}
      </ul>
    </main>
  );
}

function icon(mime: string, name: string) {
  const n = name.toLowerCase();
  if (mime.startsWith("image/")) return "🖼️";
  if (mime.startsWith("video/")) return "🎬";
  if (mime.startsWith("audio/")) return "🎧";
  if (mime.includes("pdf") || n.endsWith(".pdf")) return "📄";
  if (n.endsWith(".zip") || n.endsWith(".rar")) return "🗜️";
  return "📎";
}
