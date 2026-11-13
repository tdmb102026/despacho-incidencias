@echo off
rem Abre el Chrome del programa en modo normal para iniciar sesion en Outlook a mano (una vez).
rem Antes cierra cualquier Chrome del programa. Despues de entrar, cierra la ventana.
start "" chrome.exe --user-data-dir="C:\bosnis\perfil-chrome" https://outlook.cloud.microsoft/mail/
