-- La foto automatica di Borgo Incantato era una foto della Terra dallo spazio: uso quella ufficiale
update public.places set
  photo_url = 'https://www.ilborgoincantato.com/wp-content/uploads/2023/11/borgo-incantato-vista-drone.webp',
  photo_credit = 'Foto: ilborgoincantato.com',
  photo_source = 'auto'
where id = '194e9f7c-cedc-490a-be83-9467dedcef63';
