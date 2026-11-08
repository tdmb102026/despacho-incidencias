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
]
print("Escribe cada dato y Enter. Las claves no se ven al escribir (es normal).")
print("Si ya estaba guardado, solo presiona Enter para dejarlo igual.\n")
for sec, campo, texto, secreto in CAMPOS:
    if not c.has_section(sec):
        c.add_section(sec)
    actual = c.get(sec, campo, fallback="")
    marca = " [guardado]" if actual else ""
    v = (getpass.getpass if secreto else input)("%s%s: " % (texto, marca)).strip()
    if v:
        c.set(sec, campo, v)
with open(ARCHIVO, "w", encoding="utf-8") as f:
    c.write(f)
print("\nGuardado en", ARCHIVO)
