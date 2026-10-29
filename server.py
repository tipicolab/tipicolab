#!/usr/bin/env python3
"""Tipico Lab — app locale per generare immagini e video con fal.ai o OpenRouter, pagando solo quello che usi.

Avvio: doppio clic su "Avvia Studio.command" (oppure: python3 server.py).
Le chiavi restano in config.json su questo computer e non viene mai mandata al browser.
Solo libreria standard di Python: niente da installare.
"""
import base64
import csv
import datetime as dt
import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import aggiornamenti
import openrouter

APP = Path(__file__).resolve().parent
DATI = openrouter.DATI  # dati dell'utente: fuori dall'app, così gli aggiornamenti non li cancellano
CONFIG = DATI / "config.json"
MODELS = APP / "models.json"
AGGIUNTI = DATI / "modelli_aggiunti.json"
FAL_API = os.environ.get("FAL_API", "https://api.fal.ai/v1")
# Le immagini generate restano dentro l'app (cartella privata in Libreria): escono solo con "Scarica".
CARTELLA_DEFAULT = "~/Library/Application Support/Tipico Lab/Progetti"
CARTELLE_VECCHIE = {"~/Studio AI/Progetti", "~/Documents/Studio AI", "~/Documents/Fratak Studio",
                    "~/Documents/Fra Tak Studio", "~/Library/Application Support/Fra Tak Studio/Progetti",
                    "~/Library/Application Support/Fratak Studio/Progetti"}
CAMPI_NASCOSTI = {"prompt", "sync_mode", "end_user_id", "webhook_url"}
FAL_QUEUE = os.environ.get("FAL_QUEUE", "https://queue.fal.run")
FAL_REST = os.environ.get("FAL_REST", "https://rest.fal.ai")
FAL_CDN = os.environ.get("FAL_CDN", "https://v3.fal.media")
PORT = int(os.environ.get("STUDIO_PORT", "8765"))
SEGNAPOSTO = "INCOLLA_QUI_LA_TUA_CHIAVE_FAL"

JOBS = {}
LOCK = threading.Lock()


# ---------- configurazione ----------

def config():
    cfg = {}
    if CONFIG.exists():
        cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    chiave = os.environ.get("FAL_KEY") or cfg.get("fal_key", "")
    if chiave == SEGNAPOSTO:
        chiave = ""
    valore = cfg.get("cartella_progetti", CARTELLA_DEFAULT)
    if os.path.expanduser(valore).rstrip("/") in {os.path.expanduser(v) for v in CARTELLE_VECCHIE}:
        # sposta i progetti nella nuova cartella in Documenti (una volta sola)
        vecchia, valore = Path(os.path.expanduser(valore)), CARTELLA_DEFAULT
        nuova = Path(os.path.expanduser(valore))
        if vecchia.exists() and not nuova.exists():
            nuova.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(vecchia), str(nuova))
            if vecchia.parent.name == "Studio AI":  # solo la vecchissima "~/Studio AI" vuota, mai Documenti
                try:
                    vecchia.parent.rmdir()
                except OSError:
                    pass
        cfg["cartella_progetti"] = valore
        CONFIG.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")
    cartella = Path(os.path.expanduser(valore))
    cartella.mkdir(parents=True, exist_ok=True)
    return chiave.strip(), cartella


def modelli_aggiunti():
    if AGGIUNTI.exists():
        return json.loads(AGGIUNTI.read_text(encoding="utf-8"))
    return []


def salva_aggiunti(lista):
    AGGIUNTI.write_text(json.dumps(lista, indent=2, ensure_ascii=False), encoding="utf-8")


def modelli_fal():
    base = json.loads(MODELS.read_text(encoding="utf-8"))["modelli"] + modelli_aggiunti()
    for m in base:
        m.setdefault("prompt", True)
        m.setdefault("fornitore", "fal")
    return base


def modelli():
    return openrouter.modelli() + modelli_fal()


def modelli_visibili():
    """Mostra i modelli dei fornitori di cui hai la chiave (tutti, se non ne hai nessuna)."""
    fal_ok, or_ok = bool(config()[0]), bool(openrouter.chiave())
    if not (fal_ok or or_ok):
        return modelli()
    return (openrouter.modelli() if or_ok else []) + (modelli_fal() if fal_ok else [])


def modello(mid):
    for m in modelli():
        if m["id"] == mid:
            return m
    raise ValueError("Modello sconosciuto: " + mid)


def nome_sicuro(s):
    s = re.sub(r'[/\\:*?"<>|\x00-\x1f]', "", s).strip().strip(".")
    return s[:60] or "Senza nome"


