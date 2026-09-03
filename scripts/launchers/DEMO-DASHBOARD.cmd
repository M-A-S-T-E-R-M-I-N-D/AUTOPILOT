@echo off
REM (c) 2026 1337 REL AZEUS MASTERMIND -- Apache-2.0
REM Seed the dashboard with real sample projects (onboarded locally), so the
REM Fleet view has something to show. Idempotent; artifacts live under .autopilot/.
setlocal
cd /d "%~dp0..\.."

where pnpm >nul 2>nul
if errorlevel 1 (
  echo   pnpm was not found on PATH. Enable it once with:  corepack enable pnpm
  pause
  exit /b 1
)

echo Building AUTOPILOT...
call pnpm run build
if errorlevel 1 (
  echo.
  echo   BUILD FAILED -- see the errors above.
  pause
  exit /b 1
)

echo.
node apps\dashboard\dist\demo.js
echo.
echo Now run START-DASHBOARD.cmd (or refresh the page) to see the fleet.
echo.
pause
