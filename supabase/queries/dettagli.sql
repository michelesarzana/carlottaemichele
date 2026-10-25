select json_build_object(
  'migrations', (select json_agg(name order by name) from public._migrations),
  'cron', (select json_agg(json_build_object('job', jobname, 'schedule', schedule)) from cron.job),
  'trigger', (select json_agg(tgname) from pg_trigger where tgrelid = 'public.places'::regclass and not tgisinternal),
  'chiamate', (select json_agg(json_build_object('status', status_code, 'err', error_msg, 'body', left(content, 1500), 'at', created) order by created desc) from (select * from net._http_response order by created desc limit 5) r),
  'posti', (select json_agg(json_build_object('name', name, 'url', url, 'phone', phone, 'hours', opening_hours, 'menu', menu_url, 'insta', instagram,
      'photo', left(photo_url, 80), 'credit', photo_credit, 'src', photo_source, 'enriched', enriched_at) order by created_at desc) from public.places)
) as stato;
