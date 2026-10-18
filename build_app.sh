#!/bin/bash
# Crea "Fra Tak Studio.app" e la copia in /Applicazioni.
# Tutto quello che serve per la build sta in _build-app/ (si può cancellare quando vuoi):
# non installa nulla nel Python del Mac e non tocca i tuoi dati.
set -euo pipefail
cd "$(dirname "$0")"
QUI="$(pwd)"
BUILD="$QUI/_build-app"
mkdir -p "$BUILD"
LOG="$BUILD/build.log"
exec > >(tee "$LOG") 2>&1

echo "== Fra Tak Studio · creazione dell'app ($(date '+%d/%m/%Y %H:%M'))"

PY="${PY:-$(command -v python3 || true)}"
if [ -z "$PY" ] || ! "$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' 2>/dev/null; then
  echo "ERRORE: serve Python 3.9 o più recente (python3)."
  exit 1
fi
echo "Python: $("$PY" --version 2>&1) — $PY"

# 1) ambiente isolato per la build
if [ ! -x "$BUILD/venv/bin/python" ]; then
  echo "-- creo l'ambiente di build in _build-app/venv"
  "$PY" -m venv "$BUILD/venv"
fi
V="$BUILD/venv/bin/python"
echo "-- installo pywebview e py2app (solo dentro _build-app)"
"$V" -m pip install --disable-pip-version-check -q --upgrade pip setuptools wheel
"$V" -m pip install --disable-pip-version-check -q "pywebview==6.2.1" "py2app==0.28.10" "certifi"

# 2) file di supporto
if [ -n "${SOLO_BUILD:-}" ]; then : > build_risorse/origine.txt; else echo "$QUI" > build_risorse/origine.txt; fi

# 3) build
echo "-- creo l'app (qualche minuto)"
rm -rf "$BUILD/build" "$BUILD/dist"
"$V" setup.py py2app --dist-dir "$BUILD/dist" --bdist-base "$BUILD/build" > "$BUILD/py2app.log" 2>&1 || {
  echo "ERRORE durante py2app. Ultime righe:"; tail -n 40 "$BUILD/py2app.log"; exit 1; }
APPB="$BUILD/dist/Fra Tak Studio.app"
[ -d "$APPB" ] || { echo "ERRORE: l'app non è stata creata."; exit 1; }

# 4) firma locale (necessaria sui Mac con chip Apple; non serve un account sviluppatore)
codesign --force --deep --sign - "$APPB" >/dev/null 2>&1 || echo "Avviso: firma locale non riuscita (di solito non è un problema)"

# solo costruzione (GitHub): crea lo zip da pubblicare e si ferma qui
if [ -n "${SOLO_BUILD:-}" ]; then
  (cd "$BUILD/dist" && ditto -c -k --sequesterRsrc --keepParent "Fra Tak Studio.app" "$BUILD/Fra-Tak-Studio.zip")
  echo "== FATTO: $BUILD/Fra-Tak-Studio.zip ($(du -sh "$BUILD/Fra-Tak-Studio.zip" | cut -f1))"
  exit 0
fi

# 5) copia in /Applicazioni (chiude prima l'eventuale versione aperta)
if pgrep -f "/Applications/Fratak Studio.app/Contents/MacOS/" >/dev/null 2>&1; then
  echo "-- chiudo la vecchia Fratak Studio"
  osascript -e 'quit app "Fratak Studio"' >/dev/null 2>&1 || true
  sleep 3
fi
rm -rf "/Applications/Fratak Studio.app"   # versione col vecchio nome
if pgrep -f "/Applications/Fra Tak Studio.app/Contents/MacOS/" >/dev/null 2>&1; then
  echo "-- chiudo Fra Tak Studio aperta"
  osascript -e 'quit app "Fra Tak Studio"' >/dev/null 2>&1 || true
  sleep 3
fi
rm -rf "/Applications/Fra Tak Studio.app"
ditto "$APPB" "/Applications/Fra Tak Studio.app"
touch "/Applications/Fra Tak Studio.app"
echo "== FATTO: /Applications/Fra Tak Studio.app ($(du -sh "/Applications/Fra Tak Studio.app" | cut -f1))"
