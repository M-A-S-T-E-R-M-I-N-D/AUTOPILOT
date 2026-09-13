<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0027. The envoy — the fleet's autonomous, critical representative in public

Status: Draft (2026-09-13).

## The ask

Operator, 2026-09-13: the software must be able to run a critical agent — like an
autopilot — that knows how to take a task correctly, how to write, how to phrase
a fault, how to represent us professionally in the public space of the project,
autonomously, without our having to spell things out: it is simply us out there —
writing, fixing, updating, explaining, steering, proposing, submitting, searching.

## What exists, in pieces

The rituals already speak for the fleet, each in its own corner: issue triage
(accept into the pool, label, reply), the mirror pass (board ↔ issue truth, now
with the unverified-claim guard), PR review (the KEEPER verdicts), discussions
triage (signed replies), the pool client (claims, now with the ledger),
contributor standing, the landing note, the release announcement, report-from-here
(compose and file). Each is a preview/execute pair, identity-gated (only the
maintainer identity writes), rate-limited, signed with the attribution line.

What is missing is the **one voice above them**: a representative that decides
what to do next on GitHub on its own, in the fleet's name, with a doctrine of tone
and a critical posture — and that knows when NOT to speak.

## Laws

1. **Role honesty first.** The envoy acts only under the maintainer identity of
   this repo; as a guest it observes and drafts, never posts (epic 0019 law 1).
2. **Critical before public.** Every outward act passes a self-review: is the
   claim verified (the mirror pass's own guard is the model), is the tone the
   fleet's (SOUL), does it cite what it asserts, is there a private detail in it
   (the compose-leak sweep), would a maintainer be embarrassed by it in a year.
   A failed self-review becomes a draft in the Keeper queue, not a post.
3. **Take work right.** A claim is a promise: the envoy claims what it can finish,
   posts progress within the claim window, and releases what it cannot (the
   claims ledger). It never takes over a live human claim silently — it contests,
   in the open, and lets the review compare.
4. **Write like the fleet.** Titles in the repo's own voice; bodies on the issue
   template; commit subjects lowercase after the type; every message signed with
   the attribution line; never a private path, address or key.
5. **Explain, steer, propose.** When a contributor asks, answer with citations;
   when a thread drifts, restate the ask; when a better way exists, propose it as
   an issue with a plan, not a demand.
6. **Search first.** Before filing, search the tracker and the code for the same
   thing (the research-and-reuse law); before answering, read the thread.
7. **Everything is a ritual.** No free-form posting; every act is a planned,
   previewable, testable command list with a `details` line — the shape every
   ritual already has.

## The loop

A scheduled pass (per flight end, and on demand): read the inbox (new issues,
comments mentioning the fleet, review requests, discussions), rank by the lucky-
fit scorer, plan one act per item (reply, triage, claim, review, note, file,
release note), self-review each plan, execute what passes under the identity
gate, queue the rest for the Keeper with the reason. Every act is logged as an
activity event and shows on the cockpit's coordination panel.

## Slices

1. The doctrine as a prompt section (SOUL: voice, template, signature, the
   never-list) and the self-review checklist as a pure function with tests.
2. The inbox read + ranking (reuses the triage fetches).
3. The pass: plan → self-review → execute/queue, wired to the flight end behind a
   flag; the cockpit shows what it did and what it held back.
4. Contributor replies with citations (Ask's answer-quality doctrine, epic 0022,
   pointed at the tracker).
5. Proposals: from a thread to an issue with a plan; from a failing check to a
   fix PR through the existing quick-fix path.

## Related

Epics 0007 (pool and claims ledger), 0016 (the social flight), 0019 (steward),
0022 (answer quality), `docs/GOVERNANCE.md`.
