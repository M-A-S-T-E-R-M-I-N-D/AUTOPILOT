#!/usr/bin/env bash
# (c) 2026 1337 REL AZEUS MASTERMIND -- Apache-2.0
# Rebuild (local only) and restart the dashboard, then reopen it in the browser.
set -u
cd "$(dirname "$0")"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "  pnpm was not found on PATH. Run ./SETUP.sh once -- it installs pnpm without admin rights."
  exit 1
fi

echo "Rebuilding AUTOPILOT..."
pnpm run build
if [ $? -ne 0 ]; then
  echo
  echo "  BUILD FAILED -- see the errors above. The dashboard was not restarted."
  exit 1
fi

echo
node apps/dashboard/dist/control/cli.js restart
echo
