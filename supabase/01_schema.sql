-- ============================================================
-- ManyChat GUI — schema completo
-- Rode este arquivo inteiro no SQL Editor do Supabase.
-- Tudo com RLS ligado e SEM policies: acesso só via service key (servidor).
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- config: uma única linha com a conta conectada
-- ------------------------------------------------------------
create table if not exists config (
  id                  int primary key default 1 check (id = 1),
  ig_user_id          text,
  ig_username         text,
  ig_name             text,
  profile_picture_url text,
  access_token        text,
  token_expires_at    timestamptz,
  token_refreshed_at  timestamptz,
  updated_at          timestamptz not null default now()
);
insert into config (id) values (1) on conflict (id) do nothing;

-- ------------------------------------------------------------
-- automations: as regras que você cria no painel
-- ------------------------------------------------------------
create table if not exists automations (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  active              boolean not null default true,

  -- gatilhos
  trigger_comment     boolean not null default true,
  trigger_story       boolean not null default false,
  trigger_dm          boolean not null default false,

  -- palavras-chave
  keywords            text[] not null default '{}',
  match_type          text not null default 'contains'
                      check (match_type in ('contains','exact','any')),

  -- limitar a um post específico (null = vale para todos)
  media_id            text,

  -- resposta pública no comentário (sorteia entre as variações)
  public_replies      text[] not null default '{}',

  -- DM de boas-vindas (resposta privada, fura a janela de 24h)
  welcome_dm          text not null default '',
  quick_reply_label   text,

  -- follow-up 1: a mensagem com o link
  link_message        text,
  link_button_label   text,
  link_url            text,
  link_delay_minutes  int not null default 0,

  -- follow-up 2: o lembrete
  reminder_message    text,
  reminder_delay_minutes int not null default 1440,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists automations_active_idx on automations (active);

-- ------------------------------------------------------------
-- followups: sequência de envio, DERIVADA da automação
-- (regenerada automaticamente por trigger — não edite na mão)
-- ------------------------------------------------------------
create table if not exists followups (
  id             uuid primary key default gen_random_uuid(),
  automation_id  uuid not null references automations(id) on delete cascade,
  step           int  not null,
  kind           text not null check (kind in ('link','reminder')),
  delay_minutes  int  not null default 0,
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  unique (automation_id, step)
);

create index if not exists followups_automation_idx on followups (automation_id, step);

create or replace function rebuild_followups() returns trigger
language plpgsql as $$
begin
  delete from followups where automation_id = new.id;

  if coalesce(new.link_url, '') <> '' or coalesce(new.link_message, '') <> '' then
    insert into followups (automation_id, step, kind, delay_minutes, payload)
    values (
      new.id, 1, 'link', greatest(new.link_delay_minutes, 0),
      jsonb_build_object(
        'text',   coalesce(new.link_message, ''),
        'url',    coalesce(new.link_url, ''),
        'button', coalesce(new.link_button_label, 'Abrir')
      )
    );
  end if;

  if coalesce(new.reminder_message, '') <> '' then
    insert into followups (automation_id, step, kind, delay_minutes, payload)
    values (
      new.id, 2, 'reminder', greatest(new.reminder_delay_minutes, 0),
      jsonb_build_object('text', new.reminder_message)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists automations_rebuild_followups on automations;
create trigger automations_rebuild_followups
  after insert or update on automations
  for each row execute function rebuild_followups();

-- ------------------------------------------------------------
-- contacts: quem já interagiu
-- ------------------------------------------------------------
create table if not exists contacts (
  id                  uuid primary key default gen_random_uuid(),
  ig_id               text not null unique,
  username            text,
  first_seen_at       timestamptz not null default now(),
  last_reply_at       timestamptz,          -- resposta da pessoa = abre janela de 24h
  last_automation_id  uuid references automations(id) on delete set null,
  updated_at          timestamptz not null default now()
);

-- ------------------------------------------------------------
-- queue: fila de envio com trava atômica
-- ------------------------------------------------------------
create table if not exists queue (
  id                   uuid primary key default gen_random_uuid(),
  status               text not null default 'pending'
                       check (status in ('pending','sending','sent','failed','skipped')),
  kind                 text not null
                       check (kind in ('private_reply','public_reply','welcome_dm','link','reminder')),
  automation_id        uuid references automations(id) on delete set null,
  contact_id           uuid references contacts(id) on delete cascade,

  recipient_comment_id text,   -- resposta privada (fura a janela de 24h)
  recipient_ig_id      text,   -- DM normal
  comment_id           text,   -- alvo da resposta pública

  payload              jsonb not null default '{}'::jsonb,
  requires_window      boolean not null default true,  -- precisa da janela de 24h aberta?

  run_after            timestamptz not null default now(),
  attempts             int not null default 0,
  claimed_at           timestamptz,
  sent_at              timestamptz,
  last_error           text,
  dedupe_key           text unique,
  created_at           timestamptz not null default now()
);

create index if not exists queue_ready_idx    on queue (status, run_after);
create index if not exists queue_sent_at_idx  on queue (sent_at desc);

-- Trava atômica: marca como 'sending' e devolve as linhas travadas.
-- FOR UPDATE SKIP LOCKED garante que dois workers nunca peguem o mesmo item.
-- Itens presos em 'sending' há mais de 5 min voltam a ser elegíveis.
create or replace function claim_queue_items(p_limit int default 20)
returns setof queue
language sql as $$
  update queue q
     set status     = 'sending',
         claimed_at = now(),
         attempts   = q.attempts + 1
   where q.id in (
     select id from queue
      where (status = 'pending' and run_after <= now())
         or (status = 'sending' and claimed_at < now() - interval '5 minutes')
      order by run_after asc
      limit p_limit
      for update skip locked
   )
  returning q.*;
$$;

-- Quantas DMs automáticas saíram na última hora (limite prático da Meta: ~200/h)
create or replace function dm_sent_last_hour()
returns int
language sql stable as $$
  select count(*)::int
    from queue
   where status = 'sent'
     and kind <> 'public_reply'
     and sent_at > now() - interval '1 hour';
$$;

-- ------------------------------------------------------------
-- events: log cru de tudo que chega no webhook
-- ------------------------------------------------------------
create table if not exists events (
  id                    uuid primary key default gen_random_uuid(),
  kind                  text,
  ig_id                 text,
  username              text,
  text                  text,
  comment_id            text,
  media_id              text,
  matched_automation_id uuid references automations(id) on delete set null,
  note                  text,
  raw                   jsonb,
  created_at            timestamptz not null default now()
);

create index if not exists events_created_idx on events (created_at desc);

-- ------------------------------------------------------------
-- RLS ligado em tudo, sem policies (só service key entra)
-- ------------------------------------------------------------
alter table config     enable row level security;
alter table automations enable row level security;
alter table followups  enable row level security;
alter table contacts   enable row level security;
alter table queue      enable row level security;
alter table events     enable row level security;
