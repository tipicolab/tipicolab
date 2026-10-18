#!/bin/bash
# Doppio clic: crea (o aggiorna) "Tipico Lab.app" in Applicazioni e la controlla.
# Non genera immagini e non usa crediti.
cd "$(dirname "$0")"
chmod +x build_app.sh verifica_app.sh 2>/dev/null
if ./build_app.sh; then
  echo
  ./verifica_app.sh
else
  echo
  echo "La creazione dell'app non è riuscita. Il dettaglio è in _build-app/build.log"
fi
echo
read -n 1 -s -r -p "Premi un tasto per chiudere questa finestra."
