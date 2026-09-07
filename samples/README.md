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
| `static-site/` | Static HTML/CSS/JS, no build tooling | `static-site` (`packages/onboarding/src/gate/detectors/static-site.ts`) — `.html`/`.htm` files with no `package.json` | lint (`html-validate`) + test (`linkinator`, link-checking), both via `npx --yes`; no build/typecheck (a static site needs neither) | Detector shipped and unit-tested (`packages/onboarding/test/gate/detectors/static-site.test.ts`); the `static-site/` fixture repo itself is not built yet (see below) |

## Known gap: static-site has no fixture repo yet

`python-lib` and `node-cli` exercise detectors that already exist and are
tested (`packages/onboarding/test/gate/detectors/{js,python}.test.ts`); so
does `static-site` now (`.../detectors/static-site.test.ts`). What is still
missing is the fixture itself: a `samples/static-site/` directory with real
HTML/CSS content, plus a flight that proves `html-validate`/`linkinator`
actually run clean (or catch a seeded defect) standalone, the way
`node-cli`/`python-lib` are **Verified** above. Building that fixture is
tracked as its own follow-up — authoring and flying a fixture is a
different unit of work than the detector it depends on.

## Adding a sample

1. Create `samples/<name>/` with a real, minimal, working manifest for its
   ecosystem — the detector must recognize it via the markers in
   `packages/onboarding/src/gate/detectors/`.
2. Give it a real gate: every script named in the capability matrix above
   must actually run and pass standalone (`cd samples/<name> && <install> &&
   <gate scripts>`), independent of the root repo's toolchain.
3. Add a `README.md` inside the sample explaining what it demonstrates.
4. Update the capability matrix and status above.
