import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import AutomationForm from "../AutomationForm";
import { loadMedia } from "../loadMedia";

export const dynamic = "force-dynamic";

export default async function NovaAutomacao() {
  if (!(await isLoggedIn())) redirect("/login");
  const { media, mediaError } = await loadMedia();
  return <AutomationForm media={media} mediaError={mediaError} />;
}
