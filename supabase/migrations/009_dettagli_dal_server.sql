-- carlottaemichele · dettagli e foto dei posti compilati dal server
-- A ogni posto nuovo il database chiama la funzione enrich-places.
-- Ogni 15 minuti la richiama, per i posti rimasti indietro (rete lenta, fonti giù).
-- La chiamata è asincrona: il salvataggio non aspetta.

create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public.chiedi_dettagli() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url := 'https://btyvzzmyzmlvyhxwavxd.supabase.co/functions/v1/enrich-places',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 120000
  );
  return null;
end $$;

drop trigger if exists posti_dettagli on public.places;
create trigger posti_dettagli after insert on public.places
  for each statement execute function public.chiedi_dettagli();

select cron.unschedule(jobid) from cron.job where jobname = 'dettagli-posti';
select cron.schedule('dettagli-posti', '*/15 * * * *', $job$
  select net.http_post(
    url := 'https://btyvzzmyzmlvyhxwavxd.supabase.co/functions/v1/enrich-places',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 120000
  )
  where exists (
    select 1 from public.places
    where lat is not null and (enriched_at is null or (photo_url is null and photo_source is null))
  );
$job$);
