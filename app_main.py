"""Tipico Lab per macOS: finestra nativa (pywebview/WebKit) + server locale nello stesso processo.

- I dati dell'utente stanno in ~/Library/Application Support/Tipico Lab (copiati dalla cartella
  del programma al primo avvio). I progetti restano dove indica config.json.
- Errori in ~/Library/Logs/Tipico Lab.log; se il server non parte compare un avviso.
- Chiudere la finestra (⌘W) la nasconde; ⌘Q o "Esci" chiude tutto e libera la porta.
"""
import fcntl
import json
import logging
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import traceback
import urllib.request
from pathlib import Path

NOME = "Tipico Lab"
SUPPORTO = Path.home() / "Library" / "Application Support" / NOME
LOG = Path.home() / "Library" / "Logs" / f"{NOME}.log"
NOMI_VECCHI = ("Fra Tak Studio", "Fratak Studio")  # nomi precedenti del programma
for _v in NOMI_VECCHI:
    if (SUPPORTO.parent / _v).exists() and not SUPPORTO.exists():
        (SUPPORTO.parent / _v).rename(SUPPORTO)
SUPPORTO.mkdir(parents=True, exist_ok=True)
LOG.parent.mkdir(parents=True, exist_ok=True)
logging.basicConfig(filename=str(LOG), level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("fratak")

# Certificati HTTPS: il Python dentro l'app non usa quelli del Mac, quindi usa quelli di certifi.
# Senza, ogni chiamata a OpenRouter fallisce con CERTIFICATE_VERIFY_FAILED.
try:
    import certifi
    # py2app imposta SSL_CERT_FILE/SSL_CERT_DIR su un file inesistente: vanno sovrascritti, non solo "proposti"
    os.environ["SSL_CERT_FILE"] = certifi.where()
    os.environ.pop("SSL_CERT_DIR", None)
    os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()
except Exception:  # noqa: BLE001
    pass

# Risorse dell'app (index.html, server.py, …): Contents/Resources dentro il .app, la cartella stessa in sviluppo
RISORSE = Path(os.environ.get("RESOURCEPATH") or Path(__file__).resolve().parent)
FILE_DATI = ["config.json", "openrouter_aggiunti.json", "modelli_aggiunti.json", "openrouter_catalogo.json"]


def avviso(titolo, testo):
    """Avviso nativo macOS (funziona anche prima che la finestra esista)."""
    try:
        subprocess.run(["osascript", "-e", f'display alert {json.dumps(titolo)} message {json.dumps(testo)} as critical'],
                       timeout=600)
    except Exception:  # noqa: BLE001
        pass


def migra_dati():
    """Primo avvio: copia chiavi, modelli aggiunti, catalogo e template dalla cartella del programma."""
    if (SUPPORTO / "config.json").exists():
        return
    origine = None
    f = RISORSE / "origine.txt"
    if f.exists():
        origine = Path(f.read_text(encoding="utf-8").strip())
    candidati = [p for p in [origine, RISORSE] if p and p.exists()]
    for c in candidati:
        if (c / "config.json").exists():
            for nome in FILE_DATI:
                if (c / nome).exists() and not (SUPPORTO / nome).exists():
                    shutil.copy2(c / nome, SUPPORTO / nome)
            if (c / "template-canvas").is_dir() and not (SUPPORTO / "template-canvas").exists():
                shutil.copytree(c / "template-canvas", SUPPORTO / "template-canvas")
            log.info("Dati copiati da %s", c)
            return


def prova_rete():
    """Controllo gratuito all'avvio: legge l'elenco pubblico dei modelli (nessuna chiave, nessun costo)."""
    esito = {"ok": False}
    try:
        with urllib.request.urlopen("https://openrouter.ai/api/v1/images/models", timeout=20) as r:
            esito = {"ok": r.status == 200, "stato": r.status}
    except Exception as e:  # noqa: BLE001
        esito = {"ok": False, "errore": str(e)[:300]}
        log.error("Connessione HTTPS a OpenRouter non riuscita: %s", e)
    try:
        (SUPPORTO / ".rete.json").write_text(json.dumps(esito))
    except Exception:  # noqa: BLE001
        pass


def porta_libera(preferita=8765):
    for p in [preferita] + list(range(8766, 8800)):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", p))
                return p
            except OSError:
                continue
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


# ---------------- un'unica copia dell'app ----------------
_lock = None


def gia_aperta():
    """True se un'altra copia è già aperta: in quel caso le chiede di mostrarsi."""
    global _lock
    _lock = open(SUPPORTO / ".app.lock", "w")
    try:
        fcntl.flock(_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return False
    except OSError:
        try:
            porta = json.loads((SUPPORTO / ".istanza.json").read_text())["porta"]
            urllib.request.urlopen(f"http://127.0.0.1:{porta}/__mostra", timeout=3).read()
        except Exception:  # noqa: BLE001
            pass
        return True


# ---------------- server ----------------
class Server:
    def __init__(self):
        self.srv = None
        self.porta = None

    def avvia(self, porta=None):
        os.environ["STUDIO_NO_BROWSER"] = "1"
        import server  # noqa: E402  (dopo aver impostato FRATAK_DATI)
        self.mod = server
        try:  # aggiornamenti automatici: serve sapere dove sta l'app e come chiuderla
            import aggiornamenti
            from Foundation import NSBundle
            b = str(NSBundle.mainBundle().bundlePath())
            aggiornamenti.BUNDLE = b if b.endswith(".app") else None
            aggiornamenti.ESCI = esci
            aggiornamenti.CARTELLA_LAVORO = str(SUPPORTO)
        except Exception:  # noqa: BLE001
            log.exception("Aggiornamenti non disponibili")
        if self.porta is None:
            server.prepara()
        self.porta = porta or porta_libera()

        app = self

        class Gestore(server.Handler):
            def do_GET(self):
                if self.path.startswith("/__mostra"):
                    app.mostra()
                    self._json({"ok": True})
                    return
                super().do_GET()

        self.srv = server.ThreadingHTTPServer(("127.0.0.1", self.porta), Gestore)
        self.srv.daemon_threads = True
        threading.Thread(target=self.srv.serve_forever, name="server", daemon=True).start()
        (SUPPORTO / ".istanza.json").write_text(json.dumps({"porta": self.porta, "pid": os.getpid()}))
        log.info("Server avviato sulla porta %s", self.porta)

    def pronto(self, attesa=20):
        fine = time.time() + attesa
        while time.time() < fine:
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{self.porta}/", timeout=2).read(64)
                return True
            except Exception:  # noqa: BLE001
                time.sleep(0.15)
        return False

    def ferma(self):
        if self.srv:
            try:
                self.srv.shutdown()
                self.srv.server_close()
            except Exception:  # noqa: BLE001
                log.exception("Arresto server")
            self.srv = None

    def mostra(self):
        mostra_finestra()


SRV = Server()
STATO = {"uscita": False, "finestra": None}
GEOMETRIA = SUPPORTO / "finestra.json"


def leggi_geometria():
    g = {"width": 1440, "height": 900, "x": None, "y": None}
    try:
        g.update(json.loads(GEOMETRIA.read_text()))
    except Exception:  # noqa: BLE001
        pass
    try:  # se lo schermo dove stava la finestra non c'è più, la centra
        import AppKit
        vis = any(AppKit.NSPointInRect((g["x"] + 40, g["y"] + 40), s.frame()) for s in AppKit.NSScreen.screens()) \
            if g["x"] is not None and g["y"] is not None else False
        if not vis:
            g["x"] = g["y"] = None
    except Exception:  # noqa: BLE001
        g["x"] = g["y"] = None
    g["width"] = max(1100, int(g["width"]))
    g["height"] = max(700, int(g["height"]))
    return g


def salva_geometria():
    w = STATO["finestra"]
    if not w:
        return
    try:
        GEOMETRIA.write_text(json.dumps({"width": w.width, "height": w.height, "x": w.x, "y": w.y}))
    except Exception:  # noqa: BLE001
        pass


def sul_thread_principale(fn):
    from PyObjCTools import AppHelper
    AppHelper.callAfter(fn)


def mostra_finestra():
    def f():
        w = STATO["finestra"]
        if w:
            w.show()
            w.restore()
        import AppKit
        AppKit.NSApp().activateIgnoringOtherApps_(True)
    sul_thread_principale(f)


def esci():
    def f():
        import AppKit
        STATO["uscita"] = True
        AppKit.NSApp().terminate_(None)
    sul_thread_principale(f)


# ---------------- icona nella barra dei menu ----------------
def crea_menu_barra():
    import AppKit
    import objc

    class Azioni(AppKit.NSObject):
        def apri_(self, _):
            mostra_finestra()

        def progetti_(self, _):
            try:
                _, radice = SRV.mod.config()
                subprocess.Popen(["open", str(radice)])
            except Exception:  # noqa: BLE001
                log.exception("Apri progetti")

        def config_(self, _):
            subprocess.Popen(["open", "-e", str(SUPPORTO / "config.json")])

        def riavvia_(self, _):
            def lavoro():
                porta = SRV.porta
                SRV.ferma()
                time.sleep(0.3)
                try:
                    SRV.avvia(porta)
                except OSError:
                    SRV.avvia()
                if SRV.pronto():
                    url = f"http://127.0.0.1:{SRV.porta}/"
                    STATO["finestra"].load_url(url)
                else:
                    avviso(NOME, "Il server non è ripartito. Dettagli in ~/Library/Logs/Tipico Lab.log")
            threading.Thread(target=lavoro, daemon=True).start()

        def esci_(self, _):
            esci()

    azioni = Azioni.alloc().init()
    voce = AppKit.NSStatusBar.systemStatusBar().statusItemWithLength_(AppKit.NSVariableStatusItemLength)
    img = AppKit.NSImage.alloc().initWithContentsOfFile_(str(RISORSE / "barra.png"))
    if img:
        img.setSize_((18, 18))
        img.setTemplate_(True)
        voce.button().setImage_(img)
    else:
        voce.button().setTitle_("T")
    voce.button().setToolTip_(NOME)
    menu = AppKit.NSMenu.alloc().init()
    for titolo, azione, tasto in [("Apri Tipico Lab", "apri:", ""), (None, None, None),
                                  ("Apri la cartella dei progetti", "progetti:", ""),
                                  ("Apri config.json", "config:", ""), ("Riavvia il server", "riavvia:", ""),
                                  (None, None, None), ("Esci da Tipico Lab", "esci:", "q")]:
        if titolo is None:
            menu.addItem_(AppKit.NSMenuItem.separatorItem())
            continue
        it = AppKit.NSMenuItem.alloc().initWithTitle_action_keyEquivalent_(titolo, azione, tasto)
        it.setTarget_(azioni)
        menu.addItem_(it)
    voce.setMenu_(menu)
    STATO["barra"] = (voce, azioni, menu)  # tiene vivi gli oggetti


# ---------------- nome precedente e residui degli aggiornamenti ----------------
def rinomina_bundle():
    """Se l'app è ancora installata col nome precedente (es. "Fra Tak Studio.app", dopo l'aggiornamento
    automatico dalla 1.0.0) si rinomina in "Tipico Lab.app" e si riapre. True = questa copia deve chiudersi."""
    try:
        from Foundation import NSBundle
        b = Path(str(NSBundle.mainBundle().bundlePath()))
    except Exception:  # noqa: BLE001
        return False
    if b.name not in {f"{n}.app" for n in NOMI_VECCHI} or "AppTranslocation" in str(b):
        return False
    nuovo = b.parent / f"{NOME}.app"
    if nuovo.exists() or not os.access(b.parent, os.W_OK):
        return False
    try:
        b.rename(nuovo)
    except OSError:
        log.exception("Rinomina dell'app")
        return False
    log.info("App rinominata: %s -> %s", b, nuovo)
    subprocess.Popen(["/bin/sh", "-c", f'while kill -0 {os.getpid()} 2>/dev/null; do sleep 0.2; done; open "{nuovo}"'],
                     start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return True


def pulisci_aggiornamento():
    """Toglie i file temporanei di un aggiornamento finito (la versione vecchia dell'app)."""
    shutil.rmtree(SUPPORTO / ".aggiornamento", ignore_errors=True)


# ---------------- avvio ----------------
def main():
    log.info("---- avvio %s (Python %s)", NOME, sys.version.split()[0])
    os.environ["FRATAK_DATI"] = str(SUPPORTO)
    sys.path.insert(0, str(RISORSE))
    if rinomina_bundle():
        return
    if gia_aperta():
        log.info("Già aperta: porto in primo piano la finestra esistente")
        return
    pulisci_aggiornamento()
    try:
        migra_dati()
        SRV.avvia()
        threading.Thread(target=prova_rete, daemon=True).start()
        if not SRV.pronto():
            raise RuntimeError(f"Il server non risponde sulla porta {SRV.porta}.")
    except Exception as e:  # noqa: BLE001
        log.error("Avvio non riuscito:\n%s", traceback.format_exc())
        avviso(f"{NOME} non si è avviato", f"{e}\n\nDettagli in ~/Library/Logs/{NOME}.log")
        return

    import webview
    from webview.platforms import cocoa
    import objc

    webview.settings["ALLOW_DOWNLOADS"] = True
    webview.settings["OPEN_EXTERNAL_LINKS_IN_BROWSER"] = True

    class Delegato(cocoa.BrowserView.AppDelegate):
        def applicationShouldTerminate_(self, app):
            STATO["uscita"] = True
            salva_geometria()
            return objc.super(Delegato, self).applicationShouldTerminate_(app)

        def applicationShouldHandleReopen_hasVisibleWindows_(self, app, visibili):
            mostra_finestra()  # clic sull'icona nel Dock con la finestra chiusa
            return True

    cocoa.BrowserView._shared_app_delegate = Delegato.alloc().init()

    g = leggi_geometria()
    w = webview.create_window(NOME, f"http://127.0.0.1:{SRV.porta}/", width=g["width"], height=g["height"],
                              x=g["x"], y=g["y"], min_size=(1100, 700), resizable=True, text_select=True,
                              background_color="#FFFFFF")
    STATO["finestra"] = w

    def chiusura():
        salva_geometria()
        if STATO["uscita"]:
            return True
        w.hide()  # ⌘W / pallino rosso: nasconde; l'app resta attiva (Dock e barra dei menu)
        return False

    w.events.closing += chiusura
    w.events.resized += lambda *a: salva_geometria()
    w.events.moved += lambda *a: salva_geometria()

    def all_avvio():
        sul_thread_principale(crea_menu_barra)

    try:
        webview.start(all_avvio, gui="cocoa", private_mode=False, storage_path=str(SUPPORTO / "webview"))
    except Exception as e:  # noqa: BLE001
        log.error("Finestra non avviata:\n%s", traceback.format_exc())
        avviso(f"{NOME}: errore della finestra", f"{e}\n\nDettagli in ~/Library/Logs/{NOME}.log")
    finally:
        SRV.ferma()
        log.info("Chiusura completata")


if __name__ == "__main__":
    try:
        main()
    except Exception:  # noqa: BLE001
        log.error("Errore non gestito:\n%s", traceback.format_exc())
        avviso(NOME, f"Errore inatteso. Dettagli in ~/Library/Logs/{NOME}.log")
    os._exit(0)
