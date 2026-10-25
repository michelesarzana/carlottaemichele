-- carlottaemichele · la ricerca su OpenStreetMap passa da GitHub (Supabase è bloccato da OSM):
-- rimette in coda i posti segnati come "cercati" senza aver trovato niente
update public.places set enriched_at = null
where url is null and phone is null and email is null and instagram is null;
