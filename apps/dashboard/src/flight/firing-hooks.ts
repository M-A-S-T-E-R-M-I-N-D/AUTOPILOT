// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The per-firing hooks and fresh-input readers `fly.ts` wires into the loop:
 * the `onFiringComplete` pair (`markTaskDoneIfShipped`, `harvestProposals`)
 * that closes/creates board tasks the moment a firing lands, and the
 * per-firing freshness readers (`readBacklogTitles`, `readInboxEntries`,
 * `activityTrail`) whose contract is "read fresh EVERY firing, never cached
 * across one". Split out of `fly.ts` (SHELL DECOMP) — pure move, no behavior
 * change.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  recentTasks,
  setTaskStatus,
  createTask,
  demoteMetricsCompletion,
  reconcileShippedTasks,
  type ReconciledTask,
  type Store,
} from '@autopilot/store';
import { MAX_PROPOSALS, firingIdOf, type GitVcs, type FiringOutcome } from '@autopilot/engine';
import { taskShouldClose } from './completion.js';
import { extractDeliverable, verifyDeliverable, verifyUxExpression } from './deliverable.js';
import {
  parseDeliverablePredicates,
  evaluateDeliverablePredicates,
} from './deliverable-predicates.js';
import { extractEpicSpec } from './epic-spec.js';
import { extractAdrSpec } from './adr-spec.js';
import { parseBacklogTitles } from './backlog.js';
import { selectInboxFiles } from './inbox.js';

/** The operator's own loop (backlog I): `<target>/INBOX/` is read fresh every firing. */
const INBOX_DIR = 'INBOX';
/** Bound how many dropped files a single firing reads (selectInboxFiles sorts first). */
const INBOX_MAX_FILES = 10;

export function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

/**
 * Close the loop the instant a firing ships: a firing that completed a board
 * task self-reports the task id as its METRICS "item"; if THAT firing is
 * gate-verified shipped, mark the task done right now — not after the whole
 * flight finishes. Machine-checked (shipped=1 comes from the engine's
 * un-fakeable cross-checks), no trust in the agent's word alone. Wired as the
 * loop's `onFiringComplete` (packages/engine/src/loop.ts) so a long flight
 * never leaves a done task stuck "queued" on the board for firings still to come.
 *
 * A firing that self-reports `"completion":"slice"` only ADVANCED the task —
 * `taskShouldClose` (apps/dashboard/src/flight/completion.ts) keeps it open
 * instead of closing it on a partial claim (SYSTEMIC fix, web-msm66jma-4w4bwr).
 *
 * DELIVERABLE verifier (web-msnqeei0-71zb5a): a "complete" claim on a task
 * whose title carries a trailing `DELIVERABLE: <clause>` is checked against
 * the shipping commit's own patch (apps/dashboard/src/flight/deliverable.ts)
 * before it's trusted. A claim that shares no vocabulary at all with what it
 * says it delivers is almost certainly a false complete — demoted to a
 * slice (both here and in the metrics row itself, so the end-of-flight
 * `reconcileShippedTasks` straggler safety net can't quietly re-close it).
 *
 * EXECUTABLE PREDICATES (flight/deliverable-predicates.ts, the UNLOCK A
 * false-close lesson — see RESEARCH-LIBRARY "Goodhart in the firing loop"):
 * before the vocabulary check, any MEASURABLE claim the clause carries
 * ("shell.ts under 300 lines", "wc -l <path> under N", "<path> exists") is
 * parsed and EXECUTED against the tree at HEAD; a failed or unverifiable
 * measurement demotes the claim no matter how plausible the patch looks.
 *
 * UX-EXPRESSION DOCTRINE (web-msnqqjl9-6v8zio): a DELIVERABLE clause that
 * promises a user-facing capability (UI/docs words like "panel", "chip",
 * "renders", "docs") must be backed by a patch that actually touches a
 * UI/Docs surface — backend-only work claiming a visible result is the same
 * false-complete pattern, demoted the same way.
 *
 * EPIC SPEC convention (web-msnswvej-u71q3p, `docs/epics/README.md`): a task
 * title carrying a trailing `EPIC-SPEC: <path>` marker (`flight/epic-spec.ts`)
 * must have that path actually committed (`GitVcs.fileExists`) before a
 * "complete" claim is trusted — a marker pointing at a spec that was never
 * committed is the same false-complete pattern as an unbacked DELIVERABLE
 * clause, demoted the same way.
 *
 * ADR convention (web-msnsxucw-dso4s5, `docs/adr/README.md`): a task title
 * carrying a trailing `ADR: <path>` marker (`flight/adr-spec.ts`) — recording
 * the record a PLAN step wrote for the architectural decision that task
 * made — must have that path actually committed before a "complete" claim
 * is trusted, the same fileExists check as EPIC-SPEC, so the documented
 * "PLAN writes an ADR" convention stays enforced rather than rotting
 * unchecked.
 */
