<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# M3 — Read-only dashboard plan ("watch it fly")

> ACTION-PLAN M3 DoD: on a clean machine, one command installs; add a real repo; it backs up, orients, ships ≥1 gated
> commit; the dashboard shows it **live** (graphs, flight log, activity map, gauge). axe-core clean. Depends on M1, M2.

## Verification boundary (§17)

- **🟢 Machine-verifiable (built + gated autonomously):** the design-token system + themes (WCAG-checked), the store
  **read-model** (aggregation queries → view models), the hardened **Supervisor API** (REST+WS, CSP/DNS-rebind/rate-limit,
  localhost-bound), the Vite/test tooling, and the accessible UI structure (semantic HTML, keyboard, axe-clean).
- **🟣 Human-required (founder's eyes):** the visual *feel*. **DECIDED (2026-07-08):** ship **all three** looks — **dark
  (mission-control) · light (editorial) · terminal** — as switchable **themes** driven by a proper **design-token system**
  (conventional, accessible, dynamic). The exact palettes are an intentional first pass, presented for the founder's verdict.

## Visual architecture — design tokens (the decided direction)

A single source of truth for every design decision (web coding-style rule: never hardcode palette/type/space).
- **Theme-invariant primitives:** space, radius, type scale, font families, motion.
- **Semantic color tokens** (surface/text/border/accent/success/warning/danger/info + severity critical/high/medium/low),
  in **OKLCH** (perceptually uniform, WCAG-friendly).
- **Three themes** map the semantic tokens to intentional values; a `data-theme` attribute swaps them live (dynamic).
- **Accessibility is enforced by test:** a pure OKLCH→relative-luminance contrast check asserts each theme's
  text/muted/accent pairs meet WCAG AA — the theme cannot ship inaccessible.
- Emitted as CSS custom properties (`--color-*`, `--space-*`, …); consumed by the React UI and any future web surface.

## Slice order (each gated + committed)

1. **`@autopilot/tokens`** — primitives + 3 themes (dark/light/terminal) + OKLCH contrast core + CSS generation. **← this slice.**
2. **Read-model** (`apps/dashboard`) — store aggregation → Fleet / Project-detail / graph-series / gauge / flight-log /
   activity-map view models. Pure over the store, fully tested.
3. **Supervisor API** — hardened localhost REST + WS server over the read-model.
4. **Dashboard UI** (React + Vite) — Fleet + Project detail + gauge + activity map; token-themed, keyboard + axe-clean.
5. **e2e DoD** — a flying sandbox project rendered live (graphs + flight log + activity map).
