-- El Retiro: la foto automatica era la stazione della metro "Retiro", non il parco
update public.places set
  photo_url = 'https://upload.wikimedia.org/wikipedia/commons/1/11/Parque_del_Buen_Retiro10.jpg',
  photo_credit = 'Foto: Wikimedia Commons, voce "Parco del Retiro"', photo_source = 'auto'
where id = '40152f15-645a-4f5d-bd1f-9383a18ed52d' and coalesce(photo_source, '') <> 'own';
