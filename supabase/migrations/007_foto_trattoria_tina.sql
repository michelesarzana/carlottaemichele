-- Trattoria Tina: nessuna foto libera disponibile, uso quella della recensione di Scatti di Gusto con il credito
update public.places set
  photo_url = 'https://www.scattidigusto.it/wp-content/uploads/2026/08/trattoria-tina-milano-ravioli-erbette-sezione.jpg',
  photo_credit = 'Foto: Scatti di Gusto (scattidigusto.it)',
  photo_source = 'auto'
where id = 'ae688362-2eee-47d8-a3f5-721714c88ef0' and photo_url is null;
