-- Il Ruscello 十二馔, Milano: niente sito ufficiale né foto libere,
-- uso quella della recensione di Cooking with the Hamster con il credito
update public.places set
  photo_url = 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=1440,h=756,fit=crop,f=jpeg/mjEvnqkBKguklpqx/img_1857-eFNgJmy1lUGKQCJy.jpg',
  photo_credit = 'Foto: Cooking with the Hamster (cookingwiththehamster.com)',
  photo_source = 'auto'
where id = '66384d09-e67a-4960-a835-56f6fa60a9ef' and photo_url is null;
