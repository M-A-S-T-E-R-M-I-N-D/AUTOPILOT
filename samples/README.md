# SAMPLES

Tiny target repos AUTOPILOT can be pointed at (`folder` argument — see
`docs/RUNBOOK.md`) to demonstrate its onboarding and flight capabilities end
to end, without needing a real production codebase on hand. Each sample is
small enough to read in full and, per its own row below, flyable in 1-2
firings once picked up.

Each sample is self-contained: its own `package.json`/manifest, its own gate,
its own README. None of them are part of the root pnpm workspace
(`pnpm-workspace.yaml` only globs `packages/*` and `apps/*`) and the root
lint/format scripts ignore this directory — a sample's tooling is its own,
not this monorepo's.

## Capability matrix

| Sample | Stack | Onboarding detector | Gate | Status |
| --- | --- | --- | --- | --- |
| [`node-cli/`](node-cli/) | Node.js + TypeScript CLI | `js` (`packages/onboarding/src/gate/detectors/js.ts`) — full match via `package.json` `scripts.*` | typecheck + test + build + lint, all real | **Verified** — `npm install && npm run typecheck && npm test && npm run build && npm run lint` all pass standalone |
| [`python-lib/`](python-lib/) | Python library | `python` (`.../detectors/python.ts`) — manifest + `pytest`/`mypy`/`ruff` markers | typecheck + test + lint (detector emits no `build` key for Python) | **Verified** — `python -m venv .venv && pip install -e ".[dev]" && mypy . && pytest && ruff check .` all pass standalone |
| [`calculator/`](calculator/) | Static HTML + vanilla JS, npm-tested | `js` — `package.json` `scripts.test` | `node --test` acceptance suite | **Flown to 12/12 green** — implemented autonomously by an AUTOPILOT flight (commit 09d13e5d); see [`docs/CASE-STUDIES/calculator.md`](../docs/CASE-STUDIES/calculator.md) for the full honest arc |
| `static-site/` | Static HTML/CSS/JS, no build tooling | `static-site` (`.../detectors/static-site.ts`) — `.html`/`.htm` present, no other ecosystem's manifest | `lint` via `npx html-validate .`, `test` via `npx linkinator . --recurse` (no `build` — a static site has nothing to compile) | Detector **built and unit-tested**; the `static-site/` fixture itself is not created yet (see below) |

## Known gap: static-site has no fixture yet

`node-cli`, `python-lib`, and `calculator` each have a real fixture repo
under `samples/` exercising a detector that already existed. `static-site`
did not even have a detector: there was no `EcosystemDetector` for a plain
HTML/CSS/JS repo with no package manager, so AUTOPILOT would have onboarded
one with an empty gate (`ecosystem: 'unknown'`, every gate line `—`).

That detector now exists
(`packages/onboarding/src/gate/detectors/static-site.ts`,
covered by `packages/onboarding/test/gate/detectors/static-site.test.ts`
and the `detectGate — static-site` block in `detect.test.ts`): it proposes
`html-validate` for `lint` and `linkinator --recurse` for `test`, both run
via `npx` since a bare static site has no `package.json` to hang a
`scripts.*` entry off. Both commands were hand-verified against
`samples/calculator/` during development (`npx --yes html-validate .` and
`npx --yes linkinator . --recurse` both ran to completion there).

What is still missing is the `samples/static-site/` fixture itself — a
small HTML/CSS/JS site, written clean enough to pass `html-validate`'s
`recommended` preset (e.g. uppercase `DOCTYPE`, non-self-closing void
elements, explicit `<button type>`) and with no broken links for
`linkinator` to catch. That is fixture-authoring work distinct from the
detector, tracked as follow-up rather than folded into this firing.

## Adding a sample

1. Create `samples/<name>/` with a real, minimal, working manifest for its
   ecosystem — the detector must recognize it via the markers in
   `packages/onboarding/src/gate/detectors/`.
2. Give it a real gate: every script named in the capability matrix above
   must actually run and pass standalone (`cd samples/<name> && <install> &&
   <gate scripts>`), independent of the root repo's toolchain.
3. Add a `README.md` inside the sample explaining what it demonstrates.
4. Update the capability matrix and status above.
