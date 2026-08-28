@echo off
REM Is the overlay server running?
powershell -NoProfile -Command ^
  "try {" ^
  "  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8787/api/state' -UseBasicParsing -TimeoutSec 3;" ^
  "  Write-Host '';" ^
  "  Write-Host '  Server is RUNNING (HTTP' $r.StatusCode ')';" ^
  "  Write-Host '  Dashboard: http://127.0.0.1:8787/dashboard.html';" ^
  "} catch {" ^
  "  Write-Host '';" ^
  "  Write-Host '  Server is NOT running.';" ^
  "  Write-Host '  Start it with start.bat, or install-autostart.bat to run it at sign-in.';" ^
  "  if (Test-Path 'server.log') { Write-Host ''; Write-Host '  Last output from server.log:'; Get-Content 'server.log' -Tail 12 }" ^
  "}"
echo.
pause
