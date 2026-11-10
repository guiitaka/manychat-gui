-- Prospecção ativa: lista de abordados + estado da conversa + log de transições.
-- Rodar ANTES do deploy do código que usa estas tabelas.

create table if not exists prospects (
  id             uuid primary key default gen_random_uuid(),
  username       text not null unique,                 -- @ em minúsculas, sem "@"
  ig_id          text unique,                          -- preenchido na 1ª resposta (webhook)
  step           int  not null default 0,              -- 0 abordado · 1 · 2 · 3 · 4 handoff
  status         text not null default 'abordado'
                 check (status in ('abordado','em_conversa','nutricao','handoff','opt_out')),
  tags           text[] not null default '{prospeccao_enviada}',
  answers        jsonb not null default '{}'::jsonb,
  paused_until   timestamptz,                          -- handoff: bot calado até aqui
  handoff_count  int  not null default 0,
  last_mid       text not null default '',             -- última mensagem processada (anti-duplicata)
  contacted_at   timestamptz not null default now(),   -- quando a DM de abertura foi enviada
  last_inbound_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists prospects_status_idx on prospects (status);
create index if not exists prospects_unbound_idx on prospects (id) where ig_id is null;

-- Uma linha por transição, para o CRM (apple_leads) importar por created_at.
create table if not exists prospect_transitions (
  id             uuid primary key default gen_random_uuid(),
  prospect_id    uuid references prospects(id) on delete cascade,
  username       text not null,
  etapa          text not null
                 check (etapa in ('novo','em_conversa','proposta','negociando','ganho','perdido')),
  tags           text[] not null default '{}',
  note           text,
  proximo_followup date,
  created_at     timestamptz not null default now()
);

create index if not exists prospect_transitions_created_idx on prospect_transitions (created_at desc);

alter table prospects            enable row level security;
alter table prospect_transitions enable row level security;