def stima_costo(m, params):
    """Stima in dollari in base ai prezzi di models.json / OpenRouter."""
    if m.get("fornitore") == "openrouter":
        return openrouter.stima(m, params)
    p = m.get("prezzo") or {"per": "sconosciuto"}
    if p["per"] == "sconosciuto":
        return None
    if p["per"] == "fal":
        unit, u = float(p["unit_price"]), str(p.get("unit", "")).lower()
        if "second" in u:
            d = params.get("duration") or params.get("num_seconds") or 5
            return round(unit * (5 if str(d) == "auto" else float(str(d).rstrip("s"))), 3)
        if "image" in u or "megapixel" in u:
            return round(unit * int(params.get("num_images", 1) or 1), 3)
        return round(unit, 3)
    if p["per"] == "immagine":
        unit = p["per_risoluzione"].get(str(params.get("resolution", "1K")), max(p["per_risoluzione"].values()))
        return round(unit * int(params.get("num_images", 1) or 1), 3)
    durata = params.get("duration", "5")
    secondi = 5 if str(durata) == "auto" else float(durata)
    if "per_audio" in p:
        unit = p["per_audio"][str(bool(params.get("generate_audio"))).lower()]
    else:
        unit = p["per_risoluzione"].get(str(params.get("resolution")), max(p["per_risoluzione"].values()))
    return round(unit * secondi, 3)


# ---------- chiamate a fal ----------

def http(method, url, headers=None, body=None, timeout=120):
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        dettaglio = e.read().decode("utf-8", "ignore")[:600]
        raise RuntimeError(f"fal ha risposto {e.code}: {dettaglio}") from None


def fal_json(method, url, chiave, payload=None):
    headers = {"Authorization": "Key " + chiave, "Accept": "application/json"}
    body = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(payload).encode()
    return json.loads(http(method, url, headers, body) or b"{}")


def carica_su_fal(chiave, dati, content_type, nome_file):
    """Carica una reference sul CDN di fal e restituisce l'URL (stesso flusso del client ufficiale)."""
    tok = fal_json("POST", FAL_REST + "/storage/auth/token?storage_type=fal-cdn-v3", chiave, {})
    base = tok.get("base_url") or FAL_CDN
    headers = {
        "Authorization": f'{tok["token_type"]} {tok["token"]}',
        "Content-Type": content_type,
        "X-Fal-File-Name": nome_file,
    }
    risposta = json.loads(http("POST", base + "/files/upload", headers, dati))
    return risposta["access_url"]


def data_url_in_bytes(data_url):
    testa, b64 = data_url.split(",", 1)
    tipo = testa.split(";")[0].split(":", 1)[1] if ":" in testa else "image/png"
    return base64.b64decode(b64), tipo


def file_in_uscita(out):
    """Trova tutti i file (dict con 'url') nella risposta di un modello qualsiasi."""
    trovati = []
    for v in out.values():
        if isinstance(v, dict) and isinstance(v.get("url"), str):
            trovati.append(v)
        elif isinstance(v, list):
            trovati += [x for x in v if isinstance(x, dict) and isinstance(x.get("url"), str)]
    return trovati


# ---------- catalogo fal: cerca e aggiungi modelli ----------

def fal_api(percorso, chiave=""):
    headers = {"Accept": "application/json"}
    if chiave:
        headers["Authorization"] = "Key " + chiave
    return json.loads(http("GET", FAL_API + percorso, headers, timeout=60))


def cerca_modelli(q):
    risultati = []
    try:
        risultati += openrouter.cerca(q)
    except Exception:  # noqa: BLE001
        pass
    # I modelli fal.ai si vedono (e si possono usare) solo con la chiave fal: senza, aggiungerli li faceva
    # "sparire" (finivano nella lista ma il menu dei modelli mostra solo quelli dei fornitori di cui hai la chiave).
    if config()[0]:
        try:
            risultati += cerca_modelli_fal(q)
        except Exception:  # noqa: BLE001
            if not risultati:
                raise
    return risultati


def cerca_modelli_fal(q):
    chiave, _ = config()
    d = fal_api("/models?" + urllib.parse.urlencode({"q": q, "status": "active", "limit": 30}), chiave)
    gia = {m["endpoint"] for m in modelli()}
    out = []
    for m in d.get("models", []):
        md = m.get("metadata") or {}
        out.append({"endpoint": m["endpoint_id"], "nome": md.get("display_name") or m["endpoint_id"],
                    "categoria": md.get("category", ""), "descrizione": (md.get("description") or "")[:160],
                    "fornitore": "fal.ai", "aggiunto": m["endpoint_id"] in gia})
    return out


def _risolvi(p, comps):
    for _ in range(5):
        if "$ref" in p:
            base = comps.get(p["$ref"].split("/")[-1], {})
            p = {**base, **{k: v for k, v in p.items() if k != "$ref"}}
        elif "allOf" in p and len(p["allOf"]) == 1:
            p = {**p["allOf"][0], **{k: v for k, v in p.items() if k != "allOf"}}
        elif "anyOf" in p:
            opz = [_risolvi(o, comps) for o in p["anyOf"] if o.get("type") != "null"]
            scelta = next((o for o in opz if "enum" in o), None) or next(
                (o for o in opz if o.get("type") in ("string", "integer", "number", "boolean", "array")), opz[0] if opz else {})
            p = {**scelta, **{k: v for k, v in p.items() if k != "anyOf"}}
        else:
            break
    return p


