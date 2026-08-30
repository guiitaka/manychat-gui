import { getConfig } from "@/lib/engine";
import { listMedia } from "@/lib/ig";
import type { Media } from "@/lib/types";

export async function loadMedia(): Promise<{ media: Media[]; mediaError?: string }> {
  try {
    const cfg = await getConfig();
    if (!cfg.access_token || !cfg.ig_user_id) {
      return { media: [], mediaError: "nenhuma conta conectada" };
    }
    const res = await listMedia(cfg.ig_user_id, cfg.access_token);
    return { media: (res.data || []) as unknown as Media[] };
  } catch (e) {
    return { media: [], mediaError: String(e).slice(0, 160) };
  }
}
