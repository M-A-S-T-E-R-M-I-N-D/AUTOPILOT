// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Store mutations that aren't part of the flight/onboard write paths — dashboard
 * management actions. Kept separate from read.ts (pure reads) so the mutation
 * surface is explicit and small.
 */

import type { Store } from './db.js';

const REPLACEMENT_CHAR = '�';

/**
 * Strip the Unicode replacement character (U+FFFD) — what encoding-mismatched
 * bytes decode to (e.g. UTF-8 read through a mismatched console codepage, the
 * source of a past batch of corrupted seeded titles). Stray occurrences are
 * dropped; text that is entirely replacement characters comes back empty so
 * the caller's blank-title guard rejects it outright.
 */
function stripMojibake(text: string): { value: string; stripped: boolean } {
  if (!text.includes(REPLACEMENT_CHAR)) return { value: text, stripped: false };
  return { value: text.split(REPLACEMENT_CHAR).join(''), stripped: true };
}

/**
 * Remove a project and everything the store holds for it. The FK `ON DELETE
 * CASCADE` on events/metrics/tasks/versions/project_index(_meta) does most of the
 * work; the FTS5 `project_search` table and the sqlite-vec `project_vectors`
 * table both have no foreign key (vectors are also lazily created — only
 * present if the extension loaded), so both are cleared explicitly. Returns
 * true if a project row was actually removed. Never touches the project's
 * folder on disk or its git backup — those stay the user's.
 */
export function deleteProject(store: Store, projectId: string): boolean {
  const tx = store.db.transaction((id: string): boolean => {
    store.db.prepare('DELETE FROM project_search WHERE project_id = ?').run(id);
    const vectorTableExists = store.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'project_vectors'")
      .get();
    if (vectorTableExists) {
      store.db.prepare('DELETE FROM project_vectors WHERE project_id = ?').run(id);
    }
    const info = store.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    return info.changes > 0;
  });
  return tx(projectId);
}

/**
 * "Start over": a DECLARED round reset — wipe the project's telemetry (metrics
 * + firing/activity events) so ship-rate counters restart at 0/0, while the
 * project itself, its board, its search index, and its git backups all survive.
 * Honest by design: it never fabricates success, it starts a fresh round.
 */
export function resetProjectTelemetry(store: Store, projectId: string): boolean {
  const tx = store.db.transaction((id: string): boolean => {
    const exists = store.db.prepare('SELECT 1 FROM projects WHERE id = ?').get(id);
    if (!exists) return false;
    store.db.prepare('DELETE FROM metrics WHERE project_id = ?').run(id);
    store.db.prepare('DELETE FROM events WHERE project_id = ?').run(id);
    // Firing numbering has to restart too, or "fresh round" is a lie. Until
    // migration v22 this was implicit — the next number was COUNT(*) + 1 over
    // metrics, so clearing metrics reset it. v22 moved allocation to the
    // durable `firing_seq` table (to stop concurrent lanes racing the same
    // number) and this reset was never taught about it, so a project that
    // started over after 40 firings silently kept counting at 41.
    store.db.prepare('DELETE FROM firing_seq WHERE project_id = ?').run(id);
    return true;
  });
  return tx(projectId);
}

/**
 * Request that the flight running against `rootPath` hold after its current
 * firing instead of starting another (graceful PAUSE). Purely a request flag —
 * the flight loop's own stop-check (apps/dashboard/src/fly.ts) is what actually
 * honors it between firings and lands the project on `status = 'paused'`.
 * Returns false when no project matches that root path.
 */
export function requestFlightPause(store: Store, rootPath: string): boolean {
  const info = store.db
    .prepare('UPDATE projects SET pause_requested = 1 WHERE root_path = ?')
    .run(rootPath);
  return info.changes > 0;
}

/** Is the project at `rootPath` currently held (paused, not flying)? */
export function isProjectPaused(store: Store, rootPath: string): boolean {
  const row = store.db.prepare('SELECT status FROM projects WHERE root_path = ?').get(rootPath) as
    { status: string } | undefined;
  return row?.status === 'paused';
}

/**
 * Mark the operator has read/ratified the project's current SOUL text (SOUL
 * evolution loop, B5 closure) — clears the "unreviewed" state a project
 * starts in when its LLM-generated starter SOUL is registered (schema v13
 * defaults `soul_reviewed` to 0). Idempotent; returns false for an unknown
 * project id.
 */
