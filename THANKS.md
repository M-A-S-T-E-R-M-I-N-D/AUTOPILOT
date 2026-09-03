<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Thanks

AUTOPILOT flies on the work of people who never heard of it. Every dependency
below is someone's nights and weekends, someone's decade of maintenance,
someone's patient issue triage for strangers. This file is the project's
standing gratitude — and its promise to consume that work fairly: licenses
honored, nothing vendored or stripped, the full inventory kept public and
regenerated in [`docs/THIRD-PARTY-LICENSES.md`](docs/THIRD-PARTY-LICENSES.md)
(487 packages at last count; zero copyleft-strong, zero unknown — audited).

## The pillars

- **[Claude & Claude Code](https://www.anthropic.com/claude-code)** (Anthropic) — the mind in the cockpit. AUTOPILOT
  drives the local Claude Code CLI; without it there is no flight.
- **[Node.js](https://nodejs.org/)** and **[TypeScript](https://www.typescriptlang.org/)** — the airframe and the
  flight instruments. Strict mode everywhere.
- **[pnpm](https://pnpm.io/)** — the hangar: fast, disciplined, content-addressed.
- **[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)** — the flight recorder. Every firing, verdict, and
  dollar lands in SQLite through it.
- **[Vitest](https://vitest.dev/)** — 8,500+ tests run through it, thousands of times a day here.
- **[Playwright](https://playwright.dev/)** (Microsoft) — the real-browser eyes: e2e suites, visual baselines, and
  every screenshot in the README.
- **[esbuild](https://esbuild.github.io/)** — the speed under Vitest's wings.

## The instruments

- **[ESLint](https://eslint.org/)** + **[typescript-eslint](https://typescript-eslint.io/)** and
  **[Prettier](https://prettier.io/)** — the pre-flight checklist.
- **[Stryker](https://stryker-mutator.io/)** — 100+ mutation-testing configs that keep the tests honest about
  themselves.
- **[axe-core](https://github.com/dequelabs/axe-core)** (Deque, **MPL-2.0**) — every surface here ships axe-clean
  because their accessibility engine made it checkable.
- **[commitlint](https://commitlint.js.org/)** + **[husky](https://typicode.github.io/husky/)** — the discipline at
  the commit line.
- **[jsdom](https://github.com/jsdom/jsdom)** — the wind tunnel: a DOM fast enough to test a whole dashboard in
  milliseconds.
- **[knip](https://knip.dev/)** — the dead-weight detector.
- **[Lightning CSS](https://lightningcss.dev/)** (**MPL-2.0**) and **[caniuse-lite](https://github.com/browserslist/caniuse-lite)**
  (**CC-BY-4.0**, data by the [caniuse](https://caniuse.com/) project) — attribution gladly given.
- **[lru-cache](https://github.com/isaacs/node-lru-cache)** and **[minimatch](https://github.com/isaacs/minimatch)**
  (**BlueOak-1.0.0**) — Isaac's small perfect tools, everywhere as always.
- **[argparse](https://github.com/nodeca/argparse)** (**Python-2.0** heritage) — a port carrying Python's design
  taste into Node.

## The letters themselves

- **[Inter](https://rsms.me/inter/)** by **Rasmus Andersson** (SIL OFL-1.1 — license included at
  [`LICENSES/OFL-1.1.txt`](LICENSES/OFL-1.1.txt)) and **[Roboto](https://fonts.google.com/specimen/Roboto)** by
  **Christian Robertson** (Apache-2.0) — the only two typefaces the dashboard ships, self-hosted as woff2 so no
  visitor is ever tracked by a font CDN. Every word you read in AUTOPILOT is their craft.

## And beyond the `node_modules`

- **[Git](https://git-scm.com/)** — the ground truth this whole system trusts with its work.
- **[GitHub](https://github.com)** — the runway: Actions, Discussions, the review rituals.
- **[Shields.io](https://shields.io/)** — the badges at the top of the README.
- **[Keep a Changelog](https://keepachangelog.com/)**, **[SemVer](https://semver.org/)**,
  **[REUSE](https://reuse.software/)**, and the **[DCO](https://developercertificate.org/)** — the conventions this
  repo leans on instead of inventing worse ones.
- Everyone in [`docs/THIRD-PARTY-LICENSES.md`](docs/THIRD-PARTY-LICENSES.md) not named above — 487 packages deep,
  every one of them somebody's care.

- **[actions/checkout](https://github.com/actions/checkout)**, **[actions/setup-node](https://github.com/actions/setup-node)**,
  **[pnpm/action-setup](https://github.com/pnpm/action-setup)** — the CI hands, SHA-pinned with respect.
- The **researchers** whose published work grounds this project's own decisions — every paper cited in
  [`docs/RESEARCH-LIBRARY.md`](docs/RESEARCH-LIBRARY.md) and the evaluations: thank you for writing it down.

## And everyone we missed

Dependency trees have leaves we cannot see: transitive maintainers, spec authors, docs writers, the person who
answered the Stack Overflow question in 2014, the standards bodies, the translators. If any line of your work made
it into any line of ours — **thank you**. This section exists so the gratitude never has a missing-entry bug.

If your work is here and you'd like it credited differently — or you spot a license concern of any kind — please
open an issue; honoring your terms matters more to us than our convenience.
