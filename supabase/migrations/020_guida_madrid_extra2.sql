-- carlottaemichele · guida Madrid: gite in giornata, botteghe storiche, musica e altro
update public.guides set
  items = items || $json$[
 {
  "name": "Toledo",
  "area": "Toledo, 70 km",
  "lat": 39.859476,
  "lng": -4.0214207,
  "why": "La città delle tre culture, cattedrale e vicoli medievali. In treno veloce mezz'ora da Atocha. Pin su Plaza de Zocodover",
  "verified": true,
  "category": "posti"
 },
 {
  "name": "Acueducto de Segovia",
  "area": "Segovia, 90 km",
  "lat": 40.943613,
  "lng": -4.1093039,
  "why": "Acquedotto romano a secco, poi l'Alcázar. Mezz'ora in treno veloce da Chamartín",
  "verified": true,
  "category": "posti"
 },
 {
  "name": "Mesón de Cándido",
  "area": "Segovia",
  "lat": 40.9476582,
  "lng": -4.1178861,
  "why": "Ai piedi dell'acquedotto, il cochinillo tagliato col piatto",
  "verified": true,
  "category": "ristoranti",
  "url": "https://mesondecandido.es/"
 },
 {
  "name": "Casa Hernanz",
  "area": "Calle de Toledo, Plaza Mayor",
  "lat": 40.4142151,
  "lng": -3.7076742,
  "why": "Bottega storica di espadrillas fatte a mano, sempre con la fila",
  "verified": true,
  "category": "negozi",
  "url": "https://casahernanz.es/"
 },
 {
  "name": "Casa de Diego",
  "area": "Puerta del Sol",
  "lat": 40.4172316,
  "lng": -3.7031514,
  "why": "Ventagli, ombrelli e bastoni dal 1858",
  "verified": true,
  "category": "negozi",
  "url": "https://www.casadediego.es/"
 },
 {
  "name": "Café Central",
  "area": "Ateneo de Madrid, Barrio de las Letras",
  "lat": 40.4151962,
  "lng": -3.6982321,
  "why": "Il jazz club storico di Madrid, concerti ogni sera. Ha lasciato Plaza del Ángel e ha riaperto all'Ateneo",
  "verified": false,
  "note": "Nuova sede appena riaperta: controllate programma e ingresso",
  "category": "esperienze"
 },
 {
  "name": "Sala Equis",
  "area": "Lavapiés",
  "lat": 40.4119892,
  "lng": -3.7057283,
  "why": "Ex cinema a luci rosse diventato bar con proiezioni, gradinate e piante: il più insolito della lista",
  "verified": true,
  "category": "bar",
  "url": "https://salaequis.es/"
 },
 {
  "name": "Estadio Santiago Bernabéu",
  "area": "Chamartín",
  "lat": 40.4530437,
  "lng": -3.688197,
  "why": "Il tour dello stadio rinnovato, o una partita se il calendario coincide",
  "verified": true,
  "category": "esperienze",
  "url": "https://bernabeu.realmadrid.com/"
 }
]$json$::jsonb
where slug = 'madrid' and not (items @> '[{"name": "Sala Equis"}]'::jsonb);
