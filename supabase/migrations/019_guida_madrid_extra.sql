-- carlottaemichele · guida Madrid: cantine di vino e posti insoliti in più
update public.guides set
  items = items || $json$[
 {
  "name": "Bodegas Jesús Díaz e Hijos",
  "area": "Colmenar de Oreja, 50 km",
  "lat": 40.1078491,
  "lng": -3.3935698,
  "why": "Cantina del 1898 con tinajas di terracotta centenarie, visite con degustazione. Da abbinare a Chinchón, a 8 km",
  "verified": true,
  "category": "vino",
  "url": "https://bodegasjesusdiazehijos.com/"
 },
 {
  "name": "Plaza Mayor de Chinchón",
  "area": "Chinchón, 45 km",
  "lat": 40.1401188,
  "lng": -3.422534,
  "why": "Piazza medievale a balconate di legno, in un paese di anice e asado. Mezza giornata fuori città",
  "verified": true,
  "category": "posti"
 },
 {
  "name": "Bodega Bernabeleva",
  "area": "San Martín de Valdeiglesias, 70 km",
  "lat": 40.3666064,
  "lng": -4.431286,
  "why": "Garnacha di montagna della Sierra de Gredos, tra i vini più interessanti di Madrid. Visite su prenotazione",
  "verified": true,
  "category": "vino",
  "url": "http://bernabeleva.com/"
 },
 {
  "name": "Bodega del Real Cortijo de Carlos III",
  "area": "Aranjuez, 50 km",
  "lat": 40.0545829,
  "lng": -3.5652801,
  "why": "Cantina reale del 1782 con 14 volte sotterranee, visite nel weekend. Si abbina al Palazzo di Aranjuez",
  "verified": false,
  "note": "Pin sul borgo del Real Cortijo, non sull'ingresso esatto",
  "category": "vino"
 },
 {
  "name": "Palacio Real de Aranjuez",
  "area": "Aranjuez, 50 km",
  "lat": 40.0363361,
  "lng": -3.6082618,
  "why": "Residenza reale di primavera con giardini lungo il Tago",
  "verified": true,
  "category": "posti"
 },
 {
  "name": "Bodega de la Ardosa",
  "area": "Malasaña",
  "lat": 40.4237686,
  "lng": -3.7017746,
  "why": "Taverna del 1892: vermut alla spina e una delle tortillas più celebri di Madrid",
  "verified": true,
  "category": "vino",
  "url": "http://www.laardosa.es/"
 },
 {
  "name": "Taberna Tempranillo",
  "area": "Cava Baja, La Latina",
  "lat": 40.4120145,
  "lng": -3.7101129,
  "why": "Lunga carta di vini spagnoli al calice, tapas al banco",
  "verified": true,
  "category": "vino"
 },
 {
  "name": "Ermita de San Antonio de la Florida",
  "area": "Príncipe Pío",
  "lat": 40.425736,
  "lng": -3.7259298,
  "why": "Cappella affrescata da Goya nel 1798, dove è sepolto. Gratis e quasi sconosciuta",
  "verified": true,
  "category": "posti"
 },
 {
  "name": "Parque El Capricho",
  "area": "Alameda de Osuna",
  "lat": 40.4587234,
  "lng": -3.5970123,
  "why": "Giardino romantico della duchessa di Osuna, con un bunker della guerra civile. Aperto solo nel weekend",
  "verified": false,
  "note": "Pin alla fermata davanti all'ingresso",
  "category": "posti"
 },
 {
  "name": "Museo Cerralbo",
  "area": "Argüelles",
  "lat": 40.4237115,
  "lng": -3.7145146,
  "why": "Palazzo di un marchese collezionista rimasto intatto come a fine Ottocento: sale da ballo, armi, quadri",
  "verified": true,
  "category": "posti"
 },
 {
  "name": "Faro de Moncloa",
  "area": "Moncloa",
  "lat": 40.4372985,
  "lng": -3.7216762,
  "why": "Torre panoramica di 92 metri: vista a 360 gradi fino alla Sierra",
  "verified": true,
  "category": "posti"
 },
 {
  "name": "Matadero Madrid",
  "area": "Legazpi",
  "lat": 40.3915448,
  "lng": -3.6976625,
  "why": "Ex mattatoio diventato centro di arte e cultura, con mercatini e mostre",
  "verified": true,
  "category": "esperienze"
 },
 {
  "name": "Museo del Romanticismo",
  "area": "Malasaña",
  "lat": 40.4260218,
  "lng": -3.6989394,
  "why": "Casa ottocentesca arredata, con un caffè nel giardino interno",
  "verified": true,
  "category": "posti",
  "url": "https://www.culturaydeporte.gob.es/mromanticismo"
 }
]$json$::jsonb,
  intro = 'Suggerimenti per il viaggio a Madrid, oltre a Prado, Retiro e Gran Vía che avete già: musei, tramonti, tavole storiche di La Latina, terrazze, cantine dei Vinos de Madrid in giornata e qualche posto insolito. Fonti: esMadrid, Visit Madrid, IFEMA, Devour Tours. Posizioni verificate su OpenStreetMap.'
where slug = 'madrid' and not (items @> '[{"name": "Bodega de la Ardosa"}]'::jsonb);
