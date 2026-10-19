-- carlottaemichele · guida "Osterie della Valpolicella" (bozza)
insert into public.guides (slug, title, prompt, intro, items, published)
values (
  'osterie-valpolicella',
  'Osterie della Valpolicella',
  'cercami tutte le osterie della Valpolicella',
  'Osterie e trattorie di cucina veronese tra Negrar, Marano, Fumane, Sant''Ambrogio e San Pietro in Cariano. Fonti: Slow Food Osterie d''Italia 2026, VeronaSera, The Wom Travel, InfoValpolicella. Posizioni verificate su OpenStreetMap.',
  $json$[
 {
  "name": "Enoteca della Valpolicella",
  "area": "Fumane",
  "lat": 45.5407008,
  "lng": 10.891441,
  "why": "Chiocciola Slow Food 2026. Oltre 800 etichette e cucina di stagione",
  "verified": true,
  "category": "ristoranti",
  "url": "https://www.enotecadellavalpolicella.it/"
 },
 {
  "name": "Trattoria Dalla Rosa Alda",
  "area": "San Giorgio di Valpolicella",
  "lat": 45.5344463,
  "lng": 10.8496394,
  "why": "Aperta dal 1853, cantina scavata nella roccia. Pastissada de caval e risotto all'Amarone",
  "verified": true,
  "category": "ristoranti"
 },
 {
  "name": "Trattoria alla Ruota",
  "area": "Mazzano, Negrar",
  "lat": 45.5696827,
  "lng": 10.9568263,
  "why": "Tortelli all'Amarone, trippa allo zafferano, terrazza sulla valle",
  "verified": true,
  "category": "ristoranti"
 },
 {
  "name": "Trattoria Caprini",
  "area": "Torbe, Negrar",
  "lat": 45.5606062,
  "lng": 10.9418261,
  "why": "Quattro generazioni. Polenta brustolà e lasagnette al salmì di lepre",
  "verified": true,
  "category": "ristoranti"
 },
 {
  "name": "Trattoria dalla Bice",
  "area": "Torbe, Negrar",
  "lat": 45.5596471,
  "lng": 10.9383957,
  "why": "Vista sulla valle, lasagnette e tagliatelle fatte a mano. Meglio prenotare",
  "verified": true,
  "category": "ristoranti",
  "url": "https://www.dallabice.it/"
 },
 {
  "name": "Antica Osteria della Valpolicella",
  "area": "San Rocco, Marano",
  "lat": 45.5655749,
  "lng": 10.9141253,
  "why": "Osteria storica in collina, cucina veronese",
  "verified": true,
  "category": "ristoranti",
  "url": "https://www.anticaosteriavalpolicella.it/"
 },
 {
  "name": "Groto de Corgnan",
  "area": "Corgnan, Sant'Ambrogio",
  "lat": 45.5242628,
  "lng": 10.8412561,
  "why": "Tortelli di zucca e cinghiale all'Amarone, dolci creativi. Solo a cena",
  "verified": true,
  "category": "ristoranti",
  "url": "https://www.grotodecorgnan.it/"
 },
 {
  "name": "Antica Trattoria da Bepi",
  "area": "Marano di Valpolicella",
  "lat": 45.5560348,
  "lng": 10.9155538,
  "why": "Brodo, polenta abbrustolita, bigoli al torchio e stracotto all'Amarone",
  "verified": false,
  "note": "Trovata la via, non il locale: posizione approssimativa",
  "category": "ristoranti",
  "url": "https://anticatrattoriadabepi.it/"
 },
 {
  "name": "La Locanda dal Nane",
  "area": "San Pietro in Cariano",
  "lat": 45.5166015,
  "lng": 10.8807716,
  "why": "Casa storica, brasato all'Amarone e ravioli al Monte Veronese",
  "verified": false,
  "note": "Trovata la via, non il locale: posizione approssimativa",
  "category": "ristoranti",
  "url": "https://locandadalnane.it/"
 }
]$json$::jsonb,
  false
)
on conflict (slug) do update set
  title = excluded.title, prompt = excluded.prompt, intro = excluded.intro, items = excluded.items;
