# -*- coding: utf-8 -*-
"""Espera hasta la hora indicada (por defecto 01:00) antes del envio diario. Uso: python esperar.py 01:00"""
import datetime, sys, time
try:
    import ctypes
    _k = ctypes.windll.kernel32
    _h = _k.GetStdHandle(-10)
    _m = ctypes.c_uint()
    if _k.GetConsoleMode(_h, ctypes.byref(_m)):
        _k.SetConsoleMode(_h, (_m.value & ~0x40) | 0x80)
except Exception:
    pass
hh, mm = [int(x) for x in (sys.argv[1] if len(sys.argv) > 1 else "01:00").split(":")]
ahora = datetime.datetime.now()
meta = ahora.replace(hour=hh, minute=mm, second=0, microsecond=0)
if ahora.hour >= 18:                      # abierto antes de medianoche -> la 01:00 de manana
    meta += datetime.timedelta(days=1)
if meta <= ahora:
    # ya paso la hora: dar 2 minutos para pegar el link en la ventana de la curva,
    # porque el TPL usa el teclado y el mouse y no deja escribir
    print("Arranco el envio diario en 2 minutos. Pega AHORA el link en la ventana de la CURVA.")
    time.sleep(120)
elif meta > ahora:
    print("Esperando hasta las %s para el envio diario (TPL, Bosnis, correo)... no cierres esta ventana." % meta.strftime("%H:%M"))
    time.sleep((meta - ahora).total_seconds())
