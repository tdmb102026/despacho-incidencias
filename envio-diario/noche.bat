@echo off
rem Turno nocturno completo: abre la curva en vivo en otra ventana (pide el link) y corre el envio diario
cd /d C:\bosnis
start "CURVA EN VIVO" cmd /c curva-noche.bat
call diario.bat
