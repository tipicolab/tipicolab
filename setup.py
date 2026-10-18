"""Crea "Fra Tak Studio.app" con py2app. Non va lanciato a mano: usa build_app.sh."""
from pathlib import Path

from setuptools import setup

VERSIONE = Path(__file__).with_name("VERSIONE").read_text(encoding="utf-8").strip()

RISORSE = ["index.html", "canvas.js", "canvas.css", "models.json", "server.py", "openrouter.py", "aggiornamenti.py", "VERSIONE",
           "build_risorse/barra.png", "build_risorse/origine.txt"]

OPZIONI = {
    "iconfile": "build_risorse/Fra Tak Studio.icns",
    "argv_emulation": False,
    "resources": RISORSE,
    # pacchetti veri (cartelle con __init__.py), copiati interi
    "packages": ["certifi", "webview", "proxy_tools", "objc", "AppKit", "Foundation", "WebKit", "Quartz",
                 "Security", "UniformTypeIdentifiers", "CoreFoundation"],
    # moduli singoli e PyObjCTools (che non è un pacchetto classico)
    "includes": ["bottle", "typing_extensions", "PyObjCTools.AppHelper", "server", "openrouter", "aggiornamenti", "fcntl", "csv",
                 "uuid", "mimetypes", "http.server", "urllib.request", "webbrowser"],
    "plist": {
        "CFBundleName": "Fra Tak Studio",
        "CFBundleDisplayName": "Fra Tak Studio",
        "CFBundleIdentifier": "it.fratak.studio",
        "CFBundleShortVersionString": VERSIONE,
        "CFBundleVersion": VERSIONE,
        "LSMinimumSystemVersion": "11.0",
        "NSHighResolutionCapable": True,
        "LSApplicationCategoryType": "public.app-category.graphics-design",
        "NSHumanReadableCopyright": "Fra Tak Studio",
        "NSAppTransportSecurity": {"NSAllowsLocalNetworking": True},
    },
}

setup(name="Fra Tak Studio", app=["app_main.py"], options={"py2app": OPZIONI})
