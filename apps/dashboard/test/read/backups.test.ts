// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { resolveSnapshotTarget } from '../../src/read/backups.js';

const snapshots = [
  { name: 'autopilot-2026-01-01T00-00-00-000Z.db', path: '/backups/a.db', sizeBytes: 10 },
  { name: 'autopilot-2026-01-02T00-00-00-000Z.db', path: '/backups/b.db', sizeBytes: 20 },
  { name: 'autopilot-2026-01-03T00-00-00-000Z.db', path: '/backups/c.db', sizeBytes: 30 },
];

describe('resolveSnapshotTarget', () => {
  it('resolves "latest" to the last (newest) snapshot in the oldest-first list', () => {
    expect(resolveSnapshotTarget(snapshots, 'latest')).toEqual(snapshots[2]);
  });

  it('resolves an exact filename to its matching snapshot', () => {
    expect(resolveSnapshotTarget(snapshots, 'autopilot-2026-01-01T00-00-00-000Z.db')).toEqual(
      snapshots[0],
    );
  });

  it('returns undefined for an unknown filename', () => {
    expect(resolveSnapshotTarget(snapshots, 'does-not-exist.db')).toBeUndefined();
  });

  it('returns undefined for "latest" against an empty list', () => {
    expect(resolveSnapshotTarget([], 'latest')).toBeUndefined();
  });
});
