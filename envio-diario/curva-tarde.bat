@echo off
rem CURVA TARDE: solo columna D de 14:15 a 22:00, luego se apaga sola
cd /d C:\bosnis
set PY=python
if exist C:\Python34\python.exe set PY=C:\Python34\python.exe
%PY% curva_vivo.py --sin-referencia --desde 14:15 --hasta 22:00
