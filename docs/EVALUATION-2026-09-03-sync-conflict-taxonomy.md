<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# EVALUATION — sync-back conflict taxonomy, root causes, and the escalation decision (2026-09-03)

Every sync-back conflict from the 2026-09-02/03 fleet rounds (the first rounds
flown with the self-healing merge layer), classified by root cause, with the
external research that grounds the next mechanism. Written after the operator's
directive: "understand WHY they happened, and find a path that lands the commit
anyway — perhaps escalation to an orderly commit with an agent."

## The evidence — every conflict of the four rounds

| # | file | class | how it resolved |
| --- | --- | --- | --- |
| 1 | `docs/SELF-STUDY/PAPER.md` (×N per round, pre-fix) | GENERATED-APPEND | `merge=union` (2026-09-02) — extinct since |
| 2 | `test/tooling/generate-splice-manifest.test.ts` | SAME-MANIFEST | manual once → rerere replay |
| 3 | `apps/dashboard/src/web/shell.ts` (emoji vs SVG line) | SAME-LINE, cross-era | manual combine (lane's i18n + checkout's SVG) → rerere |
| 4 | `docs/epics/0004-bash-containment-worktree.md` | SAME-IDEA APPEND | manual pick-richer → rerere |
| 5 | `docs/epics/0001-parallel-flights.md` | SAME-IDEA APPEND | manual pick-richer → rerere |

Merge-integrity audit (`scripts/audit-sync-merges.mjs`) across all rounds:
**0 TARGET-WON** — no resolution, manual or automatic, ever dropped a lane's
work.

## Root causes, per class

- **GENERATED-APPEND** (was the majority): every lane's flight-end regenerates
  the same derived block + appends a dated entry. Cause: derived artifacts
  committed per-lane. Fix shipped: `merge=union` + regenerate-on-next-run
  self-healing. Class extinct across rounds 2-4.
- **SAME-MANIFEST**: two lanes each add one entry to a shared registry (module
  list, index census). Cause: additive-by-design files with positional
  assertions. rerere replays the once-resolved shape; longer-term the
  manifests are generator-owned (`generate-splice-manifest` already emits the
  barrel — the census test is next).
- **SAME-IDEA APPEND** (the dominant SURVIVING class — #4/#5 today): two lanes
  each append a paragraph documenting the same change to the same epic doc.
  Cause chain: the partitioner guards TASKS, not IDEAS → doc-freshness dedupes
  proposals PER DOC, but two *different* upkeep tasks (one per doc) both
  narrate the same landed change, and both lanes' flight-end sweeps see the
  same drift window. Three-way merge cannot order two insertions at one
  anchor. Fix shipped with this evaluation: `docs/epics/*.md merge=union` —
  both paragraphs land, prose dedup is the KEEPER page-upkeep duty (the same
  self-healing trade PAPER.md made; exercised successfully for a month).
- **SAME-LINE cross-era** (#3): a lane edits a line the checkout ALSO evolved
  after the lane forked. Cause: stale lane bases. Fix shipped:
  `fastForwardWorktree` at launch (7f957398) — lanes now fork from tip, so
  this class shrinks to genuinely-concurrent same-line edits.

## What the research says (external, 2021→2026)

- Neural/LLM merge resolution is an established line: DeepMerge (37% of
  non-trivial JS merges; 78% on ≤3-line conflicts), MergeBERT (63-68% as
  9-way resolution classification), MergeGen (generation > classification).
- **Merge-Bench (ICPR 2026)** warns the metric that matters: exact-match
  accuracy above 80% still "does not guarantee semantic equivalence" — LLM
  resolutions must be VALIDATED semantically, not trusted textually.
- **Rover (2026)** shows conflict resolution is not a local edit: the LLM
  needs dependency-aware context spanning files.
- The 2026 empirical comparison of LLM-based vs search-based resolution
  advocates HYBRID systems: cheap deterministic techniques first, LLM for the
  semantic remainder.
- Practice agrees: the Linux kernel's LLMinus (2025 Maintainers Summit)
  applies LLM assistance to merges with maintainer review.

## The decision — a three-rung ladder, then the agent

AUTOPILOT already implements the hybrid the research recommends, as rungs:

1. **union** for append-only/derived files (PAPER.md, epic docs) — free,
   deterministic, self-healing.
2. **rerere replay** for recurring shapes — the operator's own judgment,
   recorded once, replayed forever.
3. **fastForwardWorktree** — prevents the cross-era class at the source.
4. **NEW (board task, this evaluation): MERGE-ESCALATION AGENT** — when a
   sync-back conflict survives rungs 1-3, instead of stranding the branch and
   filing an inbox task, escalate to a focused resolution firing:
   - context: both sides + merge base + the enclosing file docs (Rover's
     lesson — context beyond the hunk);
   - the agent writes a candidate resolution;
   - **the FULL detected gate validates it** (Merge-Bench's lesson — semantic
     validation, never textual trust; this repo's converged gate is exactly
     that instrument, and the 2026-09-03 rounds proved it catches cross-lane
     semantic breaks tests-first);
   - green → commit with an attribution trailer naming the escalation;
     red → abort the merge, strand honestly, file the inbox task exactly as
     today. The ladder only ever ADDS a rung — the fail-loud floor is
     unchanged.

Board task: `MERGE-ESCALATION: agent-resolved sync-back conflicts, gate-validated`
(created alongside this evaluation). The audit ritual
(`audit-sync-merges.mjs`) remains the standing proof that no rung — including
the agent — ever silently drops lane work.

## Postscript — the audit's first live alarm (same day)

Hours after this evaluation landed, `audit-sync-merges.mjs` fired its first
real TARGET-WON on merge `b8bfb949` (`docs/epics/0004-bash-containment-worktree.md`).
Investigation: the "dropped" lane content was the duplicate same-idea telling
of `fastForwardWorktree` this evaluation's conflict #4 had already resolved
by hand — the operator-side KEEP-TARGET choice, recorded by rerere, replayed
faithfully when the base lane's older branch re-presented the same shape
(that merge pre-dated the `docs/epics/*.md merge=union` commit by two
commits). The kept, richer paragraph is verified present; nothing was lost.
Verdict: a FALSE-POSITIVE CLASS — rerere-replayed pick-one-side resolutions
read as TARGET-WON — now documented in the tool's failure output. For epic
docs the class is extinct going forward (union); for code, TARGET-WON remains
a hard alarm. The alarm→investigate→prove-no-loss loop working end-to-end on
day one is itself the strongest evidence the audit earns its place in the
collection ritual.
