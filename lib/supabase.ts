import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";
import type { Database } from "./database";
import { supabaseFetch } from "./supabaseFetch";

// Cliente com service key: NUNCA importe isto de um Client Component.
// Todas as tabelas têm RLS ligado sem policies, então só esta chave enxerga os dados.
let cached: SupabaseClient<Database> | null = null;

export function db(): SupabaseClient<Database> {
  if (!cached) {
    cached = createClient<Database>(env.supabaseUrl, env.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: supabaseFetch },
      // O retry fica só no supabaseFetch: o nativo do postgrest-js não cobre 504 e,
      // somado ao nosso, multiplicava as tentativas (12 em vez de 3 num travamento).
      db: { retry: false },
    });
  }
  return cached;
}
