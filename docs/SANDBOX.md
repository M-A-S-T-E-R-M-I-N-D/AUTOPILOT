<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# The sandbox — two minutes, $0

The fastest way to see AUTOPILOT actually work, with no Claude account, no API key, and no tokens spent. Two
scripts populate a real dashboard with a real fleet and a real flight, end to end, from a fresh clone.

## What you get

1. **A populated Fleet view** — three genuine sample repos (TypeScript, Python, Go) put through the real
   onboarding pipeline: backup ritual → gate detection → content-hash index. Nothing here is fabricated data;
   it's the same code path a real project goes through.
2. **A live flight** — a fourth sample project actually flown by the real M1 engine loop: real git commits, a
   real gate (`node --check`) verifying each one, real ship/revert logic, real telemetry written to the store.
   The only simulated part is the "thinking" — a scripted agent stands in for the live `claude` CLI, so **no
   model runs and cost is honestly $0**.

Both scripts are idempotent (safe to re-run) and write only under the git-ignored `.autopilot/` workspace —
nothing touches the repo you're demoing AUTOPILOT on.

## Run it

**1. Setup**, if you haven't already (installs Node/pnpm/deps, no admin rights needed):

```bash
./SETUP.sh          # macOS / Linux
```

or double-click `SETUP.cmd` on Windows.

**2. Seed the Fleet view:**

```bash
pnpm dashboard:demo
```

or double-click `scripts/launchers/DEMO-DASHBOARD.cmd` on Windows.

**3. Fly a demo project** (five real, gate-verified firings against a sample repo):

```bash
pnpm dashboard:flight
```

or double-click `scripts/launchers/FLY-DASHBOARD.cmd` on Windows.

**4. Start the dashboard and watch it:**

```bash
pnpm dashboard:start
```

or double-click `START-DASHBOARD.cmd` on Windows. Open **http://127.0.0.1:4317** — the Fleet view now shows
four projects, one of them (`flight-demo`) with real firings, a ship rate, and a flight log you can open.

The `.cmd` launchers in `scripts/launchers/` are Windows double-click conveniences over the same `pnpm` scripts
above — every step here works identically on macOS, Linux, and Windows from a terminal.

## Why trust the numbers

Every step the scripts take is real, not mocked, so what you see in the dashboard is exactly what a real flight
produces:

- **Onboarding** (`pnpm dashboard:demo`) runs the actual `onboard()` pipeline from `@autopilot/onboarding` against
  real git repositories it creates under `.autopilot/demo/` — the same backup, gate-detection, and indexing code a
  real project goes through.
- **The flight** (`pnpm dashboard:flight`) runs the actual `runLoop()` engine from `@autopilot/engine` — real
  `GitVcs` commits, a real `GateRunner` (`node --check`), real `SqliteFiringStore` telemetry. Only `ModelPort` is
  swapped for a scripted stand-in that makes a trivial, always-valid file change each firing — everything
  downstream of "the model responded" is the genuine machinery.

Source: [`apps/dashboard/src/demo.ts`](../apps/dashboard/src/demo.ts) and
[`apps/dashboard/src/flight.ts`](../apps/dashboard/src/flight.ts).

## Cleaning up

Delete `.autopilot/` (git-ignored) to reset the sandbox entirely, or run `pnpm dashboard:reset` for a guided
reset. Neither touches anything outside that workspace.

## Next steps

- Point AUTOPILOT at a real project: see [`README.md`](../README.md#start-here-30-seconds).
- Read how the engine loop actually works: [`ENGINE-RESEARCH.md`](ENGINE-RESEARCH.md).
- See AUTOPILOT's own flight data, gate-verified: [`SELF-STUDY/PAPER.md`](SELF-STUDY/PAPER.md).
