@echo off
rem PRUEBA del turno nocturno: la curva SI escribe (hasta 00:00), lo demas NO envia nada
cd /d C:\bosnis
start "CURVA EN VIVO" cmd /c curva-tarde.bat
call diario-prueba.bat
