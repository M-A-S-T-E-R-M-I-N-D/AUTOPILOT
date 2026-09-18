@echo off
REM (c) 2026 1337 REL AZEUS MASTERMIND -- Apache-2.0
REM Keep the dashboard alive and NOTHING else: every 15s, start the server if
REM it is not running. No build, no flights, no landings -- safe to run
REM unattended at logon (pnpm dashboard:autostart registers exactly this).
REM Output goes to .autopilot\keepalive.log so a hidden window loses nothing.
setlocal
cd /d "%~dp0"
if not exist "apps\dashboard\dist\control\cli.js" (
  echo   Not built yet -- run START-DASHBOARD.cmd first.
  exit /b 0
)
if not exist ".autopilot" mkdir ".autopilot"
node apps\dashboard\dist\control\cli.js keepalive >> ".autopilot\keepalive.log" 2>&1
