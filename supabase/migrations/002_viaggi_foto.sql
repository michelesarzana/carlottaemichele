-- carlottaemichele · viaggi e foto
-- Da incollare una volta nel SQL Editor di Supabase, dopo schema.sql.

-- ─────────────────────────────────────────────
-- Viaggi
-- ─────────────────────────────────────────────
create table if not exists public.trips (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  destination  text,
  lat          double precision,
  lng          double precision,
  status       text not null default 'sogno' check (status in ('sogno', 'programma', 'fatto')),
  use_days     boolean not null default false,
  cover_url    text,
  cover_credit text,
  vote_c       smallint check (vote_c between 1 and 4),
  vote_m       smallint check (vote_m between 1 and 4),
  review       text,
  created_at   timestamptz not null default now()
);
alter table public.trips enable row level security;
drop policy if exists "viaggi: lettura pubblica" on public.trips;
create policy "viaggi: lettura pubblica" on public.trips for select using (true);
drop policy if exists "viaggi: scrittura editor" on public.trips;
create policy "viaggi: scrittura editor" on public.trips for all
  using (public.is_editor()) with check (public.is_editor());

-- Date dei viaggi: solo editor
create table if not exists public.trip_dates (
  trip_id  uuid primary key references public.trips(id) on delete cascade,
  start_on date,
  end_on   date
);
alter table public.trip_dates enable row level security;
drop policy if exists "date viaggi: solo editor" on public.trip_dates;
create policy "date viaggi: solo editor" on public.trip_dates for all
  using (public.is_editor()) with check (public.is_editor());
revoke all on public.trip_dates from anon;

-- ─────────────────────────────────────────────
-- Posti: viaggio, giorno, foto
-- ─────────────────────────────────────────────
alter table public.places add column if not exists trip_id uuid references public.trips(id) on delete set null;
alter table public.places add column if not exists day smallint check (day between 1 and 60);
alter table public.places add column if not exists photo_url text;
alter table public.places add column if not exists photo_credit text;
-- 'own' = foto vostra, 'auto' = trovata in automatico, 'none' = cercata senza risultato
alter table public.places add column if not exists photo_source text;

create index if not exists places_trip_idx on public.places (trip_id);

-- La vecchia categoria Viaggi non serve più (se non è usata)
delete from public.categories c
where c.id = 'viaggi' and not exists (select 1 from public.places p where p.category_id = c.id);

-- ─────────────────────────────────────────────
-- Spazio file per le foto: lettura pubblica, scrittura editor
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "foto: lettura pubblica" on storage.objects;
create policy "foto: lettura pubblica" on storage.objects for select
  using (bucket_id = 'photos');
drop policy if exists "foto: caricamento editor" on storage.objects;
create policy "foto: caricamento editor" on storage.objects for insert
  with check (bucket_id = 'photos' and public.is_editor());
drop policy if exists "foto: modifica editor" on storage.objects;
create policy "foto: modifica editor" on storage.objects for update
  using (bucket_id = 'photos' and public.is_editor());
drop policy if exists "foto: eliminazione editor" on storage.objects;
create policy "foto: eliminazione editor" on storage.objects for delete
  using (bucket_id = 'photos' and public.is_editor());
