select row_to_json(p) as posto from (
  select id, name, category_id, lat, lng, area, address, url, source_url, phone, email, instagram, menu_url,
         opening_hours, photo_url, photo_source, photo_credit, enriched_at, created_at
  from public.places where id = '66384d09-e67a-4960-a835-56f6fa60a9ef'
) p;
