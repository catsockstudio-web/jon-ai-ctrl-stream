@echo off
REM Stop the overlay server.
REM
REM Asks the server to shut itself down first. Force-killing whatever held the
REM port is what used to leave stray node.exe processes behind: any server not
REM currently listening survived, and could take the port later. Anything that
REM ignores the polite request is still cleaned up below.
title Nightwire - Stop Server

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$stopped = $false;" ^
  "try {" ^
  "  Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/shutdown' -Method Post -TimeoutSec 5 -ErrorAction Stop ^| Out-Null;" ^
  "  foreach($i in 1..20){ Start-Sleep -Milliseconds 250; try { Invoke-WebRequest 'http://127.0.0.1:8787/api/health' -UseBasicParsing -TimeoutSec 1 ^| Out-Null } catch { $stopped = $true; break } };" ^
  "  if($stopped){ Write-Host ''; Write-Host '  Server stopped.' } else { Write-Host ''; Write-Host '  It did not stop when asked - forcing it.' }" ^
  "} catch {" ^
  "  Write-Host ''; Write-Host '  Nothing was answering on port 8787.'" ^
  "};" ^
  "if(-not $stopped){" ^
  "  Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue ^| ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" ^
  "};" ^
  "$strays = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue ^| Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine -match 'server\.mjs' });" ^
  "if($strays.Count -gt 0){" ^
  "  Write-Host '';" ^
  "  Write-Host ('  ' + $strays.Count + ' other overlay server process(es) are still running:');" ^
  "  foreach($p in $strays){ Write-Host ('    PID ' + $p.ProcessId + '  ' + $p.CommandLine) };" ^
  "  Write-Host '';" ^
  "  $answer = Read-Host '  Stop those too? (Y/N)';" ^
  "  if($answer -match '^[Yy]'){ foreach($p in $strays){ Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }; Write-Host '  Stopped.' }" ^
  "}"

echo.
pause
