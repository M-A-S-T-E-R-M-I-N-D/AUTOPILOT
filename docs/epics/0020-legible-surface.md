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
| 3 | Same treatment for the KEEPER issue-triage panel: issue numbers link out, labels render as real chips, decisions link to the comment they will post | **shipped** — `web/features/issue-triage.ts`, `web/issue-triage-panel.ts`, `test/web/issue-triage-link.test.ts`, `test/web/issue-triage-labels.test.ts`, `test/web/issue-triage-comment-link.test.ts` |
| 4 | Flight console: per-step progress with elapsed time — which gate step is running, how long it has been there — instead of a static status word | queued |
| 5 | Link census: a test that fails when a rendered GitHub noun (number, SHA, handle) has no link and the API reported a URL for it — the structural stop for failure #2 | **shipped** — `test/flight/link-census.test.ts` (found and fixed the pool-client panel's own dead issue-number link), `web/features/pool-client.ts`, `test/web/pool-client-link.test.ts` |
| 6 | Payload census: a test that fails when a field fetched by a flight module never reaches any client renderer — the structural stop for failure #1 | **started** — `test/flight/payload-census.test.ts` covers `PoolIssue` (pool-client.ts) and `PublicityAffordance` (publicity.ts); `PrReviewCandidate`, `IssueTriageDossier` and the `MirrorPass*Finding` payloads remain — see the test's own header for why they're follow-up, not scope skipped by accident |
| 7 | Typography and rhythm pass across panels: one scale, deliberate spacing, hierarchy by size not by weight-everywhere | **absorbed by epic [0021](0021-app-shell.md)** — fluid display type + section rhythm tokens, one inline edge (`--page-inline`), the unstyled panel fixed |
| 8 | **Diagnose & fix a red check** — the fourth maintainer verb: read the failing check's own log, CLASSIFY the failure (our flake / real defect / dependency drift), then either re-run it or prepare a fix commit on the PR branch and show the operator a diff to approve before anything is pushed | **started** — `flight/check-diagnosis.ts` ships the pure classifier over a fetched job log + touched paths + the flaky-test quarantine list, plus `createCheckDiagnosisApi` wiring it to `GET /api/pr-review/diagnose?number=`; the `🔧 Diagnose` button now sits beside "Re-run failed" on any card with a red gating check, calling that route and rendering the verdict with its own evidence (`web/pr-review-panel.ts`'s `checkDiagnosisResult`, `web/features/pr-review.ts`) — the `defect` verdict's diff-for-approval prep still remains |

Slices 5 and 6 are the ones that matter most for "never again": 1–4 fix
today's surfaces, 5–6 make the next one fail a test instead of waiting
for the operator to notice.

### Slice 8 in full — the verb the chain is missing

**Where it comes from (operator, 2026-09-10):** *"for example #37 has an
error — how can we take it and let the pilot understand the failure, fix
it, and land it instead… propose an alternative commit that answers it."*

Today a red check ends the chain. Slice 2 gave the card three verbs —
merge, update-branch, re-run — and re-run is the only answer it has to
a failure. That is the right answer for a flake and **useless against a
real defect**, which is the case an operator actually needs help with.

**The classification is the whole feature.** On PR #37 the distinction
was made by hand, in three steps, and it decided everything:

1. Read the failing job: an axe-core a11y assertion, `expected null not
   to be null`.
2. Run that same test on our own `main` — it passed. So the branch's
   content was not obviously at fault.
3. Ask whether the PR's change could even reach it. #37 bumped `zod`,
   and `zod` is imported by **exactly one file in the repo**
   (`packages/mcp/src/control.ts`, the MCP server). It cannot touch the
   dashboard's pool-client panel.

Verdict: our own Windows a11y flake, not the dependency. Re-run, merge.
Had step 3 come out the other way, the honest answer would have been a
fix commit — and that is the half that does not exist.

**Shape:**

- `flight/check-diagnosis.ts` — pure classifier over a fetched job log
  plus the PR's own touched paths. Returns one of `flake` (known
  signature, or the same test passes on base), `defect` (the change can
  reach the failure), or `unknown`. **`unknown` must be a real, common
  answer** — a classifier that always decides is the cry-wolf failure
  (FAILURE-DOCTRINE row 6) wearing a new hat. Wired to `GET
  /api/pr-review/diagnose?number=` (`createCheckDiagnosisApi`), which
  re-reads the PR's checks fresh from `gh`, reads the red one's own log
  with `gh run view --log-failed`, and feeds the classifier.
- A `🔧 Diagnose` button beside the existing three, calling that route and
  rendering the verdict with its evidence — never a bare label. The
  reasoning is the product; the button is just where it lives.
- For `defect`, prepare a commit on the PR branch and show a **diff for
  approval**. Never auto-push: pushing to a contributor's branch without
  asking is exactly what `update-branch` already refuses to do silently
  (it confirms first, and says it is putting a real commit on someone
  else's branch).

**Non-goals:** no auto-push, no auto-merge on a `flake` verdict, and no
guessing when the evidence is thin — `unknown` with its reasoning shown
beats a confident wrong answer, because the operator can act on honest
uncertainty and cannot act on a plausible fiction.

## Non-goals

- A component framework. The bundle budget (184KB core) is a feature;
  the vanilla + `.toString()` splice architecture stays.
- Dark-mode-by-default or any theme change. Both skins already exist and
  both are deliberate.
