select id, name, area, address, category_id, extra_categories from places
where category_id in ('ristoranti','vino','bar','bere') or extra_categories && array['ristoranti']
order by category_id, name;
