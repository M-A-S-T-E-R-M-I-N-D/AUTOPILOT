// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Boot-time orphan reconciliation — the fleet-wide counterpart to
 * `flight-watchdog.ts`'s single-target `flyingOwnerAlive` reconciliation.
 * That watchdog only ever reconciles the ONE folder an operator names on
 * `dashboard:watch <folder>`; every OTHER project stuck on `'flying'` after
 * its flight died ungracefully (SIGKILL, host reboot) — or after the
 * DASHBOARD SERVER ITSELF restarted mid-flight, losing its in-memory
 * `FlightRunnerRegistry` — stayed `'flying'` forever with no code path to
 * ever notice. See docs/RUNBOOK.md, "Recovery: a flight died without
 * releasing 'flying'".
 *
 * `reconcileOrphanedFlights` runs once at every dashboard boot, across every
 * project in the store: a `'flying'` project whose recorded engine-lock pid
 * is confirmed dead is flipped back to `'registered'` — the identical,
 * already-proven-safe write `fly.ts`'s own `finally` block makes on a clean
 * exit — so Fly (or the fleet watchdog) can pick it back up. A `'flying'`
 * project whose lock pid IS still alive is left completely untouched: a
 * genuinely running detached flight (`flight/spawn-flight.ts` spawns
 * `detached: true` specifically so it survives a dashboard crash/restart)
 * must never have its status or lifecycle disturbed by the very restart it
 * was built to survive. It's reported back instead, so the caller can log it
 * for the operator — docs/RUNBOOK.md §4 documents how to confirm/kill one by
 * hand if it turns out to be unwanted.
 */

import { dirname } from 'node:path';
import { openStore, listProjects, type ProjectRow } from '@autopilot/store';
import { isFlightOwnerAlive } from '../flight/lock.js';

export interface BootReconcileControl {
  /** Every project the store currently has on record. */
  listProjects(): readonly ProjectRow[];
  /** Whether `project`'s recorded engine-lock pid is still alive. */
  ownerAlive(project: ProjectRow): boolean;
  /** Flip an abandoned `'flying'` project back to `'registered'`. */
  reconcile(project: ProjectRow): void;
}

export interface BootReconcileResult {
  /** Abandoned `'flying'` projects (dead lock) flipped back to `'registered'`. */
  readonly reconciled: readonly ProjectRow[];
  /** `'flying'` projects whose lock pid is still alive — left untouched. */
  readonly stillAlive: readonly ProjectRow[];
}

export function reconcileOrphanedFlights(control: BootReconcileControl): BootReconcileResult {
  const reconciled: ProjectRow[] = [];
  const stillAlive: ProjectRow[] = [];
  for (const project of control.listProjects()) {
    if (project.status !== 'flying') continue;
    if (control.ownerAlive(project)) {
      stillAlive.push(project);
    } else {
      control.reconcile(project);
      reconciled.push(project);
    }
  }
  return { reconciled, stillAlive };
}

/** Real `BootReconcileControl`: reads every project fresh from the store
 *  (a one-time boot pass, not a hot path) and writes the reconciliation the
 *  same way `fly.ts`'s own `finally` block does on a clean exit. */
export function createBootReconcileControl(dbPath: string): BootReconcileControl {
  const dbDir = dirname(dbPath);
  return {
    listProjects: () => {
      const store = openStore(dbPath, { readonly: true });
      try {
        return listProjects(store.db);
      } finally {
        store.close();
      }
    },
    ownerAlive: (project) => isFlightOwnerAlive(dbDir, project.root_path),
    reconcile: (project) => {
      const store = openStore(dbPath);
      try {
        store.db
          .prepare(`UPDATE projects SET status = 'registered', updated_at = ? WHERE id = ?`)
          .run(Date.now(), project.id);
      } finally {
        store.close();
      }
    },
  };
}
