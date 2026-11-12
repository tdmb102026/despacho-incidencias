@echo off
rem CURVA MANANA: solo columna D de 06:00 a 14:00, luego se apaga sola
cd /d C:\bosnis
set PY=python
if exist C:\Python34\python.exe set PY=C:\Python34\python.exe
%PY% curva_vivo.py --sin-referencia --desde 06:00 --hasta 14:00
