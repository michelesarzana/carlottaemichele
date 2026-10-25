#!/usr/bin/env bash
# Prove di rete dai server di GitHub. L'uscita finisce in .github/scripts/debug.out
UA="carlottaemichele.it/1.0 (dettagli automatici dei posti)"
for spec in "La Rue|45.4760289|9.1836817" "Bottega Sicula|45.4486161|9.2067114" "Alle Baite|45.9942543|9.7543883" "Revivre|45.6239176|7.6069725"; do
  IFS='|' read -r name lat lng <<<"$spec"
  echo "### $name"
  for ep in https://overpass-api.de/api/interpreter https://overpass.kumi.systems/api/interpreter; do
    q="[out:json][timeout:15];nwr(around:250,$lat,$lng)[\"name\"];out tags center 80;"
    code=$(curl -s -m 25 -o /tmp/o.json -w '%{http_code}' -A "$UA" --data-urlencode "data=$q" "$ep")
    echo "$ep -> HTTP $code, elementi: $(jq '.elements|length' /tmp/o.json 2>/dev/null)"
    jq -r --arg n "$name" '.elements[]?.tags | select(.name) | select((.name|ascii_downcase) | contains(($n|ascii_downcase|split(" ")|.[-1]))) | "  \(.name) | \(.amenity // .tourism // .shop // "-") | web=\(.website // ."contact:website" // "") | tel=\(.phone // ."contact:phone" // "")"' /tmp/o.json 2>/dev/null | head -5
  done
done
