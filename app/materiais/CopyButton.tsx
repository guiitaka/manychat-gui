"use client";

import { useState } from "react";

export default function CopyButton({ text, label = "Copiar link" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);

  return (
    <button
      type="button"
      className="btn btn-ghost text-xs !px-2.5 !py-1.5"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // navegadores antigos / contexto sem permissão
          const el = document.createElement("textarea");
          el.value = text;
          document.body.appendChild(el);
          el.select();
          document.execCommand("copy");
          el.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
    >
      {done ? "✓ Copiado" : label}
    </button>
  );
}
