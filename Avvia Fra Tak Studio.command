#!/bin/bash
cd "$(dirname "$0")"
if ! command -v python3 >/dev/null 2>&1; then
  echo "Serve Python 3. Il Mac ora ti propone di installare gli 'Strumenti da riga di comando': accetta, poi riapri questo file."
  xcode-select --install
  read -n 1 -s -r -p "Premi un tasto per chiudere."
  exit 1
fi
python3 server.py