def modello_da_schema(endpoint, openapi, info):
    comps = openapi.get("components", {}).get("schemas", {})
    schema = None
    for ops in openapi.get("paths", {}).values():
        post = ops.get("post") or {}
        rb = post.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema")
        if rb:
            schema = _risolvi(rb, comps)
            break
    if not schema:
        raise RuntimeError("Non riesco a leggere i parametri di questo modello.")
    props, richiesti = schema.get("properties", {}), set(schema.get("required", []))
    parametri, refs = [], []
    for nome, p in props.items():
        p = _risolvi(p, comps)
        tipo = p.get("type")
        if nome in CAMPI_NASCOSTI:
            continue
        is_url = tipo == "string" and nome.endswith("_url")
        is_urls = tipo == "array" and nome.endswith("_urls") and (p.get("items") or {}).get("type", "string") == "string"
        if (is_url or is_urls) and "image" in nome:
            refs.append({"campo": nome, "multiple": is_urls, "obbligatoria": nome in richiesti,
                         "etichetta": (p.get("title") or nome.replace("_", " ")).capitalize()})
            continue
        etichetta = (p.get("title") or nome.replace("_", " ")).capitalize()
        default = p.get("default")
        if "enum" in p:
            parametri.append({"nome": nome, "etichetta": etichetta, "tipo": "scelta", "opzioni": p["enum"],
                              "default": default if default is not None else p["enum"][0]})
        elif tipo == "boolean":
            parametri.append({"nome": nome, "etichetta": etichetta, "tipo": "sino", "default": bool(default)})
        elif tipo in ("integer", "number"):
            parametri.append({"nome": nome, "etichetta": etichetta, "tipo": "numero", "default": default,
                              "intero": tipo == "integer"})
        elif tipo == "string":
            parametri.append({"nome": nome, "etichetta": etichetta, "tipo": "testo", "default": default or ""})
    principale = next((r for r in refs if not re.search(r"end|last|tail|mask", r["campo"])), None)
    fine = next((r for r in refs if re.search(r"end|last|tail", r["campo"])), None)
    categoria = info.get("category", "")
    tipo = "video" if "video" in categoria or "video" in endpoint else "immagine"
    m = {"id": re.sub(r"[^a-z0-9]+", "-", endpoint.lower()).strip("-"), "nome": info.get("display_name") or endpoint,
         "tipo": tipo, "endpoint": endpoint, "prompt": "prompt" in props, "aggiunto": True,
         "reference": principale, "parametri": parametri, "prezzo": {"per": "sconosciuto"}}
    if fine:
        m["reference_fine"] = {"campo": fine["campo"], "etichetta": fine["etichetta"]}
    return m


def prezzo_fal(endpoint):
    chiave, _ = config()
    if not chiave:
        return {"per": "sconosciuto"}
    try:
        d = fal_api("/models/pricing?" + urllib.parse.urlencode({"endpoint_id": endpoint}), chiave)
        p = (d.get("prices") or [])[0]
        return {"per": "fal", "unit_price": p["unit_price"], "unit": p.get("unit", ""), "valuta": p.get("currency", "USD")}
    except Exception:  # noqa: BLE001
        return {"per": "sconosciuto"}


def aggiungi_modello(endpoint):
    chiave, _ = config()
    d = fal_api("/models?" + urllib.parse.urlencode({"endpoint_id": endpoint, "expand": "openapi-3.0"}), chiave)
    if not d.get("models"):
        raise RuntimeError("Modello non trovato su fal.")
    item = d["models"][0]
    openapi = item.get("openapi") or {}
    if "error" in openapi or not openapi.get("paths"):
        raise RuntimeError("fal non fornisce i parametri di questo modello.")
    m = modello_da_schema(endpoint, openapi, item.get("metadata") or {})
    m["prezzo"] = prezzo_fal(endpoint)
    salva_aggiunti([x for x in modelli_aggiunti() if x["endpoint"] != endpoint] + [m])
    return m


def aggiorna_prezzi_mancanti():
    lista, cambiato = modelli_aggiunti(), False
    for m in lista:
        if (m.get("prezzo") or {}).get("per") == "sconosciuto":
            nuovo = prezzo_fal(m["endpoint"])
            if nuovo["per"] != "sconosciuto":
                m["prezzo"], cambiato = nuovo, True
    if cambiato:
        salva_aggiunti(lista)


# ---------- lavori di generazione ----------

def aggiorna(jid, **kw):
    with LOCK:
        JOBS[jid].update(kw)


def esegui(jid, richiesta):
    chiave, radice = config()
    try:
        m = modello(richiesta["modello"])
        progetto = nome_sicuro(richiesta["progetto"])
        cartella = radice / progetto
        cartella.mkdir(parents=True, exist_ok=True)
        params = {k: v for k, v in (richiesta.get("parametri") or {}).items() if v not in (None, "")}
        refs = richiesta.get("reference") or []
        if m.get("fornitore") == "openrouter":
            file, costo_reale, extra = openrouter.genera(m, richiesta, params, lambda t: aggiorna(jid, stato=t))
        else:
            file, costo_reale, extra = esegui_fal(jid, m, richiesta, params, chiave)
        salva_risultati(jid, m, richiesta, params, refs, cartella, progetto, file, costo_reale, extra)
    except Exception as e:  # noqa: BLE001
        aggiorna(jid, stato="Errore", fatto=True, errore=str(e))


