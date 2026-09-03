#!/usr/bin/env bash
# (c) 2026 1337 REL AZEUS MASTERMIND -- Apache-2.0
# Stop the running dashboard (signals only the recorded pid).
set -u
cd "$(dirname "$0")"

if [ ! -f "apps/dashboard/dist/control/cli.js" ]; then
  echo "  Nothing to stop -- the dashboard was never built/started."
  exit 0
fi
node apps/dashboard/dist/control/cli.js stop
echo
