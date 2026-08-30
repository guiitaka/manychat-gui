import { notFound, redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import { db } from "@/lib/supabase";
import type { Automation } from "@/lib/types";
import AutomationForm from "../AutomationForm";
import { loadMedia } from "../loadMedia";

export const dynamic = "force-dynamic";

export default async function EditarAutomacao({
  params,
}: {
  params: Promise<{ id: string }>; // Next 16: params é assíncrono
}) {
  if (!(await isLoggedIn())) redirect("/login");
  const { id } = await params;

  const { data } = await db().from("automations").select("*").eq("id", id).single();
  if (!data) notFound();

  const { media, mediaError } = await loadMedia();
  return <AutomationForm automation={data as unknown as Automation} media={media} mediaError={mediaError} />;
}
