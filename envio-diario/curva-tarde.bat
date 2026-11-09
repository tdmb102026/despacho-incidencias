@echo off
rem Turno tarde: llena SOLO la columna D del Sheets de hoy hasta las 22:00 y se apaga
cd /d C:\bosnis
set PY=python
if exist C:\Python34\python.exe set PY=C:\Python34\python.exe
%PY% curva_vivo.py --sin-referencia --hasta 22:00
