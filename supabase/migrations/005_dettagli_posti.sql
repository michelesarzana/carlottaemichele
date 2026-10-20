-- carlottaemichele · dettagli dei primi posti, cercati a mano dai siti ufficiali
-- Compila solo i campi vuoti (coalesce), tranne la foto di Borgo Vescine che era sbagliata.

-- Trattoria Tina, Milano (fonti: trattoriatina.it, Scatti di Gusto)
update public.places set
  phone = coalesce(phone, '+39 02 3962 2378'),
  email = coalesce(email, 'info@trattoriatina.it'),
  instagram = coalesce(instagram, 'https://www.instagram.com/trattoriatinamilano/'),
  opening_hours = coalesce(opening_hours, 'Tu-Sa 19:30-22:30; Su,Mo off'),
  menu_url = coalesce(menu_url, 'https://www.scattidigusto.it/wp-content/uploads/2026/08/trattoria-tina-milano-menu-1280x1600.jpg')
where id = 'ae688362-2eee-47d8-a3f5-721714c88ef0';

-- Borgo Vescine, Radda in Chianti (fonte: vescine.it)
update public.places set
  phone = coalesce(phone, '+39 0577 741144'),
  email = coalesce(email, 'info@vescine.it'),
  instagram = coalesce(instagram, 'https://www.instagram.com/borgovescine/'),
  photo_url = 'https://images.squarespace-cdn.com/content/v1/63fa5a875489c1006b8bcdd1/b4d8a974-9538-4649-8a67-a03fa8b8669f/17-DJI_20260721155004_0473_D-HDR.jpg?format=1500w',
  photo_credit = 'Foto: vescine.it',
  photo_source = 'auto'
where id = 'f328be9e-2781-4c6f-aaa3-42906969a661';

-- Borgo Incantato, Pompagnano di Spoleto (fonte: ilborgoincantato.com)
update public.places set
  url = coalesce(url, 'https://www.ilborgoincantato.com/'),
  phone = coalesce(phone, '+39 331 103 8616'),
  email = coalesce(email, 'info@ilborgoincantato.it'),
  instagram = coalesce(instagram, 'https://www.instagram.com/borgoincantatospoleto/'),
  menu_url = coalesce(menu_url, 'https://www.ilborgoincantato.com/ristorante-en')
where id = '194e9f7c-cedc-490a-be83-9467dedcef63';
