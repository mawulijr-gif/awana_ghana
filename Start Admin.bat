@echo off
setlocal
cd /d "%~dp0"

curl.exe --silent --fail http://127.0.0.1:3000/api/session >nul 2>nul
if errorlevel 1 (
  echo Starting the website server...
  start "Awana Clubs Ghana Server" "%ComSpec%" /k ""%~dp0Start Server.bat""
  set "SERVER_READY="
  for /L %%i in (1,1,20) do (
    timeout /t 1 /nobreak >nul
    curl.exe --silent --fail http://127.0.0.1:3000/api/session >nul 2>nul
    if not errorlevel 1 set "SERVER_READY=1"
    if defined SERVER_READY goto server_ready
  )
  echo The website did not start. Check the server window for errors.
  pause
  exit /b 1
)

:server_ready
start "" "http://localhost:3000/admin.html"
