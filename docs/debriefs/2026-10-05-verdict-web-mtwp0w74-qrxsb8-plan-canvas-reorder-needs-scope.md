<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# VERDICT split `web-mtwp0w74-qrxsb8`: the remaining Plan canvas work is two separable things, one gated on an operator decision

Board: "EPIC 0021 slice 3 — Plan canvas: the gate pipeline / flight plan as an
editable node graph (palette · canvas · properties; pan/zoom, drag, tap-tap
connect on touch, auto-layout, undo/redo, autosave, r…" (truncated on the
board; the full text lives in `docs/epics/0021-app-shell.md` row 3).

## What is actually left

`docs/epics/0021-app-shell.md` row 3 already marks this slice **second cut
shipped** (`e72093c6`, camera first cut `b634e421`, undo/redo shipped after).
Its own "Remaining" clause names exactly two items:

> drag-to-reorder once the engine honours an order, tap-tap connect

Both are unbuilt — confirmed by grep: no `drag`/`reorder`/`tap-tap` wiring
exists in `apps/dashboard/src/web/plan-editor.ts` or `pipeline-panel.ts`
today, only pan/zoom/select plumbing.

## Why neither is a safe one-firing unit as written

**Drag-to-reorder** is explicitly gated behind an engine capability that does
not exist yet. `apps/dashboard/src/gate-commands.ts:52` hardcodes the gate's
execution order:

```
const kinds: (keyof GateSpec)[] = ['install', 'typecheck', 'lint', 'format', 'test', 'build'];
```

with a real reason, not an arbitrary one — `install` must run first (every
other leg judges the tree against its `node_modules`), and `test`/`build`
stay sequential and ordered because build wants a green typecheck. Only
`typecheck`/`lint`/`format` are mutually independent (`PARALLEL_GATE_KINDS`,
same file) and already run concurrently, so reordering *those three*
relative to each other would be safe but also **invisible** — a UI control
that lets an operator "reorder" steps whose relative order has zero
execution effect is the kind of facade the UX-EXPRESSION doctrine rules out,
not a real capability. A reorder control with teeth means deciding which
subset of the five kinds may actually move, and that is a scope call this
engine's gate semantics have not made — it directly risks every firing's and
every landing's gate if gotten wrong, which is why it reads as "once the
engine honours an order" rather than as a shipped TODO.

**Tap-tap connect** is 0024's node-graph vocabulary (arbitrary nodes joined
by typed links) carried into 0021's row verbatim. The Plan canvas today is a
fixed five-step *chain* with no branches and no links to create — there is
nothing to connect yet. Building tap-tap-connect gestures ahead of any
actual graph topology (0024 slices 4-5: subgraphs, custom nodes) would be
speculative UI for a capability that doesn't exist, which the project's own
anti-overbuilding stance rules out.

## Recommended split

1. **🟣 Operator scope decision** (new, same shape as `ap-mtzrb9gy-3`
   elsewhere on this board): which steps may an operator actually reorder —
   just the parallel three (cosmetic/reporting order only), or does the gate
   engine gain a real configurable order with new safety invariants? This
   has to be answered before any code, the same way `ap-mtzrb9gy-3` already
   waits on a decision for fix-commit generation.
2. **Tap-tap connect**: re-file against 0024 (the node-graph epic) once a
   slice there actually introduces multiple paths/links to connect; it does
   not belong to 0021 slice 3's fixed-chain scope.

## Verification note for this firing's own METRICS

Docs-only unit: this debrief plus the regenerated `docs/debriefs/README.md`
index (`node scripts/docs/generate-debriefs-index.mjs` — ran clean, 82
entries already current, no diff). `pnpm run ci:doc-links` and
`pnpm run ci:doc-commit-refs` both pass against the new file. Also ran
`typecheck`, `lint`, and every cheap `ci:*` script (`architecture`,
`bundle-size`, `conflict-markers`, `contrast-matrix`, `data-model`,
`dependency-audit`, `donate`, `license-check`, `merge-integrity`,
`no-personal-paths`, `model-freshness`, `quarantine-report`, `secret-scan`,
`spdx`, `threat-model`, `validate-configs`) looking for a safe, concrete
self-initiated fix before writing this verdict — every one is green, so
there was no organic defect to fix instead. No claimed or unlanded sibling
file was touched (`docs/MODEL-CARD.md` stayed untouched per fleet-2's live
intent and fleet-7's unlanded checkpoint, already covered by today's
`2026-10-05-verdict-ap-muv2rhjx-0-model-card-v18-blocked-by-fleet7.md`).