def esegui_fal(jid, m, richiesta, params, chiave):
    inp = dict(params)
    if m.get("prompt", True):
        inp["prompt"] = richiesta["prompt"]

    ref = m.get("reference")
    refs = richiesta.get("reference") or []
    if ref:
        if ref.get("obbligatoria") and not refs:
            raise RuntimeError("Questo modello ha bisogno di almeno una reference.")
        aggiorna(jid, stato="Carico le reference…")
        urls = []
        for r in refs:
            dati, tipo = data_url_in_bytes(r["dati"])
            urls.append(carica_su_fal(chiave, dati, tipo, r.get("nome", "reference.png")))
        if urls:
            inp[ref["campo"]] = urls if ref.get("multiple") else urls[0]
    fine = richiesta.get("reference_fine")
    if fine and m.get("reference_fine"):
        dati, tipo = data_url_in_bytes(fine["dati"])
        inp[m["reference_fine"]["campo"]] = carica_su_fal(chiave, dati, tipo, fine.get("nome", "fine.png"))

    aggiorna(jid, stato="In coda su fal…")
    sub = fal_json("POST", f'{FAL_QUEUE}/{m["endpoint"]}', chiave, inp)
    status_url, response_url = sub["status_url"], sub["response_url"]
    inizio = time.time()
    while True:
        time.sleep(3)
        st = fal_json("GET", status_url, chiave)
        s = st.get("status")
        if st.get("error"):
            raise RuntimeError(f'{st.get("error_type", "errore")}: {st["error"]}')
        if s == "IN_QUEUE":
            aggiorna(jid, stato=f'In coda (posizione {st.get("queue_position", "?")})')
        elif s == "IN_PROGRESS":
            aggiorna(jid, stato=f"In generazione… {int(time.time() - inizio)} s")
        elif s == "COMPLETED":
            break
        if time.time() - inizio > 60 * 30:
            raise RuntimeError("Tempo scaduto (30 minuti). Controlla la richiesta sul sito di fal.")

    out = fal_json("GET", response_url, chiave)
    media = file_in_uscita(out)
    if not media:
        raise RuntimeError("fal non ha restituito file: " + json.dumps(out)[:300])

    aggiorna(jid, stato="Scarico i file…")
    file = []
    for f in media:
        url = f["url"]
        est = Path(urllib.parse.urlparse(url).path).suffix or (".mp4" if m["tipo"] == "video" else ".png")
        file.append((http("GET", url, timeout=600), est if len(est) <= 6 else ".bin"))
    return file, None, {"seed": out.get("seed"), "request_id": sub.get("request_id")}


def salva_risultati(jid, m, richiesta, params, refs, cartella, progetto, file, costo_reale, extra):
    timestamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    stimato = stima_costo(m, params)
    costo = float(costo_reale) if costo_reale is not None else (stimato or 0.0)
    salvati = []
    for i, (dati, est) in enumerate(file, 1):
        nome = f'{timestamp}_{m["id"]}_{i}{est}'
        (cartella / nome).write_bytes(dati)
        scheda = {
            "file": nome, "data": dt.datetime.now().isoformat(timespec="seconds"),
            "modello": m["nome"], "fornitore": m.get("fornitore", "fal"), "endpoint": m["endpoint"],
            "prompt": richiesta.get("prompt_tag") or richiesta.get("prompt", ""),
            "prompt_inviato": richiesta.get("prompt", ""), "parametri": params, "reference": [r.get("nome") for r in refs],
            "costo_usd": round(costo / len(file), 4), "costo_reale": costo_reale is not None,
            "costo_stimato_usd": round((stimato or 0) / len(file), 3), **extra,
        }
        (cartella / (nome + ".json")).write_text(json.dumps(scheda, ensure_ascii=False, indent=2), encoding="utf-8")
        salvati.append(nome)

    spese = cartella / "spese.csv"
    nuovo = not spese.exists()
    with spese.open("a", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh, delimiter=";")
        if nuovo:
            w.writerow(["data", "fornitore", "modello", "parametri", "file", "costo_usd", "tipo_costo"])
        w.writerow([dt.datetime.now().strftime("%d/%m/%Y %H:%M"), m.get("fornitore", "fal"), m["nome"],
                    json.dumps(params, ensure_ascii=False), ", ".join(salvati), f"{costo:.4f}".replace(".", ","),
                    "reale" if costo_reale is not None else "stimato"])
    aggiorna(jid, stato="Fatto", fatto=True, file=salvati, progetto=progetto, costo=costo)


# ---------- dati per l'interfaccia ----------

def elenco_progetti():
    _, radice = config()
    return sorted([p.name for p in radice.iterdir() if p.is_dir() and not p.name.startswith(".")],
                  key=lambda n: (radice / n).stat().st_mtime, reverse=True)


