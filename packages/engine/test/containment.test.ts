// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  guardedPathsFor,
  snapshotGuardedHeads,
  detectContainmentBreaches,
  describeBreach,
  classifyBreaches,
  type HeadReader,
} from '../src/containment.js';

/** A HeadReader backed by a mutable map — a test can "move" a repo's HEAD. */
function fakeReader(heads: Record<string, string>): HeadReader {
  return { headOf: (p) => heads[p] ?? '' };
}

describe('guardedPathsFor', () => {
  it('guards every candidate except the target itself', () => {
    expect(guardedPathsFor('/work/sbx', ['/work/autopilot', '/work/sbx'])).toEqual([
      '/work/autopilot',
    ]);
  });

  it('guards nothing when the only candidate IS the target (dogfooding)', () => {
    // Flying the repo on itself legitimately commits to it — never a breach.
    expect(guardedPathsFor('/work/autopilot', ['/work/autopilot'])).toEqual([]);
  });
});

describe('containment audit', () => {
  it('reports no breach when guarded HEADs are unchanged', () => {
    const heads = { '/work/autopilot': 'aaaa' };
    const reader = fakeReader(heads);
    const snap = snapshotGuardedHeads(reader, ['/work/autopilot']);
    expect(detectContainmentBreaches(reader, snap)).toEqual([]);
  });

  it('detects a breach when a guarded repo HEAD moves during the flight', () => {
    const heads = { '/work/autopilot': 'aaaa' };
    const reader = fakeReader(heads);
    const snap = snapshotGuardedHeads(reader, ['/work/autopilot']);

    heads['/work/autopilot'] = 'bbbb'; // the escaped agent committed here

    const breaches = detectContainmentBreaches(reader, snap);
    expect(breaches).toEqual([{ repoPath: '/work/autopilot', before: 'aaaa', after: 'bbbb' }]);
  });

  it('treats a repo that becomes initialized (empty → sha) as a breach', () => {
    const heads: Record<string, string> = { '/work/x': '' };
    const reader = fakeReader(heads);
    const snap = snapshotGuardedHeads(reader, ['/work/x']);
    heads['/work/x'] = 'cccc';
    expect(detectContainmentBreaches(reader, snap)).toHaveLength(1);
  });

  it('reports each guarded repo independently', () => {
    const heads = { '/a': '1', '/b': '2' };
    const reader = fakeReader(heads);
    const snap = snapshotGuardedHeads(reader, ['/a', '/b']);
    heads['/b'] = '9';
    const breaches = detectContainmentBreaches(reader, snap);
    expect(breaches.map((b) => b.repoPath)).toEqual(['/b']);
  });

  it('describes a breach in one human-readable line, truncating the sha to 12 chars', () => {
    const line = describeBreach({
      repoPath: '/work/autopilot',
      before: 'abcdef1234567',
      after: '',
    });
    // Exact match (not toContain) so a dropped .slice(0, 12) — which would
    // leave the full untruncated sha in the line — actually fails this test:
    // 'abcdef123456'.includes-style assertions pass either way since the
    // untruncated sha still contains the truncated prefix as a substring.
    expect(line).toBe(
      'CONTAINMENT BREACH — /work/autopilot HEAD moved abcdef123456 → (none) (the flight left its target)',
    );
    expect(line.toLowerCase()).toContain('breach');
  });

  it('describes a breach from a fresh repo (no prior HEAD) to its first commit, truncating the sha to 12 chars', () => {
    const line = describeBreach({
      repoPath: '/work/x',
      before: '',
      after: 'abcdef1234567890',
    });
    expect(line).toBe(
      'CONTAINMENT BREACH — /work/x HEAD moved (none) → abcdef123456 (the flight left its target)',
    );
  });
});

describe('classifyBreaches (CONTAINMENT vs OPERATOR, web-msu3x5ub-vqxjhu)', () => {
  const breach = { repoPath: '/work/target', before: 'aaaa', after: 'bbbb' };

  it('demotes every breach to operator activity when worktree isolation is active', () => {
    expect(classifyBreaches([breach], true)).toEqual({ hard: [], operator: [breach] });
  });

  it('keeps the hard stop when isolation is NOT active (Bash runs directly in a guarded path)', () => {
    expect(classifyBreaches([breach], false)).toEqual({ hard: [breach], operator: [] });
  });

  it('returns empty buckets for no breaches, isolated or not', () => {
    expect(classifyBreaches([], true)).toEqual({ hard: [], operator: [] });
    expect(classifyBreaches([], false)).toEqual({ hard: [], operator: [] });
  });
});
