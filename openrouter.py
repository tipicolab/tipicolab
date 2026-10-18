"""Supporto OpenRouter per Tipico Lab: immagini (/api/v1/images) e video (/api/v1/videos).

Il catalogo dei modelli viene letto dalle API pubbliche di OpenRouter e salvato in cache.
I modelli mostrati nell'app sono quelli in PREDEFINITI più quelli che aggiungi da "+ Modelli".
"""
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

APP = Path(__file__).resolve().parent


def _cartella_dati():
    """Dove stanno i dati dell'utente (chiavi, modelli aggiunti, template, catalogo).
    App per Mac: ~/Library/Application Support/Tipico Lab (passata con FRATAK_DATI).
    Avvio dal Terminale: la stessa cartella se esiste già, altrimenti la cartella del programma."""
    env = os.environ.get("FRATAK_DATI")
    if env:
        return Path(env)
    sup = Path.home() / "Library" / "Application Support" / "Tipico Lab"
    for nome in ("Fra Tak Studio", "Fratak Studio"):  # nomi precedenti del programma
        vecchia = sup.parent / nome
        if vecchia.exists() and not sup.exists():
            vecchia.rename(sup)
    return sup if (sup / "config.json").exists() else APP


DATI = _cartella_dati()
DATI.mkdir(parents=True, exist_ok=True)
CACHE = DATI / "openrouter_catalogo.json"
AGGIUNTI = DATI / "openrouter_aggiunti.json"
BASE = os.environ.get("OPENROUTER_BASE", "https://openrouter.ai/api/v1")
SEGNAPOSTO = "INCOLLA_QUI_LA_CHIAVE_OPENROUTER"
CACHE_ORE = 24

PREDEFINITI = [
    "google/gemini-3-pro-image",        # Nano Banana Pro
    "google/gemini-3.1-flash-image",    # Nano Banana 2
    "kwaivgi/kling-v3.0-std",
    "kwaivgi/kling-v3.0-pro",
    "bytedance/seedance-2.0",
    "bytedance/seedance-2.0-fast",
    "google/veo-3.1-fast",
]

# token di output stimati per immagine (modelli Gemini / Nano Banana)
TOKEN_IMMAGINE = {"512": 560, "768": 800, "1K": 1120, "1.5K": 1120, "2K": 1120, "4K": 2000}
AREA = {"480p": 854 * 480, "720p": 1280 * 720, "768p": 1366 * 768, "1080p": 1920 * 1080,
        "1K": 1920 * 1080, "2K": 2560 * 1440, "4K": 3840 * 2160}


# ---------- utilità ----------

def chiave():
    k = os.environ.get("OPENROUTER_KEY", "")
    cfg = DATI / "config.json"
    if not k and cfg.exists():
        k = json.loads(cfg.read_text(encoding="utf-8")).get("openrouter_key", "")
    return "" if k == SEGNAPOSTO else k.strip()


def _http(method, url, body=None, auth=True, timeout=120, raw=False):
    headers = {"Accept": "application/json", "HTTP-Referer": "http://127.0.0.1", "X-Title": "Tipico Lab"}
    if auth:
        headers["Authorization"] = "Bearer " + chiave()
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            b = r.read()
    except urllib.error.HTTPError as e:
        testo = e.read().decode("utf-8", "ignore")
        try:
            msg = json.loads(testo).get("error", {})
            testo = msg.get("message", testo) if isinstance(msg, dict) else str(msg)
        except Exception:  # noqa: BLE001
            pass
        if e.code == 402:
            testo = "credito OpenRouter esaurito o limite della chiave raggiunto. " + testo
        raise RuntimeError(f"OpenRouter ha risposto {e.code}: {testo[:500]}") from None
    return b if raw else json.loads(b or b"{}")


def _lista(d):
    if isinstance(d, list):
        return d
    return d.get("data") or d.get("models") or []


def _slug(or_id):
    return "or-" + re.sub(r"[^a-z0-9]+", "-", or_id.lower()).strip("-")


