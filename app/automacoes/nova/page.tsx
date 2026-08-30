import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import AutomationForm from "../AutomationForm";
import { loadMedia } from "../loadMedia";
import { listMaterials } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function NovaAutomacao() {
  if (!(await isLoggedIn())) redirect("/login");
  const [{ media, mediaError }, materials] = await Promise.all([loadMedia(), listMaterials().catch(() => [])]);
  return <AutomationForm media={media} mediaError={mediaError} materials={materials} />;
}
