-- carlottaemichele · schema del database
-- Da incollare una volta nel SQL Editor di Supabase.
-- Tutti leggono, solo gli editor (tabella editors) scrivono.
-- Le date delle visite sono in una tabella separata, leggibile solo dagli editor.

-- ─────────────────────────────────────────────
-- Editor: chi può scrivere. Le email NON stanno in questo file pubblico,
-- si inseriscono a parte (vedi README).
-- ─────────────────────────────────────────────
create table if not exists public.editors (
  email text primary key,
  name  text not null
);
alter table public.editors enable row level security;
-- nessuna policy: la tabella non è leggibile da fuori

create or replace function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.editors
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.my_editor_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select name from public.editors
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

grant execute on function public.is_editor() to anon, authenticated;
grant execute on function public.my_editor_name() to anon, authenticated;

-- ─────────────────────────────────────────────
-- Categorie
-- ─────────────────────────────────────────────
create table if not exists public.categories (
  id    text primary key,
  name  text not null,
  color text not null,
  icon  text not null,
  sort  int  not null default 100
);
alter table public.categories enable row level security;
create policy "categorie: lettura pubblica" on public.categories for select using (true);
create policy "categorie: scrittura editor" on public.categories for all
  using (public.is_editor()) with check (public.is_editor());

insert into public.categories (id, name, color, icon, sort) values
  ('ristoranti', 'Ristoranti',     '#D9480F', 'fork',     10),
  ('bar',        'Bar e caffè',    '#8A5A2B', 'cup',      20),
  ('vino',       'Vino e cantine', '#5E3A87', 'wine',     30),
  ('negozi',     'Negozi',         '#2F6FDB', 'bag',      40),
  ('posti',      'Posti',          '#2B7A4B', 'mountain', 50),
  ('esperienze', 'Esperienze',     '#C2367A', 'star',     60),
  ('dormire',    'Dormire',        '#4B4FB8', 'bed',      70),
  ('viaggi',     'Viaggi',         '#0F7F7F', 'plane',    80)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────
-- Guide AI
-- ─────────────────────────────────────────────
create table if not exists public.guides (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,
  title      text not null,
  prompt     text,
  intro      text,
  items      jsonb not null default '[]'::jsonb,
  published  boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.guides enable row level security;
create policy "guide: pubbliche per tutti, bozze per editor" on public.guides for select
  using (published or public.is_editor());
create policy "guide: scrittura editor" on public.guides for all
  using (public.is_editor()) with check (public.is_editor());

-- ─────────────────────────────────────────────
-- Posti
-- ─────────────────────────────────────────────
create table if not exists public.places (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category_id text not null references public.categories(id) on update cascade,
  lat         double precision not null,
  lng         double precision not null,
  area        text,
  address     text,
  price       smallint check (price between 1 and 4),
  url         text,
  source_url  text,
  notes       text,
  proposed_by text,
  guide_id    uuid references public.guides(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.places enable row level security;
create policy "posti: lettura pubblica" on public.places for select using (true);
create policy "posti: scrittura editor" on public.places for all
  using (public.is_editor()) with check (public.is_editor());

-- ─────────────────────────────────────────────
-- Visite: voti e recensione sono pubblici, le date no.
-- seq ordina le visite senza rivelare quando sono avvenute.
-- ─────────────────────────────────────────────
create table if not exists public.visits (
  id        uuid primary key default gen_random_uuid(),
  seq       bigint generated always as identity,
  place_id  uuid not null references public.places(id) on delete cascade,
  vote_c    smallint check (vote_c between 1 and 4),
  vote_m    smallint check (vote_m between 1 and 4),
  review    text,
  review_by text
);
alter table public.visits enable row level security;
create policy "visite: lettura pubblica" on public.visits for select using (true);
create policy "visite: scrittura editor" on public.visits for all
  using (public.is_editor()) with check (public.is_editor());

create table if not exists public.visit_dates (
  visit_id   uuid primary key references public.visits(id) on delete cascade,
  visited_on date not null
);
alter table public.visit_dates enable row level security;
create policy "date: solo editor" on public.visit_dates for all
  using (public.is_editor()) with check (public.is_editor());

-- I visitatori anonimi non vedono le date nemmeno per errore.
revoke all on public.visit_dates from anon;

create index if not exists places_category_idx on public.places (category_id);
create index if not exists visits_place_idx on public.visits (place_id, seq desc);
