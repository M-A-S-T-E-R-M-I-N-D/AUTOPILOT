// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { BackupVcs } from './types.js';

/** The pristine pre-touch snapshot (MASTER-PLAN §7). */
export const MYTH_TAG = 'autopilot/myth';
/** The lock-on baseline. */
export const LEGACY_TAG = 'autopilot/legacy';
/** The branch AUTOPILOT commits on — never `main`. */
export const FLIGHT_BRANCH = 'autopilot/flight';

/** A repo is backed up once BOTH the MYTH and LEGACY snapshots exist. */
export async function isBackedUp(vcs: BackupVcs): Promise<boolean> {
  return (await vcs.tagExists(MYTH_TAG)) && (await vcs.tagExists(LEGACY_TAG));
}