export async function markTaskDoneIfShipped(
  store: Store,
  projectId: string,
  outcome: FiringOutcome,
  vcs: GitVcs,
): Promise<string | undefined> {
  const { shipped, item, completion, sha } = outcome.record;
  if (!shipped || !item) return undefined;
  const task = recentTasks(store.db, projectId).find(
    (t) => t.id === item && (t.status === 'queued' || t.status === 'in_progress'),
  );
  if (!task) return undefined;
  if (!taskShouldClose(completion)) {
    out(`  ↻ board task advanced (partial slice — stays open): ${task.id} — ${task.title}`);
    return undefined;
  }
  if (completion === 'complete' && sha) {
    // A refused close must reach the NEXT firing's prompt, not just the
    // operator console — three real firings (802/806/810) re-attempted one
    // close blind because the refusal reason never left the flight log.
    const demote = (reason: string): string => {
      demoteMetricsCompletion(store, projectId, sha);
      out(`  ⚠ ${reason} — demoted to slice (stays open): ${task.id} — ${task.title}`);
      return (
        `COMPLETION DEMOTED — the previous firing tagged "complete" on board task\n` +
        `${task.id} ("${task.title}") but the close verifier refused it:\n` +
        `${reason}.\n` +
        `Ship exactly the missing piece this firing, or tag "slice" honestly.`
      );
    };
    const deliverable = extractDeliverable(task.title);
    if (deliverable) {
      // EXECUTABLE PREDICATES FIRST (flight/deliverable-predicates.ts, the
      // UNLOCK A lesson): a measurable claim ("under 300 lines", "exists")
      // is MEASURED against HEAD before any soft check — vocabulary overlap
      // can confirm a claim is mentioned, never that it is met.
      const predicates = parseDeliverablePredicates(deliverable);
      if (predicates.length > 0) {
        const failure = await evaluateDeliverablePredicates(predicates, vcs);
        if (failure) return demote(`DELIVERABLE predicate FAILED (${failure})`);
      }
      const patch = await vcs.showPatch(await vcs.head());
      if (!verifyDeliverable(deliverable, patch)) {
        return demote(
          `DELIVERABLE verifier found no trace of the claim (clause: "${deliverable}")`,
        );
      }
      if (!verifyUxExpression(deliverable, patch)) {
        return demote(
          'UX-EXPRESSION DOCTRINE: claim promises a user-facing capability but the patch touches no UI/Docs surface',
        );
      }
    }
    const epicSpec = extractEpicSpec(task.title);
    if (epicSpec && !(await vcs.fileExists(epicSpec))) {
      return demote(`EPIC SPEC convention: linked spec '${epicSpec}' isn't committed`);
    }
    const adrSpec = extractAdrSpec(task.title);
    if (adrSpec && !(await vcs.fileExists(adrSpec))) {
      return demote(`ADR convention: linked record '${adrSpec}' isn't committed`);
    }
  }
  if (setTaskStatus(store, task.id, 'done', Date.now())) {
    out(`  ✓ board task done (gate-verified ship): ${task.id} — ${task.title}`);
  }
  return undefined;
}

/**
 * Mid-flight straggler reconcile (board ap-mt3d6qvs-2): `reconcileShippedTasks`
 * (packages/store/src/mutate.ts) previously only ran at flight start (self-heal
 * from whatever a PRIOR flight left behind) and flight end (catch what THIS
 * flight itself shipped, `fly.ts`) — a task shipped and merged by a SIBLING
 * flight (same shared board, different process) partway through a long flight
 * sat "queued" for every firing in between, since neither of those two spots
 * runs again until the flight ends. Wired into `onFiringComplete` alongside
 * `markTaskDoneIfShipped` so every firing catches whatever a sibling shipped
 * since the last one — `reconcileShippedTasks` is idempotent (its own doc
 * comment: "safe to call as often as needed"), so calling it this often costs
 * one cheap indexed SELECT and nothing when there's nothing to close.
 */
export function reconcileMidFlightStragglers(
  store: Store,
  projectId: string,
  updatedAt: number,
): ReconciledTask[] {
  const closed = reconcileShippedTasks(store, projectId, updatedAt);
  for (const task of closed) {
    out(`  ✓ board task done (straggler from a sibling flight): ${task.id} — ${task.title}`);
  }
  return closed;
}

/**
 * Turn one firing's PROPOSALS (offered when the board was empty) into
 * approval-pending tasks — wired as onFiringComplete so a proposed chip
 * appears seconds after the firing that offered it, instead of after the
 * whole flight ends. A proposal the agent tagged `"source":"backlog"` (lifted
 * from an open docs/BACKLOG-999.md item) is sourced 'backlog'; everything
 * else is 'self' (freshly mined). `proposedSoFar` carries the running total
 * across firings so the flight-wide MAX_PROPOSALS cap holds; returns the new total.
 */
