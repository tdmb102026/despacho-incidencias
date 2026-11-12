@echo off
rem CURVA MADRUGADA (casos especiales): solo columna D de 00:15 a 06:00 del archivo del dia, luego se apaga sola
cd /d C:\bosnis
set PY=python
if exist C:\Python34\python.exe set PY=C:\Python34\python.exe
%PY% curva_vivo.py --sin-referencia --desde 00:15 --hasta 06:00
