// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * AUTO MODE (operator, 2026-09-26): a project can let the tasks its firings
 * propose enter the pool on their own, instead of each waiting for the
 * operator's ✓. Off until the operator turns it on, per project.
 *
 * The setting is an `events` row (type `'auto-approve-setting'`), the latest
 * one winning — no migration, and every change keeps its own history.
 *
 * What auto mode never takes from the operator:
 *   - `OPERATOR ...` tasks: work only a person can do, which no lane claims;
 *   - `VERDICT blocked ...`: a blocker only a person can lift;
 *   - `VERDICT close ...`: approving one CLOSES the tasks it names — a
 *     judgement on existing work, not new work entering the pool.
 * Those still wait for the ✓. An auto-approved task records an
 * `'auto-approved'` event, never the operator's `'approved'` evaluation
 * label: the approval-rate signal stays the operator's own judgement.
 */

import type { Store } from './db.js';
import { isClaimableTitle } from './mutate.js';

export const AUTO_APPROVE_SETTING_EVENT = 'auto-approve-setting';
export const AUTO_APPROVED_EVENT = 'task-auto-approved';

const VERDICT_CLOSE_PREFIX_RE = /^VERDICT close/i;

/** Whether this project's proposals enter the pool without the operator. */
export function isAutoApproveOn(store: Store, projectId: string): boolean {
  const row = store.db
    .prepare(
      `SELECT payload FROM events
        WHERE project_id = ? AND type = ?
        ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .get(projectId, AUTO_APPROVE_SETTING_EVENT) as { payload: string | null } | undefined;
  if (!row?.payload) return false;
  try {
    return (JSON.parse(row.payload) as { enabled?: unknown }).enabled === true;
  } catch {
    return false;
  }
}

/** Turn auto mode on or off for one project. False for an unknown project. */
export function setAutoApprove(
  store: Store,
  projectId: string,
  enabled: boolean,
  at: number,
): boolean {
  try {
    const info = store.db
      .prepare(
        'INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, NULL, ?, ?, ?)',
      )
      .run(projectId, AUTO_APPROVE_SETTING_EVENT, JSON.stringify({ enabled }), at);
    return info.changes > 0;
  } catch {
    return false; // unknown project (FK)
  }
}

/** Whether a proposal with this title may skip the operator in auto mode. */
export function isAutoApprovable(title: string): boolean {
  return isClaimableTitle(title) && !VERDICT_CLOSE_PREFIX_RE.test(title.trim());
}

/** Record that a proposal entered the pool on auto mode, for the audit trail. */
export function recordAutoApproved(
  store: Store,
  projectId: string,
  taskId: string,
  title: string,
  at: number,
): void {
  store.db
    .prepare(
      'INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, NULL, ?, ?, ?)',
    )
    .run(projectId, AUTO_APPROVED_EVENT, JSON.stringify({ taskId, title }), at);
}
