<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Roadmap — where the maestro is flying

The honest, load-bearing answer to "what direction is AUTOPILOT going, and how can I help?"
Updated by the maintainer when direction actually changes — not a wish list, a flight plan.
Live granular truth: [`CHANGELOG.md`](../CHANGELOG.md) (what landed) and the
[issues labeled `help wanted`](https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)
(what's open for you, right now).

## Now flying (the current focus)

1. **Full dashboard i18n** — community-reported
   ([#16](https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT/issues/16)): every user-facing
   string through the locale table; Hebrew first-class, native-quality by doctrine
   (`docs/TRANSLATION-DOCTRINE.md`). The fleet works this continuously; the structural
   unblocked-core-budget fix (deferring the locale table) is invited work.
2. **GitHub Steward** ([epic 0019](epics/0019-github-steward.md)) — the pilot manages the
   page: taxonomy labels/milestones on every accepted issue (live since 0.30.0),
   issues⇄board mirroring, role-honest verbs (maintainer vs guest, disabled-with-reason),
   and the in-app contributor journey from visitor to Active partner.
3. **Attribution everywhere** (`docs/ATTRIBUTION.md`) — commit trailers, PR spread-lines,
   conversation signatures; the human always signs as themself (DCO), the tool takes
   credit only in the trailer.
4. **The cockpit at SOTA** — the next four epics, each written with research citations
   before a line of code: a first-class Markdown reader and editor (0023), the pipeline
   view rethought as a readable plan with outcomes (0024), a vendored icon set in place
   of emoji (0025), and the tasks screen rebuilt from the best list and board patterns
   (0026) — animations, every state, strict accessibility, fast.

Shipped since the last update (0.30.0 → 0.42.0): the **app shell**
([epic 0021](epics/0021-app-shell.md)) — subjects with a bottom bar on phones and a rail
from tablets, a context rail at desktop, the **Keeper queue** (everything waiting on a
human, one list), the **flight plan editor** with undo/redo, the **board as columns**,
⌘K, focus mode, an RTL and density audit in Hebrew, and a two-column desktop Overview;
the **lucky roll says what to fly** (a fit shortlist under the Fly bar, #44); **lane
freshness** (every lane launches on the tip, no more stale bases); the **claim contract**
and the KEEPER issue-protocol gate; terminal-theme baselines and a translated theme menu;
and contributor-reported fixes (#43, #45, #48) landing within a day of their report.
Before that (0.29.0 → 0.30.0): the LLM issue composer end-to-end, the post-push verdict
ritual, the PARITY landing gate, the mirror-pass reconcile API, multi-lane self-healing
worktrees, the Foundation surface, and the collaboration protocol's first Active partner.

## Next up (M4 → M5 arc)

- **Live flight control from the dashboard** finishing M4: pause/steer/approve mid-flight.
- **Approvals queue maturity (M5)**: every human-only call (deps, publicity, spend) in one
  place, with the KEEPER ritual's reasoning attached.
- **Update channel polish**: the over-the-air banner grew in 0.23.0; next is release-notes
  surfacing in-app and a smoother stash-and-update flow.

## Horizon (M6 → M9, unchanged intent)

Efficiency levers (cost per shipped firing), multi-project fleets as a first-class surface,
harness hardening, and the **1.0.0 public-launch milestone (M9)** — 1.0 ships on maturity,
not arithmetic ([`docs/RELEASING.md`](RELEASING.md)).

## How work gets shared

| You want to… | Do this |
|---|---|
| See what needs doing | Issues labeled **`help wanted`** — each carries scope, isolation notes, and a DoD |
| Take one | Comment **`/claim`** — the bot assigns YOU, labels it `claimed`; one assignee, ever, so nobody double-picks |
| Hand it back | Comment `/unclaim` (or 14 quiet days auto-release it) |
| Know who's on what | The issue's assignee IS the claim — visible to everyone, including the fleet |
| Ship it safely | Fork-first, touch only the scoped paths, `pnpm run verify` green, squash-PR referencing the issue — the KEEPER review ritual does the rest ([`CONTRIBUTING.md`](../.github/CONTRIBUTING.md)) |
| See what was declined and why | Label **`declined`** always carries a reasoned comment — disagreement is documented, never silent |

The autonomous fleet respects the same rules in reverse: an issue assigned to a human is
OFF the fleet's menu (that's the point of the `good first issue` reserve too — the fleet
leaves the welcome mat alone).
