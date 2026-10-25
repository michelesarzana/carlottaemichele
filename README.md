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

4. Il resto lo fa GitHub: il flusso `.github/workflows/supabase.yml` applica gli script in `supabase/migrations` e pubblica le funzioni. Serve il segreto `SUPABASE_ACCESS_TOKEN` (Supabase › Account › Access Tokens) nelle impostazioni della repo.

## Dettagli e foto automatici

Ogni posto nuovo si compila da solo, sul server: sito, telefono, email, Instagram, orari, menù e foto.
Il database chiama la funzione `enrich-places` appena il posto è salvato, e la richiama ogni 15 minuti per quelli rimasti indietro. Funziona anche se chiudete l'app subito dopo aver salvato. Compila solo i campi vuoti.

Fonti: OpenStreetMap, il sito del posto, Wikipedia e Wikimedia Commons per la foto.
Facoltativo: con il segreto `GOOGLE_PLACES_KEY` su Supabase (Edge Functions › Secrets) usa anche Google Places, che ha telefono, orari e foto di quasi tutti i locali. La foto di Google viene copiata nel bucket `photos`.

Le foto vostre vengono ridotte a 1600 px e caricate nel bucket pubblico `photos`. Dalla scheda potete sempre sceglierne un'altra.

## Guide AI

Le guide si generano con Claude e finiscono nella tabella `guides` come bozza (`published = false`). Dal sito si pubblicano o si ritirano.

Formato di `items`:

```json
[{ "name": "…", "area": "…", "lat": 45.5, "lng": 10.9, "why": "…", "verified": true, "category": "ristoranti", "url": "…" }]
```
