// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * DOC-FRESHNESS (BACKLOG web-msnsjxqu-25trfq): each doc below governs a set of
 * subject paths; when a subject was touched more recently than the doc that
 * describes it, the doc has likely drifted out of date and is worth a look.
 * `computeDocDrift` is pure — git timestamp lookup is injected (same seam as
 * `LandWatchdogControl`'s `landableCommitCount`) so drift detection is testable
 * without shelling out, and `gitLastTouchedAt` is the real implementation a
 * future post-flight sweep wires in to actually propose update tasks.
 */

import { execFileSync } from 'node:child_process';
import { slugify } from '@autopilot/onboarding';

export interface DocSubjectEntry {
  readonly doc: string;
  readonly subjects: readonly string[];
}

/** The initial backfill — docs with a well-defined, live-code subject area.
 *  Narrative/history docs (CHANGELOG, MASTER-PLAN) are deliberately excluded:
 *  their "subject" is the whole repo, so every commit would drift them. */
export const DOC_SUBJECTS: readonly DocSubjectEntry[] = [
  {
    doc: 'docs/epics/0001-parallel-flights.md',
    subjects: [
      'apps/dashboard/src/fly.ts',
      'apps/dashboard/src/flight/runner.ts',
      'apps/dashboard/src/flight/registry.ts',
    ],
  },
  {
    doc: 'docs/epics/0002-shell-decomposition.md',
    subjects: ['apps/dashboard/src/web/', 'apps/dashboard/src/shared/'],
  },
  {
    doc: 'docs/epics/0003-ring-0-fleet-watchdog.md',
    subjects: [
      'apps/dashboard/src/control/cli.ts',
      'apps/dashboard/src/control/flight-watchdog.ts',
      'apps/dashboard/src/control/land-watchdog.ts',
    ],
  },
  {
    doc: 'docs/epics/0004-bash-containment-worktree.md',
    subjects: ['apps/dashboard/src/flight/worktree.ts', 'apps/dashboard/src/fly.ts'],
  },
  {
    // Active epic, slices 1-2 landed (connect panel + sync-any-project) with a
    // well-defined subject area — the `gh` probe/doctor and the connect
    // panel's UI — so drift is watchable even with slices 3-5 still open.
    doc: 'docs/epics/0006-github-connected-mode.md',
    subjects: [
      'apps/dashboard/src/github/',
      'apps/dashboard/src/connection/',
      'apps/dashboard/src/web/connect-panel.ts',
    ],
  },
  {
    // Active epic; slices 3 (issue triage), 4 (PR review), 5 (report-from-
    // here), 6 (pool client), and 7 (publicity) have all landed pure-decision-
    // core + execute files — their well-defined subject area. UI panels are
    // already covered by epic 0002's broader web/ entry above.
    doc: 'docs/epics/0007-platform-maintainer-and-pool.md',
    subjects: [
      'apps/dashboard/src/flight/issue-triage.ts',
      'apps/dashboard/src/flight/issue-triage-execute.ts',
      'apps/dashboard/src/flight/pr-review.ts',
      'apps/dashboard/src/flight/pr-review-execute.ts',
      'apps/dashboard/src/flight/report-from-here.ts',
      'apps/dashboard/src/flight/report-from-here-execute.ts',
      'apps/dashboard/src/flight/pool-client.ts',
      'apps/dashboard/src/flight/pool-client-execute.ts',
      'apps/dashboard/src/flight/publicity.ts',
    ],
  },
  {
    // Active epic; the goggles mark and brandmark are its landed, well-defined
    // subject area — the mark itself, not every surface that later embeds it.
    doc: 'docs/epics/0008-brand-identity.md',
    subjects: [
      'apps/dashboard/src/assets/goggles-mark.ts',
      'apps/dashboard/src/assets/brandmark.ts',
    ],
  },
  {
    // Draft epic, but its resume-session code path has landed slices with a
    // well-defined subject area (the CLI adapter that threads `--resume` and
    // the store instrument that measures the saving), so drift is watchable.
    doc: 'docs/epics/0009-warm-sessions.md',
    subjects: ['packages/engine/src/adapters/claude-cli.ts', 'packages/store/src/warm-sessions.ts'],
  },
  {
    // Active epic (slices 2-3 shipped, slice 4 open); the CI-run report and
    // the unifying sweep it composes into are its well-defined subject area.
    doc: 'docs/epics/0010-maintenance-ritual.md',
    subjects: [
      'apps/dashboard/src/control/ci-status.ts',
      'apps/dashboard/src/control/maintenance-sweep.ts',
    ],
  },
  {
    // Shipped epic (slices 1-3 landed; slice 4 deliberately deferred); the
    // confirm-gated execute endpoint and the ARCHITECT proposal parser are
    // its well-defined subject area — narrower than the shared Ask panel
    // client (web/features/search.ts) that hosts them, already tracked by
    // epic 0002's broader web/ entry above.
    doc: 'docs/epics/0011-architect-chat-v2.md',
    subjects: [
      'apps/dashboard/src/flight/control-execute.ts',
      'apps/dashboard/src/ask/architect-proposal.ts',
    ],
  },
  {
    // Shipped epic (all 3 slices landed); the escalation logic and its
    // service-layer call site are its well-defined subject area.
    doc: 'docs/epics/0012-agentic-ask-escalation.md',
    subjects: ['packages/engine/src/ask-escalation.ts', 'apps/dashboard/src/ask/service.ts'],
  },
  {
    // Active epic (slice 1 landed, slices 2-3 not started); the read-only
    // usage-pool aggregator is its well-defined subject area.
    doc: 'docs/epics/0013-cost-semantics-v3.md',
    subjects: [
      'packages/engine/src/usage-pool.ts',
      'packages/engine/src/adapters/usage-pool-scan.ts',
    ],
  },
  {
    // Shipped epic (all four slices landed); the marker-registry mining seam
    // named in its own "Related" section as "the two seams every slice lands
    // in" is its well-defined subject area.
    doc: 'docs/epics/0014-fleet-wisdom-generalization.md',
    subjects: [
      'apps/dashboard/src/flight/soul-mining.ts',
      'apps/dashboard/src/flight/fleet-wisdom-mining.ts',
    ],
  },
  {
    // Active epic, Phase 0 (measure) open; the metrics script is the current
    // phase's own named deliverable ("Board task carries the EPIC-SPEC marker
    // for this file") — narrower than the broad web/ entry above since later
    // phases' UI work lands there instead. Epic 0005 (cockpit redesign v1) is
    // deliberately NOT tracked here: this epic's own doc supersedes it, and
    // its subject was the whole dashboard surface already covered by the
    // epic-0002 web/ entry above.
    doc: 'docs/epics/0015-cockpit-supervisory-control.md',
    subjects: ['scripts/cockpit-metrics.mjs'],
  },
  {
    // Non-epic doc, first of its kind here — its own "Defense in depth" list
    // names layer (1) as `containment.ts` and layer (2) as `guard.ts` +
    // `guard-hook.ts` by exact filename, giving it the same well-defined,
    // live-code subject area an epic has. Worktree isolation (layer 4) is
    // deliberately left off: that mechanism is already tracked under epic
    // 0004's own entry above, and duplicating it here would just double-fire
    // one drift as two proposals. ACTION-PLAN/FEATURE-COVERAGE/BACKLOG-999/
    // MODEL-CARD/RUNBOOK were considered and excluded — each spans the whole
    // roadmap or the whole system the way CHANGELOG/MASTER-PLAN already are,
    // with no comparably narrow subject to pin without guessing.
    doc: 'docs/FLIGHT-CONTAINMENT.md',
    subjects: [
      'packages/engine/src/containment.ts',
      'packages/engine/src/guard.ts',
      'packages/engine/src/guard-hook.ts',
    ],
  },
];

export interface DocFreshnessFinding {
  readonly doc: string;
  readonly docTouchedAt: number;
  /** Among subjects touched more recently than the doc, the one touched most
   *  recently — the single most useful pointer for "what changed since". */
  readonly newestStaleSubject: string;
  readonly newestStaleSubjectTouchedAt: number;
}

/**
 * Compare each doc's last-touch time against its subjects'. A doc or subject
 * missing from `lastTouchedAt` (e.g. untracked, or outside the git history
 * window a caller chose to fetch) is skipped rather than treated as infinitely
 * stale or infinitely fresh — no finding beats a wrong one.
 */
export function computeDocDrift(
  entries: readonly DocSubjectEntry[],
  lastTouchedAt: ReadonlyMap<string, number>,
): readonly DocFreshnessFinding[] {
  const findings: DocFreshnessFinding[] = [];
  for (const { doc, subjects } of entries) {
    const docTouchedAt = lastTouchedAt.get(doc);
    if (docTouchedAt === undefined) continue;
    let newest: { subject: string; touchedAt: number } | null = null;
    for (const subject of subjects) {
      const touchedAt = lastTouchedAt.get(subject);
      if (touchedAt === undefined || touchedAt <= docTouchedAt) continue;
      if (!newest || touchedAt > newest.touchedAt) newest = { subject, touchedAt };
    }
    if (newest) {
      findings.push({
        doc,
        docTouchedAt,
        newestStaleSubject: newest.subject,
        newestStaleSubjectTouchedAt: newest.touchedAt,
      });
    }
  }
  return findings;
}

/**
 * The id every proposal for `doc` starts with — the doc's whole dedup
 * identity. `docFreshnessTaskId` folds the newest-stale-subject's touch time
 * in AFTER this prefix, so every later commit to a subject mints a NEW id
 * while old, unresolved proposals stay open: keyed-by-id dedup alone let the
 * board accumulate 13 near-identical DOC-FRESHNESS rows (observed
 * 2026-08-20, amplified by fleet runs — every instance's flight-end sweep
 * fires). The sweep must skip proposing while ANY open proposal with this
 * prefix exists, regardless of which subject touch minted it.
 */
export function docFreshnessIdPrefix(doc: string): string {
  return `docfresh-${slugify(doc)}-`;
}

/** The proposal task id for `finding` — byte-identical to the inline
 *  construction the sweep has always used, now derived from
 *  `docFreshnessIdPrefix` so id and dedup-prefix can never drift apart. */
export function docFreshnessTaskId(finding: DocFreshnessFinding): string {
  return `${docFreshnessIdPrefix(finding.doc)}${finding.newestStaleSubjectTouchedAt}`;
}

/**
 * Prune counterpart to the mint side above (same VERIFY-BY doctrine
 * `findStaleVerifyByProposalIds` established): once a doc catches up past a
 * finding's subject-touch time — fixed by hand, or a further subject edit
 * ages the id out — `computeDocDrift` stops reporting it under its old id,
 * but the OLDER open proposal for that id can still be sitting
 * `needs_approval` forever: the mint-side dedup check (LIKE prefix, any open
 * status) treats it as "already covered" regardless, so it never gets
 * superseded on its own even though the drift it named is already resolved.
 * Given the ids of every currently-open docfresh proposal and the findings
 * `computeDocDrift` currently reports, returns the ids that no longer match
 * ANY current finding — safe to retire.
 */
export function findStaleDocFreshnessProposalIds(
  openProposalIds: readonly string[],
  findings: readonly DocFreshnessFinding[],
): readonly string[] {
  const currentIds = new Set(findings.map(docFreshnessTaskId));
  return openProposalIds.filter((id) => !currentIds.has(id));
}

/** Real git-backed lookup: epoch-ms of a path's most recent commit, or `null`
 *  when the path has no history yet (git prints nothing, same as an untracked
 *  or not-yet-committed path) — or when `git` itself fails (`repo` is not a
 *  git repository, e.g. a transient sweep against a non-repo cwd), the same
 *  "skip, don't guess" degradation `computeDocDrift` already gives a missing
 *  lookup. */
export function gitLastTouchedAt(repo: string, path: string): number | null {
  let out: string;
  try {
    out = execFileSync('git', ['-C', repo, 'log', '-1', '--format=%ct', '--', path], {
      encoding: 'utf8',
    });
  } catch {
    return null;
  }
  if (!out) return null;
  return Number(out) * 1000;
}

/**
 * The impure half `computeDocDrift` is deliberately kept free of: look up a
 * real git last-touch timestamp for every unique doc/subject path across
 * `entries` (a post-flight sweep's actual data source). A path with no
 * history (`gitLastTouchedAt` returns null) is simply absent from the map —
 * `computeDocDrift` already treats a missing lookup as "skip, don't guess".
 */
export function collectDocFreshnessTimestamps(
  repo: string,
  entries: readonly DocSubjectEntry[],
): ReadonlyMap<string, number> {
  const paths = new Set<string>();
  for (const { doc, subjects } of entries) {
    paths.add(doc);
    for (const subject of subjects) paths.add(subject);
  }
  const map = new Map<string, number>();
  for (const path of paths) {
    const touchedAt = gitLastTouchedAt(repo, path);
    if (touchedAt !== null) map.set(path, touchedAt);
  }
  return map;
}
