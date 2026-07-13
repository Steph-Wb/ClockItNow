@echo off
cd /d "%~dp0"

:: Bestehende Instanz auf Port 3001 beenden (deutsche + englische netstat-Ausgabe)
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr /R ":3001 .*ABHOEREN :3001 .*LISTENING"') do (
    if not "%%P"=="0" taskkill /PID %%P /F >nul 2>&1
)

:: Kurz warten bis der Port freigegeben ist
timeout /t 2 /nobreak >nul

:: Produktionsbuild erzeugen, falls noch keiner existiert
if not exist "dist\server\index.js" call npm run build
if not exist "dist\client\index.html" call npm run build

:: Produktionsserver starten (liefert Frontend + API auf Port 3001)
call npm start
