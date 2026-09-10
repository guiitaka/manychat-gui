"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { isLoggedIn } from "@/lib/auth";

async function guard() {
  if (!(await isLoggedIn())) throw new Error("Não autorizado");
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function markContacted(formData: FormData) {
  await guard();
  const id = str(formData, "id");
  const status = str(formData, "status") === "contacted" ? "pending" : "contacted";
  await db().from("reservations").update({ status }).eq("id", id);
  revalidatePath("/reservas-admin");
}

export async function deleteReservation(formData: FormData) {
  await guard();
  const id = str(formData, "id");
  await db().from("reservations").delete().eq("id", id);
  revalidatePath("/reservas-admin");
}
