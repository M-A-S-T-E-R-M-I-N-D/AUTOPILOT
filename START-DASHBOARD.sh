#!/usr/bin/env bash
# (c) 2026 1337 REL AZEUS MASTERMIND -- Apache-2.0
# Build (local only) then start the read-only dashboard, detached, on 127.0.0.1,
# and print the URL. Runs in this terminal so you can read the output.
set -u
cd "$(dirname "$0")"

if ! command -v pnpm >/dev/null 2>&1; then
  echo
  echo "  pnpm was not found on PATH. Run ./SETUP.sh once -- it installs pnpm without admin rights."
  echo
  exit 1
fi

echo "Building AUTOPILOT (first run can take a moment)..."
pnpm run build
if [ $? -ne 0 ]; then
  echo
  echo "  BUILD FAILED -- see the errors above. The dashboard was not started."
  echo
  exit 1
fi

echo
node apps/dashboard/dist/control/cli.js start
echo
