-- carlottaemichele · viaggio a Salzana: 5 posti dove mangiare in Val Taleggio
-- Si ferma senza toccare nulla se il viaggio non si trova, o se ce n'è più di uno.
do $$
declare
  v_trip uuid;
  v_n    int;
begin
  select count(*) into v_n from public.trips
  where name ilike '%salzana%' or destination ilike '%salzana%';
  if v_n <> 1 then
    raise exception 'Viaggio Salzana: trovati % viaggi, ne serve esattamente 1', v_n;
  end if;

  select id into v_trip from public.trips
  where name ilike '%salzana%' or destination ilike '%salzana%';

  insert into public.places (name, category_id, lat, lng, area, address, price, url, notes, proposed_by, trip_id)
  select v.name, 'ristoranti', v.lat, v.lng, v.area, v.address, v.price, v.url, v.notes, 'Michele', v_trip
  from (values
    ('Ristorante San Marco', 45.8923477, 9.567675, 'Taleggio', 'Via Santa Rosa, 1, Taleggio (BG)', 2, null,
     'Pasta fresca, porzioni abbondanti, prezzi bassi. Il lunedì chiude alle 15:30.'),
    ('Duca d''Aosta', 45.8929659, 9.5638639, 'Sottochiesa', 'SP25, Sottochiesa (BG)', 2, 'https://www.caffeducadaosta.it/',
     'Casoncelli, gnocchetti con fonduta, taglieri locali. Ha anche il banco dei formaggi. Chiuso il martedì.'),
    ('Trattoria Nonno Fifì', 45.8973451, 9.5526313, 'Reggetto, Vedeseta', 'Frazione Reggetto, Vedeseta (BG)', 2, null,
     'Solo pranzo, vista sul Resegone, molto semplice. Chiuso il martedì.'),
    ('Albergo Ristorante dell''Angelo', 45.8907763, 9.5394732, 'Vedeseta', 'Via Centro, 11, Vedeseta (BG)', null, null,
     'In piazza, buon rapporto qualità prezzo. Ha anche camere se vuoi fermarti.'),
    ('Trattoria dell''Arlecchino', 45.8823292, 9.6339516, 'Roncaglia, San Giovanni Bianco', 'Via Roncaglia Entro, 72, San Giovanni Bianco (BG)', 2, 'https://www.trattoriadellarlecchino.it/',
     'All''imbocco dell''Orrido. Polenta ottima. Chiuso il lunedì.')
  ) as v(name, lat, lng, area, address, price, url, notes)
  where not exists (
    select 1 from public.places p where p.trip_id = v_trip and lower(p.name) = lower(v.name)
  );
end $$;
