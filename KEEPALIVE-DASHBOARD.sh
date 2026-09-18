#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
# SPDX-License-Identifier: Apache-2.0
# Keep the dashboard alive and NOTHING else: every 15s, start the server if it
# is not running. No build, no flights, no landings -- safe to run unattended
# from a login item or a user service. Output goes to .autopilot/keepalive.log.
set -u
cd "$(dirname "$0")"

if [ ! -f "apps/dashboard/dist/control/cli.js" ]; then
  echo "  Not built yet -- run ./START-DASHBOARD.sh first."
  exit 0
fi
mkdir -p .autopilot
node apps/dashboard/dist/control/cli.js keepalive >> .autopilot/keepalive.log 2>&1
