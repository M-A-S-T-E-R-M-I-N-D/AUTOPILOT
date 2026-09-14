<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Five firings — from a folder of notes to a working calculator

2026-09-13. The operator's ask: "show a practical example — a folder that
collects materials for a calculator, then one run after another builds it,
with a screenshot after each firing and what happened in each." This is
that run, as it happened, with the costs from the record.

![Five frames: no page yet after firing 1; the calculator showing 9, 20, Error and 25 after firings 2 to 5](../screens/calculator-five-firings.png)

## The seed — materials only

[`samples/calculator-materials/`](../../samples/calculator-materials/): a
`NOTES.md` with what the calculator must do and how it should look, a
`references/keys.md` with the key layout, one line in `INBOX/` ("write the
acceptance tests before the state machine; the display and keys come after
the logic is green"), a `package.json` whose only script is `npm test`, and a
README that says "materials only". No code, no tests, no prompt.

Copied into a fresh git repository, committed as `materials: notes, key
layout, an inbox note — no code yet`, locked on from the dashboard's Fly bar
(the folder typed, $3 per firing), and fired five times — one firing per
press, a frame of `index.html` in a real Chromium after each.

## The five firings

| Fire | Commit                                                  | Cost  | What happened, in the firing's own words                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `test: acceptance tests + pure state machine`           | $0.61 | Followed the inbox note: acceptance tests written first and "confirmed red against a missing calc.js", then the pure, immutable state machine that satisfies them — sequential evaluation, decimals, divide-by-zero to `Error` without ever surfacing `Infinity`, clear, backspace, chained equals. The page was "intentionally deferred — the brief calls for logic-green-first". |
| 2    | `feat: display and keys for the pocket calculator`      | $1.10 | `index.html` and `style.css` from the key layout — dark, high contrast, a four-column grid; mouse and keyboard both drive `press()`; a tiny UMD export so one file serves `node --test` and a `<script>` tag. "Verified with a jsdom harness driving the real index.html … since no browser binary could be downloaded in this sandbox." |
| 3    | `test: cover operator-override and digit-cap edge cases` | $0.58 | The board's inbox task was already done by firings 1 and 2, so the firing said so and made a free pick: two behaviours the logic had but the tests did not cover.                                                                                            |
| 4    | `docs: update README now that the calculator is built`  | $0.52 | The README still said "materials only"; rewritten for the finished product — how to run it, how to test it, 17 of 17 passing.                                                                                                                                 |
| 5    | `chore: add .gitignore for node_modules`                | $0.79 | Housekeeping: the test script implies a node toolchain, so a guard against an accidental `node_modules` commit.                                                                                                                                              |

Totals: **$3.60**, five commits, every gate green, **17 acceptance tests**,
**109 lines** of logic against the notes' ceiling of 150. Frames 2 to 5 are
the page after `7 + 2 =`, `2 + 3 × 4 =` (20 — sequential, as the notes
demanded), `8 ÷ 0 =` (`Error`, and the next key recovers), and `12.5 × 2 =`.

## What it shows

- **No prompt on the first launch.** The folder was the brief; the inbox
  line was optional context, and the first firing took it as the order of
  work.
- **Tests first, then the code.** The doctrine the pilot applies to
  AUTOPILOT itself held on a stranger's folder: the tests were red before
  the state machine existed.
- **One unit per firing, the gate before every commit.** Each firing ended
  with one commit and `npm test` green; the costs above are the record's,
  not an estimate.
- **The mission was met by firing 2.** Firings 3 to 5 were honest additions
  — more tests, a README, a guard — because a fixed count keeps firing. Two
  firings, or the "stop at total" mode, is the operator's call.

## What it also showed

- Frame 1 has no page: the first firing built the logic and the tests and
  said why the page waits. That is the brief's own order, not a gap.
- The flight's sandbox has no browser, so the pilot verified the page under
  jsdom and said so in its commit. The frames here were taken afterwards in
  a real Chromium — the page works by mouse and keyboard as promised.
- **A cross-project leak surfaced — and is closed.** After the first flight the
  calculator's board carried four DOC-FRESHNESS proposals about AUTOPILOT's own
  `docs/epics/`: the post-flight sweep had scanned the dashboard's checkout
  instead of the flight's target. Boarded the same hour, fixed the next day, and
  widened past the one sweep that was reported. The doc-freshness and verify-by
  sweeps now return early unless the flight IS the engine's own checkout; the
  stale-claim sweep carries the same guard, because releasing a claim is a real
  write against this repository's pool and the maintainer is exactly who flies
  other folders; and the Lucky shortlist no longer offers this repository's
  claimable work to a foreign target — it ranked AUTOPILOT's own pool issues on
  every project, and the new "hand to the pilot" verb could have written one
  onto the calculator's board.
  [`cross-project-leak.test.ts`](../../apps/dashboard/test/flight/cross-project-leak.test.ts)
  is the census that keeps it closed: a sweep that reads the engine's own tree
  and forgets the guard fails that file.
- **A second leak the story exposed.** The first firing archived the INBOX note
  inside the operator's own checkout without committing it, so every later
  sync-back refused with "uncommitted changes" and the work stayed in the
  flight's worktree until it was merged by hand. Boarded as high severity; the
  frames above were taken from that worktree.

## Reproduce it

```bash
cp -r samples/calculator-materials ~/pocket-calculator && cd ~/pocket-calculator
git init && git add -A && git commit -m "materials: notes, key layout, an inbox note — no code yet"
```

Then lock the Fly bar onto that folder, set the budget you like, and press
Fire — five times, or twice with "stop at total". `npm test` is the endpoint.
