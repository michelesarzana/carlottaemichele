-- Cucina dei posti dove mangiare (fino a 3 etichette, es. {Giapponese, Sushi})
alter table public.places add column if not exists cuisines text[] not null default '{}';
alter table public.places add column if not exists cuisine_checked_at timestamptz;
-- I posti che non sono da mangiare non vanno cercati
update public.places set cuisine_checked_at = now()
where not (category_id in ('ristoranti', 'bar', 'bere', 'vino') or extra_categories && array['ristoranti', 'bar', 'bere', 'vino']);

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
    where lat is not null and (enriched_at is null or price_checked_at is null or cuisine_checked_at is null or (photo_url is null and photo_source is null))
  );
$job$);
