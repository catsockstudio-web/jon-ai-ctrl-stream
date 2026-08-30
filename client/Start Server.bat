@echo off
REM Start Nightwire (it normally starts by itself at sign-in).
REM
REM Nightwire.vbs starts the overlay server first and the tray icon second, so
REM the overlay comes up even if the tray cannot. This then CONFIRMS the server
REM is answering rather than assuming it: a launcher that reports nothing is
REM how a silent failure turns into "the dashboard refuses to connect" with no
REM clue why.
title Nightwire - Start
cd /d "%~dp0"
start "" wscript.exe "%~dp0Nightwire.vbs"

echo.
echo   Starting Nightwire...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ok=$false;" ^
  "foreach($i in 1..20){ try { Invoke-WebRequest 'http://127.0.0.1:8787/api/health' -UseBasicParsing -TimeoutSec 2 ^| Out-Null; $ok=$true; break } catch { Start-Sleep -Milliseconds 600 } };" ^
  "if($ok){" ^
  "  Write-Host '  Running. Opening the dashboard...';" ^
  "  Write-Host '  Look for the Nightwire icon by the clock - Windows may hide it';" ^
  "  Write-Host '  behind the small arrow at the left of the notification area.';" ^
  "  Start-Process 'http://127.0.0.1:8787/dashboard.html'" ^
  "} else {" ^
  "  Write-Host '';" ^
  "  Write-Host '  The server did not start.';" ^
  "  Write-Host '';" ^
  "  if(Test-Path 'server.log'){ Write-Host '  server.log says:'; Get-Content 'server.log' -Tail 15 }" ^
  "  else { Write-Host '  No server.log was written, which usually means Node.js is missing.'; Write-Host '  Run Setup.bat.' }" ^
  "}"

echo.
pause
