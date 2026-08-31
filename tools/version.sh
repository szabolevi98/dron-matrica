#!/usr/bin/env bash
# Egyetlen verziócímkét ír minden helyi CSS és JS hivatkozásra, hogy a böngésző
# és a CDN gyorsítótára soha ne keverjen össze két kiadást. Deploy előtt futtasd.
set -e
cd "$(dirname "$0")/.."
V="${1:-$(date +%Y%m%d%H%M)}"

sed -i -E "s|(href=\"css/style\.css)(\?v=[0-9]+)?\"|\1?v=$V\"|" index.html
sed -i -E "s|(src=\"js/main\.js)(\?v=[0-9]+)?\"|\1?v=$V\"|" index.html
sed -i -E "s|(from '\./[a-zA-Z0-9]+\.js)(\?v=[0-9]+)?'|\1?v=$V'|g" js/*.js

echo "verzió: $V"
grep -o 'css/style\.css?v=[0-9]*' index.html | head -1
grep -o "from '\./[a-zA-Z0-9]*\.js?v=[0-9]*'" js/main.js | head -2
