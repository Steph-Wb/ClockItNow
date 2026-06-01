@echo off
cd /d "%~dp0"

:: Bestehende Instanzen auf Port 3001 und 5173 beenden
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr /R ":3001 .*ABHOEREN\|:5173 .*ABHOEREN"') do (
    if not "%%P"=="0" taskkill /PID %%P /F >nul 2>&1
)

:: Kurz warten bis Ports freigegeben sind
timeout /t 2 /nobreak >nul

:: App starten (npm run dev läuft im Hintergrund – Fenster wird von ClockItNow.vbs versteckt)
npm run dev
