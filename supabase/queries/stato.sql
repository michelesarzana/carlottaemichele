select json_build_object(
  'migrations', (select json_agg(name order by name) from public._migrations),
  'guides', (select json_agg(json_build_object('slug', slug, 'published', published)) from public.guides),
  'places', (select json_agg(json_build_object(
      'name', name, 'url', url, 'phone', phone, 'email', email, 'instagram', instagram, 'menu_url', menu_url,
      'opening_hours', opening_hours, 'photo_url', photo_url, 'photo_credit', photo_credit) order by created_at) from public.places)
) as stato;
