// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { MYTH_TAG, LEGACY_TAG, FLIGHT_BRANCH, isBackedUp } from './refs.js';
import type { BackupVcs, LockInput, LockResult } from './types.js';

const DEFAULT_BASELINE_MESSAGE = 'chore(autopilot): baseline snapshot';

async function ensureOnFlight(vcs: BackupVcs): Promise<void> {
  if (!(await vcs.branchExists(FLIGHT_BRANCH))) await vcs.createBranch(FLIGHT_BRANCH);
  await vcs.checkoutBranch(FLIGHT_BRANCH);
}

/**
 * The folder-lock ritual (MASTER-PLAN §7). Backs a repo up BEFORE any git action
 * that changes state:
 *   1. anchor a commit (for a non-repo / unborn HEAD, this baseline commit IS the
 *      pristine capture — the only git action that precedes the tags, and it
 *      captures, never touches);
 *   2. tag MYTH (pristine) + LEGACY (baseline) at HEAD;
 *   3. only THEN move onto the flight branch (working-tree changes carry over —
 *      never `reset --hard`).
 * A repo that already carries MYTH+LEGACY is RESUMED, never re-backed-up.
 */
export async function lockRepo(vcs: BackupVcs, input: LockInput = {}): Promise<LockResult> {
  const refs = { myth: MYTH_TAG, legacy: LEGACY_TAG, flight: FLIGHT_BRANCH };

  if (await isBackedUp(vcs)) {
    await ensureOnFlight(vcs);
    return { resumed: true, ...refs };
  }

  const status = await vcs.status();

  if (!status.isRepo) await vcs.initRepo();
  // head is null for both a non-repo and an unborn (no-commit) repo → the baseline
  // commit captures the pristine files as MYTH.
  if (status.head === null) await vcs.commitAll(input.baselineMessage ?? DEFAULT_BASELINE_MESSAGE);

  await vcs.createTag(MYTH_TAG);
  await vcs.createTag(LEGACY_TAG);

  await ensureOnFlight(vcs);

  return { resumed: false, ...refs };
}
