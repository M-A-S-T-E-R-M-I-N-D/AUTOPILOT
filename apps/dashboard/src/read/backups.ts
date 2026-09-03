// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { SnapshotInfo } from '@autopilot/store';

/**
 * Resolve a `dashboard:restore` CLI argument against the available
 * snapshots (oldest-first, `listSnapshots`'s order) — `'latest'` picks the
 * newest, anything else must match a snapshot's filename exactly. Pulled
 * out of `restore.ts` so the selection rules are unit-testable without
 * touching the filesystem.
 */
export function resolveSnapshotTarget(
  snapshots: readonly SnapshotInfo[],
  arg: string,
): SnapshotInfo | undefined {
  if (arg === 'latest') return snapshots[snapshots.length - 1];
  return snapshots.find((s) => s.name === arg);
}
