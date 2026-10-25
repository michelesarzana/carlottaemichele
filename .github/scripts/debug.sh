#!/usr/bin/env bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
for u in https://unsaccobellomilano.it/ https://bottegasiculamilano.it/ https://www.osteriailgranburrone.it/ http://lapobbia.com/ https://arctictreehousehotel.com/; do
  echo "### $u"
  curl -sL -m 25 -A "$UA" "$u" -o /tmp/p.html -w "HTTP %{http_code} %{url_effective}\n"
  grep -oiE '(og:image"[^>]*content="[^"]+"|content="[^"]+"[^>]*og:image)' /tmp/p.html | head -2
  grep -oiE '(https?:)?//[^"'"'"' )]+\.(jpe?g|webp|png)(\?[^"'"'"' )]*)?' /tmp/p.html | grep -viE 'logo|icon|favicon|sprite|badge|flag|payment' | sort -u | head -15
  grep -oiE 'tel:[^"'"'"']+|mailto:[^"'"'"'?]+' /tmp/p.html | sort -u | head -4
done
echo "### wikipedia"
for t in "Museo_del_Prado" "Gran_Vía_(Madrid)" "Parco_del_Retiro"; do
  curl -s -m 20 -A "carlottaemichele.it/1.0" "https://it.wikipedia.org/api/rest_v1/page/summary/$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$t")" | jq -r '"\(.title) | \(.originalimage.source // "-")"'
done
