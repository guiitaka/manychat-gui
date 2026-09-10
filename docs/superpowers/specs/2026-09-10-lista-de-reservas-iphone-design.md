# Lista de reservas — iPhone 18

## Contexto

O usuário quer uma página pública, bonita, para que clientes reservem a compra
dos iPhones recém-lançados (iPhone 18 Pro, iPhone 18 Pro Max, iPhone Duo),
integrada ao painel existente (manychat-gui: Next.js 16 App Router + Supabase,
tema escuro com gradiente de marca rosa/laranja, autenticação por cookie de
sessão via `lib/auth.ts` e `proxy.ts`).

## Rotas

| Rota | Acesso | Para quê |
|---|---|---|
| `/reservas` | Público (sem login) | Landing page + formulário de reserva |
| `/reservas-admin` | Protegido (login exigido) | Lista de reservas, contadores, ações |

`/reservas` entra na lista `PUBLIC` de `proxy.ts` (correspondência exata,
igual `/privacidade`). `/reservas-admin` **não** entra nessa lista, então cai
no comportamento padrão do proxy: exige o cookie `mcg_session`, redireciona
para `/login` caso contrário — igual `/materiais` e `/automacoes` hoje.

O painel principal (`app/page.tsx`) ganha um link **"Reservas"** no cabeçalho
de ações, ao lado do link "Materiais" já existente, apontando para
`/reservas-admin`.

## Dados

Nova migration `supabase/03_reservations.sql`, seguindo o padrão das
existentes (RLS ligado, sem policies — só a service key do servidor acessa):

```sql
create table if not exists reservations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text not null,
  model      text not null check (model in ('iPhone 18 Pro','iPhone 18 Pro Max','iPhone Duo')),
  status     text not null default 'pending' check (status in ('pending','contacted')),
  created_at timestamptz not null default now()
);

create index if not exists reservations_created_idx on reservations (created_at desc);
create index if not exists reservations_model_idx on reservations (model);

alter table reservations enable row level security;
```

Tipo correspondente em `lib/types.ts`:

```ts
export type ReservationModel = "iPhone 18 Pro" | "iPhone 18 Pro Max" | "iPhone Duo";

export type Reservation = {
  id: string;
  name: string;
  phone: string;
  model: ReservationModel;
  status: "pending" | "contacted";
  created_at: string;
};
```

## Página pública `/reservas`

Arquivo: `app/reservas/page.tsx` (Server Component, `dynamic = "force-dynamic"`
como as demais páginas do app) + `app/reservas/actions.ts` (Server Action,
**sem** `guard()` — é a única ação do app que roda sem sessão, propositalmente,
porque o autor da reserva nunca está logado).

**Hero** (topo, fundo escuro com glow radial rosa/laranja — reaproveitando
`--color-brand` / `--color-brand-2` de `globals.css`):

- Título grande: "Reserve o seu iPhone 18"
- Subtítulo: "Os novos iPhones acabaram de chegar. Garanta prioridade na fila
  assim que forem liberados."

**Formulário** (card abaixo do hero, mesma classe `.card`/`.field`/`.btn` já
usadas em `/materiais`):

- Nome completo (`text`, obrigatório)
- WhatsApp (`tel`, obrigatório) — sem máscara/lib nova, campo de texto livre
- Modelo de interesse: **3 cards clicáveis lado a lado** (radio inputs
  estilizados como cards, um por `ReservationModel`), obrigatório
- Botão "Reservar agora" (`.btn-primary`, gradiente da marca)

**Submissão** (`createReservation` em `app/reservas/actions.ts`):

1. Lê `name`, `phone`, `model` do `FormData`.
2. Valida: `name` e `phone` não vazios (trim), `model` é um dos 3 valores
   permitidos (allow-list no servidor — nunca confia no valor vindo do form).
3. Se inválido → `redirect("/reservas?erro=...&name=...&phone=...")` — a
   página volta preenchendo os campos com o que a pessoa já tinha digitado
   (mesmo padrão de preservar contexto usado em `/materiais`).
4. Se válido → insere em `reservations`, depois
   `redirect("/reservas?ok=1&nome=<name>&modelo=<model>")`.

**Confirmação** — quando `searchParams.ok === "1"`, a página troca o
formulário por um card de sucesso:

> "Reserva confirmada, {nome}! Você entrou na lista para o {modelo}."

com um botão **"Falar no WhatsApp"** linkando para
`https://wa.me/5511979607922?text=<mensagem pré-preenchida com nome e modelo>`
(número fixo em uma constante no arquivo da página — não é segredo, não
precisa ir para `.env`) e um link "Fazer outra reserva" que volta ao
formulário vazio (`/reservas`).

## Página administrativa `/reservas-admin`

Arquivo: `app/reservas-admin/page.tsx` + `app/reservas-admin/actions.ts`
(ambas as actions usam `guard()`, igual ao restante do painel).

- `redirect("/login")` se `!isLoggedIn()` (mesmo padrão de `/materiais`).
- Link "← Voltar ao painel" no topo.
- **Contadores**: 4 `Stat` cards (reaproveitando o padrão de `app/page.tsx`) —
  total geral + um por modelo.
- **Filtro por modelo**: links simples (`?modelo=iPhone+18+Pro`) que destacam
  a aba ativa, sem estado de cliente — filtragem via `searchParams` e `.eq()`
  no Supabase, mesmo espírito dos filtros que já existem no app.
- **Lista**: um item por reserva — nome, telefone (também é um link
  `wa.me/<telefone>`), tag do modelo, bolinha de status (pendente = âmbar,
  contatado = verde, reaproveitando `--color-warn`/`--color-ok`), data
  (`fmt()` de `lib/time.ts`).
- **Ações por linha** (Server Actions, `revalidatePath("/reservas-admin")`
  depois):
  - `markContacted` — alterna `status` entre `pending`/`contacted` (mesmo
    padrão de `toggleAutomation`).
  - `deleteReservation` — remove a linha (mesmo padrão de `deleteMaterial`).

## Erros e casos de borda

- Formulário público enviado sem nome/telefone → mensagem de erro na própria
  página, dados preenchidos preservados.
- Modelo fora da allow-list (manipulação do form) → tratado como inválido no
  servidor, mesma mensagem de erro genérica.
- Falha ao inserir no Supabase → `redirect("/reservas?erro=...")` com o texto
  do erro truncado, mesmo padrão de `uploadMaterial`.
- `/reservas-admin` sem reservas ainda → estado vazio ("Nenhuma reserva
  ainda"), mesmo padrão usado em `/materiais` e nas automações.

## Fora de escopo (YAGNI)

- Sem notificação automática (e-mail/Instagram/Slack) quando alguém reserva —
  o admin confere manualmente em `/reservas-admin`.
- Sem limite de vagas por modelo, sem paginação (volume esperado é pequeno).
- Sem máscara de telefone / biblioteca nova — campo de texto livre.
- Sem deduplicação de reservas repetidas.
