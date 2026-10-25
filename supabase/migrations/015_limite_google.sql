-- carlottaemichele · Google Places senza mai pagare
-- 1. Ogni posto si cerca su Google una volta sola
alter table public.places add column if not exists google_checked_at timestamptz;

-- 2. Contatore mensile: la funzione si ferma prima della quota gratuita (1.000 al mese per tipo)
create table if not exists public.api_usage (
  month text not null,
  kind  text not null,
  count int  not null default 0,
  primary key (month, kind)
);
alter table public.api_usage enable row level security;   -- nessuna policy: non leggibile da fuori

create or replace function public.use_quota(p_kind text, p_max int)
returns boolean language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  insert into public.api_usage (month, kind, count)
  values (to_char(now() at time zone 'utc', 'YYYY-MM'), p_kind, 1)
  on conflict (month, kind) do update set count = api_usage.count + 1
    where api_usage.count < p_max
  returning true into ok;
  return coalesce(ok, false);
end $$;
revoke all on function public.use_quota(text, int) from public, anon, authenticated;
grant execute on function public.use_quota(text, int) to service_role;

-- 3. Rimette in coda i posti ancora senza dettagli o senza foto, perché li provi anche Google
update public.places set enriched_at = null
where url is null and phone is null and email is null and instagram is null;
update public.places set photo_source = null
where photo_url is null and photo_source = 'none';
