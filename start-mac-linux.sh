#!/bin/sh
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
(sleep 2; open http://localhost:3000 2>/dev/null || xdg-open http://localhost:3000 2>/dev/null) &
node server.js
