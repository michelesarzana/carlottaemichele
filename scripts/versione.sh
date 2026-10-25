#!/usr/bin/env bash
# Aggiorna il numero di versione su CSS e moduli JS, così i browser non usano copie vecchie.
# Da eseguire prima di ogni commit che tocca il sito.
set -e
cd "$(dirname "$0")/.."
v=$(date -u +%Y%m%d%H%M%S)
sed -i -E "s#(css/app\.css|js/app\.js)(\?v=[0-9]+)?\"#\1?v=$v\"#g" index.html
sed -i -E "s#(from '\./[a-z]+\.js)(\?v=[0-9]+)?'#\1?v=$v'#g" js/*.js
echo "versione $v"
