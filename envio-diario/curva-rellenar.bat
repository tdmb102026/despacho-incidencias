@echo off
rem CURVA RELLENAR (caso especial): columna C completa y D desde 00:15 hasta la hora actual, y termina
cd /d C:\bosnis
set PY=python
if exist C:\Python34\python.exe set PY=C:\Python34\python.exe
%PY% curva_vivo.py --desde 00:15 --hasta 24:00 --una-vez
pause