export function markSoulReviewed(store: Store, projectId: string, updatedAt: number): boolean {
  const info = store.db
    .prepare('UPDATE projects SET soul_reviewed = 1, updated_at = ? WHERE id = ?')
    .run(updatedAt, projectId);
  return info.changes > 0;
}

/**
 * Record a pending SOUL amendment (SOUL evolution loop, B5 closure, schema
 * v14) — the storage a future post-flight step writes to when it PROPOSES a
 * diff mined from recent learnings. Never touches the live `soul` text or
 * `soul_reviewed`; a proposal only takes effect once the operator calls
 * ratifySoulAmendment. Overwrites any prior pending proposal (one pending
 * proposal per project — the newest supersedes the last unresolved one).
 * Returns false for an unknown project or a blank proposal.
 */
export function proposeSoulAmendment(
  store: Store,
  projectId: string,
  proposedText: string,
  updatedAt: number,
): boolean {
  const text = proposedText.trim();
  if (text.length === 0) return false;
  const info = store.db
    .prepare('UPDATE projects SET soul_proposed = ?, soul_proposed_at = ? WHERE id = ?')
    .run(text, updatedAt, projectId);
  return info.changes > 0;
}

/**
 * Ratify the pending SOUL proposal: it becomes the live `soul` text, the
 * project is marked reviewed (an operator who just approved a diff has, by
 * construction, read the result), and the pending slot clears. A no-op
 * (false) when there is no pending proposal to ratify. Also records an
 * `'approved'` evaluation label ({@link recordEvaluationLabel}) — a SOUL
 * proposal is as much an operator judgment on agent-authored content as a
 * self-proposed task's approve/reject, so it feeds the same human-vs-agent
 * capture the task-status/delete paths already do.
 *
 * Snapshots the `soul` text it is about to overwrite into `soul_previous`
 * (schema v17) so a mistaken ratify — the incident that opened board item
 * web-mswqemor-ab3jsu, an operator ratified by mistake and had the flag
 * "restored by hand" — can be undone with {@link unratifySoulAmendment}
 * instead of a manual SQL edit.
 */
export function ratifySoulAmendment(store: Store, projectId: string, updatedAt: number): boolean {
  const info = store.db
    .prepare(
      `UPDATE projects
          SET soul_previous = soul,
              soul_previous_at = ?,
              soul = soul_proposed,
              soul_reviewed = 1,
              soul_proposed = NULL,
              soul_proposed_at = NULL,
              updated_at = ?
        WHERE id = ? AND soul_proposed IS NOT NULL`,
    )
    .run(updatedAt, updatedAt, projectId);
  if (info.changes > 0) {
    recordEvaluationLabel(
      store,
      projectId,
      `soul:${projectId}`,
      'SOUL proposal',
      'approved',
      updatedAt,
    );
  }
  return info.changes > 0;
}

/**
 * Undo a ratified SOUL proposal (SOUL evolution loop, un-ratify affordance,
 * board web-mswqemor-ab3jsu) — restores the live `soul` text from the
 * `soul_previous` snapshot {@link ratifySoulAmendment} took, then clears the
 * snapshot. One level of undo: un-ratifying twice in a row is a no-op the
 * second time, and a later ratify overwrites the snapshot with whatever was
 * live at that point. Records a `'rejected'` evaluation label ({@link
 * recordEvaluationLabel}), reversing the `'approved'` one ratify recorded. A
 * no-op (false) when there is nothing to undo, an unknown project id, or a
 * throwing (unmigrated) store.
 */
export function unratifySoulAmendment(store: Store, projectId: string, updatedAt: number): boolean {
  const info = store.db
    .prepare(
      `UPDATE projects
          SET soul = soul_previous,
              soul_previous = NULL,
              soul_previous_at = NULL,
              updated_at = ?
        WHERE id = ? AND soul_previous_at IS NOT NULL`,
    )
    .run(updatedAt, projectId);
  if (info.changes > 0) {
    recordEvaluationLabel(
      store,
      projectId,
      `soul:${projectId}`,
      'SOUL proposal',
      'rejected',
      updatedAt,
    );
  }
  return info.changes > 0;
}

