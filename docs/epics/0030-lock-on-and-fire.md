<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0030. Lock on and fire — the first file a user reads, the real flow in pictures, and the hierarchy behind it

Status: Draft (2026-09-13).

## The asks (operator, 2026-09-13)

- "To market it much better: take screenshots, or recreate the image, of the
  actual way it works — we lock on a folder or a GitHub repo, we hit LUCKY if we
  want the system to check our specs and consider for us, and we hit FIRE."
- "Rethink the structure of the firing system fully: better hierarchies in our
  apps — research hierarchy — write a more covering master prompt that includes
  everything I missed, then update: hierarchies, sizes, fields, everything;
  patch; release with a more updated, selling first file that users understand:
  you lock on a folder, you hit fire, no prompt on first launch."

## The promise, in one breath

You point AUTOPILOT at a folder or a GitHub repo. You press **Fire**. It
orients itself, picks the most valuable thing it can finish, does it, runs your
own gate, commits when green, and tells you what happened — again and again,
inside the budget you gave it. There is no prompt to write on the first launch:
the mission is the code, the board, and the docs already in the folder. **Lucky**
is the one extra press: it reads your specs and the board and proposes what fits
the attention you have (an evening, a day, a week).

## Slices

1. **The selling first file.** README.md opens with the promise above, then
   three real screenshots from the populated fixture: (1) the fleet home with the
   Fly bar — a folder locked on, budget, Fire; (2) the Lucky shortlist under the
   bar; (3) a live firing in progress with its phase rail. Captured at 1440×1030
   @2× like the existing `docs/screens`, dark theme, no operator paths.
2. **The master prompt.** `docs/MASTER-PROMPT.md`: one document that states
   the product's promise, its laws (honest telemetry, additive git, gate before
   commit, one unit per firing, claim contracts), its surfaces (fleet, project,
   board, plan, docs, data), every ritual, every knob and its field, and what a
   firing may and may not do — the text a new maintainer, a new pilot and the
   pilot's own prompt all read from. Written from `packages/engine/src/prompt.ts`,
   the flight laws, and this epic list; then the firing prompt is regenerated
   from it, not the other way round.
3. **Hierarchy research and rethink.** Study how the best operator consoles
   (flight decks, CI dashboards, IDE assistants) rank what the eye meets first;
   write `docs/HIERARCHY.md`: the order of subjects, the size of each, the
   fields each card carries and drops, the phone and desktop variants — and a
   census test that pins the order. Then patch the shell to it.
4. **Release.** The README, the screenshots and the master prompt land in one
   minor release whose notes read like the first file.

## Related

Epics 0021 (shell), 0024 (pipeline graph), 0026 (tasks screen), 0027 (the
envoy), `README.md`, `docs/screens/`.
