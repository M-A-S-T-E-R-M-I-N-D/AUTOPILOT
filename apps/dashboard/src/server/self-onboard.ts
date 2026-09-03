// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Register the folder the dashboard is running in as a project on boot — so a
 * fresh clone always has itself available to continue development on, with no
 * manual `dashboard:fly` first.
 *
 * Deliberately does NOT run the real onboarding ritual's backup step
 * (packages/onboarding onboard/onboard.ts -> lockRepo): that step checks the
 * repo out onto the `autopilot/flight` branch, which is the right move for an
 * explicit, consenting action like `dashboard:fly`, but would be a surprise
 * mutation if it fired silently the moment a passive dashboard boots — before
 * the operator has asked for anything. So this does the read-only-safe subset
 * only (detect gate, register, index, SOUL) and leaves the backup/branch-switch
 * ritual to run later, the normal way, the first time the project is actually
 * flown.
 */

import { mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { openStore, migrate, SqliteSearchStore, type Store } from '@autopilot/store';
import {
  detectGate,
  detectBacklogPath,
  generateStarterSoul,
  slugify,
  refreshProjectIndex,
  triageFolder,
  FsFileSource,
  SqliteIndexStore,
  SqliteProjectStore,
  readFsSnapshot,
} from '@autopilot/onboarding';

export interface SelfOnboardResult {
  /** False when `root` was already registered — nothing ran. */
  readonly ran: boolean;
  readonly projectId?: string;
}

/** Registers `root` into the store at `dbPath`, unless it's already registered. */
export async function ensureSelfOnboarded(
  dbPath: string,
  root: string,
): Promise<SelfOnboardResult> {
  mkdirSync(dirname(dbPath), { recursive: true });
  const store: Store = openStore(dbPath);
  try {
    migrate(store);
    const projects = new SqliteProjectStore(store);
    if (projects.findByRoot(root)) return { ran: false };

    const name = basename(root);
    const snapshot = readFsSnapshot(root);
    const gate = detectGate(snapshot);
    const triage = triageFolder(snapshot);
    const projectId = `self-${slugify(name)}`;
    projects.register({
      id: projectId,
      slug: slugify(name),
      name,
      rootPath: root,
      soul: generateStarterSoul(name, gate, triage, snapshot),
      gateConfig: JSON.stringify(gate.spec),
      backlogPath: detectBacklogPath(snapshot),
    });

    await refreshProjectIndex(
      new FsFileSource(root),
      new SqliteIndexStore(store),
      projectId,
      new SqliteSearchStore(store),
    );

    return { ran: true, projectId };
  } finally {
    store.close();
  }
}
