<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# @autopilot/dashboard

The localhost web control panel and the flight runner: watch the fleet fly, steer it, land it,
release it — from one page, on a phone or a desktop, in English or Hebrew, in three themes.

Part of the [AUTOPILOT](../../README.md) monorepo; not published on its own (`private`). Binary:
`autopilot-dashboard` (`dist/control/cli.js`).

## Run it

```
pnpm dashboard:start        # serve on http://127.0.0.1:4317 (loopback only, CSP self-only)
pnpm dashboard:watch        # the ring-0 watchdog: revives, replaces, lands hands-free
pnpm dashboard:fly <folder> <firings> <budget>   # one flight, one lane
pnpm dashboard:fleet        # a hub-aware partitioned round across worktree lanes
```

## What lives here

- `src/server/` — the HTTP server: `/api/state` and the SSE stream every 1.5 s, the CSRF-guarded
  write routes (tasks, plan, landing, release, fleet), the security headers. No framework.
- `src/web/` — the hand-authored client: `shell.ts` assembles `/app.js`, `/project.js` and
  `/panels.js` from `features/*.ts` (each a self-initialising panel) and `layout-css.ts` (mobile-first,
  logical properties only, tokens only). Chunk membership lives in `chunks.ts`; bundle budgets in
  `scripts/ci/check-bundle-size.mjs`.
- `src/flight/` — the rituals a flight or the Keeper runs: issue triage and the claim contract, the
  mirror pass, PR review, the pool client, the lucky plan and fit, lane freshness, update checks.
- `src/landing/`, `src/release/` — the landing ritual (gate → merge → push → self-restart) and the
  release ritual (bump → tag → GitHub pre-release).
- `src/read/` — the read model composed from `@autopilot/store` for every page.
- `src/control/` — the CLI, the watchdog, CI status.
- `e2e/` — Playwright: desktop, phone and tablet projects, CI-canonical visual baselines per theme.

## Laws worth knowing

- **The dashboard never launches a flight on its own.** Plans fill the Fly bar; the click is the
  operator's.
- **One instance paints one page.** Live sections patch in place; client-built panels are cached per
  data key; a hidden tab neither ticks nor paints.
- **Every string is in `@autopilot/tokens`' table**, in both locales, and rides the DOM sweep.

Tests: `pnpm exec vitest run apps/dashboard` (≈700 files). E2E: `pnpm -C apps/dashboard exec playwright
test -c e2e/playwright.config.ts`.
