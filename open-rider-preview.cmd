@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -Command "try { if ((Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:17881/api/rider-catalog' -TimeoutSec 2).StatusCode -ne 200) { exit 1 } } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
  start "Denglema Rider Preview - localhost" /min cmd /k "node scripts\rider-preview-local.mjs"
  timeout /t 2 /nobreak >nul
)
start "" "http://127.0.0.1:17881/rider-preview?preset=bubble-suit"
