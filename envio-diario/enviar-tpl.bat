@echo off
rem SOLO TPL: baja los 26 medidores, los sube a SIMEC y saca la captura
cd /d C:\bosnis
C:\Python34\python.exe tpl.py enviar
C:\Python34\python.exe tpl.py capturar
echo.
echo === TPL TERMINADO ===
pause
