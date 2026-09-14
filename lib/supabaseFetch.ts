// fetch com retry para a API REST do Supabase.
//
// Em 14/09/2026, entre ~02:55 e 03:46 UTC, o gateway do Supabase respondeu
// "504 Gateway Timeout" de forma intermitente: cada requisição falhava em ~6 s
// e a seguinte passava. Sem retry, um único 504 no meio do webhook descartava o
// evento (a Meta já tinha recebido 200 e não reenvia).
//
// Só repetimos o que é seguro repetir, porque um 504 não garante que o banco
// deixou de executar a escrita:
//   - GET/HEAD/PATCH/DELETE (leituras e updates/deletes por filtro)
//   - POST de upsert (Prefer: resolution=...) — contacts e queue (dedupe_key)
//   - POST /rpc/ — claim_queue_items devolve itens presos após 5 min
// Insert simples (reservations, automations) NÃO é repetido.
// Storage e Auth passam direto.

// 503 e 520 são os que o retry nativo do postgrest-js cobria (desligado em supabase.ts).
const RETRY_STATUS = new Set([502, 503, 504, 520]);
const RETRY_DELAYS_MS = [1_000, 3_000];
// Os 504 observados voltaram em ~6 s. Com 8 s por tentativa, o pior caso de uma
// chamada fica em ~28 s, o que cabe duas vezes no maxDuration de 60 s do webhook.
const ATTEMPT_TIMEOUT_MS = 8_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isRetriable(url: string, init?: RequestInit): boolean {
  if (!url.includes("/rest/v1/")) return false;
  const method = (init?.method || "GET").toUpperCase();
  if (method !== "POST") return true;
  if (url.includes("/rest/v1/rpc/")) return true;
  const prefer = new Headers(init?.headers).get("Prefer") || "";
  return prefer.includes("resolution=");
}

export async function supabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = urlOf(input);
  if (!isRetriable(url, init)) return fetch(input, init);

  const path = new URL(url).pathname;
  for (let attempt = 0; ; attempt++) {
    const last = attempt >= RETRY_DELAYS_MS.length;
    const timeout = AbortSignal.timeout(ATTEMPT_TIMEOUT_MS);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;

    let reason: string;
    try {
      const res = await fetch(input, { ...init, signal });
      if (last || !RETRY_STATUS.has(res.status)) return res;
      await res.body?.cancel();
      reason = `HTTP ${res.status}`;
    } catch (err) {
      if (last || init?.signal?.aborted) throw err;
      reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    }

    const delay = RETRY_DELAYS_MS[attempt];
    console.warn(`supabase ${init?.method || "GET"} ${path}: ${reason} — tentativa ${attempt + 1}, repetindo em ${delay} ms`);
    await sleep(delay);
  }
}
