select (select count(*) from places) as posti,
  (select count(*) from places where price_checked_at is not null) as prezzo_cercato,
  (select count(*) from places where price is not null) as con_prezzo,
  (select json_agg(json_build_object('n', name, 'p', price, 'r', price_range)) from (select name, price, price_range from places where price_checked_at is not null order by price_checked_at desc limit 12) x) as esempi,
  (select json_agg(u) from (select * from api_usage order by 1 desc limit 6) u) as uso;
