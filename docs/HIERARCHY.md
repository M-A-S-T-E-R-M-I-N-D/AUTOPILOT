<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# HIERARCHY — what the eye meets first, and why

Epic 0030 slice 3 (2026-09-13). The operator's ask: "rethink the structure of
the firing system fully — better hierarchies in our apps; research hierarchy;
then update: hierarchies, sizes, fields, everything." This file is the order
of subjects, the size of each, the fields a card carries and drops, the phone
and desktop variants — and the reasoning, sourced, so the next change argues
with evidence rather than taste. A census test pins the order.

## 1. The diagnosis

The README's own frames (epic 0030 slice 1) showed it: on the fleet home the
Fly bar — the product's one verb, _lock on a folder and press Fire_ — sat
**fourth**, under the totals, the performance tiles and "Contributor
standing". A first-time visitor met a leaderboard before the launch button.
The masthead was already quiet (stroke icons, one gear); the body was not
ordered by importance.

## 2. What the best operator consoles do

Ranked principles, each with its source.

1. **The launch bar is the attitude indicator: top-center, always present,
   never summoned.** 14 CFR 25.1321(b) puts the attitude instrument "in the
   top center position"; FAA AC 25-11B requires it "continuously, directly in
   front of each flightcrew member"; pilots spend 80–90 % of their scan on it
   and route every other glance through it (FAA-H-8083-15B).
2. **Folder-lock and Fire live in one control, not in settings.** Every
   shipping agent console puts the repo picker inside the prompt box (Copilot
   coding agent, Cursor background agents, Jules, Claude Code on the web).
3. **One primary action, styled alone.** Material 3 and Apple's HIG give one
   filled button per screen; NN/g measures the decision cost of two equal
   calls to action.
4. **Quiet dark by default.** Airbus: "if all the lights are out, the
   aircraft is ready to fly"; Boeing's "quiet dark concept". No badge, chip
   or colour unless something needs a human; all-quiet is a readable state.
5. **Red and amber are the alert namespace only.** 14 CFR 25.1322: warning
   (act now), caution (know now, act soon), advisory (know); their colours
   "for functions other than flightcrew alerting must be limited".
6. **One fixed slot for fleet-wide status.** NASA's display standard: "a
   common dedicated area for the display of key information… visible at all
   times"; Datadog: "place the overview group at the top".
7. **Summary above, detail below; symptom before cause.** Google SRE's
   dashboards answer "what's broken" first; SLIs on the landing page.
8. **Budget the first screenful.** NN/g: 74 % of viewing time lands in the
   first two screenfuls; the 100 px above the fold draw 102 % more than the
   100 px below it.
9. **Weight left and top.** 80 % of fixations land on the left half (NN/g);
   Grafana's Z-pattern: "place key content in the top left corner".
10. **Two-track progress.** A cheap status chip and a diff counter in the
    list; the rich log a click away (Copilot, Codex, Claude Code on the web).
11. **A card answers one question.** AC 25-11B: an element belongs only if it
    "adds useful information content" — clutter is measured in seconds.
12. **DOM order is visual order.** WCAG 1.3.2 and 2.4.3 forbid CSS-only
    reordering; 2.4.1 wants a skip link first; 2.4.11 (new in 2.2) warns a
    sticky bar can obscure focus — give it `scroll-padding-top`; 4.1.3 wants
    progress announced by a polite live region, since `role="progressbar"`
    alone is silent.

## 3. The order

**Desktop (fleet home, subjects stacked from `lg`):**

1. Skip link (visually hidden) → the main landmark.
2. **The Fly bar** — folder lock (picker, last-used prefill), budget, Lucky,
   **Fire** as the only filled button above the fold; Pause/Stop while
   flying; the flight's progress in a polite live region.
3. **Search / Ask** — one line under the bar; `/` reaches it from anywhere,
   so its visual weight is small.
4. **Totals** — the fixed status slot: projects · flying · firings · shipped
   · cost · open findings · need you. Only _need you_ and a red gate may take
   amber or red.
5. **Who is flying now** — live work, one row per lane: project · phase chip
   · elapsed · one action (open).
6. **Performance tiles** — cost per ship, ship rate, streak, turns, cache
   share: five numbers, no more.
