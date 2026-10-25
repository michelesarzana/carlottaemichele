-- carlottaemichele · rifà la ricerca automatica dopo il passaggio da Overpass a Nominatim
-- 1. Dettagli: di nuovo per i posti senza sito e senza telefono
update public.places set enriched_at = null
where url is null and phone is null;

-- 2. Foto: tolte quelle prese a caso vicino al posto su Wikimedia Commons (scorci di strada, non il locale)
update public.places set photo_url = null, photo_credit = null, photo_source = null
where photo_source = 'auto' and photo_credit like '%Wikimedia Commons%';

-- 3. Avvia subito la funzione (il resto lo fa il controllo ogni 15 minuti)
select net.http_post(
  url := 'https://btyvzzmyzmlvyhxwavxd.supabase.co/functions/v1/enrich-places',
  body := '{}'::jsonb,
  headers := '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds := 120000
);
