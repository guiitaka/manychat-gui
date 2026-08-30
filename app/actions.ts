"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase";
import { isLoggedIn } from "@/lib/auth";
import { drainQueue } from "@/lib/engine";
import { putMaterial, removeMaterial } from "@/lib/storage";
import type { MatchType } from "@/lib/types";

async function guard() {
  if (!(await isLoggedIn())) throw new Error("Não autorizado");
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
const int = (fd: FormData, k: string, fallback = 0) => {
  const n = Number(str(fd, k));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
};
const csv = (fd: FormData, k: string) =>
  str(fd, k).split(",").map((s) => s.trim()).filter(Boolean);
const lines = (fd: FormData, k: string) =>
  str(fd, k).split("\n").map((s) => s.trim()).filter(Boolean);

const matchType = (v: string): MatchType =>
  v === "exact" || v === "any" ? v : "contains";

export async function saveAutomation(formData: FormData) {
  await guard();

  const id = str(formData, "id");
  const row = {
    name: str(formData, "name") || "Sem nome",
    active: bool(formData, "active"),
    trigger_comment: bool(formData, "trigger_comment"),
    trigger_story: bool(formData, "trigger_story"),
    trigger_dm: bool(formData, "trigger_dm"),
    keywords: csv(formData, "keywords"),
    match_type: matchType(str(formData, "match_type")),
    media_id: str(formData, "media_id") || null,
    public_replies: lines(formData, "public_replies"),
    welcome_dm: str(formData, "welcome_dm"),
    quick_reply_label: str(formData, "quick_reply_label") || null,
    link_message: str(formData, "link_message") || null,
    link_button_label: str(formData, "link_button_label") || null,
    link_url: str(formData, "link_url") || null,
    link_delay_minutes: int(formData, "link_delay_minutes", 0),
    reminder_message: str(formData, "reminder_message") || null,
    reminder_delay_minutes: int(formData, "reminder_delay_minutes", 1440),
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const { error } = await db().from("automations").update(row).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db().from("automations").insert(row);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/");
  redirect("/");
}

export async function toggleAutomation(formData: FormData) {
  await guard();
  const id = str(formData, "id");
  const active = str(formData, "active") === "true";
  await db().from("automations").update({ active, updated_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/");
}

export async function deleteAutomation(formData: FormData) {
  await guard();
  await db().from("automations").delete().eq("id", str(formData, "id"));
  revalidatePath("/");
  redirect("/");
}

export async function disconnectAccount() {
  await guard();
  await db()
    .from("config")
    .update({
      ig_user_id: null,
      ig_username: null,
      ig_name: null,
      profile_picture_url: null,
      access_token: null,
      token_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  revalidatePath("/");
}

export async function drainNow() {
  await guard();
  await drainQueue(20);
  revalidatePath("/");
}

export async function retryQueueItem(formData: FormData) {
  await guard();
  await db()
    .from("queue")
    .update({ status: "pending", run_after: new Date().toISOString(), attempts: 0, claimed_at: null })
    .eq("id", str(formData, "id"));
  revalidatePath("/");
}

// ------------------------------------------------------------
// Materiais (Supabase Storage)
// ------------------------------------------------------------
export async function uploadMaterial(formData: FormData) {
  await guard();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/materiais?erro=" + encodeURIComponent("Nenhum arquivo selecionado"));
  }
  if (file.size > 25 * 1024 * 1024) {
    redirect("/materiais?erro=" + encodeURIComponent("Arquivo maior que 25 MB"));
  }
  try {
    const m = await putMaterial(file);
    revalidatePath("/materiais");
    redirect("/materiais?enviado=" + encodeURIComponent(m.name));
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // redirect() do Next
    redirect("/materiais?erro=" + encodeURIComponent(String(e).slice(0, 160)));
  }
}

export async function deleteMaterial(formData: FormData) {
  await guard();
  const name = str(formData, "name");
  if (name) await removeMaterial(name);
  revalidatePath("/materiais");
  redirect("/materiais");
}
