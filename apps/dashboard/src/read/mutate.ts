// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Store-mutation wrappers (SHELL DECOMP 3/5, epic 0002 slice 5): open/mutate/
 * close around each `@autopilot/store` write, split out of read/source.ts
 * (which stays the read-model gather seam) since every function here shares
 * the same shape — open the store, delegate to one store mutation, close —
 * and has a single consumer (server/main.ts's API wiring). Every failure mode
 * (missing DB, unknown id, unmigrated/corrupt store) degrades to `false`,
 * never throws: the dashboard's write paths must fail safely, not crash it.
 */

import { existsSync } from 'node:fs';
import {
  openStore,
  migrate,
  deleteProject,
  resetProjectTelemetry,
  requestFlightPause,
  isProjectPaused,
  createTask,
  setTaskFocus,
  reorderTasks,
  unpinTasks,
  setTaskStatus,
  deleteTask,
  markSoulReviewed,
  proposeSoulAmendment,
  ratifySoulAmendment,
  dismissSoulProposal,
  unratifySoulAmendment,
  ratifyFleetWisdomAmendment,
  dismissFleetWisdomProposal,
  type Store,
} from '@autopilot/store';

/** Add a human task to a project's board (open/mutate/close; false on failure). */
export function createTaskInStore(
  dbPath: string,
  input: {
    id: string;
    projectId: string;
    title: string;
    severity?: string | null;
    dimension?: string | null;
    createdAt: number;
  },
): boolean {
  if (!existsSync(dbPath)) return false;
  let store: Store | undefined;
  try {
    store = openStore(dbPath);
    return createTask(store, input);
  } catch {
    return false;
  } finally {
    store?.close();
  }
}

/** Move a task to a new status (open/mutate/close; false on failure). */
export function setTaskStatusInStore(
  dbPath: string,
  taskId: string,
  status: string,
  updatedAt: number,
): boolean {
  if (!existsSync(dbPath)) return false;
  let store: Store | undefined;
  try {
    store = openStore(dbPath);
    return setTaskStatus(store, taskId, status, updatedAt);
  } catch {
    return false;
  } finally {
    store?.close();
  }
}

/** Delete a task outright (reject a proposal / remove an obsolete task). */
export function deleteTaskInStore(dbPath: string, taskId: string): boolean {
  if (!existsSync(dbPath)) return false;
  let store: Store | undefined;
  try {
    store = openStore(dbPath);
    return deleteTask(store, taskId);
  } catch {
    return false;
  } finally {
    store?.close();
  }
}

/**
 * Remove a project from the store (dashboard management). Opens the store,
 * deletes, closes. Never touches the project's folder or its git backup — only
 * the store record. Returns whether a project was actually removed.
 */
export function deleteProjectFromStore(dbPath: string, projectId: string): boolean {
  if (!existsSync(dbPath)) return false;
  let store: Store | undefined;
  try {
    store = openStore(dbPath);
    return deleteProject(store, projectId);
  } catch {
    return false;
  } finally {
    store?.close();
  }
}

/**
 * Mark the operator has read/ratified a project's current SOUL text (SOUL
 * evolution loop, B5 closure) — open/mutate/close; false on a missing DB,
 * unknown project id, or a throwing (unmigrated) store.
 */
export function markSoulReviewedInStore(
  dbPath: string,
  projectId: string,
  updatedAt: number,
): boolean {
  if (!existsSync(dbPath)) return false;
  let store: Store | undefined;
  try {
    store = openStore(dbPath);
    return markSoulReviewed(store, projectId, updatedAt);
  } catch {
    return false;
  } finally {
    store?.close();
  }
}

/**
 * Record a hand-written SOUL proposal from the dashboard's SOUL editor entry
 * (board web-mswqemor-ab3jsu) — the operator's way to view the live text and
 * propose an edit directly, rather than waiting for an automated post-flight
 * proposal. Goes through the exact same pending-slot + ratify/dismiss flow
 * as a mined proposal; open/mutate/close; false on a missing DB, blank text,
 * unknown project id, or a throwing (unmigrated) store.
 */
export function proposeSoulAmendmentInStore(
  dbPath: string,
  projectId: string,
  proposedText: string,
  updatedAt: number,
): boolean {
  if (!existsSync(dbPath)) return false;
  let store: Store | undefined;
  try {
    store = openStore(dbPath);
    return proposeSoulAmendment(store, projectId, proposedText, updatedAt);
  } catch {
    return false;
  } finally {
    store?.close();
  }
}

/**
 * Ratify a project's pending SOUL proposal — it becomes the live SOUL text
 * (SOUL evolution loop, B5 closure); open/mutate/close; false on a missing
 * DB, no pending proposal, unknown project id, or a throwing (unmigrated)
 * store.
 */
export function ratifySoulAmendmentInStore(
  dbPath: string,
  projectId: string,
  updatedAt: number,
): boolean {
  if (!existsSync(dbPath)) return false;
  let store: Store | undefined;
  try {
    store = openStore(dbPath);
    return ratifySoulAmendment(store, projectId, updatedAt);
  } catch {
    return false;
  } finally {
    store?.close();
  }
}

/**
 * Dismiss a project's pending SOUL proposal without applying it (SOUL
 * evolution loop, B5 closure); open/mutate/close; false on a missing DB, no
 * pending proposal, unknown project id, or a throwing (unmigrated) store.
 */
export function dismissSoulProposalInStore(
  dbPath: string,
  projectId: string,
  updatedAt: number,
): boolean {
  if (!existsSync(dbPath)) return false;
  let store: Store | undefined;
  try {
    store = openStore(dbPath);
    return dismissSoulProposal(store, projectId, updatedAt);
  } catch {
    return false;
  } finally {
    store?.close();
  }
}

/**
 * Undo a project's last SOUL ratification — restores the SOUL text ratify
 * overwrote (SOUL evolution loop, un-ratify affordance, board
 * web-mswqemor-ab3jsu); open/mutate/close; false on a missing DB, nothing to
 * undo, unknown project id, or a throwing (unmigrated) store.
 */
export function unratifySoulAmendmentInStore(
  dbPath: string,
  projectId: string,
  updatedAt: number,
): boolean {
  if (!existsSync(dbPath)) return false;
  let store: Store | undefined;
  try {
    store = openStore(dbPath);
    return unratifySoulAmendment(store, projectId, updatedAt);
  } catch {
    return false;
  } finally {
    store?.close();
  }
}

/**
 * Ratify the fleet-wide pending wisdom proposal `fly.ts`'s FLEET WISDOM
 * mining sweep (board web-msnt26xe-pc4pzp) writes — it becomes the live
 * `wisdom` text every project's SOUL is layered on top of; open/mutate/close;
 * false on a missing DB, no pending proposal, or a throwing (unmigrated)
 * store. The fleet-scoped counterpart to `ratifySoulAmendmentInStore` — one
 * pending slot for the whole fleet, not a project id.
 */
export function ratifyFleetWisdomAmendmentInStore(dbPath: string): boolean {
  if (!existsSync(dbPath)) return false;
  let store: Store | undefined;
  try {
    store = openStore(dbPath);
    return ratifyFleetWisdomAmendment(store);
  } catch {
    return false;
  } finally {
    store?.close();
  }
}

/**
 * Dismiss the fleet-wide pending wisdom proposal without applying it; the
 * live `wisdom` text is untouched. Open/mutate/close; false on a missing DB,
 * no pending proposal, or a throwing (unmigrated) store. The fleet-scoped
 * counterpart to `dismissSoulProposalInStore`.
 */
export function dismissFleetWisdomProposalInStore(dbPath: string): boolean {
  if (!existsSync(dbPath)) return false;
  let store: Store | undefined;
  try {
    store = openStore(dbPath);
    return dismissFleetWisdomProposal(store);
  } catch {
    return false;
  } finally {
    store?.close();
  }
}

/**
 * "Start over" for a project: wipe its telemetry (metrics + events) so the
 * counters restart at 0/0. The project row, board, search index, and git
 * backups all survive — a declared round reset, never a fabrication.
 */
export function resetProjectTelemetryInStore(dbPath: string, projectId: string): boolean {
  if (!existsSync(dbPath)) return false;
  let store: Store | undefined;
  try {
    store = openStore(dbPath);
    return resetProjectTelemetry(store, projectId);
  } catch {
    return false;
  } finally {
    store?.close();
  }
}

/** Graceful PAUSE: record a hold request against the project flying at `folder`. */
export function requestFlightPauseInStore(dbPath: string, folder: string): boolean {
  if (!existsSync(dbPath)) return false;
  let store: Store | undefined;
  try {
    store = openStore(dbPath);
    return requestFlightPause(store, folder);
  } catch {
    return false;
  } finally {
    store?.close();
  }
}

/** Did the flight at `folder` last end by honoring a pause request? */
export function isProjectPausedInStore(dbPath: string, folder: string): boolean {
  if (!existsSync(dbPath)) return false;
  let store: Store | undefined;
  try {
    store = openStore(dbPath);
    return isProjectPaused(store, folder);
  } catch {
    return false;
  } finally {
    store?.close();
  }
}

/** Lock/release operator focus on a task (open/mutate/close; false on failure). */
export function setTaskFocusInStore(
  dbPath: string,
  taskId: string,
  focus: boolean,
  updatedAt: number,
): boolean {
  if (!existsSync(dbPath)) return false;
  let store: Store | undefined;
  try {
    store = openStore(dbPath);
    return setTaskFocus(store, taskId, focus, updatedAt);
  } catch {
    return false;
  } finally {
    store?.close();
  }
}

/** Apply the operator's task ordering (open/mutate/close; false when nothing
 *  applied). Pins every touched task (`mutate.ts`'s `reorderTasks(..., pin:
 *  true)`) — this is the ONLY caller of `reorderTasks` reachable from an
 *  operator action (drag/↑↓ via `/api/task/reorder`), so the next triage run
 *  knows to leave these positions alone (web-mt1bwkrf-v5pnx2). */
export function reorderTasksInStore(
  dbPath: string,
  projectId: string,
  orderedIds: readonly string[],
  updatedAt: number,
): boolean {
  if (!existsSync(dbPath)) return false;
  let store: Store | undefined;
  try {
    store = openStore(dbPath);
    return reorderTasks(store, projectId, orderedIds, updatedAt, true) > 0;
  } catch {
    return false;
  } finally {
    store?.close();
  }
}

/** Release operator pins on the given tasks (open/mutate/close; false when
 *  nothing was released). The inverse `reorderTasksInStore` never had: pins
 *  were one-way since v16, so a stale operator priority stuck forever.
 *  `priority` stays untouched — the next takeoff triage re-ranks naturally. */
export function unpinTasksInStore(
  dbPath: string,
  projectId: string,
  ids: readonly string[],
  updatedAt: number,
): boolean {
  if (!existsSync(dbPath)) return false;
  let store: Store | undefined;
  try {
    store = openStore(dbPath);
    return unpinTasks(store, projectId, ids, updatedAt) > 0;
  } catch {
    return false;
  } finally {
    store?.close();
  }
}

/**
 * Bring an existing store up to this build's schema (append-only, checksum-
 * frozen migrations). The dashboard calls this ONCE at boot: its read paths
 * never migrate, so without this a DB created by an older build makes every
 * read throw on missing columns and the fleet degrades to empty — the "my
 * projects vanished" failure. Missing DB = nothing to do; failure degrades
 * silently (reads then show empty, never crash).
 */
export function ensureStoreMigrated(dbPath: string): boolean {
  if (!existsSync(dbPath)) return false;
  let store: Store | undefined;
  try {
    store = openStore(dbPath);
    migrate(store);
    return true;
  } catch {
    return false;
  } finally {
    store?.close();
  }
}
