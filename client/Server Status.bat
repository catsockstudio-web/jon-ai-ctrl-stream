@echo off
REM Is the overlay running, and which copy of the package is serving it?
REM
REM The folder matters as much as the yes/no: if a server left over from an
REM older copy is holding the port, everything looks healthy while the pages
REM being served are the old ones. Compare the path below with this folder.
title Nightwire - Server Status
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try {" ^
  "  $h = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/health' -TimeoutSec 3 -ErrorAction Stop;" ^
  "  Write-Host '';" ^
  "  Write-Host '  Nightwire is RUNNING';" ^
  "  Write-Host '  Dashboard:  http://127.0.0.1:8787/dashboard.html';" ^
  "  if($h.PSObject.Properties.Name -contains 'root'){" ^
  "    Write-Host ('  Serving:    ' + $h.root);" ^
  "    $here = (Get-Location).Path.TrimEnd('\');" ^
  "    if($h.root.TrimEnd('\') -ine $here){" ^
  "      Write-Host '';" ^
  "      Write-Host '  WARNING: that is NOT this folder.';" ^
  "      Write-Host ('  This folder: ' + $here);" ^
  "      Write-Host '  A server from another copy is holding the port, so the';" ^
  "      Write-Host '  pages being served are that copy''s. Run Stop Server.bat,';" ^
  "      Write-Host '  then Start Server.bat from here.'" ^
  "    }" ^
  "  } else {" ^
  "    Write-Host '  Serving:    (an older build that cannot say where it lives)'" ^
  "  }" ^
  "} catch {" ^
  "  Write-Host '';" ^
  "  Write-Host '  Nightwire is NOT running.';" ^
  "  Write-Host '  Start it with Start Server.bat, or the Nightwire shortcut.';" ^
  "  if (Test-Path 'server.log') { Write-Host ''; Write-Host '  Last output from server.log:'; Get-Content 'server.log' -Tail 12 }" ^
  "}"
echo.
pause
