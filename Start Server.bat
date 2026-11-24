@echo off
setlocal
cd /d "%~dp0"

set "NODE_EXE="
where node >nul 2>nul
if not errorlevel 1 set "NODE_EXE=node"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\nodejs\node.exe"

if not defined NODE_EXE (
  echo Node.js was not found.
  echo Install Node.js LTS or place node.exe at "%LOCALAPPDATA%\nodejs\node.exe".
  pause
  exit /b 1
)

if not exist "node_modules\express" (
  echo Project dependencies are missing.
  echo Run npm install in this folder first.
  pause
  exit /b 1
)
if not exist "node_modules\multer" (
  echo Project dependencies are missing.
  echo Run npm install in this folder first.
  pause
  exit /b 1
)

echo Starting Awana Clubs Ghana at http://localhost:3000
"%NODE_EXE%" server.js
if errorlevel 1 (
  echo.
  echo The website server stopped with an error.
  pause
)
