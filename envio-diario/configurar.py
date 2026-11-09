# -*- coding: utf-8 -*-
"""Pide las claves y las guarda SOLO en esta PC: C:\\bosnis\\credenciales.ini
Si ya hay un dato guardado, Enter lo deja igual."""
from __future__ import print_function
import configparser, getpass, os

ARCHIVO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "credenciales.ini")
c = configparser.ConfigParser()
c.read(ARCHIVO, encoding="utf-8")

CAMPOS = [
    ("cenace", "usuario", "CENACE Bitacora Net - usuario", False),
    ("cenace", "clave", "CENACE Bitacora Net - clave", True),
    ("cenace", "ingeniero", "CENACE - Nombre y Apellido del ingeniero de turno", False),
    ("demanda", "usuario", "DemandaMaxima - usuario", False),
    ("demanda", "clave", "DemandaMaxima - clave", True),
    ("tpl", "usuario", "Programa TPL - Nombre de usuario", False),
    ("tpl", "clave", "Programa TPL - Contrasena", True),
    ("simec", "usuario", "SIMEC (smec.cenace.gob.ec) - usuario", False),
    ("simec", "clave", "SIMEC - clave", True),
    ("correo", "usuario", "Correo Outlook (cecon@eeasa.com.ec) - usuario", False),
    ("correo", "clave", "Correo Outlook - clave", True),
]
GRUPOS = [("cenace", "CENACE Bitacora Net"), ("demanda", "DemandaMaxima"), ("tpl", "Programa TPL"),
          ("simec", "SIMEC"), ("correo", "Correo Outlook")]
print("  #  %-22s %-28s %s" % ("PROGRAMA", "USUARIO", "CLAVE"))
print("  " + "-" * 70)
for i, (sec, nombre) in enumerate(GRUPOS, 1):
    print("  %d  %-22s %-28s %s" % (i, nombre, c.get(sec, "usuario", fallback="") or "(vacio)",
                                   c.get(sec, "clave", fallback="") or "(vacio)"))
print("  0  Todo")
print("\nQue quieres cambiar? (numero, o varios separados por espacio)")
op = input("Numero: ").strip()
elegidas = [g[0] for g in GRUPOS] if op in ("", "0") else \
    [GRUPOS[int(x) - 1][0] for x in op.replace(",", " ").split() if x.isdigit() and 0 < int(x) <= len(GRUPOS)]
print("\nEscribe cada dato y Enter. Ojo: las claves se ven en pantalla.")
print("Si ya estaba guardado, solo presiona Enter para dejarlo igual.\n")
for sec, campo, texto, secreto in CAMPOS:
    if sec not in elegidas:
        continue
    if not c.has_section(sec):
        c.add_section(sec)
    actual = c.get(sec, campo, fallback="")
    marca = " [guardado]" if actual else ""
    v = input("%s%s: " % (texto, (" [actual: %s]" % actual) if actual else "")).strip()
    if v:
        c.set(sec, campo, v)
with open(ARCHIVO, "w", encoding="utf-8") as f:
    c.write(f)
print("\nGuardado en", ARCHIVO)
