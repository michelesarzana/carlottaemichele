-- carlottaemichele · guida "Madrid" (bozza), collegata al viaggio di Madrid
alter table public.guides add column if not exists trip_id uuid references public.trips(id) on delete set null;

insert into public.guides (slug, title, prompt, intro, items, published, trip_id)
values (
  'madrid',
  'Madrid: cosa aggiungere',
  'arricchisci il viaggio di Madrid con dei suggerimenti',
  'Suggerimenti per il viaggio a Madrid, oltre a Prado, Retiro e Gran Vía che avete già: musei, tramonti, tavole storiche di La Latina e qualche terrazza. Fonti: esMadrid, Visit Madrid, Devour Tours. Posizioni verificate su OpenStreetMap.',
  $json$[
 {
  "name": "Palacio Real",
  "area": "Ópera",
  "lat": 40.4167403,
  "lng": -3.7136222,
  "why": "Residenza ufficiale dei re, 3.400 stanze: si visitano sale di gala e armeria",
  "verified": true,
  "category": "posti",
  "url": "https://www.patrimonionacional.es/real-sitio/palacio-real-de-madrid"
 },
 {
  "name": "Templo de Debod",
  "area": "Príncipe Pío",
  "lat": 40.4240689,
  "lng": -3.7176131,
  "why": "Tempio egizio vero, regalo dell'Egitto. Il posto per il tramonto",
  "verified": true,
  "category": "posti"
 },
 {
  "name": "Museo Reina Sofía",
  "area": "Atocha",
  "lat": 40.4080495,
  "lng": -3.6944216,
  "why": "Arte del Novecento, con Guernica di Picasso",
  "verified": true,
  "category": "posti",
  "url": "https://www.museoreinasofia.es/"
 },
 {
  "name": "Museo Thyssen-Bornemisza",
  "area": "Paseo del Prado",
  "lat": 40.4162159,
  "lng": -3.6949317,
  "why": "Dal Duecento alla pop art in un'unica collezione, completa il Prado",
  "verified": true,
  "category": "posti",
  "url": "https://www.museothyssen.org/"
 },
 {
  "name": "Plaza Mayor",
  "area": "Sol",
  "lat": 40.4153949,
  "lng": -3.7069974,
  "why": "La piazza seicentesca porticata. Qui intorno il bocadillo de calamares",
  "verified": true,
  "category": "posti"
 },
 {
  "name": "Museo Sorolla",
  "area": "Chamberí",
  "lat": 40.4353934,
  "lng": -3.692512,
  "why": "La casa-studio del pittore della luce, con giardino andaluso. Piccolo e tranquillo",
  "verified": true,
  "category": "posti",
  "url": "http://museosorolla.mcu.es/"
 },
 {
  "name": "Real Jardín Botánico",
  "area": "Paseo del Prado",
  "lat": 40.4123656,
  "lng": -3.6921452,
  "why": "Giardino settecentesco accanto al Prado, pausa verde tra un museo e l'altro",
  "verified": true,
  "category": "posti"
 },
 {
  "name": "Andén 0, estación de Chamberí",
  "area": "Chamberí",
  "lat": 40.4341,
  "lng": -3.7038,
  "why": "Stazione del metro chiusa nel 1966, rimasta com'era con le piastrelle pubblicitarie",
  "verified": false,
  "note": "Posizione approssimativa, sotto Plaza de Chamberí",
  "category": "posti"
 },
 {
  "name": "El Rastro",
  "area": "La Latina",
  "lat": 40.4087,
  "lng": -3.7072,
  "why": "Il mercato delle pulci della domenica mattina, lungo Ribera de Curtidores",
  "verified": false,
  "note": "Posizione approssimativa, solo la domenica e i festivi",
  "category": "esperienze"
 },
 {
  "name": "Corral de la Morería",
  "area": "La Latina",
  "lat": 40.4127418,
  "lng": -3.7141548,
  "why": "Tablao di flamenco storico, con ristorante stellato",
  "verified": true,
  "category": "esperienze",
  "url": "https://www.corraldelamoreria.com"
 },
 {
  "name": "Casa Lucio",
  "area": "Cava Baja, La Latina",
  "lat": 40.4120917,
  "lng": -3.7096742,
  "why": "L'istituzione dei huevos rotos, anche cocido e callos",
  "verified": true,
  "category": "ristoranti",
  "url": "http://casalucio.es/"
 },
 {
  "name": "Sobrino de Botín",
  "area": "Calle de Cuchilleros",
  "lat": 40.4141,
  "lng": -3.7083,
  "why": "Il ristorante più antico del mondo per il Guinness, cochinillo e agnello al forno a legna",
  "verified": false,
  "note": "Non trovato su OpenStreetMap: posizione approssimativa",
  "category": "ristoranti"
 },
 {
  "name": "Posada de la Villa",
  "area": "Cava Baja, La Latina",
  "lat": 40.4130547,
  "lng": -3.7084475,
  "why": "Locanda del Seicento, agnello dal forno a legna e cocido madrileño",
  "verified": true,
  "category": "ristoranti",
  "url": "https://posadadelavilla.com/"
 },
 {
  "name": "Malacatín",
  "area": "La Latina",
  "lat": 40.4103182,
  "lng": -3.7076364,
  "why": "Cocido in tre portate, dal 1895",
  "verified": true,
  "category": "ristoranti",
  "url": "https://www.malacatin.com/"
 },
 {
  "name": "Juana la Loca",
  "area": "Puerta de Moros, La Latina",
  "lat": 40.4104,
  "lng": -3.7113,
  "why": "Taverna famosa per la tortilla e i ravioli ai porcini",
  "verified": false,
  "note": "Non trovata su OpenStreetMap: posizione approssimativa",
  "category": "ristoranti"
 },
 {
  "name": "Mercado de San Miguel",
  "area": "Plaza Mayor",
  "lat": 40.4153741,
  "lng": -3.7090151,
  "why": "Mercato in ferro e vetro con tapas gourmet. Affollato, meglio a metà mattina",
  "verified": true,
  "category": "ristoranti"
 },
 {
  "name": "Chocolatería San Ginés",
  "area": "Sol",
  "lat": 40.4167707,
  "lng": -3.706803,
  "why": "Churros con cioccolata dal 1894, aperta fino a tardi",
  "verified": true,
  "category": "bar",
  "url": "https://chocolateriasangines.com/"
 },
 {
  "name": "La Casa del Abuelo",
  "area": "Calle de la Victoria",
  "lat": 40.4157405,
  "lng": -3.7017617,
  "why": "Taverna centenaria delle gambas al ajillo",
  "verified": true,
  "category": "bar",
  "url": "http://lacasadelabuelo.es/"
 },
 {
  "name": "Azotea del Círculo de Bellas Artes",
  "area": "Calle de Alcalá",
  "lat": 40.4182071,
  "lng": -3.6965142,
  "why": "Terrazza sul tetto con vista su Gran Vía e Metrópolis, si paga un piccolo ingresso",
  "verified": true,
  "category": "bar",
  "url": "https://www.circulobellasartes.com/"
 },
 {
  "name": "Mercado de San Antón",
  "area": "Chueca",
  "lat": 40.4219408,
  "lng": -3.6975833,
  "why": "Mercato con terrazza all'ultimo piano per un aperitivo",
  "verified": true,
  "category": "ristoranti",
  "url": "https://www.mercadosananton.com/"
 }
]$json$::jsonb,
  false,
  (select id from public.trips where name ilike '%madrid%' order by created_at limit 1)
)
on conflict (slug) do update set
  title = excluded.title, intro = excluded.intro, items = excluded.items, trip_id = excluded.trip_id;
