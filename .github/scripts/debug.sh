#!/usr/bin/env bash
fn="https://btyvzzmyzmlvyhxwavxd.supabase.co/functions/v1/resolve-link"
key="sb_publishable_u8wHUg1_eKbo1U3nwGphRA_vVF-u8Vj"
echo "### preflight dal sito"
curl -s -i -m 20 -X OPTIONS "$fn" -H "Origin: https://carlottaemichele.it" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,x-client-info,apikey,content-type,x-supabase-api-version" | grep -iE "^HTTP|access-control"
echo "### POST come il browser (senza login)"
curl -s -m 40 -X POST "$fn" -H "Origin: https://carlottaemichele.it" -H "apikey: $key" -H "Authorization: Bearer $key" \
  -H "x-client-info: supabase-js-web/2.118.0" -H "Content-Type: application/json" \
  -d '{"url":"https://maps.app.goo.gl/Kkm1tPCB8vsErGgZ8?g_st=ic"}' -w "\nHTTP %{http_code}\n" | sed -E 's/"url":"[^"]*",//' | cut -c1-300
echo "### sito pubblicato: versione"
curl -s -m 20 https://carlottaemichele.it/ | grep -oE 'app\.(js|css)\?v=[0-9]+' | head -2
curl -s -m 20 "https://carlottaemichele.it/js/app.js" | grep -c "data?.lat"
