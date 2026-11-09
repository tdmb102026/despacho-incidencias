@echo off
rem Turno manana: llena SOLO la columna D del Sheets de hoy hasta las 14:00 y se apaga
cd /d C:\bosnis
set PY=python
if exist C:\Python34\python.exe set PY=C:\Python34\python.exe
%PY% curva_vivo.py --sin-referencia --hasta 14:00
