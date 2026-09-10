-- ============================================================
-- Lista de reservas do iPhone 18 (/reservas)
-- Rode este arquivo no SQL Editor do Supabase.
-- RLS ligado e SEM policies: só a service key (servidor) acessa.
-- ============================================================

create table if not exists reservations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text not null,
  model      text not null
             check (model in ('iPhone 18 Pro','iPhone 18 Pro Max','iPhone Duo')),
  status     text not null default 'pending'
             check (status in ('pending','contacted')),
  created_at timestamptz not null default now()
);

create index if not exists reservations_created_idx on reservations (created_at desc);
create index if not exists reservations_model_idx on reservations (model);

alter table reservations enable row level security;
