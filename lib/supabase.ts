import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";
import type { Database } from "./database";

// Cliente com service key: NUNCA importe isto de um Client Component.
// Todas as tabelas têm RLS ligado sem policies, então só esta chave enxerga os dados.
let cached: SupabaseClient<Database> | null = null;

export function db(): SupabaseClient<Database> {
  if (!cached) {
    cached = createClient<Database>(env.supabaseUrl, env.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