# ---------- catalogo ----------

def catalogo(forza=False):
    if CACHE.exists() and not forza:
        c = json.loads(CACHE.read_text(encoding="utf-8"))
        if time.time() - c.get("ts", 0) < CACHE_ORE * 3600:
            return c
    try:
        img = _lista(_http("GET", BASE + "/images/models", auth=False, timeout=60))
        vid = _lista(_http("GET", BASE + "/videos/models", auth=False, timeout=60))
        c = {"ts": time.time(), "immagini": img, "video": vid}
        CACHE.write_text(json.dumps(c, ensure_ascii=False), encoding="utf-8")
        return c
    except Exception:  # noqa: BLE001
        if CACHE.exists():
            return json.loads(CACHE.read_text(encoding="utf-8"))
        return {"ts": 0, "immagini": [], "video": []}


def aggiunti():
    return json.loads(AGGIUNTI.read_text(encoding="utf-8")) if AGGIUNTI.exists() else []


def _durate(v):
    if isinstance(v, list):
        return [int(x) for x in v]
    if isinstance(v, dict) and "min" in v:
        return list(range(int(v["min"]), int(v["max"]) + 1))
    if isinstance(v, str) and re.fullmatch(r"\d+-\d+", v):
        a, b = map(int, v.split("-"))
        return list(range(a, b + 1))
    return []


def _scelta(nome, etichetta, opzioni, preferiti):
    opzioni = [o for o in opzioni if o is not None]
    if not opzioni:
        return None
    default = next((p for p in preferiti if p in opzioni), opzioni[0])
    return {"nome": nome, "etichetta": etichetta, "tipo": "scelta", "opzioni": opzioni, "default": default}


def _modello_immagine(x, extra):
    sp = x.get("supported_parameters") or {}
    par = []
    if "resolution" in sp:
        par.append(_scelta("resolution", "Risoluzione", sp["resolution"].get("values", []), ["2K", "1K"]))
    if "aspect_ratio" in sp:
        par.append(_scelta("aspect_ratio", "Formato", sp["aspect_ratio"].get("values", []), ["4:5", "3:4", "1:1"]))
    n = sp.get("n") or {}
    if n.get("max", 1) > 1:
        par.append(_scelta("n", "Quante immagini", list(range(int(n.get("min", 1)), min(int(n["max"]), 4) + 1)), [1]))
    for k in ("quality", "output_format", "background"):
        if sp.get(k, {}).get("type") == "enum":
            par.append(_scelta(k, k.replace("_", " ").capitalize(), sp[k]["values"], []))
    if "seed" in sp:
        par.append({"nome": "seed", "etichetta": "Seed (opzionale)", "tipo": "numero", "default": None})
    refmax = int((sp.get("input_references") or {}).get("max", 0) or 0)
    refmin = int((sp.get("input_references") or {}).get("min", 0) or 0)
    m = {"id": _slug(x["id"]), "nome": x.get("name") or x["id"], "tipo": "immagine", "fornitore": "openrouter",
         "or_id": x["id"], "endpoint": x["id"], "prompt": True, "parametri": [p for p in par if p],
         "reference": None, "prezzo": extra.get("prezzo") or {"per": "sconosciuto"}}
    if refmax:
        m["reference"] = {"campo": "input_references", "multiple": refmax > 1, "obbligatoria": refmin > 0,
                          "etichetta": (f"Reference di stile (obbligatoria, max {refmax})" if refmin > 0
                                        else f"Reference (opzionali, max {refmax})"), "max": refmax}
    return m


