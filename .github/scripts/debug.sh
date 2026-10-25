#!/usr/bin/env bash
UA="carlottaemichele.it/1.0 (dettagli automatici dei posti)"
for spec in "La Rue|45.4760289|9.1836817" "Bottega Sicula|45.4486161|9.2067114" "Alle Baite|45.9942543|9.7543883" "Revivre Village|45.6239176|7.6069725" "Primo Naso|45.47|9.19"; do
  IFS='|' read -r name lat lng <<<"$spec"
  echo "### $name"
  vb=$(python3 -c "print(f'{$lng-0.02},{$lat+0.015},{$lng+0.02},{$lat-0.015}')")
  t0=$(date +%s.%N)
  curl -s -m 20 -A "$UA" -G "https://nominatim.openstreetmap.org/search" --data-urlencode "q=$name" \
    --data "format=jsonv2&extratags=1&limit=3&bounded=1&viewbox=$vb" -o /tmp/n.json -w "nominatim HTTP %{http_code} %{time_total}s\n"
  jq -r '.[] | "  \(.name) | \(.category)/\(.type) | web=\(.extratags.website // .extratags["contact:website"] // "") | tel=\(.extratags.phone // .extratags["contact:phone"] // "") | ore=\(.extratags.opening_hours // "")"' /tmp/n.json 2>/dev/null
  sleep 1.2
done
q='[out:json][timeout:10];nwr(around:200,45.4760289,9.1836817)["name"];out tags 5;'
for ep in https://overpass.private.coffee/api/interpreter https://maps.mail.ru/osm/tools/overpass/api/interpreter https://overpass.osm.jp/api/interpreter https://overpass-api.de/api/interpreter; do
  curl -s -m 20 -A "$UA" --data-urlencode "data=$q" "$ep" -o /tmp/o.json -w "$ep HTTP %{http_code} %{time_total}s " ; echo "elementi: $(jq '.elements|length' /tmp/o.json 2>/dev/null)"
done
