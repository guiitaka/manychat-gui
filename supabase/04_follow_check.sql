-- Checagem "segue o perfil" antes de liberar os follow-ups (lista VIP).
-- Rodar ANTES do deploy do código que usa estas colunas.
alter table automations
  add column if not exists require_follow boolean not null default false,
  add column if not exists not_following_message text;