export function harvestProposals(
  store: Store,
  projectId: string,
  outcome: FiringOutcome,
  existingTitles: Set<string>,
  proposedSoFar: number,
): number {
  let proposed = proposedSoFar;
  for (const p of outcome.record.proposals ?? []) {
    if (proposed >= MAX_PROPOSALS) break;
    const title = p.title.trim();
    if (title.length === 0 || existingTitles.has(title.toLowerCase())) continue;
    // parseProposalsLine already schema-validates severity/dimension against
    // the store's canonical enums (fail-loud: invalidTags flags a dropped tag
    // instead of losing it silently) — trust the already-validated values here.
    const created = createTask(
      store,
      {
        id: `ap-${Date.now().toString(36)}-${proposed}`,
        projectId,
        title,
        severity: p.severity,
        dimension: p.dimension,
        source: p.fromBacklog ? 'backlog' : 'self',
        status: 'needs_approval', // flights skip it until the operator approves
        createdAt: Date.now(),
      },
      (message) => out(`    ⚠ ${message}`),
    );
    if (created) {
      existingTitles.add(title.toLowerCase());
      proposed += 1;
      out(`  ✦ proposed task (awaiting your approval on the dashboard): ${title}`);
      if (p.invalidTags) {
        out(`    ⚠ dropped an out-of-enum severity/dimension tag on this proposal`);
      }
    }
  }
  return proposed;
}

/**
 * Read the flight target's own backlog file — onboarding's detected
 * `backlogPath` (BACKLOG*.md / TODO.md, whatever this repo actually has), if
 * any — as a title list for the deterministic dedupe backstop below. Most
 * target repos simply won't have one — a missing/null path or an unreadable
 * doc yields an empty list rather than failing the flight.
 */
export function readBacklogTitles(target: string, backlogPath: string | null): readonly string[] {
  if (!backlogPath) return [];
  const path = join(target, backlogPath);
  if (!existsSync(path)) return [];
  try {
    return parseBacklogTitles(readFileSync(path, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Read `<target>/INBOX/` (the operator's own loop, backlog I) fresh — a note
 * dropped mid-flight must be seen by the NEXT firing, the same freshness
 * contract the board gets (buildPrompt, below). A missing folder, or a file
 * that fails to read, is not a flight failure: this input is optional.
 */
export function readInboxEntries(target: string): readonly { name: string; content: string }[] {
  const dir = join(target, INBOX_DIR);
  if (!existsSync(dir)) return [];
  let names: string[];
  try {
    names = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name);
  } catch {
    return [];
  }
  const entries: { name: string; content: string }[] = [];
  for (const name of selectInboxFiles(names).slice(0, INBOX_MAX_FILES)) {
    try {
      entries.push({ name, content: readFileSync(join(dir, name), 'utf8') });
    } catch {
      // unreadable (binary, permissions, deleted mid-read) — skip, not fatal.
    }
  }
  return entries;
}

/** How much of a dead firing's exploration trail to hand the next firing. */
const TRAIL_MAX_LINES = 12;

/**
 * NOTHING IS LOST (the founder's principle): a firing that dies at the turn cap
 * takes its context with it — but its tool trail was recorded live (activity
 * events). Digest that trail — the LAST unique steps, freshest context first —
 * so the next firing RESUMES the exploration instead of re-paying for it.
 * (File changes were never at risk: the engine packs them into a checkpoint
 * commit; this recovers the other asset, the un-committed *knowledge*.)
 */
export function activityTrail(
  store: Store,
  projectId: string,
  firing: number,
  instanceId?: string,
): string {
  const rows = store.db
    .prepare(
      "SELECT payload FROM events WHERE project_id = ? AND firing_id = ? AND type = 'activity' ORDER BY rowid",
    )
    .all(projectId, firingIdOf(projectId, firing, instanceId)) as { payload: string }[];
  // Map preserves insertion order; delete+set on a repeat moves the key to the
  // end, so a re-touched step re-earns its freshest position instead of being
  // stuck (and truncated away) at its first occurrence.
  const lines = new Map<string, string>();
  for (const r of rows) {
    try {
      const a = JSON.parse(r.payload) as { tool?: unknown; target?: unknown };
      if (typeof a.tool !== 'string' || typeof a.target !== 'string') continue;
      const key = `${a.tool} ${a.target}`;
      lines.delete(key);
      lines.set(key, `- ${key}`);
    } catch {
      /* skip a malformed activity payload */
    }
  }
  return [...lines.values()].slice(-TRAIL_MAX_LINES).join('\n');
}
