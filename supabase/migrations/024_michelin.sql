-- Guida Michelin: stelle (0-3), stella verde, Bib Gourmand
alter table public.places add column if not exists michelin_stars smallint not null default 0 check (michelin_stars between 0 and 3);
alter table public.places add column if not exists michelin_green boolean not null default false;
alter table public.places add column if not exists michelin_bib boolean not null default false;

-- Verifica sulla Guida Michelin Italia e Spagna 2026 (novembre 2026): tra i posti salvati solo Il Colmetto ha una distinzione
update public.places set michelin_green = true where name ilike 'Il Colmetto%';
