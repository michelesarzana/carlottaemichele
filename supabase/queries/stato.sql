select json_agg(json_build_object(
  'id', id, 'name', name, 'cat', category_id, 'extra', extra_categories, 'area', area, 'lat', lat, 'lng', lng,
  'url', url, 'phone', phone, 'email', email, 'insta', instagram, 'menu', menu_url, 'hours', opening_hours,
  'photo', photo_url, 'photo_source', photo_source, 'enriched_at', enriched_at, 'source_url', source_url
) order by created_at) as places from public.places;
-- 2026-10-25T10:21:28
