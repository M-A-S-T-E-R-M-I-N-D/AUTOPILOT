<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0026. The tasks screen — a list with a point of view, and Ask one gesture away

Status: Draft (2026-09-13). Board tasks seeded 2026-09-12 under this number.
First cut of the column card shipped 2026-09-13 (title on its own line, controls
as a strip). Slice 1's keyboard half shipped 2026-09-26: the `j`/`k` cursor
with Escape, then `a` approve / `d` done on the row under it and the one-line
key legend under the column heads that names them. Row selection followed the
same day: every row leads with a checkbox, `x` toggles the one under the
cursor, an "N selected" status line counts the set, and Escape clears it
before it leaves. Ctrl/Cmd-A takes every row in the cursor's list, named in
the legend as `Ctrl+A`. Shift+`j`/`k` extends: it moves like `j`/`k` and checks
the row it leaves and the row it lands on, so a run walked with Shift held is
selected; it only adds, and walking back keeps the run. That closes Linear's
five selection keys. The set is what slice 4's bulk actions will act on.
Enter closed the slice's key list the same day: the title is the row's
disclosure button (`aria-expanded`, `aria-controls`), and Enter from anywhere
in the row but its own buttons, Space on the title, or a click opens a
read-only detail on its own line under the row — the task's whole body (the
hover tip stops at 240 characters), its id and its age. Open rows survive the
per-tick rebuild. The legend names it as `Enter` open. The detail then gained
the task's slices and cost history: a "Firings: N · $X in all" line from the
store's lifetime tally, then one line per firing the loaded flight log still
holds, newest first — the flight log's verdict dot, how it ended, the commit
subject, cost, wall time, age and short sha — and, when the tally is larger
than that page of the log, a line counting the earlier firings it cannot
show. Still open in slice 1: the detail as a split pane beside the list from
`lg`, and the rest of its contents (provenance, the claim).

## The ask

Operator, 2026-09-12: the tasks screen "needs and deserves a lot of improvement" —
study Apple's Human Interface Guidelines, Material 3, Linear and GitHub Projects;
and make the Ask agent (Architect / Genius) reachable from a floating action
button or a side sheet, not only from its panel.

## What the field says

- **Material 3 lists.** One selection mode at a time; a fixed row anatomy —
  leading element, headline, supporting text, trailing element — at 56/72/88dp
  for one/two/three lines; the list-detail canonical layout pairs a list with a
  detail pane from the expanded window class up.
- **Linear.** The view header holds filters and display options; filters narrow,
  display options show or hide properties, and both live in the URL. Selection is
  keyboard-first: `j`/`k` move, `x` selects, Shift extends, Cmd/Ctrl-A takes all,
  Esc clears; the command palette acts on the selection. List, board and split
  views are one dataset with three presentations.
- **GitHub Projects.** Views are saved queries with grouping and slicing; a
  side panel edits the selected item without leaving the list.
- **Apple HIG.** Sidebars and lists carry hierarchy through spacing and weight,
  never through boxes; a detail pane keeps context; a floating button is for the
  one primary action of a screen, nothing else.

## The screen

Row anatomy: leading status glyph (an icon, epic 0025) · headline (the title, one
line with an ellipsis, expanding on selection) · supporting line (id, severity,
dimension, cost) · trailing actions on hover and focus. A view header with
grouping (status, severity, source), filters and display options, all in the URL.
A split/detail pane from `lg`: the selected task's body, provenance, slices, cost
history, and its claim (the claims ledger, epic 0007). Keyboard: `j`/`k`, `x`,
Enter, `a` approve, `d` done. Counts on group heads. A "Focus" grouping puts what
to work first at the top — the lucky-fit scorer feeds it.

## Ask, one gesture away

A floating action button (bottom trailing, above the phone nav; 56dp; the
Ask icon) opens Ask as a **side sheet** from `lg` up and as a bottom sheet below
it — the pattern the assistant panels of modern IDEs and office suites use. The
sheet keeps the page underneath live and scrollable, carries the current
selection as context ("about this task"), and remembers which persona was open.
Escape closes; focus returns to the button. It is the screen's one floating
control; nothing else floats.

## Slices

1. Row anatomy + the detail pane (read-only), keyboard selection.
2. View header: grouping, filters, display options in the URL.
3. The FAB + side sheet for Ask, with selection context.
4. Bulk actions from the palette on a selection.
5. Visual regression at the four breakpoints, three themes, list and columns.

## Related

Epics 0021 (shell), 0022 (Ask answer quality), 0025 (icons), 0007 (the claims
ledger the detail pane shows).