def _modello_upscale(x):
    uf = x.get("upscale_factor") or {}
    lo, hi = float(uf.get("min", 1.5)), float(uf.get("max", 3))
    fattori, f = [], lo
    while f <= hi + 1e-9:
        fattori.append(int(f) if f == int(f) else round(f, 2))
        f += 0.5
    par = [_scelta("upscale_factor", "Ingrandimento", fattori, [1.5]),
           _scelta("modalita", "Modalità", ["Precise", "Creative"], ["Precise"])]
    return {"id": _slug(x["id"]), "nome": x.get("name") or x["id"], "tipo": "video", "fornitore": "openrouter",
            "or_id": x["id"], "endpoint": x["id"], "prompt": True, "prompt_opzionale": True,
            "parametri": [p for p in par if p], "reference": None,
            "video_sorgente": {"etichetta": "Video da upscalare (obbligatorio)"},
            "prezzo": {"per": "or_upscale", "skus": x.get("pricing_skus") or {}}}


def _modello_video(x):
    if x.get("upscale_factor"):
        return _modello_upscale(x)
    par = []
    durate = _durate(x.get("supported_durations"))
    if durate:
        par.append(_scelta("duration", "Durata (s)", durate, [5, 6, 4]))
    if x.get("supported_resolutions"):
        par.append(_scelta("resolution", "Risoluzione", x["supported_resolutions"], ["720p", "768p", "1080p"]))
    if x.get("supported_aspect_ratios"):
        par.append(_scelta("aspect_ratio", "Formato", x["supported_aspect_ratios"], ["16:9", "9:16"]))
    skus = x.get("pricing_skus") or {}
    audio = x.get("generate_audio")
    if audio is None:
        audio = any("audio" in k for k in skus) or x.get("supports_audio")
    if audio:
        par.append({"nome": "generate_audio", "etichetta": "Audio", "tipo": "sino", "default": False})
    frames = x.get("supported_frame_images") or []
    m = {"id": _slug(x["id"]), "nome": x.get("name") or x["id"], "tipo": "video", "fornitore": "openrouter",
         "or_id": x["id"], "endpoint": x["id"], "prompt": True, "parametri": [p for p in par if p],
         "reference": None, "prezzo": {"per": "or_video", "skus": skus}}
    if "first_frame" in frames:
        m["reference"] = {"campo": "first_frame", "multiple": False, "obbligatoria": False,
                          "etichetta": "Primo frame (opzionale: senza = da testo)"}
    if "last_frame" in frames:
        m["reference_fine"] = {"campo": "last_frame", "etichetta": "Ultimo frame (opzionale)"}
    return m


def prezzo_immagine(or_id):
    """Legge dagli endpoint del modello il costo per token di output (se disponibile)."""
    try:
        d = _http("GET", f"{BASE}/images/models/{or_id}/endpoints", auth=False, timeout=30)
        d = d.get("data", d) if isinstance(d, dict) else d
        eps = d if isinstance(d, list) else d.get("endpoints", [])
        for ep in eps:
            pricing = ep.get("pricing") or []
            if isinstance(pricing, dict):
                pricing = [pricing]
            for p in pricing:
                if p.get("billable") == "output_image" and p.get("unit") == "token":
                    return {"per": "or_img_token", "usd": float(p["cost_usd"])}
    except Exception:  # noqa: BLE001
        pass
    return {"per": "sconosciuto"}


def modelli():
    c = catalogo()
    per_id = {x["id"]: ("immagine", x) for x in c.get("immagini", [])}
    per_id.update({x["id"]: ("video", x) for x in c.get("video", [])})
    extra = {a["or_id"]: a for a in aggiunti()}
    out = []
    for or_id in PREDEFINITI + [i for i in extra if i not in PREDEFINITI]:
        if or_id not in per_id:
            continue
        tipo, x = per_id[or_id]
        m = _modello_immagine(x, extra.get(or_id, {})) if tipo == "immagine" else _modello_video(x)
        if tipo == "immagine" and m["prezzo"]["per"] == "sconosciuto" and or_id in PREDEFINITI:
            m["prezzo"] = {"per": "or_img_token", "usd": 0.00012} if "gemini-3-pro-image" in or_id else (
                {"per": "or_img_token", "usd": 0.00006} if "gemini-3.1-flash-image" in or_id else m["prezzo"])
        m["aggiunto"] = or_id in extra and or_id not in PREDEFINITI
        out.append(m)
    return out