7. **Project cards** — one question each ("what is this project doing, and
   does it need me?"), sorted by last activity; the card's own Fire is tonal.
8. **Keeper** — PR review, the pool, CI, fleet wisdom: everything waiting on
   a human, in one list.
9. **Community** — good first issues, publicity, contributor standing.

**Phone (tabs):** Fly (the bar, one line: folder chip + Fire; the fields
expand on tap) · Fleet (totals collapse to two numbers, then live work, then
cards in one column) · Keeper · Community. Standing is never above the fold
on a phone. The bottom bar is the rail.

## 4. Sizes and fields

- **The Fly bar** is one row at `lg` and above (folder, browse, mode,
  firings, $/firing, lanes, Lucky, Fire), two rows below; the hint sentence
  under it names the total spend in words.
- **Totals** are the large numerals (the `--text-3xl` step); tiles one step
  smaller; card numerals one step smaller again — three sizes, three ranks.
- **A project card** carries: name, status chip, language · files · size
  chips, the live firing (when flying) with its phase rail, firings · shipped
  · ship rate, open findings with the gauge bar, and one details disclosure.
  It drops: raw token counts, cache figures, DORA — those live on the project
  page under Data.
- **Live-work rows** carry project, phase, elapsed, the file being edited,
  and the task; they drop cost until the firing lands ("cost known once it
  lands" stays honest).

## 5. This slice

- The fleet home's DOM order moved the Fly bar and the search bar above the
  totals (`renderShell`); nothing was reordered by CSS.
- `apps/dashboard/test/web/hierarchy-census.test.ts` pins the fleet home's
  section order and the rule that the Fly bar precedes the totals.
- The visual baselines were re-rendered on CI for the new order.
- **Totals collapse to two numbers on a phone** (`renderTotals`,
  `TOTALS_PHONE_KEEP` in `shell.ts`): flying and need you — the two
  actionable counts under the "quiet unless it needs you" doctrine above —
  stay visible below 48rem; the rest (`.total-collapse`) return at 48rem.
  The seeded Tab stop moves to the first visible cell on phone so the
  collapse never strands keyboard focus on a hidden one.
- The skip link (`.skip-link`, `shell.ts`) was already the first interactive
  element in the DOM, ahead of the masthead — an earlier build, not this
  slice; the "Open" bullet below is retired as already satisfied.
- **The Fly bar is one line on a phone — folder chip + Fire — with
  everything else behind expand-on-tap** (`#fly-options`, `shell.ts` +
  `layout-css.ts`): browse, mode, firings/total, $/firing, lanes and Lucky
  move into a `<details>`/`<summary>` disclosure (native keyboard/tap
  toggle, no script), collapsed by default below 48rem; the folder's own
  `<label>` goes visually-hidden at that width so the input and **Fire**
  share the row instead of the label forcing it onto its own line.
  `#fly-options`'s `order: 3` pushes the disclosure after every other
  default-order field (folder, Fire/Pause/Stop, status, hint, fit,
  progress) so those stay adjacent regardless of the disclosure's DOM
  position. At 48rem and up `display: contents` unwraps the `<details>`
  and its body back into the plain flex row §4 already specifies (folder,
  browse, mode, firings, $/firing, lanes, Lucky, Fire) — an author rule
  that overrides the UA's `details:not([open])` hiding, since origin beats
  specificity in the cascade — so desktop's DOM order, and the already-
  captured README frames, are unchanged.

## 6. Open

- `scroll-padding-top` if the Fly bar ever becomes sticky.
- The diff counter (`+N −M`) on live-work rows once the record carries it.

## Sources

Airbus A330neo cockpit commonality (airbus.com); NASA NTRS 19910001624
(Boeing flight-deck philosophy); 14 CFR 25.1321, 25.1322; FAA AC 25-11B;
FAA-H-8083-15B; NASA-STD-3001 Vol. 2; NASA display standard Appendix F;
Google SRE book and workbook (monitoring); Grafana dashboard best practices;
Datadog integration dashboard guidance; GitHub Actions, Buildkite and Vercel
docs; Material 3 buttons; Apple WWDC25 session 356; NN/g on visual hierarchy,
first impressions, scrolling and attention, the page fold, horizontal
attention, progressive disclosure; GitHub Copilot coding agent, Devin, Jules,
Codex cloud, Cursor and Claude Code web docs; WCAG 2.2 Understanding 1.3.2,
2.4.1, 2.4.3, 2.4.11, 4.1.3; ARIA APG landmark regions; MDN on `autofocus`.
