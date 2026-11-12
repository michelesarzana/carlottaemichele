-- Categorie con le emoji al posto delle icone al tratto
update public.categories set icon = case icon
  when 'fork' then '🍴' when 'cup' then '☕' when 'beer' then '🍺' when 'wine' then '🍷'
  when 'wheat' then '🌾' when 'cards' then '🎴' when 'bag' then '🛍️' when 'mountain' then '🏞️'
  when 'star' then '⭐' when 'bed' then '🛏️' when 'plane' then '✈️' when 'heart' then '❤️'
  when 'pin' then '📍' else icon end;
update public.categories set icon = '🎟️' where id = 'esperienze';
