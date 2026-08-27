@echo off
REM Stop the overlay server, whether it was started visibly or hidden.
setlocal enabledelayedexpansion
set FOUND=0
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8787" ^| findstr "LISTENING"') do (
  taskkill /F /PID %%p >nul 2>&1
  if not errorlevel 1 (
    echo Stopped the server ^(process %%p^).
    set FOUND=1
  )
)
if "!FOUND!"=="0" echo Nothing was listening on port 8787 - the server was not running.
echo.
pause
