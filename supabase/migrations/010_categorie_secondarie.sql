-- carlottaemichele · categorie secondarie: una principale (category_id) più al massimo due secondarie
alter table public.places add column if not exists extra_categories text[] not null default '{}';

alter table public.places drop constraint if exists places_extra_categories_max;
alter table public.places add constraint places_extra_categories_max
  check (coalesce(array_length(extra_categories, 1), 0) <= 2 and not (category_id = any (extra_categories)));

create index if not exists places_extra_categories_idx on public.places using gin (extra_categories);
