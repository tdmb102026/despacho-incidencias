@echo off
rem Turno manana/tarde (PC normal): llena SOLO la columna D del Sheets hasta las 00:00
cd /d C:\bosnis
set PY=python
if exist C:\Python34\python.exe set PY=C:\Python34\python.exe
%PY% curva_vivo.py --sin-referencia --hasta 24:00
pause