def cerca(q):
    c = catalogo()
    q = q.lower().strip()
    presenti = set(PREDEFINITI) | {a["or_id"] for a in aggiunti()}
    out = []
    for tipo, lista in (("text-to-image", c.get("immagini", [])), ("video", c.get("video", []))):
        for x in lista:
            testo = (x["id"] + " " + (x.get("name") or "")).lower()
            if all(p in testo for p in q.split()):
                out.append({"endpoint": "or:" + x["id"], "nome": x.get("name") or x["id"], "categoria": tipo,
                            "descrizione": (x.get("description") or "")[:160], "fornitore": "OpenRouter",
                            "aggiunto": x["id"] in presenti})
    return out[:40]


def aggiungi(or_id):
    lista = [a for a in aggiunti() if a["or_id"] != or_id]
    voce = {"or_id": or_id}
    if any(x["id"] == or_id for x in catalogo().get("immagini", [])):
        voce["prezzo"] = prezzo_immagine(or_id)
    lista.append(voce)
    AGGIUNTI.write_text(json.dumps(lista, indent=2), encoding="utf-8")
    return next(m for m in modelli() if m["or_id"] == or_id)


def rimuovi(mid):
    AGGIUNTI.write_text(json.dumps([a for a in aggiunti() if _slug(a["or_id"]) != mid], indent=2), encoding="utf-8")


# ---------- costi ----------

def stima(m, params):
    p = m.get("prezzo") or {}
    if p.get("per") == "or_img_token":
        t = TOKEN_IMMAGINE.get(str(params.get("resolution", "1K")), 1120)
        return round(p["usd"] * t * int(params.get("n", 1) or 1), 3)
    if p.get("per") == "or_upscale":
        w, h, dur = (float(params.get(k) or 0) for k in ("_src_w", "_src_h", "_src_dur"))
        if not (w and h and dur):
            return None
        f = float(params.get("upscale_factor") or 1.5)
        mp = (w * f) * (h * f) / 1e6
        chiave_sku = "creative" if params.get("modalita") == "Creative" else "precise"
        cent = next((float(v) for k, v in (p.get("skus") or {}).items() if chiave_sku in k), None)
        return None if cent is None else round(cent / 100 * mp * dur, 3)
    if p.get("per") != "or_video":
        return None
    skus = {k: float(v) for k, v in (p.get("skus") or {}).items() if re.fullmatch(r"[\d.]+", str(v))}
    if not skus:
        return None
    dur = float(params.get("duration") or 5)
    res = str(params.get("resolution") or "720p").lower()
    audio = "with_audio" if params.get("generate_audio") else "without_audio"
    for k in (f"duration_seconds_{audio}_{res}", f"duration_seconds_{audio}", f"image_to_video_duration_seconds_{res}",
              "duration_seconds_with_audio" if audio == "with_audio" else "duration_seconds", "duration_seconds"):
        if k in skus:
            return round(skus[k] * dur, 3)
    tok = next((skus[k] for k in (f"video_tokens_{res}", "video_tokens" if audio == "with_audio" else "video_tokens_without_audio",
                                   "video_tokens") if k in skus), None)
    if tok is not None:
        area = AREA.get(res.upper() if res.endswith("k") else res, 1280 * 720)
        return round(tok * area * dur * 24 / 1024, 3)
    sec = [v for k, v in skus.items() if "second" in k and res in k] or [v for k, v in skus.items() if "second" in k]
    if sec:
        val = min(sec)
        return round((val / 100 if "cents" in " ".join(skus) else val) * dur, 3)
    return None


# ---------- immagini di riferimento ----------

