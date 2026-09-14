<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0031. The snackbar — one place where an interaction says what happened

Status: Active (2026-09-14). Slice 1 shipped the same day.

## The ask (operator, 2026-09-14)

> After the Lucky roll: a really long text with strange line breaks. It is
> important that this message gets some UI or an orderly panel with a clear
> position — above, below, a snackbar, I don't know. In any case it is
> important to bring a snackbar into every kind of interaction.

And, minutes later, about the same panel:

> What is it worth that it shows me what fits me but gives me no way to use
> the pilot to pull it in and solve it — a button or something. That is
> really strange.

## Laws

1. **One place.** Every transient outcome appears in one host at the bottom
   of the viewport, above the phone's nav bar and inside the safe area.
   Nothing in the page moves when a snack appears: the host is a fixed
   overlay that takes no layout and catches pointer events only on the
   snacks themselves.
2. **Short and whole.** A snack is one sentence. Detail belongs to the panel
   the interaction owns; a snack may carry **one** action that goes there.
3. **It leaves on its own, but never mid-read.** It dismisses after its
   timeout (a failure gets longer); the timer pauses while the pointer is
   over it or focus is inside it; a close button ends it at once; Escape
   ends the one holding focus.
4. **Announced, not stolen.** The host is a polite live region and a failure
   is `role="alert"`. Focus never moves on its own — a snack is not a
   dialog. The host carries no `aria-label`: a name on a nameless container
   is prohibited (axe `aria-prohibited-attr`), and the snacks speak for
   themselves.
5. **At most three.** Beyond three the oldest goes, so the stack can never
   become a wall.
6. **A suggestion that cannot be acted on is not finished.** Where a panel
   ranks work, the row carries the verb — and the snack confirms what the
   verb did.

## Slices

1. **Shipped 2026-09-14:** `web/features/snackbar.ts` (the host, stacking,
   pause-on-read, one action, both locales) and its first consumers — the
   Lucky roll. The roll's arithmetic moved out of the inline status line
   into a "Why this size" panel, one row per reason, and the status now
   reads one short localized sentence that the snackbar repeats. The fit
   shortlist became a real list (a title line, a meta line, one reason) and
   every pool row carries **Hand to the pilot**: one click queues that issue
   on the board the roll itself read, and the snack confirms it with an
   "Open the board" action. Nothing is claimed on GitHub and nothing flies.
2. The rituals: `busy.ts`'s ritual toast folds into the snackbar so a
   landing, a release and a round all report the same way.
3. The board and the Keeper: task create/done/delete, claim, merge and
   triage outcomes.
4. A census test that pins every `fetch(...).then` outcome in
   `web/features/` to either a panel of its own or a snack — so a silent
   failure cannot ship.

## Related

Epics 0028 (busy states — the scrim and its ritual toast), 0020 (the
legible surface), 0026 (the tasks screen), `docs/HIERARCHY.md`.