/**
 * Reject the pending SOUL proposal without applying it — the live `soul`
 * text and `soul_reviewed` are untouched, only the pending slot clears. A
 * no-op (false) when there is no pending proposal to dismiss. Also records a
 * `'rejected'` evaluation label ({@link recordEvaluationLabel}), the SOUL
 * counterpart to a self-proposed task's deletion.
 */
export function dismissSoulProposal(store: Store, projectId: string, updatedAt: number): boolean {
  const info = store.db
    .prepare(
      `UPDATE projects
          SET soul_proposed = NULL,
              soul_proposed_at = NULL,
              updated_at = ?
        WHERE id = ? AND soul_proposed IS NOT NULL`,
    )
    .run(updatedAt, projectId);
  if (info.changes > 0) {
    recordEvaluationLabel(
      store,
      projectId,
      `soul:${projectId}`,
      'SOUL proposal',
      'rejected',
      updatedAt,
    );
  }
  return info.changes > 0;
}

/**
 * Record a pending fleet-wide wisdom amendment (schema v20, board
 * web-msnt26xe-pc4pzp) — the storage `flight/fleet-wisdom-mining.ts`'s pure
 * `mineFleetWisdom` writes to once a learning has generalized across enough
 * distinct projects. Mirrors `proposeSoulAmendment`'s contract at fleet
 * scope: overwrites any prior pending proposal (one pending proposal for the
 * whole fleet — the newest supersedes the last unresolved one), never
 * touches the live `wisdom` text until the operator calls
 * `ratifyFleetWisdomAmendment`. Returns false for a blank proposal.
 */
export function proposeFleetWisdomAmendment(
  store: Store,
  proposedText: string,
  updatedAt: number,
): boolean {
  const text = proposedText.trim();
  if (text.length === 0) return false;
  const info = store.db
    .prepare(`UPDATE fleet SET wisdom_proposed = ?, wisdom_proposed_at = ? WHERE id = 'fleet'`)
    .run(text, updatedAt);
  return info.changes > 0;
}

/**
 * Ratify the pending fleet wisdom proposal: it becomes the live `wisdom`
 * text every project's SOUL is layered on top of, and the pending slot
 * clears. A no-op (false) when there is no pending proposal to ratify.
 */
export function ratifyFleetWisdomAmendment(store: Store): boolean {
  const info = store.db
    .prepare(
      `UPDATE fleet
          SET wisdom = wisdom_proposed,
              wisdom_proposed = NULL,
              wisdom_proposed_at = NULL
        WHERE id = 'fleet' AND wisdom_proposed IS NOT NULL`,
    )
    .run();
  return info.changes > 0;
}

/**
 * Reject the pending fleet wisdom proposal without applying it — the live
 * `wisdom` text is untouched, only the pending slot clears. A no-op (false)
 * when there is no pending proposal to dismiss.
 */
export function dismissFleetWisdomProposal(store: Store): boolean {
  const info = store.db
    .prepare(
      `UPDATE fleet
          SET wisdom_proposed = NULL,
              wisdom_proposed_at = NULL
        WHERE id = 'fleet' AND wisdom_proposed IS NOT NULL`,
    )
    .run();
  return info.changes > 0;
}

export interface CreateTaskInput {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly severity?: string | null;
  readonly dimension?: string | null;
  /** 'dashboard' (human, the default), 'self' (autopilot-mined proposal),
   * 'backlog' (autopilot proposal lifted from an open docs/BACKLOG-999.md item —
   * both proposal sources await the operator's approval the same way),
   * 'inbox' (auto-triaged from an operator note dropped in `INBOX/`, already
   * human-authored so it goes straight to 'queued' like 'dashboard' does), or
   * 'github' (accepted by the KEEPER triage ritual from an upstream issue —
   * see `flight/issue-triage.ts`'s `planIssueTriageTask`). */
  readonly source?: 'dashboard' | 'self' | 'backlog' | 'inbox' | 'github';
  /** 'queued' (workable, the default) or 'needs_approval' (proposed — flights skip it). */
  readonly status?: 'queued' | 'needs_approval';
  readonly createdAt: number;
}

/**
 * Add a task to a project's board — human-created (`source: 'dashboard'`, the
 * default) or autopilot-proposed (`source: 'self'` mined fresh, or `'backlog'`
 * lifted from docs/BACKLOG-999.md). Returns false (never throws) when the
 * project is missing, the title is blank (or is nothing but mojibake once
 * U+FFFD is stripped), or a CHECK constraint rejects a value — the dashboard
 * degrades, it doesn't crash. This is the ONE write path every ingestion
 * source (dashboard form, self-mined proposals, and any future chat/API
 * ingestion) funnels through, so stripping mojibake here guards all of them
 * at once; `warn`, if given, is called when stripping actually changed the title.
 */
