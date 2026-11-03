select (select json_agg(name order by name desc) from (select name from public._migrations order by name desc limit 4) m) as ultime,
  (select json_agg(column_name) from information_schema.columns where table_name='places' and column_name like 'michelin%') as colonne;