def contenuto_progetto(nome):
    _, radice = config()
    cartella = radice / nome_sicuro(nome)
    elementi, totale = [], 0.0
    if cartella.exists():
        for j in sorted(cartella.glob("*.json"), reverse=True):
            if j.name == CANVAS:
                continue
            try:
                s = json.loads(j.read_text(encoding="utf-8"))
            except Exception:  # noqa: BLE001
                continue
            if s.get("file") and (cartella / s["file"]).exists():
                totale += float(s.get("costo_usd", s.get("costo_stimato_usd")) or 0)
                elementi.append(s)
    return {"elementi": elementi, "totale_usd": round(totale, 2), **info_destinazione(nome)}


# ---------- canvas (posizioni delle card, una per progetto) ----------

CANVAS = "canvas.json"
ALLA_LINGUA = None  # l'app per Mac la imposta per tradurre il menu nella barra


def leggi_canvas(nome):
    _, radice = config()
    p = radice / nome_sicuro(nome) / CANVAS
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}


def salva_canvas(nome, dati):
    _, radice = config()
    cartella = radice / nome_sicuro(nome)
    b = dati.get("board")
    if not cartella.exists() and isinstance(b, dict) and not b.get("nodi"):
        return  # canvas vuota di un progetto che non esiste: non crea cartelle fantasma
    cartella.mkdir(parents=True, exist_ok=True)
    if isinstance(dati.get("board"), dict):
        # Canvas a nodi (versione 2): la board viene salvata così com'è, con un limite di dimensione
        board = dict(dati["board"], versione=2)
        testo = json.dumps(board, ensure_ascii=False)
        if len(testo) > 8_000_000:
            raise RuntimeError("La canvas è troppo grande per essere salvata.")
        tmp = cartella / (CANVAS + ".tmp")
        tmp.write_text(testo, encoding="utf-8")
        os.replace(tmp, cartella / CANVAS)
        return
    pulito = {"posizioni": {}, "vista": None}
    for f, r in (dati.get("posizioni") or {}).items():
        try:
            pulito["posizioni"][Path(f).name] = {k: round(float(r[k]), 1) for k in ("x", "y", "w", "h")}
        except (KeyError, TypeError, ValueError):
            continue
    v = dati.get("vista")
    if isinstance(v, dict):
        try:
            pulito["vista"] = {k: round(float(v[k]), 4) for k in ("x", "y", "z")}
        except (KeyError, TypeError, ValueError):
            pass
    tmp = cartella / (CANVAS + ".tmp")
    tmp.write_text(json.dumps(pulito, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, cartella / CANVAS)


# ---------- progetti: rinomina ed elimina (nel Cestino del Mac, recuperabile) ----------

def sposta_nel_cestino(p):
    try:
        from Foundation import NSFileManager, NSURL
        ok = NSFileManager.defaultManager().trashItemAtURL_resultingItemURL_error_(
            NSURL.fileURLWithPath_(str(p)), None, None)
        if (ok[0] if isinstance(ok, tuple) else ok) and not p.exists():
            return
    except Exception:  # noqa: BLE001
        pass
    cestino = Path.home() / ".Trash"
    if sys.platform == "darwin" and cestino.is_dir():
        dest, i = cestino / p.name, 2
        while dest.exists():
            dest, i = cestino / f"{p.name} {i}", i + 1
        shutil.move(str(p), str(dest))
        return
    raise RuntimeError("Non riesco a spostare il progetto nel Cestino.")


# ---------- cartella di salvataggio di ogni progetto (dove finiscono i file con "Scarica") ----------
IMPOSTAZIONI = ".impostazioni"  # file nascosto dentro la cartella del progetto: segue rinomina ed eliminazione
SCEGLI_CARTELLA = None  # l'app per Mac la imposta con la finestra nativa "Scegli cartella"


def impostazioni(nome):
    _, radice = config()
    p = radice / nome_sicuro(nome) / IMPOSTAZIONI
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}


def salva_impostazioni(nome, imp):
    _, radice = config()
    cartella = radice / nome_sicuro(nome)
    if not cartella.is_dir():
        raise RuntimeError("Progetto non trovato.")
    (cartella / IMPOSTAZIONI).write_text(json.dumps(imp, indent=2, ensure_ascii=False), encoding="utf-8")


def info_destinazione(nome):
    d = impostazioni(nome).get("destinazione")
    if not d:
        return {"destinazione": None}
    casa = str(Path.home())
    breve = "~" + d[len(casa):] if d == casa or d.startswith(casa + "/") else d
    return {"destinazione": d, "destinazione_breve": breve, "destinazione_ok": Path(d).is_dir()}


def scegli_cartella(titolo):
    """Finestra del Mac per scegliere una cartella. None se annullata."""
    if SCEGLI_CARTELLA:
        return SCEGLI_CARTELLA(titolo)
    if sys.platform == "darwin":
        r = subprocess.run(["osascript", "-e", f"POSIX path of (choose folder with prompt {json.dumps(titolo)})"],
                           capture_output=True, text=True)
        return r.stdout.strip() or None if r.returncode == 0 else None
    raise RuntimeError("Scegliere una cartella funziona solo sul Mac.")


