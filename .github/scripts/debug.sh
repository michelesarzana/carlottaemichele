#!/usr/bin/env bash
fn="https://btyvzzmyzmlvyhxwavxd.supabase.co/functions/v1/enrich-places"
key="sb_publishable_u8wHUg1_eKbo1U3nwGphRA_vVF-u8Vj"
sleep 60  # lascia il tempo di pubblicare la funzione
for id in b7e95cc3-fb81-46c1-a26c-55a8767c5750 706dbc3b-c873-4166-82c5-3f0d80ce6647; do
  echo "### $id"
  curl -sS -m 60 -X POST "$fn" -H "apikey: $key" -H "Content-Type: application/json" -d "{\"debug\":\"$id\"}" -w "\nHTTP %{http_code}\n"
done
