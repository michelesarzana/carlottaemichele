-- Voti con i mezzi punti (1; 1,5; 2 … 4) per visite e viaggi
do $$
declare r record;
begin
  for r in select conrelid::regclass as t, conname from pg_constraint
    where contype = 'c' and conrelid in ('public.visits'::regclass, 'public.trips'::regclass)
      and pg_get_constraintdef(oid) ~ 'vote_[cm]'
  loop
    execute format('alter table %s drop constraint %I', r.t, r.conname);
  end loop;
end $$;

alter table public.visits alter column vote_c type numeric(2,1), alter column vote_m type numeric(2,1);
alter table public.trips  alter column vote_c type numeric(2,1), alter column vote_m type numeric(2,1);

alter table public.visits add constraint visits_vote_c_check check (vote_c between 1 and 4 and vote_c * 2 = round(vote_c * 2));
alter table public.visits add constraint visits_vote_m_check check (vote_m between 1 and 4 and vote_m * 2 = round(vote_m * 2));
alter table public.trips  add constraint trips_vote_c_check  check (vote_c between 1 and 4 and vote_c * 2 = round(vote_c * 2));
alter table public.trips  add constraint trips_vote_m_check  check (vote_m between 1 and 4 and vote_m * 2 = round(vote_m * 2));