def _uguali(a, b):
    if a.stat().st_size != b.stat().st_size:
        return False
    with a.open("rb") as fa, b.open("rb") as fb:
        while True:
            x, y = fa.read(1 << 20), fb.read(1 << 20)
            if x != y:
                return False
            if not x:
                return True


def nome_download(progetto, file):
    """Nome con cui un file esce dall'app: Tipico-Lab-<progetto>-GG-MM-AAAA-HH-MM(.ext)
    (data e ora della generazione; "-2", "-3"… per le immagini successive della stessa generazione)."""
    _, radice = config()
    cartella = radice / nome_sicuro(progetto)
    f = Path(file).name
    quando = None
    try:
        quando = dt.datetime.fromisoformat(json.loads((cartella / (f + ".json")).read_text(encoding="utf-8"))["data"])
    except Exception:  # noqa: BLE001
        m = re.search(r"(\d{8})-(\d{6})", f)
        if m:
            try:
                quando = dt.datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S")
            except ValueError:
                pass
    if quando is None:
        try:
            quando = dt.datetime.fromtimestamp((cartella / f).stat().st_mtime)
        except OSError:
            quando = dt.datetime.now()
    k = re.search(r"_(\d+)\.[^.]+$", f)
    extra = f"-{k.group(1)}" if k and int(k.group(1)) > 1 and not f.startswith("_ref-") else ""
    return f"Tipico-Lab-{nome_sicuro(progetto)}-{quando:%d-%m-%Y-%H-%M}{extra}{Path(f).suffix}"


def salva_in_destinazione(nome, file, chiedi=False):
    """Copia un file del progetto nella sua cartella di salvataggio, senza doppioni.
    Se nella cartella c'è già lo stesso file (anche con un altro nome) non lo ricopia; se il nome è già preso
    da un file diverso aggiunge "-2", "-3"…"""
    d = None if chiedi else impostazioni(nome).get("destinazione")
    if not d:  # nessuna cartella (o "Salva con nome…"): l'app apre la finestra "Salva" del Mac con questo nome
        return {"nessuna": True, "nome": nome_download(nome, file)}
    dest = Path(d)
    if not dest.is_dir():
        raise RuntimeError(f'La cartella di salvataggio "{dest.name}" non esiste più (spostata o cancellata?): sceglila di nuovo.')
    _, radice = config()
    src = radice / nome_sicuro(nome) / Path(file).name
    if not src.is_file():
        raise RuntimeError("File non trovato.")
    dimensione = src.stat().st_size
    for g in dest.iterdir():  # lo stesso file c'è già, magari con un altro nome?
        try:
            if g.is_file() and g.stat().st_size == dimensione and _uguali(src, g):
                return {"stato": "gia", "nome": g.name, "cartella": str(dest)}
        except OSError:
            continue
    base = Path(nome_download(nome, file))
    i, t = 1, dest / base.name
    while t.exists():
        i += 1
        t = dest / f"{base.stem}-{i}{base.suffix}"
    shutil.copy2(src, t)
    return {"stato": "salvato", "nome": t.name, "cartella": str(dest)}


def rinomina_progetto(vecchio, nuovo):
    _, radice = config()
    v = radice / nome_sicuro(vecchio)
    if not v.is_dir():
        raise RuntimeError("Progetto non trovato.")
    if not str(nuovo).strip():
        raise RuntimeError("Scrivi un nome.")
    nome = nome_sicuro(nuovo)
    n = radice / nome
    if n.exists() and v.name.lower() != nome.lower():
        raise RuntimeError(f'Esiste già un progetto chiamato "{nome}".')
    v.rename(n)
    return nome


def elimina_progetto(nome):
    _, radice = config()
    p = radice / nome_sicuro(nome)
    if not p.is_dir():
        raise RuntimeError("Progetto non trovato.")
    sposta_nel_cestino(p)


# ---------- file trascinati sulla canvas e template ----------

TIPI_CARICABILI = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif",
                   "image/heic": ".heic", "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm",
                   "audio/mpeg": ".mp3", "audio/mp4": ".m4a", "audio/x-m4a": ".m4a", "audio/wav": ".wav",
                   "audio/x-wav": ".wav", "audio/aac": ".aac", "audio/ogg": ".ogg"}
MAX_CARICA = 600 * 1024 * 1024
TEMPLATE = DATI / "template-canvas"


def salva_caricato(progetto, nome, tipo, dati):
    """Salva un file trascinato sulla canvas nella cartella del progetto (prefisso _ref-, non è un risultato)."""
    _, radice = config()
    cartella = radice / nome_sicuro(progetto)
    cartella.mkdir(parents=True, exist_ok=True)
    est = TIPI_CARICABILI.get(tipo) or Path(nome).suffix.lower()
    if est not in set(TIPI_CARICABILI.values()):
        raise RuntimeError("Tipo di file non supportato: " + (tipo or nome))
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(nome).stem)[:40] or "file"
    finale = f'_ref-{dt.datetime.now().strftime("%Y%m%d-%H%M%S")}-{uuid.uuid4().hex[:4]}-{base}{est}'
    (cartella / finale).write_bytes(dati)
    return finale


