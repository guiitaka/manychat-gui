"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/supabase";
import { RESERVATION_MODELS, type ReservationModel } from "@/lib/types";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function back(params: Record<string, string>): never {
  redirect("/reservas?" + new URLSearchParams(params).toString());
}

// Ação pública: qualquer visitante pode chamar, sem login — é o próprio
// propósito da página. Não use guard() aqui.
export async function createReservation(formData: FormData) {
  const name = str(formData, "name");
  const phone = str(formData, "phone");
  const model = str(formData, "model") as ReservationModel;

  if (!name || !phone || !RESERVATION_MODELS.includes(model)) {
    back({ erro: "Preencha nome, WhatsApp e escolha um modelo.", name, phone, model });
  }

  const { error } = await db().from("reservations").insert({ name, phone, model });
  if (error) {
    back({ erro: String(error.message).slice(0, 160), name, phone, model });
  }

  back({ ok: "1", nome: name, modelo: model });
}