export function createTask(
  store: Store,
  input: CreateTaskInput,
  warn?: (message: string) => void,
): boolean {
  const { value: cleanedTitle, stripped } = stripMojibake(input.title);
  const title = cleanedTitle.trim();
  if (title.length === 0) return false;
  if (stripped) warn?.(`stripped mojibake (U+FFFD) from task title: "${title}"`);
  try {
    const info = store.db
      .prepare(
        `INSERT INTO tasks (id, project_id, title, status, severity, dimension, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.projectId,
        title,
        input.status ?? 'queued',
        input.severity ?? null,
        input.dimension ?? null,
        input.source ?? 'dashboard',
        input.createdAt,
        input.createdAt,
      );
    return info.changes > 0;
  } catch {
    return false; // missing project (FK), duplicate id, or CHECK-rejected value
  }
}

/**
 * Records one operator VERDICT on agent-authored content as an `events` row
 * (type `'evaluation-label'`) — the "harder half" of the human-vs-agent
 * self-study slice (MASTER-PLAN.md §17.3: every human approve/reject/edit is
 * the fitness signal that Goodhart-guards the gate; PAPER.md §6 originally
 * noted none of this was captured anywhere in the store). Two callers today:
 * a self-proposed (`source: 'self'`) task's approve/reject via
 * `setTaskStatus`/`deleteTask`, and a SOUL amendment's ratify/dismiss via
 * `ratifySoulAmendment`/`dismissSoulProposal` — both are operator judgments
 * on something the agent authored, not the operator's own hand-typed content.
 * Reuses the existing generic `events` table rather than a new one (no
 * migration) — the same un-fakeable-chain convention `fly.ts`'s
 * activity/intent-collision events already use; `evaluationLabelEvents` /
 * `evaluationLabelSummary` (`read.ts`) read them back.
 */
function recordEvaluationLabel(
  store: Store,
  projectId: string,
  taskId: string,
  title: string,
  verdict: 'approved' | 'rejected',
  createdAt: number,
): void {
  store.db
    .prepare(
      'INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, NULL, ?, ?, ?)',
    )
    .run(projectId, 'evaluation-label', JSON.stringify({ taskId, title, verdict }), createdAt);
}

/**
 * Delete a task outright — the operator's "reject / remove" (a dismissed
 * proposal or an obsolete task). Returns whether a row was actually removed.
 * A self-proposed (`source: 'self'`) task's deletion also records a
 * `'rejected'` evaluation label ({@link recordEvaluationLabel}) — deleting
 * the agent's own proposal, approved or not yet, is the clearest "reject"
 * verdict short of an in-app rating.
 */
export function deleteTask(store: Store, taskId: string, nowMs = Date.now()): boolean {
  const before = store.db
    .prepare('SELECT project_id, title, source FROM tasks WHERE id = ?')
    .get(taskId) as { project_id: string; title: string; source: string } | undefined;
  const info = store.db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
  if (info.changes > 0 && before && before.source === 'self') {
    recordEvaluationLabel(store, before.project_id, taskId, before.title, 'rejected', nowMs);
  }
  return info.changes > 0;
}

/**
 * Lock (or release) the operator's FOCUS on a task. Focused open tasks are the
 * ONLY work a flight will do (WIP-limit-1 discipline) until done or un-focused.
 * Mirrors setTaskStatus's own guard: a task already 'done'/'deferred' can never
 * have focus forced back to 1 here either, closing the race where a stale
 * `/api/task/focus` POST lands after a flight has already closed the task —
 * without this, focus gets stuck on a closed task with no UI left to clear it,
 * since the focus toggle only renders for workable (queued/in_progress) tasks.
 */
export function setTaskFocus(
  store: Store,
  taskId: string,
  focus: boolean,
  updatedAt: number,
): boolean {
  const info = store.db
    .prepare(
      `UPDATE tasks
          SET focus = CASE WHEN status IN ('done', 'deferred') THEN 0 ELSE ? END,
              updated_at = ?
        WHERE id = ?`,
    )
    .run(focus ? 1 : 0, updatedAt, taskId);
  return info.changes > 0;
}

/**
 * Apply an explicit ordering: priority = position in `orderedIds` (lower =
 * sooner). One transaction; ids not in the project are ignored. Returns how
 * many tasks were re-prioritized.
 *
 * `pin: true` (the operator's own reorder — drag or ↑/↓, `read/source.ts`'s
 * `reorderTasksInStore`) additionally marks every touched task
 * `priority_pinned`, so `fly.ts`'s `runBoardTriage` knows to leave it exactly
 * where the operator put it rather than folding it back into the model's
 * ranking on the next takeoff (web-mt1bwkrf-v5pnx2 — operator order always
 * outranks triage). `pin: false` (the default; triage's own writes) never
 * touches the flag, so a previously-pinned task STAYS pinned across a triage
 * run that merely re-numbers `priority` around it.
 */
export function reorderTasks(
  store: Store,
  projectId: string,
  orderedIds: readonly string[],
  updatedAt: number,
  pin = false,
): number {
  const update = store.db.prepare(
    pin
      ? 'UPDATE tasks SET priority = ?, priority_pinned = 1, updated_at = ? WHERE id = ? AND project_id = ?'
      : 'UPDATE tasks SET priority = ?, updated_at = ? WHERE id = ? AND project_id = ?',
  );
  const tx = store.db.transaction((): number => {
    let changed = 0;
    for (let i = 0; i < orderedIds.length; i += 1) {
      const id = orderedIds[i];
      if (id === undefined) continue;
      changed += update.run(i, updatedAt, id, projectId).changes;
    }
    return changed;
  });
  return tx();
}

/**
 * Release operator pins (the ↑/↓-reorder's one-way flag finally gets its
 * inverse — pins were set-only since v16, so a stale operator priority stuck
 * forever and a pinned-but-speculative task re-taxed every round). Clears
 * `priority_pinned` ONLY: `priority` itself is left untouched, so the task
 * keeps its slot until the next takeoff triage folds it back into the
 * model's own ranking. One transaction; ids not in the project (or not
 * pinned) simply don't count. Returns how many pins were actually released.
 */
export function unpinTasks(
  store: Store,
  projectId: string,
  ids: readonly string[],
  updatedAt: number,
): number {
  const update = store.db.prepare(
    'UPDATE tasks SET priority_pinned = 0, updated_at = ? WHERE id = ? AND project_id = ? AND priority_pinned = 1',
  );
  const tx = store.db.transaction((): number => {
    let changed = 0;
    for (const id of ids) changed += update.run(updatedAt, id, projectId).changes;
    return changed;
  });
  return tx();
}

/** Every task-id shape the board mints (`web-<ts36>-<rand>`, `ap-<ts36>-<n>`,
 *  `inbox-<slug>`, `github-<issue#>`) — mirrors the dashboard's own
 *  `VERDICT_TASK_ID_RE` (flight/completion.ts, which defers these same ids
 *  the moment a `VERDICT close`/`blocked` proposal is minted) so
 *  approval-time cascade and proposal-time defer agree on what a verdict
 *  NAMES. Duplicated rather than imported: packages/store sits below
 *  apps/dashboard in the dependency graph. */
const VERDICT_TASK_ID_RE =
  /(?:web|ap)-[a-z0-9]+-[a-z0-9]+|inbox-[a-z0-9]+(?:-[a-z0-9]+)*|github-[0-9]+/g;

/** A `VERDICT close ...` proposal specifically (not `blocked`/`split`/
 *  `deprioritize`) — the only verdict kind {@link setTaskStatus} cascades on
 *  approval, since "close" is the one verdict that already asserts a
 *  decision rather than flagging something for a human to still resolve. */
const VERDICT_CLOSE_KIND_RE = /^VERDICT close\b/i;

/**
 * Move a task to a new status (the board's state machine — values enforced by
 * the schema CHECK). Returns false for an unknown task or an invalid status.
 * Landing on 'done' or 'deferred' also releases operator FOCUS: setTaskFocus's
 * own contract says focus holds "until done or un-focused", but a task closed
 * via this path (ship-triggered, reconciled, or manually closed) never goes
 * through setTaskFocus — leaving focus=1 stuck forever with no UI to clear it,
 * since the focus toggle only renders for workable (queued/in_progress) tasks.
 *
 * When this transitions a self-proposed task OUT of `needs_approval` into
 * `queued` (the ✓ approve action — `shell.ts`'s "Approve a PROPOSED task"),
 * it also records an `'approved'` evaluation label
 * ({@link recordEvaluationLabel}) — the approve/reject counterpart to
 * {@link deleteTask}'s reject capture.
 *
 * APPROVED-VERDICT CASCADE (board web-mt5g8l1w-p2dddo): approving a
 * self-proposed `VERDICT close ...` task is the operator agreeing the named
 * tasks should close — not minting new workable content. Requesting `queued`
 * on one instead lands the verdict task itself on `done` (retired, never
 * queued as work) and cascades `done` onto every open task its title NAMES
 * ({@link VERDICT_TASK_ID_RE}), matching `flight/completion.ts`'s
 * `verdictDeferTargets` convention for what a verdict "names". The
 * `'approved'` evaluation label still records against the verdict task, and
 * the requested status stays `queued` for every non-`VERDICT close` proposal
 * (a `blocked`/`split`/`deprioritize` verdict, or an ordinary task) — this
 * only changes the one case where "approve" previously meant "queue a
 * decision as if it were a chore".
 */
export function setTaskStatus(
  store: Store,
  taskId: string,
  status: string,
  updatedAt: number,
): boolean {
  try {
    return store.db.transaction((): boolean => {
      const before = store.db
        .prepare('SELECT project_id, title, status, source FROM tasks WHERE id = ?')
        .get(taskId) as
        { project_id: string; title: string; status: string; source: string } | undefined;
      const isApproval =
        before !== undefined &&
        before.source === 'self' &&
        before.status === 'needs_approval' &&
        status === 'queued';
      const isVerdictClose = isApproval && VERDICT_CLOSE_KIND_RE.test(before!.title);
      const finalStatus = isVerdictClose ? 'done' : status;

      const info = store.db
        .prepare(
          `UPDATE tasks
              SET status = ?, focus = CASE WHEN ? IN ('done', 'deferred') THEN 0 ELSE focus END,
                  updated_at = ?
            WHERE id = ?`,
        )
        .run(finalStatus, finalStatus, updatedAt, taskId);
      if (info.changes === 0 || !before) return info.changes > 0;

      if (isVerdictClose) {
        const namedIds = [...new Set(before.title.match(VERDICT_TASK_ID_RE) ?? [])];
        const closeNamed = store.db.prepare(
          `UPDATE tasks SET status = 'done', focus = 0, updated_at = ?
            WHERE id = ? AND project_id = ? AND status != 'done'`,
        );
        for (const namedId of namedIds) closeNamed.run(updatedAt, namedId, before.project_id);
      }

      if (isApproval) {
        recordEvaluationLabel(
          store,
          before.project_id,
          taskId,
          before.title,
          'approved',
          updatedAt,
        );
      }
      return true;
    })();
  } catch {
    return false; // CHECK-rejected status
  }
}

/**
 * PARALLEL UNLOCK C (board task-CLAIMING): reserve a task for ONE flight
 * INSTANCE so a same-folder N-way fleet (`flight/registry.ts`) never has two
 * concurrent instances both work the SAME board task — the race a naive
 * "read the board, work the top item" loop would hit the instant more than
 * one instance can fly the same folder at once. Atomic: SQLite serializes
 * writes, so this single UPDATE's WHERE clause is race-proof even when two
 * instances call it in the same millisecond — only the write that actually
 * matches a still-unclaimed (or self-already-claimed) row succeeds; a
 * concurrent loser sees `assignee` already set to someone else and gets
 * `false` back. Flips a fresh 'queued' claim to 'in_progress'; re-claiming a
 * task this SAME instanceKey already holds is a no-op status-wise. Refuses a
 * task another instanceKey holds, or one that isn't workable at all ('done',
 * 'deferred', 'needs_approval').
 *
 * OPERATOR tasks are un-claimable by ANY instance: a title starting with
 * "OPERATOR" marks work only the human can do (a machine upgrade, a policy
 * decision) — observed live 2026-09-02, a lane burned two no-ship firings on
 * the node-upgrade task before benching it, and status juggling alone kept
 * leaking such tasks back into the autonomous path. The claim gate is the
 * one chokepoint every lane must pass, so the ownership boundary lives here,
 * not in whichever status the task happens to hold today. Prefix-anchored on
 * purpose: a task merely MENTIONING the word mid-title stays claimable.
 */
export function claimTask(
  store: Store,
  taskId: string,
  instanceKey: string,
  updatedAt: number,
): boolean {
  const info = store.db
    .prepare(
      `UPDATE tasks
          SET assignee = ?,
              status = CASE WHEN status = 'queued' THEN 'in_progress' ELSE status END,
              updated_at = ?
        WHERE id = ?
          AND status IN ('queued', 'in_progress')
          AND (assignee IS NULL OR assignee = ?)
          AND title NOT LIKE 'OPERATOR%'`,
    )
    .run(instanceKey, updatedAt, taskId, instanceKey);
  return info.changes > 0;
}

/**
 * Hand a claimed-but-unworked task back to the fleet — back to 'queued',
 * unassigned — so a sibling instance's next board read sees it again instead
 * of it being stranded, invisible, until the claiming instance's own next
 * firing. Called when a firing claimed a task pre-firing (steering it toward
 * the board's top pick) but then actually shipped something else (a
 * deliberate PICK DISCIPLINE deviation) or shipped nothing at all — an
 * abandoned claim must never starve the rest of the fleet. A no-op (false)
 * for a task `instanceKey` doesn't currently hold, or one already resolved
 * to a terminal status.
 */
export function releaseTaskClaim(
  store: Store,
  taskId: string,
  instanceKey: string,
  updatedAt: number,
): boolean {
  const info = store.db
    .prepare(
      `UPDATE tasks
          SET assignee = NULL,
              status = 'queued',
              updated_at = ?
        WHERE id = ?
          AND assignee = ?
          AND status = 'in_progress'`,
    )
    .run(updatedAt, taskId, instanceKey);
  return info.changes > 0;
}

/**
 * Flight-end claim sweep: hand EVERY task this instance still holds back to
 * the fleet — 'queued', unassigned. `releaseTaskClaim` above covers the
 * per-firing endings ("shipped something else" / "shipped nothing"), but a
 * firing that ships a SLICE of its claimed task keeps the claim on purpose
 * (sticky lease — the same instance's next firing continues the unit). When
 * the FLIGHT then ends, nothing released those leases: two BRAND tasks sat
 * `in_progress` for three days assigned to long-dead instances (observed
 * 2026-08-20), reading as live work on the board and inflating the
 * openFindings gauge. Called from the flight's `finally` (skipped on pause —
 * a paused flight's claims are deliberately kept for its own Resume).
 * Returns how many claims were handed back (0 = clean end, nothing held).
 * Crash paths that skip `finally` (SIGKILL, power loss) still need the
 * stale-claim reaper — this sweep only owns the orderly endings.
 */
export function releaseInstanceClaims(
  store: Store,
  projectId: string,
  instanceKey: string,
  updatedAt: number,
): number {
  const info = store.db
    .prepare(
      `UPDATE tasks
          SET assignee = NULL,
              status = 'queued',
              updated_at = ?
        WHERE project_id = ?
          AND assignee = ?
          AND status = 'in_progress'`,
    )
    .run(updatedAt, projectId, instanceKey);
  return info.changes;
}

export interface ReconciledTask {
  readonly id: string;
  readonly title: string;
}

/** Default staleness threshold {@link releaseStaleClaims} ages a claim out at. */
export const DEFAULT_STALE_CLAIM_MS = 24 * 60 * 60 * 1000;

/**
 * FLEET STALE-CLAIM REAPER: release every 'in_progress' + assigned task whose
 * `updated_at` hasn't moved in `maxAgeMs` — the crash-path counterpart
 * {@link releaseInstanceClaims}'s own doc comment names as still owed. That
 * sweep only runs from fly.ts's `finally`, so it covers orderly flight ends;
 * a crashed instance (SIGKILL, power loss) skips `finally` entirely and its
 * claim is stranded with no `instanceKey` left to hand it back through. Two
 * BRAND tasks sat `in_progress`, assigned to long-dead instances, for three
 * days before this existed (observed 2026-08-20) — invisible on the board as
 * "still running" work and inflating the openFindings gauge the whole time.
 *
 * Board-wide by design, not scoped to one `instanceKey`: a dead instance
 * can't identify itself, so this ages out ANY claim past the threshold no
 * matter who holds it. `updated_at` is the right clock because `claimTask`
 * touches it on every re-claim a live instance's firing makes (even when
 * status doesn't change) — a claim's `updated_at` only goes stale when
 * nothing is left alive to keep refreshing it. Returns the tasks it released.
 */
export function releaseStaleClaims(
  store: Store,
  projectId: string,
  maxAgeMs: number,
  nowMs: number,
): ReconciledTask[] {
  const cutoff = nowMs - maxAgeMs;
  const release = store.db.prepare(
    `UPDATE tasks
        SET assignee = NULL,
            status = 'queued',
            updated_at = ?
      WHERE id = ?
        AND project_id = ?
        AND status = 'in_progress'
        AND assignee IS NOT NULL
        AND updated_at < ?`,
  );
  const tx = store.db.transaction((): ReconciledTask[] => {
    const candidates = store.db
      .prepare(
        `SELECT id, title FROM tasks
          WHERE project_id = ? AND status = 'in_progress' AND assignee IS NOT NULL
            AND updated_at < ?`,
      )
      .all(projectId, cutoff) as ReconciledTask[];
    const released: ReconciledTask[] = [];
    for (const task of candidates) {
      if (release.run(nowMs, task.id, projectId, cutoff).changes > 0) released.push(task);
    }
    return released;
  });
  return tx();
}

/**
 * Straggler safety net: close every open task that already has a gate-verified
 * shipped metrics record, no matter when that ship happened. A per-firing hook
 * (packages/engine/src/loop.ts `onFiringComplete`) marks a task done the
 * instant its own firing ships it, but that hook only runs if the flight
 * process reaches it — a crash, an early exit, or a task shipped before the
 * hook existed can all leave a done task stuck "queued". Callers should run
 * this BOTH at the start of a flight (self-heal from whatever a prior flight
 * left behind) and at the end (catch what this flight itself shipped, in case
 * the per-firing hook wasn't wired). Idempotent — safe to call as often as
 * needed. Returns the tasks it closed.
 *
 * A firing that self-reported `"completion":"slice"` only ADVANCED its linked
 * task, not finished it — excluded here so a partial-slice claim can never
 * close the whole task (the systemic bug this field exists to fix). A NULL
 * completion (every firing before this field existed, or a commit-inferred
 * ship) is trusted whole, same as before.
 */
export function reconcileShippedTasks(
  store: Store,
  projectId: string,
  updatedAt: number,
): ReconciledTask[] {
  const shippedItems = store.db
    .prepare(
      `SELECT DISTINCT item FROM metrics
        WHERE project_id = ? AND shipped = 1 AND item IS NOT NULL
          AND (completion IS NULL OR completion = 'complete')`,
    )
    .all(projectId) as { item: string }[];
  if (shippedItems.length === 0) return [];
  const shippedSet = new Set(shippedItems.map((r) => r.item));

  const openTasks = store.db
    .prepare(
      "SELECT id, title FROM tasks WHERE project_id = ? AND status IN ('queued','in_progress')",
    )
    .all(projectId) as ReconciledTask[];

  const closed: ReconciledTask[] = [];
  for (const task of openTasks) {
    if (shippedSet.has(task.id) && setTaskStatus(store, task.id, 'done', updatedAt)) {
      closed.push(task);
    }
  }
  return closed;
}

/**
 * Demote a shipped firing's self-reported "complete" to "slice" — the
 * DELIVERABLE verifier's correction (BACKLOG web-msnqeei0-71zb5a) when a
 * task's title carries a DELIVERABLE clause but the shipping commit's patch
 * never mentions it: the claim is untrustworthy, so it's downgraded to a
 * partial slice instead of trusted whole. This is what keeps
 * `reconcileShippedTasks`'s straggler safety net (which reads `completion`
 * straight from this table) from re-closing the task behind the verifier's
 * back later in the same flight. Matched by `sha` — the exact commit this
 * firing's metrics row recorded — so it can never touch a different
 * firing's row. Only demotes an actual 'complete' row; returns true if one was.
 */
export function demoteMetricsCompletion(store: Store, projectId: string, sha: string): boolean {
  const info = store.db
    .prepare(
      `UPDATE metrics SET completion = 'slice'
        WHERE project_id = ? AND sha = ? AND completion = 'complete'`,
    )
    .run(projectId, sha);
  return info.changes > 0;
}
