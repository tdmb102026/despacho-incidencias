# -*- coding: utf-8 -*-
"""Instala/actualiza el programa BOSNI en C:\\bosnis (Python 3.4)."""
from __future__ import print_function
import io, os, time, zipfile
import urllib.request as u

DESTINO = r"C:\bosnis"
BASE = "https://raw.githubusercontent.com/tdmb102026/despacho-incidencias/claude/project-thread-vee0yh/envio-diario/"
DRIVER = "https://chromedriver.storage.googleapis.com/109.0.5414.74/chromedriver_win32.zip"

if not os.path.isdir(DESTINO):
    os.makedirs(DESTINO)

# usar el ultimo commit exacto (evita copias viejas en cache)
import json
RAMA = "claude/project-thread-vee0yh"
try:
    BASE = BASE.replace(RAMA, V)   # V viene del comando de instalar (commit exacto)
    print("Version", V[:7])
except NameError:
  try:
    info = json.loads(u.urlopen("https://api.github.com/repos/tdmb102026/despacho-incidencias/commits/" + RAMA,
                                timeout=60).read().decode("utf-8"))
    BASE = BASE.replace(RAMA, info["sha"])
    print("Version del", info["commit"]["committer"]["date"], info["sha"][:7])
  except Exception as e:
    print("(no se pudo leer la ultima version, uso la rama)", e)

for nombre in ("bosnis.py", "bosnis.bat", "bosnis-prueba.bat", "bosnis-prueba-completa.bat", "configurar.py", "configurar.bat", "tpl.py", "tpl-prueba.bat", "diario.bat", "demanda.py", "curva.vbs", "demanda-prueba.bat"):
    print("Bajando", nombre)
    datos = u.urlopen(BASE + nombre + "?t=%d" % time.time(), timeout=60).read()
    open(os.path.join(DESTINO, nombre), "wb").write(datos)

if not os.path.isfile(os.path.join(DESTINO, "chromedriver.exe")):
    print("Bajando chromedriver 109")
    z = zipfile.ZipFile(io.BytesIO(u.urlopen(DRIVER, timeout=120).read()))
    z.extract("chromedriver.exe", DESTINO)

print("LISTO. Todo quedo en", DESTINO)
