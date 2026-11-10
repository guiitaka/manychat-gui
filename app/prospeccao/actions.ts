"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { isLoggedIn } from "@/lib/auth";

async function guard() {
  if (!(await isLoggedIn())) throw new Error("Não autorizado");
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

// Instagram: letras, números, ponto e underline (até 30). Sem "@", em minúsculas.
const HANDLE = /^[a-z0-9._]{1,30}$/;

// Cadastra quem recebeu a DM de abertura. É a ÚNICA porta de entrada do fluxo:
// quem não está nesta lista nunca recebe resposta do bot de prospecção.
export async function addProspects(formData: FormData) {
  await guard();
  const handles = Array.from(
    new Set(
      str(formData, "handles")
        .split(/[\s,;]+/)
        .map((h) => h.replace(/^@/, "").toLowerCase())
        .filter((h) => HANDLE.test(h))
    )
  );
  if (handles.length === 0) return;

  // ignoreDuplicates: quem já está na lista não é reiniciado (nem reabordado).
  const { data, error } = await db()
    .from("prospects")
    .upsert(
      handles.map((username) => ({ username })),
      { onConflict: "username", ignoreDuplicates: true }
    )
    .select("id, username");
  if (error) throw new Error(error.message);

  const created = (data || []) as Array<{ id: string; username: string }>;
  if (created.length > 0) {
    await db()
      .from("prospect_transitions")
      .insert(
        created.map((p) => ({
          prospect_id: p.id,
          username: p.username,
          etapa: "novo" as const,
          tags: ["prospeccao_enviada"],
          note: "DM de abertura enviada (cadastrado no painel)",
        }))
      );
  }
  revalidatePath("/prospeccao");
}

// Tira da lista (o bot para de responder). O histórico de transições vai junto.
export async function removeProspect(formData: FormData) {
  await guard();
  await db().from("prospects").delete().eq("id", str(formData, "id"));
  revalidatePath("/prospeccao");
}
