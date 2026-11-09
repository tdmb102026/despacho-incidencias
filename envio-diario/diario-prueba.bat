@echo off
rem PRUEBA de todo junto: no envia nada (SIMEC sin Enviar, CENACE sin Guardar, correo sin Enviar)
rem Capturas y curva van a C:\bosnis\capturas-prueba y C:\bosnis\pruebas
cd /d C:\bosnis
C:\Python34\python.exe tpl.py enviar --prueba
C:\Python34\python.exe bosnis.py --prueba
C:\Python34\python.exe demanda.py todo --prueba
C:\Python34\python.exe tpl.py capturar --prueba
pause
