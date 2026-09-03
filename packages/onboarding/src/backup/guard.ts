// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { isBackedUp } from './refs.js';
import { RepoNotBackedUpError } from './errors.js';
import type { BackupVcs } from './types.js';

/**
 * The cardinal-rule guard: throw unless the repo carries its MYTH+LEGACY
 * snapshot. The engine calls this before its first firing, so no project is ever
 * touched before it is backed up.
 */
export async function assertBackedUp(vcs: BackupVcs, root: string): Promise<void> {
  if (!(await isBackedUp(vcs))) throw new RepoNotBackedUpError(root);
}
