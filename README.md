# Fra Tak Studio

App per Mac per generare immagini e video con i modelli di [OpenRouter](https://openrouter.ai), pagando a consumo con la **propria** chiave.

- Tutto resta sul tuo computer: progetti, immagini e chiave stanno in `~/Library/Application Support/Fra Tak Studio/`.
  Su GitHub c'è solo il codice dell'app.
- Ognuno usa la sua chiave OpenRouter: al primo avvio apri l'icona **F** nella barra dei menu → *Apri config.json*,
  incolla la chiave al posto di `INCOLLA_QUI_LA_CHIAVE_OPENROUTER` (tra le virgolette), salva e scegli *Riavvia il server*.

## Installare

1. Scarica `Fra-Tak-Studio.zip` dall'ultima versione nella pagina **Releases** (o ricevi l'app via AirDrop).
2. Trascina **Fra Tak Studio** nella cartella **Applicazioni** (importante: da lì si aggiorna da sola).
3. La prima volta macOS la blocca perché non è firmata da Apple: *Impostazioni di Sistema → Privacy e sicurezza →*
   in fondo **Apri comunque**. Serve solo la prima volta.

## Aggiornamenti

All'avvio l'app controlla se qui è uscita una versione nuova e propone **Aggiorna e riavvia**:
scarica la nuova versione, sostituisce quella in Applicazioni e si riapre. Chiave e progetti non vengono toccati.

## Pubblicare una versione nuova (per chi sviluppa)

1. Aumenta il numero in `VERSIONE` (es. `1.0.1`) e aggiungi il paragrafo `## 1.0.1` in `NOVITA.md`.
2. Fai il commit e crea il tag con lo stesso numero: `git tag v1.0.1 && git push --tags`.
3. GitHub costruisce l'app (circa 10 minuti, vedi la scheda *Actions*) e la pubblica in *Releases*.
