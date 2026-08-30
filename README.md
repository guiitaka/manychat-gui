# Automação de Instagram (substituto do ManyChat)

Comentário com palavra-chave → resposta pública opcional → DM privada com botão →
quando a pessoa toca, abre a janela de 24h → link + lembrete.

Roda inteiro em plano grátis: **Next.js 16 na Vercel** + **Postgres no Supabase**.

## Como o motor funciona

| Etapa | Onde | Detalhe |
|---|---|---|
| Recebe evento | `app/api/webhook/route.ts` | Valida `X-Hub-Signature-256` (HMAC-SHA256 do corpo cru) |
| Casa palavra-chave | `lib/match.ts` | Ignora acento e caixa; `contains` / `exact` / `any` |
| Enfileira | `lib/engine.ts` | `dedupe_key` UNIQUE impede envio duplicado |
| Envia | `lib/engine.ts` → `lib/ig.ts` | ~2/s, teto de 200 DMs/h |
| Agenda | `supabase/02_cron.sql` | pg_cron + pg_net batem no drain a cada minuto |
| Instantâneo | `after()` no webhook | Dispara o drain junto com o evento; a trava atômica evita duplicata |

A **resposta privada a comentário** é a única mensagem que fura a janela de 24h
(1x por comentário, válida por 7 dias). Todo o resto exige a janela aberta —
e quem abre a janela é a pessoa respondendo.

## Variáveis de ambiente

```
SUPABASE_URL                 # Supabase > Project Settings > Data API
SUPABASE_SERVICE_ROLE_KEY    # Supabase > Project Settings > API Keys (secret)
IG_APP_ID                    # Meta > Instagram > ID do app do Instagram
IG_APP_SECRET                # Meta > Instagram > Chave secreta do app do Instagram
IG_VERIFY_TOKEN              # gerado por nós; usado no webhook da Meta
CRON_SECRET                  # gerado por nós; protege /api/queue/drain e /api/token/refresh
ADMIN_PASSWORD               # senha do painel
APP_URL                      # https://seu-app.vercel.app (a Vercel preenche sozinha)
```

## Banco

1. `supabase/01_schema.sql` — tabelas, RLS, trigger de follow-ups e a trava atômica da fila.
2. `supabase/02_cron.sql` — agendamentos (trocar `__APP_URL__` e `__CRON_SECRET__` antes).

## Rotas

| Rota | Para quê |
|---|---|
| `/` | Painel: conta, automações, fila, eventos |
| `/automacoes/nova` · `/automacoes/[id]` | Criar e editar automações |
| `/api/webhook` | GET = handshake da Meta · POST = eventos |
| `/api/oauth/start` · `/api/oauth/callback` | Login do Instagram e assinatura dos webhooks |
| `/api/queue/drain` | Worker (Bearer `CRON_SECRET`) |
| `/api/token/refresh` | Renovação semanal do token de 60 dias |
| `/privacidade` · `/exclusao-de-dados` | Exigidas pela Meta para publicar o app |

## Limites reais

- **Não dá** para exigir que a pessoa siga antes de mandar o link — a API não expõe
  a relação de seguidor. Dá só para pedir no texto.
- **Não dá** para saber se a pessoa clicou no link; por isso o lembrete dispara por tempo.
- Disparo em massa para base fria é proibido pela Meta e derruba a conta. Aqui só
  respondemos quem interagiu primeiro.

## Desenvolvimento

```bash
npm run dev        # http://localhost:3000
npx tsc --noEmit   # typecheck
npm run build
```
