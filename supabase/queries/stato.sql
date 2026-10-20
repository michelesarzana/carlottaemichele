select json_build_object(
  'migrations', (select json_agg(name order by name) from public._migrations),
  'guides', (select json_agg(json_build_object('slug', slug, 'title', title, 'published', published, 'items', jsonb_array_length(items))) from public.guides),
  'places', (select json_agg(json_build_object(
      'id', id, 'name', name, 'category', category_id, 'area', area, 'address', address, 'lat', lat, 'lng', lng,
      'url', url, 'phone', phone, 'email', email, 'instagram', instagram, 'menu_url', menu_url,
      'opening_hours', opening_hours, 'photo', photo_url is not null, 'photo_source', photo_source,
      'enriched_at', enriched_at, 'source_url', source_url) order by created_at) from public.places),
  'trips', (select json_agg(json_build_object('name', name, 'cover', cover_url is not null)) from public.trips)
) as stato;