def _data_url(dati, tipo):
    """Riduce le immagini molto pesanti (sips, solo Mac) e restituisce un data URL."""
    if len(dati) > 3_000_000 and sys.platform == "darwin" and shutil.which("sips"):
        with tempfile.TemporaryDirectory() as d:
            src, dst = Path(d) / "in", Path(d) / "out.jpg"
            src.write_bytes(dati)
            r = subprocess.run(["sips", "-Z", "2048", "-s", "format", "jpeg", str(src), "--out", str(dst)],
                               capture_output=True)
            if r.returncode == 0 and dst.exists():
                dati, tipo = dst.read_bytes(), "image/jpeg"
    return f"data:{tipo};base64," + base64.b64encode(dati).decode()


def _img(data_url_utente):
    testa, b64 = data_url_utente.split(",", 1)
    tipo = testa.split(";")[0].split(":", 1)[1] if ":" in testa else "image/png"
    return _data_url(base64.b64decode(b64), tipo)


# ---------- caricamento temporaneo del video (OpenRouter vuole un link HTTPS) ----------

LITTERBOX = os.environ.get("LITTERBOX", "https://litterbox.catbox.moe/resources/internals/api.php")
TMPFILES = os.environ.get("TMPFILES", "https://tmpfiles.org/api/v1/upload")


def _multipart(campi, campo_file, nome, tipo, dati):
    confine = "----StudioAI" + os.urandom(8).hex()
    parti = []
    for k, v in campi.items():
        parti.append(f'--{confine}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    parti.append(f'--{confine}\r\nContent-Disposition: form-data; name="{campo_file}"; filename="{nome}"\r\n'
                 f'Content-Type: {tipo}\r\n\r\n'.encode() + dati + b"\r\n")
    parti.append(f"--{confine}--\r\n".encode())
    return b"".join(parti), "multipart/form-data; boundary=" + confine


def _post_file(url, campi, campo_file, nome, tipo, dati):
    corpo, ct = _multipart(campi, campo_file, nome, tipo, dati)
    req = urllib.request.Request(url, data=corpo, method="POST",
                                 headers={"Content-Type": ct, "User-Agent": "StudioAI/1.0"})
    with urllib.request.urlopen(req, timeout=900) as r:
        return r.read().decode("utf-8", "ignore").strip()


def carica_temporaneo(dati, tipo, nome):
    """Carica il file su un hosting temporaneo e restituisce un link HTTPS diretto."""
    nome = re.sub(r"[^A-Za-z0-9._-]+", "_", nome or "video.mp4")
    errori = []
    try:  # Litterbox: cancellato automaticamente dopo 1 ora, max 1 GB
        u = _post_file(LITTERBOX, {"reqtype": "fileupload", "time": "1h"}, "fileToUpload", nome, tipo, dati)
        if u.startswith("https://"):
            return u
        errori.append("Litterbox: " + u[:150])
    except Exception as e:  # noqa: BLE001
        errori.append(f"Litterbox: {e}")
    try:  # tmpfiles.org: cancellato dopo 60 minuti, max 100 MB
        d = json.loads(_post_file(TMPFILES, {}, "file", nome, tipo, dati))
        u = (d.get("data") or {}).get("url", "")
        m = re.match(r"https?://tmpfiles\.org/(.+)", u)
        if m:
            return "https://tmpfiles.org/dl/" + m.group(1)
        errori.append("tmpfiles: " + json.dumps(d)[:150])
    except Exception as e:  # noqa: BLE001
        errori.append(f"tmpfiles: {e}")
    raise RuntimeError("Non riesco a caricare il video online (" + " | ".join(errori) + ")")


# ---------- generazione ----------

ESTENSIONI = {"image/svg+xml": ".svg", "image/svg": ".svg", "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "video/mp4": ".mp4",
              "video/webm": ".webm", "video/quicktime": ".mov"}


