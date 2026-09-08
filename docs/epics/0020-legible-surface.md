<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Epic 0020 — The legible surface

**Operator directive, 2026-09-09:** *"למה אם אנחנו מביאים מידע מהGITHUB
למה אנחנו לא יכולים לקשר באופן ישיר בקלות להודעות... לתת יותר ביטוי
לטסטים שמתרחשים, השלבים... כמו שהם עושים... כי הUX/I נראה ממש חלש אצלנו
וחייב להיות ברמת SOTA... כל הUXI חייב להיארז בצורה הרבה יותר נכונה."*

## The diagnosis, stated plainly

The dashboard is not short of DATA. It is short of the last inch that
turns data into something a person can act on. Three failures, all the
same failure:

1. **Facts fetched and discarded at the client boundary.** `gh pr list`
   returns every check's name, state, timing and log URL; the panel
   rendered one word. The rollup was fetched on every 30s poll and
   thrown away. Fixed in slice 1 — but it was fetched-and-discarded for
   months, and nothing structural stops the next one.
2. **Dead ends where a link belongs.** Everything the fleet says about
   GitHub — a PR number, an issue number, a run id, a commit SHA, a
   contributor's handle — was plain text. The reader's next move is
   always "open that on GitHub", and every single time they had to go
   find it themselves.
3. **No sense of motion.** A ritual that takes four minutes and a ritual
   that has stalled render identically. GitHub solves this with staged
   loaders and per-step timing; we render a static word.

## Principles

- **If we fetched it, we can show it.** A field that reaches the server
  and dies at the client boundary is a bug, not a scope decision.
- **Every GitHub noun is a link.** PR, issue, run, check, commit,
  handle. Synthesized URLs are forbidden — link only what the API
  actually reported, or render plain text.
- **State must be visibly different from stall.** Anything that can take
  more than a couple of seconds shows what step it is on and how long it
  has been there.
- **Disabled-with-reason everywhere.** A control that cannot act says
  why and what would re-enable it (rows 21 of FAILURE-DOCTRINE).
- **No motion without a reason, none at all under reduced-motion.** The
  sheet's global kill switch is the single lever.

## Slices

| # | Slice | State |
| - | ----- | ----- |
| 1 | PR cards: deep links + per-check pipeline strip (glyph, duration, log link, pulsing run) | **shipped** — `pr-review-panel.ts`, `pr-check-strip.test.ts` |
| 2 | The maintainer's merge button on queue-for-human cards, disabled-with-reason until green | **shipped** — `flight/human-merge.ts` |
| 3 | Same treatment for the KEEPER issue-triage panel: issue numbers link out, labels render as real chips, decisions link to the comment they will post | queued |
| 4 | Flight console: per-step progress with elapsed time — which gate step is running, how long it has been there — instead of a static status word | queued |
| 5 | Link census: a test that fails when a rendered GitHub noun (number, SHA, handle) has no link and the API reported a URL for it — the structural stop for failure #2 | queued |
| 6 | Payload census: a test that fails when a field fetched by a flight module never reaches any client renderer — the structural stop for failure #1 | queued |
| 7 | Typography and rhythm pass across panels: one scale, deliberate spacing, hierarchy by size not by weight-everywhere | queued |

Slices 5 and 6 are the ones that matter most for "never again": 1–4 fix
today's surfaces, 5–6 make the next one fail a test instead of waiting
for the operator to notice.

## Non-goals

- A component framework. The bundle budget (184KB core) is a feature;
  the vanilla + `.toString()` splice architecture stays.
- Dark-mode-by-default or any theme change. Both skins already exist and
  both are deliberate.
