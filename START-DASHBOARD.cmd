@echo off
REM (c) 2026 1337 REL AZEUS MASTERMIND -- Apache-2.0
REM Build (local only) then start the read-only dashboard, detached, on 127.0.0.1,
REM and open it in your browser. The window stays open so you can read the URL.
setlocal
cd /d "%~dp0"

where pnpm >nul 2>nul
if errorlevel 1 (
  echo.
  echo   pnpm was not found on PATH. Run SETUP.cmd once -- it installs pnpm without admin rights.
  echo.
  pause
  exit /b 1
)

echo Building AUTOPILOT ^(first run can take a moment^)...
call pnpm run build
if errorlevel 1 (
  echo.
  echo   BUILD FAILED -- see the errors above. The dashboard was not started.
  echo.
  pause
  exit /b 1
)

echo.
node apps\dashboard\dist\control\cli.js start
echo.
pause
