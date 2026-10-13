-- Mantiene vivo el proyecto (plan gratuito): cada 12 horas la base se llama a sí misma por la API REST.
-- Replace the project URL and the anon key before running it.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create or replace function public.keepalive() returns timestamptz
language sql stable
set search_path = ''
as $$ select now(); $$;
grant execute on function public.keepalive() to anon, authenticated;

select cron.unschedule('keepalive') where exists (select 1 from cron.job where jobname = 'keepalive');
select cron.schedule(
  'keepalive',
  '0 */12 * * *',
  $$ select net.http_post(
       url := 'https://YOUR-PROJECT-REF.supabase.co/rest/v1/rpc/keepalive',
       headers := jsonb_build_object('apikey', '<ANON_KEY>', 'Content-Type', 'application/json'),
       body := '{}'::jsonb
     ) $$
);
