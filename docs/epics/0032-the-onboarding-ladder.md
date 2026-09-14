<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0032. The onboarding ladder — micro-tasks that perform themselves, and two ticks worth earning

Status: Active (2026-09-14). Slice 1 shipped the same day.

## The ask (operator, 2026-09-14)

> One of the important remaining tasks is that the onboarding tour on the
> site is very simple, but the system has become very complex. Research what
> a state-of-the-art onboarding looks like — with micro-tasks, for instance
> one click that adds the calculator sample by itself, combined with symbols
> and icons, in every supported language, so the user knows what their
> progression is, like collecting badges. Every new supporter must have two
> ticks. A permanent watermark on the site. Level 2 onboarding is connecting
> to GitHub and publishing findings and submitting fixes — the system should
> remember it and remind, without being annoying. Badges before access to
> SOCIAL. A personal profile showing what I submitted and whether it was
> accepted.

## Laws

1. **A step that can be performed is performed.** "Add the calculator
   sample" copies a real project and fills the Fly bar with its path. It
   never tells the reader to go and find a folder. This is the entire
   difference between the ladder and the guided tour (epic 0002's
   `features/tour.ts`), which explains vocabulary and asks for nothing.
2. **One nudge, about one thing.** The model names a single current step,
   and it is always the first unfinished step of the first unfinished
   level. Level 2 is never proposed while a level-1 step is open.
3. **Never nag.** The panel auto-opens once, on a genuinely empty fleet.
   "Remind me later" puts it away for the rest of the day. Both ticks
   earned removes it for good. There are no notifications about it, ever.
4. **A tick is a fact, not a click.** Every step's state is derived from a
   signals snapshot — projects, firings, the GitHub connection — not from
   the reader pressing Next. A checklist that can be advanced without doing
   the thing is decoration.
5. **Done stays done.** A step already earned is never un-ticked by a later
   snapshot. Someone who flew once and then deleted the sample has still
   flown.
6. **Two ticks, two kinds of proof.** Level 1 is locally verified: you flew
   something, and this machine watched. Level 2 ends in acts a third party
   has to accept — a published issue, a merged fix. Those are the ones
   worth showing in public, precisely because the contributor cannot grant
   them to themselves.
7. **Level 1's tick is the key to SOCIAL.** The pool, the discussions and
   the standing board answer to people who have actually flown something.
   It is the cheapest honest filter there is against drive-by noise, and it
   asks nothing of a newcomer except the thing the product is for.
8. **State in words, never colour alone.** A badge carries its name and its
   state as text (WCAG 1.4.1). A locked badge and an earned badge differ by
   more than opacity.

## What the research changed

Five parallel surveys ran before a line was written (SOTA onboarding,
checklist/gamification evidence, i18n and profile pages, the GitHub
contributions API, attribution watermarks). Four findings altered the
design:

- **Cap level 1 at four or five steps.** Completion falls off a cliff past
  five, and the honest planning number is a median around 10% checklist
  completion — the ladder is designed for the reader who never finishes it,
  which is why every step is useful standalone.
- **Detect completion from observed state.** The pattern VS Code's
  walkthroughs use (`completionEvents`) rather than "Next" clicks; progress
  then survives a restart and a run made entirely from the CLI. This is
  law 4.
- **Never gate a public badge on an act the user alone controls.** Every
  badge system that counted self-controlled acts got farmed. This is law 6,
  and it is why level 2's badge waits on a maintainer.
- **Habituation to a repeated prompt is measurable by the second
  exposure.** So the panel is a masthead entry after its one auto-open, and
  a dismissal means dismissed. This is law 3.

A fifth finding removed something: no daily streak. Streak mechanics in
developer tools distort behaviour rather than reveal it.

## Slices

| # | Slice | State |
|---|-------|-------|
| 1 | The ladder: model, panel, both locales, icons, progress, two badges, the watermark, and the one-click sample | Shipped 2026-09-14 |
| 2 | Level-2 verification: read the operator's own issues and PRs, so "published" and "merged" are third-party facts rather than local marks | Open |
| 3 | The personal profile: what I submitted, and whether it was accepted | Open |
| 4 | SOCIAL gating: the pool, discussions and standing board answer to level 1's tick | Open |

## Slice 1, as shipped

- `web/onboarding.ts` — the pure model. Seven steps, two levels,
  `computeOnboarding(signals)` returning each step's state, each level's
  roll-up, the single current step, and a percentage.
- `web/features/onboarding.ts` — the panel. Splices the model's real value
  and real compiled source, so the served checklist cannot drift from the
  tested one. DOM via `createElement`/`textContent` only; icons assembled
  with `createElementNS` from spliced shape data.
- `flight/sample-project.ts` — the copy plan. Pure: what to copy, where to,
  and every refusal worded as a sentence. The target is always **outside**
  this checkout, because locking onto a path inside another repository
  would back up and fly the wrong thing — the lesson
  `docs/CASE-STUDIES/calculator-five-firings.md` learned by hand.
- `server/onboarding-route.ts` — `POST /api/onboarding/sample`. POST-only,
  JSON-guarded, rate-limited to five a minute, because each call copies a
  directory and shells `git init`.
- The watermark: one permanent footer line on every page, naming what built
  the page, who holds the copyright and under which licence.

## Open questions

- **Where the profile lives.** A route of its own, or a panel on the
  standing board. Slice 3 decides.
- **What a level-2 tick shows when the GitHub connection is absent.** The
  honest answer is "not earned, and we cannot see" — which is a third badge
  state, not a second.
