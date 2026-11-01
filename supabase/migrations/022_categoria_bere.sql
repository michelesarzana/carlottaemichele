-- Nuova categoria "Bere" (birrerie, pub, cocktail bar), icona boccale
insert into public.categories (id, name, color, icon, sort) values
  ('bere', 'Bere', '#C27C0E', 'beer', 25)
on conflict (id) do update set name = excluded.name, color = excluded.color, icon = excluded.icon;
