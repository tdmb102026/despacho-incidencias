@echo off
cd /d C:\bosnis
set PY=python
if exist C:\Python34\python.exe set PY=C:\Python34\python.exe
%PY% configurar.py
pause
