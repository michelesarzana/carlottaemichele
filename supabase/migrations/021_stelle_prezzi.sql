-- Posti "da non perdere" nei viaggi e prezzo da Google (0 = gratis)
alter table public.places add column if not exists starred boolean not null default false;
alter table public.places add column if not exists price_range text;
alter table public.places add column if not exists price_checked_at timestamptz;

do $$
declare c text;
begin
  for c in select conname from pg_constraint
    where conrelid = 'public.places'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%price%'
  loop
    execute format('alter table public.places drop constraint %I', c);
  end loop;
end $$;
alter table public.places add constraint places_price_check check (price between 0 and 4);

-- Il giro automatico passa anche sui posti di cui non abbiamo ancora chiesto il prezzo
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
    where lat is not null and (enriched_at is null or price_checked_at is null or (photo_url is null and photo_source is null))
  );
$job$);
