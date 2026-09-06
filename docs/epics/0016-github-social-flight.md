<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Epic 0016 — The GitHub Social Flight

**Status:** SPEC (operator directive 2026-09-06, verbatim intent below) — slices land via the board.
**Toggle:** on/off, and only ever active when `gh` is connected and authenticated.
**Bar:** "חייב להיות ברמה הגבוהה ביותר שקיימת" — the highest-existing level, or it doesn't ship.

## The operator's intent (the contract)

A flight mode that flies ON the GitHub surface itself — not the code tree:
review, update, verify data and texts, hygiene, issues, move things, ANSWER
PEOPLE — with the runner auto-identified by role: the repo owner flies as
maintainer; any user flying their own repo flies as themselves. And a
"mirror pass": look at the main tree and the running version, understand
what the maestro wants, check whether tasks actually completed, submit what
is missing, file issues for findings — or a fix alongside them.

Runs standalone ("fly GitHub") AND weaves into ordinary flights — a social
pass at start, between firings, or at flight-end. Every pass carries an
ANTI-SPAM protocol as a first-class law.

## The Social Protocol (anti-spam is the identity)

1. **Search before you speak.** Before opening ANYTHING, search existing
   issues/PRs/discussions (open AND closed). Found a match → thread INTO it:
   comment with the new evidence, cross-link, support — never a duplicate.
2. **Know what is already ours.** The pass loads its own prior submissions
   (issues/comments authored by this identity) and NEVER re-submits or
   re-states; it may UPDATE its own prior comment when facts changed.
3. **One conversation per topic.** If several people discuss the same theme
   across threads, the pass links them and proposes (not forces) a canonical
   thread.
4. **Budgeted voice.** Hard caps per pass (e.g., ≤N new issues, ≤M comments)
   with the caps visible in the flight log; exceeding = stop and queue for
   human, never spray.
5. **Role honesty.** Maintainer identity acts with maintainer verbs (label,
   triage, answer authoritatively); a user identity on their own repo acts as
   that user; NEVER impersonate, never answer FOR a human where a human was
   asked.
6. **Tone doctrine.** Kind, specific, evidence-first, credits contributors,
   never argues to win — the voice this repo already established in #11–#19.

## The Mirror Pass (tree ⇄ GitHub truth sync)

Per pass, mechanically derived — no guesses:
- Board tasks marked done ↔ referenced issues actually closed? Close with a
  landing note (commit SHA) or reopen honestly.
- Landed commits referencing `#N` ↔ issue state + a "landed in <sha>/<ver>"
  comment where missing.
- README/docs public claims ↔ tree reality (versions, counts, links) — file
  findings as issues (or a fix PR alongside, when in scope) rather than
  editing silently.
- Stale claims (assignee quiet 14d) → the reaper path (epic-shared with the
  collab protocol slices).
- Unanswered human messages (issue comments, discussions, PR replies) →
  answer if within protocol, else queue-for-human with a drafted reply.

## Slices (board tasks carry the granular DoD)

1. **social-pass core**: `flight/social-pass.ts` — gh-identity resolve, role
   detect (owner vs user), inventory load (own submissions, open threads),
   protocol engine with caps; pure planner + injectable executor, the
   pool-client/pr-review seam style.
2. **mirror-pass core**: the tree⇄GitHub derivations above as pure planners
   over `gh` reads + store reads; every action carries its evidence string.
3. **weave-in**: fly.ts hooks (start/interval/end) behind
   `AUTOPILOT_SOCIAL_FLIGHT=off|start|end|full`; dashboard toggle in the fly
   bar; refuses cleanly when gh is not connected.
4. **standalone**: "Fly GitHub" as a target choice in the fly bar (no code
   tree edits at all in this mode).
5. **observability**: every social action in the flight log + a SOCIAL
   section in the debrief (what was said/filed/closed, caps consumed).
6. **tests**: protocol red-team — duplicate-issue temptation fixture, cap
   overflow, role-confusion, answer-for-a-human refusal.

## Non-goals

No mass outreach, no cross-repo posting beyond the flown repo, no publicity
actions (those stay human-gated forever), no auto-merge changes to KEEPER.
