@echo off
REM Stop the overlay server.
REM
REM Asks the server to shut itself down first. Force-killing whatever held the
REM port is what used to leave stray processes behind: any server not currently
REM listening survived, and could take the port later. Anything that ignores
REM the polite request is still cleaned up below.
REM
REM The sweep matches cmd.exe as well as node.exe. The server runs as
REM "cmd /c node server.mjs > server.log", and it is CMD that owns the
REM server.log handle and has this folder as its working directory - so
REM killing only node.exe left the folder locked and undeletable, which looked
REM exactly like the stop having not worked.
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
  "$strays = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue ^| Where-Object { $_.CommandLine -and $_.CommandLine -match 'server\.mjs' -and $_.Name -in @('node.exe','cmd.exe') });" ^
  "if($strays.Count -gt 0){" ^
  "  Write-Host '';" ^
  "  Write-Host ('  ' + $strays.Count + ' other overlay server process(es) are still running:');" ^
  "  foreach($p in $strays){ Write-Host ('    PID ' + $p.ProcessId + '  ' + $p.CommandLine) };" ^
  "  Write-Host '';" ^
  "  $answer = Read-Host '  Stop those too? (Y/N)';" ^
  "  if($answer -match '^[Yy]'){ foreach($p in $strays){ Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }; Start-Sleep -Milliseconds 600; Write-Host '  Stopped.' }" ^
  "};" ^
  "Start-Sleep -Milliseconds 400;" ^
  "try { [IO.File]::Open((Join-Path (Get-Location).Path 'server.log'),'Open','Read','None').Close() }" ^
  "catch [IO.FileNotFoundException] { }" ^
  "catch { Write-Host ''; Write-Host '  NOTE: server.log is still open, so this folder cannot be deleted yet.'; Write-Host '  Something is still running from it - run this again, or check Task Manager.' }"

echo.
pause
