-- carlottaemichele · dettagli e foto cercati a mano dai siti ufficiali (25 ottobre 2026)
-- Compila solo i campi vuoti, tranne foto e telefono sbagliati che vengono corretti.

-- Un Sacco Bello, Milano (unsaccobellomilano.it)
update public.places set
  photo_url = coalesce(photo_url, 'https://static.wixstatic.com/media/f45054_49081478f1644d558fc8cdabbe95f6dd~mv2.jpg'),
  photo_credit = coalesce(photo_credit, 'Foto: unsaccobellomilano.it'),
  photo_source = coalesce(photo_source, 'auto')
where id = '1ef4a67c-a084-46ed-8020-2226b893d133' and photo_url is null;
update public.places set photo_source = 'auto'
where id = '1ef4a67c-a084-46ed-8020-2226b893d133' and photo_source = 'none' and photo_url is not null;

-- Bottega Sicula, Milano (bottegasiculamilano.it)
update public.places set
  photo_url = 'https://bottegasiculamilano.it/wp-content/uploads/2023/04/275486143_1336342343459056_7422285084473556326_n.jpg',
  photo_credit = 'Foto: bottegasiculamilano.it', photo_source = 'auto'
where id = '2dbdd318-fd3d-4ef8-b38b-641abc4c3f92' and (photo_url is null or photo_source = 'none');

-- Osteria il Gran Burrone, Milano (osteriailgranburrone.it): telefono scritto male e foto del sito
update public.places set
  phone = '+39 02 5411 8438',
  photo_url = 'https://www.osteriailgranburrone.it/wp-content/uploads/2021/10/interno-2.jpg',
  photo_credit = 'Foto: osteriailgranburrone.it', photo_source = 'auto'
where id = '9710c8bb-1b4e-4067-ba1f-459023d68a46' and coalesce(photo_source, '') <> 'own';

-- Ristorante La Pobbia 1850, Milano (lapobbia.com)
update public.places set
  url = coalesce(url, 'https://lapobbia.com/'),
  phone = coalesce(phone, '+39 02 3800 6641'),
  email = coalesce(email, 'lapobbia@lapobbia.com'),
  address = coalesce(address, 'Via Gallarate 92, 20151 Milano'),
  photo_url = coalesce(photo_url, 'https://lapobbia.com/wp-content/uploads/2022/06/slider-hp.jpg'),
  photo_credit = coalesce(photo_credit, 'Foto: lapobbia.com'),
  photo_source = 'auto', enriched_at = now()
where id = '1b51088e-ec64-411c-bbe5-860afeff3e2c' and coalesce(photo_source, '') <> 'own';

-- Arctic TreeHouse Hotel, Rovaniemi (arctictreehousehotel.com, Visit Rovaniemi)
update public.places set
  url = coalesce(url, 'https://arctictreehousehotel.com/'),
  phone = coalesce(phone, '+358 50 517 6909'),
  email = coalesce(email, 'guestservice@arctictreehousehotel.com'),
  address = coalesce(address, 'Tarvantie 3, 96930 Rovaniemi'),
  photo_url = coalesce(photo_url, 'https://www.visitrovaniemi.fi/wp-content/uploads/86179210-557d-11f0-ae44-c12d0d4b9580.jpg'),
  photo_credit = coalesce(photo_credit, 'Foto: Visit Rovaniemi'),
  photo_source = 'auto', enriched_at = now()
where id = '55e17f85-3bfc-4cf5-8789-819e27146ebd' and coalesce(photo_source, '') <> 'own';

-- Museo Nacional del Prado, Madrid: foto della voce di Wikipedia
update public.places set
  photo_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Museo_del_Prado_2016_%2825185969599%29.jpg/1280px-Museo_del_Prado_2016_%2825185969599%29.jpg',
  photo_credit = 'Foto: Wikimedia Commons, voce "Museo del Prado"', photo_source = 'auto'
where id = '1fa4e4f7-56ea-4eba-a4a3-478e3213e00e' and photo_url is null;

-- Trattoria dei Cacciatori: la foto automatica non era il locale
update public.places set photo_url = null, photo_credit = null, photo_source = 'none'
where id = '15675727-c47c-4dfa-a01b-1e070900fe98' and photo_source = 'auto' and photo_credit like '%Wikimedia Commons%';
