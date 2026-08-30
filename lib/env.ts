// Leitura centralizada das variáveis de ambiente (somente servidor).
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

export const env = {
  get supabaseUrl() { return req("SUPABASE_URL"); },
  get supabaseServiceKey() { return req("SUPABASE_SERVICE_ROLE_KEY"); },
  get igAppId() { return req("IG_APP_ID"); },
  get igAppSecret() { return req("IG_APP_SECRET"); },
  get igVerifyToken() { return req("IG_VERIFY_TOKEN"); },
  get cronSecret() { return req("CRON_SECRET"); },
  get adminPassword() { return req("ADMIN_PASSWORD"); },
  get appUrl() {
    const explicit = process.env.APP_URL;
    if (explicit) return explicit.replace(/\/$/, "");
    const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
    if (vercel) return `https://${vercel}`;
    return "http://localhost:3000";
  },
};

export const IG_GRAPH = "https://graph.instagram.com";
export const IG_API_VERSION = "v25.0";
