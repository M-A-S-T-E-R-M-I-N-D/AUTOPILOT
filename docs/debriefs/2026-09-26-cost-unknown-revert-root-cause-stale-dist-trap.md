<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Debrief: `489fb8eb` (cost_unknown, board `web-mty1azf9-2we84o`) landed then reverted — root cause, plus a stale-`dist` trap that will bite a careless reland

## What happened

`489fb8eb` (`fix(store): a checkpoint-killed firing no longer records cost
as a fabricated $0`) added `metrics.cost_unknown` (schema migration v23) so
a checkpoint-killed firing's genuinely-unknown cost stops being coerced
into a `cost_usd = 0` row that reads identically to a real $0 firing. It
landed on `main`, then was reverted two commits later by `96a0f69c`
(`Revert "fix(store): a checkpoint-killed firing no longer records cost as
a fabricated $0"`) with no explanatory body.

## Root cause

`489fb8eb`'s diff never touches `docs/DATA-MODEL.md`
(`packages/engine/src/adapters/store.ts`, `packages/store/src/{schema,types}.ts`,
and two test files only). `docs/DATA-MODEL.md` is a generated doc —
`pnpm run ci:data-model` (`node scripts/data-model/generate-doc.mjs
--check`) fails the gate whenever it drifts from `packages/store/src/schema.ts`'s
`MIGRATIONS`. Adding migration v23 without regenerating the doc is exactly
that drift; the reland-blocking gate step is `ci:data-model`, not
`typecheck`/`test`/`build`, all of which stayed green throughout (confirmed
by reproducing the pre-fix tree in this firing: `typecheck`, `lint`,
`format:check`, `build`, targeted `vitest run` on the three touched test
files, `ci:conflict-markers`, and `ci:merge-integrity` all pass against the
cherry-picked fix — only `ci:data-model` was ever going to be red).

## A second, sharper trap for whoever relands this

`scripts/data-model/generate-doc.mjs` imports its schema from
**`packages/store/dist/index.js`** — the built output — not from
`packages/store/src/`:

```js
import { ... MIGRATIONS, migrate, openStore } from '../../packages/store/dist/index.js';
```

Running `pnpm data-model:update` (or `--check`) right after editing
`packages/store/src/schema.ts`, without first rebuilding `packages/store`
(`pnpm --filter @autopilot/store build`, i.e. `tsc -b` in that package),
regenerates the doc from the **stale pre-edit `dist/`** — it writes
successfully, the timestamp line changes, and `--check` will even pass
locally, but the emitted content still doesn't mention the new column or
migration. A rebuild done later (e.g. by the top-level `pnpm run build` in
the full gate) then makes the checked-in doc stale again, and CI fails the
same way `489fb8eb` did — just one step further downstream, and harder to
attribute because the local `--check` looked green. Confirmed by
reproduction in this firing: regenerating immediately after the cherry-pick
(stale `dist/`) produced a 1-line diff (timestamp only, no `cost_unknown`
row); rebuilding `packages/store` first and regenerating again produced the
real diff (`cost_unknown` column row + migration 23 line).

**The correct order for this fix (or any `packages/store/src/schema.ts`
migration) is:** edit schema → `pnpm --filter @autopilot/store build` →
`pnpm data-model:update` → verify the new column/migration actually
appears in `docs/DATA-MODEL.md` (`grep`, don't just trust exit 0) →
`pnpm run ci:data-model` to confirm.

## This firing's attempt and why it didn't land

This firing cherry-picked `489fb8eb` clean (`git cherry-pick -n`), rebuilt
`packages/store`, regenerated `docs/DATA-MODEL.md` correctly (confirmed
`cost_unknown` present, `ci:data-model --check` green), and ran the full
targeted gate above — all green. At commit time the pre-commit sibling scan
blocked it: `packages/store/src/schema.ts` is claimed **right now** by a
live sibling (`autopilot/flight-worktree-fly-autopilot--fleet-6`,
working `web-mtpzqrw8-dsy6a9` slice 1/3, an unrelated `shareable` flag
migration on the same file). Per the fleet containment rule this is a hard
block, not a judgment call, even though the two changes are semantically
disjoint — a same-file collision at commit time is exactly what the guard
exists to catch. This firing discarded its own uncommitted changes
(`git restore --staged --worktree ...`, safe since nothing else was in the
tree) rather than force the commit, and is filing this debrief instead so
the next attempt has both the root cause and the `dist`-staleness trap
already solved.

## VERDICT

**Reland is safe and gate-clean once `packages/store/src/schema.ts` is free
of a live sibling claim.** No code defect in `489fb8eb` itself — only a
missing regenerated doc. Next attempt: reapply the same fix (cherry-pick
`489fb8eb` still applies cleanly against current `main` as of this
debrief), follow the build-before-regenerate order above, and confirm no
`.autopilot-intent`/fleet claim on `packages/store/src/schema.ts` before
committing.
