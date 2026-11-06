-- Nuova categoria Pokémon (negozi di carte, eventi, posti a tema), icona delle carte da collezione
insert into public.categories (id, name, color, icon, sort) values
  ('pokemon', 'Pokémon', '#3B6FD8', 'cards', 90)
on conflict (id) do update set name = excluded.name, color = excluded.color, icon = excluded.icon;
