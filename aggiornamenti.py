"""Aggiornamenti automatici di Fra Tak Studio.

Le versioni nuove si pubblicano su GitHub (pagina "Releases" del repository): GitHub costruisce l'app
e la allega come Fra-Tak-Studio.zip. All'avvio l'app controlla se c'è una versione più recente e, se
l'utente lo chiede, la scarica, sostituisce quella in Applicazioni e si riapre.
Tocca solo il programma: chiavi, progetti e impostazioni (in Application Support) restano come sono.
Nessuna chiave serve per controllare o scaricare: il repository è pubblico.
"""
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

REPO = "tipicolab/tipicolab"  # proprietario/nome del repository su GitHub
API = os.environ.get("FRATAK_GITHUB_API", "https://api.github.com")
ASSET = "Fra-Tak-Studio.zip"
NOME_APP = "Fra Tak Studio.app"


def _qui():
    for p in (Path(os.environ.get("RESOURCEPATH", "")), Path(__file__).resolve().parent):
        if (p / "VERSIONE").exists():
            return p
    return Path(__file__).resolve().parent


def versione_attuale():
    try:
        return (_qui() / "VERSIONE").read_text(encoding="utf-8").strip()
    except OSError:
        return "0"


def _numeri(v):
    out = []
    for parte in str(v).strip().lstrip("vV").split("."):
        cifre = "".join(c for c in parte if c.isdigit())
        out.append(int(cifre) if cifre else 0)
    return tuple(out + [0] * (3 - len(out)))


def piu_nuova(a, b):
    """True se la versione a è più recente di b."""
    return _numeri(a) > _numeri(b)


# Impostati dall'app per Mac (app_main.py). Senza, si è nella versione "da cartella" e non si installa nulla.
BUNDLE = None  # percorso di Fra Tak Studio.app in esecuzione
ESCI = None    # funzione che chiude l'app
CARTELLA_LAVORO = None  # dove scaricare (Application Support)

_cache = {"t": 0, "dati": None}
_stato = {"fase": "", "errore": "", "in_corso": False}
_lock = threading.Lock()


def _get_json(url, timeout=15):
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json",
                                               "User-Agent": "Fra-Tak-Studio"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def installabile():
    """Si può aggiornare da sola? Solo se è l'app vera, in una cartella dove può scrivere."""
    if not BUNDLE or sys.platform != "darwin":
        return False, "Aggiornamento automatico disponibile solo nell'app (non da \"Avvia Fra Tak Studio.command\")."
    b = Path(BUNDLE)
    if "AppTranslocation" in str(b) or not b.exists():
        return False, "Sposta Fra Tak Studio nella cartella Applicazioni, riaprila e riprova."
    if not os.access(b.parent, os.W_OK):
        return False, f"Non ho il permesso di sostituire l'app in {b.parent}."
    return True, ""


def controlla(forza=False):
    """Info sull'ultima versione pubblicata (tenute in memoria per un'ora)."""
    attuale = versione_attuale()
    base = {"attuale": attuale, "nuova": None, "repo": REPO}
    if REPO.startswith("UTENTE/") and "FRATAK_GITHUB_API" not in os.environ:
        return base
    if forza or not _cache["dati"] or time.time() - _cache["t"] > 3600:
        try:
            r = _get_json(f"{API}/repos/{REPO}/releases/latest")
            zipurl = next((a["browser_download_url"] for a in r.get("assets", []) if a.get("name") == ASSET), None)
            _cache.update(t=time.time(), dati={"tag": r.get("tag_name", ""), "note": (r.get("body") or "")[:2000],
                                               "pagina": r.get("html_url", ""), "zip": zipurl})
        except Exception as e:  # noqa: BLE001  (offline, GitHub irraggiungibile…: nessun avviso)
            base["errore"] = str(e)[:200]
            return base
    d = _cache["dati"]
    if d and d["zip"] and piu_nuova(d["tag"], attuale):
        ok, motivo = installabile()
        base.update(nuova=d["tag"].lstrip("vV"), note=d["note"], pagina=d["pagina"], installabile=ok, motivo=motivo)
    base["stato"] = dict(_stato)
    return base


def _scarica(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": "Fra-Tak-Studio"})
    with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
        tot = int(r.headers.get("Content-Length") or 0)
        letti = 0
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)
            letti += len(b)
            if tot:
                _stato["fase"] = f"Scarico l'aggiornamento… {letti * 100 // tot}%"


def _installa():
    try:
        info = controlla(forza=True)
        if not info.get("nuova"):
            raise RuntimeError("Nessuna versione nuova da installare.")
        ok, motivo = installabile()
        if not ok:
            raise RuntimeError(motivo)
        lavoro = Path(CARTELLA_LAVORO) / ".aggiornamento"
        shutil.rmtree(lavoro, ignore_errors=True)
        lavoro.mkdir(parents=True)
        z = lavoro / ASSET
        _stato["fase"] = "Scarico l'aggiornamento…"
        _scarica(_cache["dati"]["zip"], z)
        _stato["fase"] = "Preparo la nuova versione…"
        subprocess.run(["ditto", "-x", "-k", str(z), str(lavoro / "nuova")], check=True, capture_output=True)
        nuova = lavoro / "nuova" / NOME_APP
        if not (nuova / "Contents" / "MacOS").is_dir():
            raise RuntimeError("Il file scaricato non contiene l'app.")
        subprocess.run(["xattr", "-dr", "com.apple.quarantine", str(nuova)], capture_output=True)
        attuale = Path(BUNDLE)
        vecchia = lavoro / "vecchia.app"
        _stato["fase"] = "Installo…"
        shutil.move(str(attuale), str(vecchia))
        try:
            shutil.move(str(nuova), str(attuale))
        except Exception:
            shutil.move(str(vecchia), str(attuale))  # rimette com'era
            raise
        subprocess.run(["touch", str(attuale)], capture_output=True)
        _stato["fase"] = "Riavvio…"
        # riapre l'app appena questa copia è chiusa, poi cancella la vecchia versione
        subprocess.Popen(["/bin/sh", "-c", f'while kill -0 {os.getpid()} 2>/dev/null; do sleep 0.3; done; '
                          f'sleep 0.5; open "{attuale}"; rm -rf "{lavoro}"'],
                         start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(0.8)
        if ESCI:
            ESCI()
    except Exception as e:  # noqa: BLE001
        _stato.update(errore=str(e)[:400], fase="")
    finally:
        _stato["in_corso"] = False


def avvia_installazione():
    with _lock:
        if _stato["in_corso"]:
            return
        _stato.update(in_corso=True, errore="", fase="Inizio…")
    threading.Thread(target=_installa, daemon=True).start()


def stato():
    return dict(_stato)