def elenco_template():
    if not TEMPLATE.exists():
        return []
    return sorted(p.stem for p in TEMPLATE.glob("*.json"))


# ---------- server web locale ----------

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def _body(self):
        n = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        if u.path == "/":
            b = (APP / "index.html").read_bytes()
            try:
                lin = (DATI / "lingua.txt").read_text().strip()
                if lin in ("it", "en"):
                    b = b.replace(b'<html lang="it">', f'<html lang="{lin}" data-lingua="{lin}">'.encode(), 1)
            except OSError:
                pass
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(b)
        elif u.path in ("/canvas.js", "/canvas.css", "/i18n.js"):
            b = (APP / u.path.lstrip("/")).read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", ("application/javascript" if u.path.endswith(".js") else "text/css") + "; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(b)
        elif u.path == "/api/template":
            nome = q.get("nome", [""])[0]
            if nome:
                p = TEMPLATE / (nome_sicuro(nome) + ".json")
                self._json(json.loads(p.read_text(encoding="utf-8")) if p.exists() else {"errore": "Template non trovato."},
                           200 if p.exists() else 404)
            else:
                self._json({"template": elenco_template()})
        elif u.path == "/api/stato":
            chiave, radice = config()
            chiavi = {"fal": bool(chiave), "openrouter": bool(openrouter.chiave())}
            self._json({"chiave_ok": any(chiavi.values()), "chiavi": chiavi, "cartella": str(radice),
                        "modelli": modelli_visibili(), "progetti": elenco_progetti()})
        elif u.path == "/api/aggiornamento":
            self._json(aggiornamenti.stato() if q.get("solo_stato") else aggiornamenti.controlla())
        elif u.path == "/api/cerca-modelli":
            try:
                self._json({"risultati": cerca_modelli(q.get("q", [""])[0])})
            except Exception as e:  # noqa: BLE001
                self._json({"errore": str(e)}, 400)
        elif u.path == "/api/progetto":
            self._json(contenuto_progetto(q.get("nome", [""])[0]))
        elif u.path == "/api/canvas":
            self._json(leggi_canvas(q.get("progetto", [""])[0]))
        elif u.path == "/api/lavoro":
            with LOCK:
                self._json(JOBS.get(q.get("id", [""])[0], {"errore": "non trovato", "fatto": True}))
        elif u.path == "/file":
            _, radice = config()
            p = (radice / nome_sicuro(q["progetto"][0]) / Path(q["nome"][0]).name)
            if not p.exists():
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(p.name)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(p.stat().st_size))
            if q.get("scarica"):
                nd = nome_download(q["progetto"][0], p.name)
                self.send_header("Content-Disposition", "attachment; filename*=UTF-8''" + urllib.parse.quote(nd))
            self.end_headers()
            with p.open("rb") as fh:
                while chunk := fh.read(1 << 20):
                    self.wfile.write(chunk)
        else:
            self.send_error(404)

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/api/carica":
            try:
                q = urllib.parse.parse_qs(u.query)
                n = int(self.headers.get("Content-Length", 0))
                if not 0 < n <= MAX_CARICA:
                    raise RuntimeError("File vuoto o troppo grande (max 600 MB).")
                dati = self.rfile.read(n)
                tipo = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
                self._json({"file": salva_caricato(q.get("progetto", [""])[0], q.get("nome", ["file"])[0], tipo, dati)})
            except Exception as e:  # noqa: BLE001
                self._json({"errore": str(e)}, 400)
            return
        try:
            d = self._body()
            if u.path == "/api/stima":
                self._json({"usd": stima_costo(modello(d["modello"]), d.get("parametri") or {})})
            elif u.path == "/api/aggiungi-modello":
                if d["endpoint"].startswith("or:"):
                    self._json({"modello": openrouter.aggiungi(d["endpoint"][3:])})
                else:
                    self._json({"modello": aggiungi_modello(d["endpoint"])})
            elif u.path == "/api/rimuovi-modello":
                if d["id"].startswith("or-"):
                    openrouter.rimuovi(d["id"])
                else:
                    salva_aggiunti([x for x in modelli_aggiunti() if x["id"] != d["id"]])
                self._json({"ok": True})
            elif u.path == "/api/nuovo-progetto":
                _, radice = config()
                nome = nome_sicuro(d["nome"])
                (radice / nome).mkdir(parents=True, exist_ok=True)
                self._json({"nome": nome})
            elif u.path == "/api/aggiorna":
                aggiornamenti.avvia_installazione()
                self._json({"ok": True})
            elif u.path == "/api/rinomina-progetto":
                self._json({"nome": rinomina_progetto(d.get("vecchio", ""), d.get("nuovo", ""))})
            elif u.path == "/api/lingua":
                lin = "en" if d.get("lingua") == "en" else "it"
                try:
                    f = DATI / "lingua.txt"
                    if not f.exists() or f.read_text().strip() != lin:
                        f.write_text(lin)
                except OSError:
                    pass
                if ALLA_LINGUA:
                    try:
                        ALLA_LINGUA(lin)
                    except Exception:  # noqa: BLE001
                        pass
                self._json({"ok": True})
            elif u.path == "/api/destinazione":
                nome = d.get("progetto", "")
                imp = impostazioni(nome)
                if d.get("azione") == "rimuovi":
                    imp.pop("destinazione", None)
                else:
                    scelta = scegli_cartella(f'Dove salvare i file del progetto "{nome}"?')
                    if not scelta:
                        self._json({"annullato": True, **info_destinazione(nome)})
                        return
                    imp["destinazione"] = str(Path(scelta).expanduser())
                salva_impostazioni(nome, imp)
                self._json(info_destinazione(nome))
            elif u.path == "/api/salva-in-destinazione":
                self._json(salva_in_destinazione(d.get("progetto", ""), d.get("file", ""), bool(d.get("chiedi"))))
            elif u.path == "/api/salva-tutto":
                nome, esiti = d.get("progetto", ""), {"salvato": 0, "gia": 0}
                for e in contenuto_progetto(nome)["elementi"]:
                    esiti[salva_in_destinazione(nome, e["file"]).get("stato", "gia")] += 1
                self._json(esiti)
            elif u.path == "/api/mostra-nel-finder":
                f = Path(d.get("percorso", ""))
                if sys.platform == "darwin" and f.exists():
                    subprocess.Popen(["open", "-R", str(f)])
                self._json({"ok": True})
            elif u.path == "/api/elimina-progetto":
                elimina_progetto(d.get("nome", ""))
                self._json({"ok": True})
            elif u.path == "/api/genera":
                chiave, _ = config()
                m = modello(d["modello"])
                if m.get("fornitore") == "openrouter" and not openrouter.chiave():
                    self._json({"errore": "Manca la chiave OpenRouter: incollala in config.json al posto del segnaposto e riavvia."}, 400)
                    return
                if m.get("fornitore", "fal") == "fal" and not chiave:
                    self._json({"errore": "Manca la chiave fal: incollala in config.json al posto del segnaposto e riavvia."}, 400)
                    return
                if not d.get("progetto") or (m.get("prompt", True) and not m.get("prompt_opzionale") and not d.get("prompt", "").strip()):
                    self._json({"errore": "Servono progetto e prompt."}, 400)
                    return
                jid = uuid.uuid4().hex[:10]
                m = modello(d["modello"])
                with LOCK:
                    JOBS[jid] = {"id": jid, "stato": "Preparo…", "fatto": False, "modello": m["nome"],
                                 "prompt": d.get("prompt", "")[:120], "stima": stima_costo(m, d.get("parametri") or {})}
                threading.Thread(target=esegui, args=(jid, d), daemon=True).start()
                self._json({"id": jid})
            elif u.path == "/api/apri-cartella":
                _, radice = config()
                p = radice / nome_sicuro(d.get("progetto", "")) if d.get("progetto") else radice
                f = p / Path(d["file"]).name if d.get("file") else None
                if sys.platform == "darwin":
                    subprocess.Popen(["open", "-R", str(f)] if f and f.exists() else ["open", str(p)])
                self._json({"ok": True})
            elif u.path == "/api/template":
                nome = nome_sicuro(d.get("nome", ""))
                if not nome or not isinstance(d.get("board"), dict):
                    self._json({"errore": "Servono nome e struttura."}, 400)
                    return
                TEMPLATE.mkdir(exist_ok=True)
                (TEMPLATE / (nome + ".json")).write_text(json.dumps(d["board"], ensure_ascii=False), encoding="utf-8")
                self._json({"ok": True, "nome": nome})
            elif u.path == "/api/canvas":
                if not d.get("progetto"):
                    self._json({"errore": "Manca il progetto."}, 400)
                    return
                salva_canvas(d["progetto"], d)
                self._json({"ok": True})
            else:
                self.send_error(404)
        except Exception as e:  # noqa: BLE001
            self._json({"errore": str(e)}, 400)


def prepara():
    """Crea config.json se manca e avvia i lavori in background. Usata da main() e dall'app per Mac."""
    cfg = json.loads(CONFIG.read_text(encoding="utf-8")) if CONFIG.exists() else {
        "fal_key": SEGNAPOSTO, "cartella_progetti": CARTELLA_DEFAULT}
    if "openrouter_key" not in cfg:
        cfg = {"openrouter_key": openrouter.SEGNAPOSTO, **cfg}
        CONFIG.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")
    elif not CONFIG.exists():
        CONFIG.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")
    chiave, radice = config()
    if chiave:
        threading.Thread(target=aggiorna_prezzi_mancanti, daemon=True).start()
    threading.Thread(target=openrouter.catalogo, daemon=True).start()
    return chiave, radice


def main():
    chiave, radice = prepara()
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://127.0.0.1:{PORT}"
    print(f"\n  Tipico Lab è aperto su {url}")
    print(f"  Progetti in: {radice}")
    if not chiave and not openrouter.chiave():
        print("  ATTENZIONE: manca una chiave (OpenRouter o fal). Aprila in config.json.")
    print("  Per chiudere: chiudi questa finestra o premi Ctrl+C.\n")
    if not os.environ.get("STUDIO_NO_BROWSER"):
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
