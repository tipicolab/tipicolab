#!/bin/bash
# Controlla l'app installata SENZA generare nulla (nessun credito usato):
# apertura, server, chiusura con ⌘Q, porta libera, riapertura con dati intatti.
cd "$(dirname "$0")"
OUT="_build-app/verifica.log"
mkdir -p _build-app
exec > >(tee "$OUT") 2>&1
SUP="$HOME/Library/Application Support/Fra Tak Studio"
ok(){ echo "  OK  $*"; }; ko(){ echo "  NO  $*"; ERR=1; }
ERR=0
porta(){ python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["porta"])' "$SUP/.istanza.json" 2>/dev/null; }
attendi(){ for i in $(seq 1 60); do P=$(porta); if [ -n "$P" ] && curl -s -o /dev/null "http://127.0.0.1:$P/"; then return 0; fi; sleep 0.5; done; return 1; }

echo "== Verifica Fra Tak Studio.app ($(date '+%H:%M:%S'))"
rm -f "$SUP/.rete.json"
open -a "/Applications/Fra Tak Studio.app"
if attendi; then P=$(porta); ok "app aperta, server sulla porta $P"; else ko "il server non risponde"; tail -n 30 "$HOME/Library/Logs/Fra Tak Studio.log"; exit 1; fi
sleep 3
STATO=$(curl -s "http://127.0.0.1:$P/api/stato")
echo "$STATO" | python3 -c 'import json,sys;d=json.load(sys.stdin);print("  ..  chiave OpenRouter:", "presente" if d["chiavi"]["openrouter"] else "MANCANTE");print("  ..  modelli nel menu:", len(d["modelli"]), "· aggiunti:", sum(1 for m in d["modelli"] if m.get("aggiunto")));print("  ..  progetti:", len(d["progetti"]), "in", d["cartella"])'
PRIMA="$STATO"
for f in index.html canvas.js canvas.css; do
  c=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$P/${f/index.html/}"); [ "$c" = 200 ] && ok "$f" || ko "$f ($c)"
done
[ -f "$SUP/config.json" ] && ok "dati in Application Support" || ko "config.json non trovato in Application Support"
for i in $(seq 1 30); do [ -f "$SUP/.rete.json" ] && break; sleep 1; done
grep -q '"ok": true' "$SUP/.rete.json" 2>/dev/null && ok "connessione HTTPS a OpenRouter (elenco pubblico, nessun credito)" || ko "connessione a OpenRouter: $(cat "$SUP/.rete.json" 2>/dev/null)"

echo "-- chiudo con ⌘Q"
osascript -e 'tell application "Fra Tak Studio" to quit' >/dev/null 2>&1
sleep 4
if pgrep -f "Fra Tak Studio.app/Contents/MacOS" >/dev/null; then ko "processo ancora attivo"; else ok "nessun processo rimasto"; fi
if lsof -nP -iTCP:"$P" -sTCP:LISTEN >/dev/null 2>&1; then ko "porta $P ancora occupata"; else ok "porta $P libera"; fi

echo "-- riapro"
rm -f "$SUP/.istanza.json"
open -a "/Applications/Fra Tak Studio.app"
if attendi; then P=$(porta); ok "riaperta sulla porta $P"; else ko "non si riapre"; exit 1; fi
sleep 3
DOPO=$(curl -s "http://127.0.0.1:$P/api/stato")
python3 - "$PRIMA" "$DOPO" <<'EOF'
import json,sys
a,b=json.loads(sys.argv[1]),json.loads(sys.argv[2])
for k,f in [("chiave",lambda d:d["chiavi"]["openrouter"]),("modelli aggiunti",lambda d:sorted(m["id"] for m in d["modelli"] if m.get("aggiunto"))),("progetti",lambda d:sorted(d["progetti"])),("cartella progetti",lambda d:d["cartella"])]:
    print(("  OK  " if f(a)==f(b) else "  NO  ")+k+" uguali dopo la riapertura")
EOF
echo "-- seconda apertura (deve solo riportare in primo piano)"
open -a "/Applications/Fra Tak Studio.app"; sleep 3
N=$(pgrep -f "Fra Tak Studio.app/Contents/MacOS" | wc -l | tr -d ' ')
[ "$N" = 1 ] && ok "una sola copia in esecuzione" || ko "copie in esecuzione: $N"
echo "== Verifica finita. L'app resta aperta."
