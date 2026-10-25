select json_build_object(
  'usage', (select json_agg(row_to_json(u)) from public.api_usage u),
  'places', (select json_agg(json_build_object(
    'name', name, 'url', url, 'phone', phone, 'email', email, 'insta', instagram, 'menu', menu_url, 'hours', opening_hours,
    'photo', photo_url, 'credit', photo_credit, 'photo_source', photo_source, 'enriched_at', enriched_at, 'google', google_checked_at
  ) order by created_at) from public.places)
) as stato;
-- 2026-10-25T11:20:16
