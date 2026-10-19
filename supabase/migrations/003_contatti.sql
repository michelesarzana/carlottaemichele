-- carlottaemichele · contatti, orari e menù dei posti
alter table public.places add column if not exists phone text;
alter table public.places add column if not exists email text;
alter table public.places add column if not exists instagram text;
alter table public.places add column if not exists menu_url text;
alter table public.places add column if not exists opening_hours text;
-- quando sono stati cercati i dettagli in automatico (null = mai)
alter table public.places add column if not exists enriched_at timestamptz;
