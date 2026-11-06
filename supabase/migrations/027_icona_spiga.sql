-- Categoria gluten free: icona della spiga
update public.categories set icon = 'wheat' where name ilike '%gluten%' or id ilike '%gluten%';
