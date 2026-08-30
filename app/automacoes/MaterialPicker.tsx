"use client";

export default function MaterialPicker({
  materials,
}: {
  materials: { name: string; url: string }[];
}) {
  if (materials.length === 0) return null;

  return (
    <div className="mt-2">
      <p className="hint !mt-0 mb-1.5">Ou escolha um material já enviado:</p>
      <div className="flex flex-wrap gap-1.5">
        {materials.map((m) => (
          <button
            key={m.url}
            type="button"
            className="tag hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] cursor-pointer"
            onClick={() => {
              const input = document.getElementById("link_url") as HTMLInputElement | null;
              if (!input) return;
              input.value = m.url;
              input.dispatchEvent(new Event("input", { bubbles: true }));
              input.focus();
            }}
          >
            {m.name}
          </button>
        ))}
      </div>
    </div>
  );
}