def genera(m, richiesta, params, stato):
    """Restituisce (lista di (bytes, estensione), costo_reale_usd_o_None, info_extra)."""
    if not chiave():
        raise RuntimeError("Manca la chiave OpenRouter in config.json.")
    refs = richiesta.get("reference") or []
    if m["tipo"] == "immagine":
        body = {"model": m["or_id"], "prompt": richiesta["prompt"], **params}
        if refs:
            body["input_references"] = [{"type": "image_url", "image_url": {"url": _img(r["dati"])}} for r in refs]
        stato("In generazione su OpenRouter…")
        d = _http("POST", BASE + "/images", body, timeout=900)
        file = []
        for x in d.get("data", []):
            if not x.get("b64_json"):
                continue
            dati = base64.b64decode(x["b64_json"])
            est = ESTENSIONI.get(x.get("media_type", ""))
            if not est:
                inizio = dati[:200].lstrip().lower()
                est = ".svg" if inizio.startswith(b"<svg") or (inizio.startswith(b"<?xml") and b"<svg" in dati[:1000].lower()) \
                    else ".jpg" if dati[:3] == b"\xff\xd8\xff" else ".webp" if dati[8:12] == b"WEBP" else ".png"
            file.append((dati, est))
        if not file:
            raise RuntimeError("OpenRouter non ha restituito immagini: " + json.dumps(d)[:300])
        return file, (d.get("usage") or {}).get("cost"), {}

    if m.get("video_sorgente"):
        v = richiesta.get("video_sorgente")
        if not v or not v.get("dati"):
            raise RuntimeError("Carica il video da upscalare.")
        stato("Carico il video (link temporaneo, si cancella da solo)…")
        dati_v, tipo_v = base64.b64decode(v["dati"].split(",", 1)[1]), \
            (v["dati"].split(";")[0].split(":", 1)[1] if v["dati"].startswith("data:") else "video/mp4")
        v["url"] = carica_temporaneo(dati_v, tipo_v, v.get("nome"))
        body = {"model": m["or_id"],
                "input_references": [{"type": "video_url", "video_url": {"url": v["url"]}}],
                "upscale_factor": float(params.get("upscale_factor") or 1.5),
                "creativity": 1 if params.get("modalita") == "Creative" else 0}
        if (richiesta.get("prompt") or "").strip():
            body["prompt"] = richiesta["prompt"].strip()
        stato("Invio il video a OpenRouter…")
    else:
        body = {"model": m["or_id"], "prompt": richiesta["prompt"],
                **{k: v for k, v in params.items() if not k.startswith("_")}}
    if "duration" in body:
        body["duration"] = int(body["duration"])
    frames = []
    if refs:
        frames.append({"type": "image_url", "image_url": {"url": _img(refs[0]["dati"])}, "frame_type": "first_frame"})
    fine = richiesta.get("reference_fine")
    if fine and m.get("reference_fine"):
        frames.append({"type": "image_url", "image_url": {"url": _img(fine["dati"])}, "frame_type": "last_frame"})
    if frames and not m.get("video_sorgente"):
        body["frame_images"] = frames
    stato("Invio a OpenRouter…")
    sub = _http("POST", BASE + "/videos", body, timeout=300)
    url = sub.get("polling_url") or f'{BASE}/videos/{sub["id"]}'
    inizio = time.time()
    while True:
        time.sleep(5)
        st = _http("GET", url, timeout=60)
        s = st.get("status")
        if s == "failed" or st.get("error"):
            err = st.get("error")
            raise RuntimeError("Generazione fallita: " + (err.get("message", str(err)) if isinstance(err, dict) else str(err)))
        if s == "completed":
            break
        stato(("In coda… " if s == "pending" else "In generazione… ") + f"{int(time.time() - inizio)} s")
        if time.time() - inizio > 45 * 60:
            raise RuntimeError("Tempo scaduto (45 minuti).")
    stato("Scarico il video…")
    urls = st.get("unsigned_urls") or [f'{BASE}/videos/{sub["id"]}/content?index=0']
    file = [(_http("GET", u, timeout=900, raw=True), ".mp4") for u in urls]
    extra = {"request_id": sub.get("id")}
    if m.get("video_sorgente"):
        extra["video_sorgente"] = (richiesta.get("video_sorgente") or {}).get("nome")
    return file, (st.get("usage") or {}).get("cost"), extra
