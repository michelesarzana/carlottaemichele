# carlottaemichele

I posti di Carlotta e Michele: ristoranti, cantine, negozi e viaggi. Da fare e già fatti, su una mappa.

Sito statico su GitHub Pages. Dati e accesso su Supabase. Mappa MapLibre con tile OpenFreeMap, ricerca indirizzi OpenStreetMap Nominatim.

## Come è fatto

- `index.html`, `css/app.css`, `js/` · il sito, senza build
- `js/config.js` · URL e chiave pubblica di Supabase (pubblica per natura)
- `supabase/schema.sql` · tabelle e regole di sicurezza

Tutti leggono. Scrive solo chi è nella tabella `editors`.
Voti e recensioni sono pubblici. Le date delle visite stanno in `visit_dates`, leggibile solo dagli editor.

## Prima installazione

1. Supabase › SQL Editor › incolla `supabase/schema.sql` › Run.
2. Sempre nel SQL Editor, aggiungi gli editor (le email non stanno nel repo):

   ```sql
   insert into public.editors (email, name) values
     ('email-di-carlotta', 'Carlotta'),
     ('email-di-michele', 'Michele');
   ```

3. Authentication › URL Configuration:
   - Site URL: l'indirizzo del sito
   - Redirect URLs: lo stesso indirizzo

## Guide AI

Le guide si generano con Claude e finiscono nella tabella `guides` come bozza (`published = false`). Dal sito si pubblicano o si ritirano.

Formato di `items`:

```json
[{ "name": "…", "area": "…", "lat": 45.5, "lng": 10.9, "why": "…", "verified": true, "category": "ristoranti", "url": "…" }]
```
