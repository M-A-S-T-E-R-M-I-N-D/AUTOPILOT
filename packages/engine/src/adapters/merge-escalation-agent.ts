// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Rung 4's still-missing half (docs/EVALUATION-2026-09-03-sync-conflict-
 * taxonomy.md): `merge-conflict-context.ts` gathers base/ours/theirs for
 * every path a sync-back merge still can't settle and files it as a
 * STRANDED SYNC-BACK inbox task; today the ladder stops there — "abort,
 * refuse, file the task". This module is the decision core the doc
 * describes next: build the agent's resolution prompt
 * ({@link buildMergeEscalationPrompt}), then drive the attempt
 * ({@link runMergeEscalationAgent}) through exactly the sequence the
 * evaluation specifies — invoke the agent, verify every listed path is
 * actually staged clean, run the FULL detected gate (Merge-Bench's lesson:
 * validate semantically, never trust an agent's diff on sight), and only
 * THEN commit with an attribution trailer naming the escalation; any
 * failure at any step aborts the merge so the repo is never left mid-merge
 * — the same fail-loud floor `worktree.ts`'s `syncWorktreeBranch` already
 * guarantees today.
 *
 * Deliberately unwired: every side effect (`invokeAgent`/`listUnresolvedPaths`/
 * `runGate`/`commit`/`abortMerge`) is injected, so this orchestrates purely
 * against fakes in tests. Wiring a real `ClaudeCliModel` invocation mid-merge
 * into `syncWorktreeBranch`'s live sync-back path — the path every flight's
 * catch-up and flight-end sync runs through — is a separate, riskier slice
 * that needs its own integration test against a real conflicted repo.
 */

import { formatMergeEscalationContext, type MergeConflictSides } from './merge-conflict-context.js';

/**
 * The agent's actual work order: `formatMergeEscalationContext`'s human-
 * readable base/ours/theirs dump, wrapped in the specific instructions this
 * ladder rung needs — resolve ONLY the listed paths, never drop either
 * lane's content (the standing invariant `scripts/audit-sync-merges.mjs`
 * verifies post-hoc), stage each resolved file, and leave the commit itself
 * to the caller so {@link runMergeEscalationAgent} can gate before it lands.
 */
export function buildMergeEscalationPrompt(
  conflicts: readonly MergeConflictSides[],
  sourceBranch: string,
  targetBranch: string,
): string {
  const paths = conflicts.map((c) => c.path).join(', ');
  return (
    `A merge of '${sourceBranch}' into '${targetBranch}' is in progress and stopped on ` +
    `${conflicts.length} unresolved conflict(s) — union-merge, rerere replay, and ` +
    `fastForwardWorktree (the earlier rungs of docs/EVALUATION-2026-09-03-sync-conflict-` +
    `taxonomy.md) all failed to settle them. Resolve ONLY the file(s) listed below by ` +
    `combining both sides' intent — never silently drop either lane's change. For each ` +
    `listed path: edit the file in the worktree to the fully resolved content (no conflict ` +
    `markers left behind), then stage it with 'git add'. Do not edit or stage any other file, ` +
    `and do not run 'git commit' yourself — the caller commits once every listed path is ` +
    `staged clean and the project's gate has validated the result.\n\n` +
    `Files to resolve: ${paths}\n\n${formatMergeEscalationContext(conflicts)}`
  );
}

/** Attribution trailer naming this rung — mirrors `Assisted-by`'s pattern (docs/ATTRIBUTION.md): identifies the mechanism, certifies nothing. */
export function mergeEscalationCommitMessage(sourceBranch: string, targetBranch: string): string {
  return (
    `chore: sync ${sourceBranch} into ${targetBranch} (rung 4 merge-escalation agent resolved)\n\n` +
    `Merge-Escalation-Agent: docs/EVALUATION-2026-09-03-sync-conflict-taxonomy.md rung 4`
  );
}

export interface MergeEscalationAttempt {
  readonly ok: boolean;
  readonly details: string;
}

/** Every side effect the orchestrator needs, injected — see the module doc for why nothing here is wired to a real spawn/gate/commit yet. */
export interface MergeEscalationDeps {
  /** Runs the resolution agent against {@link buildMergeEscalationPrompt}'s prompt. `ok: false` means the agent invocation itself errored or timed out. */
  readonly invokeAgent: (prompt: string) => Promise<MergeEscalationAttempt>;
  /** Paths still unmerged in the index after the agent ran (`git diff --name-only --diff-filter=U`). */
  readonly listUnresolvedPaths: () => Promise<readonly string[]>;
  /** Runs the FULL detected gate against the agent's staged resolution — Merge-Bench's semantic-validation lesson, never a textual trust of the diff. */
  readonly runGate: () => Promise<MergeEscalationAttempt>;
  /** Commits the resolved merge once the gate is green. */
  readonly commit: (message: string) => Promise<MergeEscalationAttempt>;
  /** Aborts the in-progress merge — called on every non-`resolved` outcome so the repo is never left mid-merge, matching `syncWorktreeBranch`'s existing fail-loud floor. */
  readonly abortMerge: () => Promise<void>;
}

export type MergeEscalationOutcome =
  | { readonly kind: 'resolved'; readonly details: string }
  | { readonly kind: 'agent-failed'; readonly details: string }
  | { readonly kind: 'left-unresolved'; readonly unresolvedPaths: readonly string[] }
  | { readonly kind: 'gate-red'; readonly details: string }
  | { readonly kind: 'commit-failed'; readonly details: string };

/**
 * Drives one escalation attempt through the evaluation's exact decision
 * sequence: invoke → verify nothing is left unresolved → gate → commit.
 * Every non-`resolved` outcome aborts the merge first — the ladder only
 * ever ADDS a rung; a failed escalation strands exactly as honestly as an
 * escalation that was never attempted.
 */
export async function runMergeEscalationAgent(
  conflicts: readonly MergeConflictSides[],
  sourceBranch: string,
  targetBranch: string,
  deps: MergeEscalationDeps,
): Promise<MergeEscalationOutcome> {
  const prompt = buildMergeEscalationPrompt(conflicts, sourceBranch, targetBranch);
  const attempt = await deps.invokeAgent(prompt);
  if (!attempt.ok) {
    await deps.abortMerge();
    return { kind: 'agent-failed', details: attempt.details };
  }

  const unresolvedPaths = await deps.listUnresolvedPaths();
  if (unresolvedPaths.length > 0) {
    await deps.abortMerge();
    return { kind: 'left-unresolved', unresolvedPaths };
  }

  const gate = await deps.runGate();
  if (!gate.ok) {
    await deps.abortMerge();
    return { kind: 'gate-red', details: gate.details };
  }

  const commit = await deps.commit(mergeEscalationCommitMessage(sourceBranch, targetBranch));
  if (!commit.ok) {
    await deps.abortMerge();
    return { kind: 'commit-failed', details: commit.details };
  }
  return { kind: 'resolved', details: commit.details };
}
