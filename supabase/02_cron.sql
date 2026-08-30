-- ============================================================
-- Motor sem custo: pg_cron + pg_net do Supabase.
-- O plano grátis da Vercel não roda cron de minuto — quem bate no
-- endpoint é o próprio Postgres.
--
-- ANTES DE RODAR: troque __APP_URL__ e __CRON_SECRET__ pelos valores reais.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove agendamentos antigos (idempotente)
select cron.unschedule(jobid) from cron.job
 where jobname in ('drenar-fila-instagram', 'renovar-token-instagram');

-- 1) Drena a fila a cada minuto
select cron.schedule(
  'drenar-fila-instagram',
  '* * * * *',
  $job$
  select net.http_post(
    url     := '__APP_URL__/api/queue/drain?limit=20',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer __CRON_SECRET__'
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);

-- 2) Renova o token longo toda segunda-feira às 03:00 UTC (00:00 em São Paulo)
select cron.schedule(
  'renovar-token-instagram',
  '0 3 * * 1',
  $job$
  select net.http_post(
    url     := '__APP_URL__/api/token/refresh',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer __CRON_SECRET__'
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);

-- Conferir os agendamentos:
--   select jobid, jobname, schedule, active from cron.job;
-- Conferir as últimas execuções:
--   select * from cron.job_run_details order by start_time desc limit 10;
