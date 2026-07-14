@echo off
cd /d "%~dp0"

:: Bestehende Instanz auf Port 3001 beenden (sprachunabhaengig, kein netstat-Textparsing)
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1

:: Kurz warten bis der Port freigegeben ist
timeout /t 2 /nobreak >nul

:: Produktionsbuild erzeugen, falls noch keiner existiert
if not exist "dist\server\index.js" call npm run build
if not exist "dist\client\index.html" call npm run build

:: Produktionsserver starten (liefert Frontend + API auf Port 3001)
call npm start
