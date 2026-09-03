// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { isBackedUp, MYTH_TAG, LEGACY_TAG, FLIGHT_BRANCH } from '../../src/backup/refs.js';
import type { BackupVcs } from '../../src/backup/types.js';

function fakeVcs(present: readonly string[]): BackupVcs {
  return {
    status: vi.fn(),
    tagExists: vi.fn(async (tag: string) => present.includes(tag)),
    branchExists: vi.fn(),
    initRepo: vi.fn(),
    commitAll: vi.fn(),
    createTag: vi.fn(),
    createBranch: vi.fn(),
    checkoutBranch: vi.fn(),
  };
}

describe('isBackedUp', () => {
  it('exposes the AUTOPILOT ref names', () => {
    expect(MYTH_TAG).toBe('autopilot/myth');
    expect(LEGACY_TAG).toBe('autopilot/legacy');
    expect(FLIGHT_BRANCH).toBe('autopilot/flight');
  });

  it('is false when neither tag exists', async () => {
    expect(await isBackedUp(fakeVcs([]))).toBe(false);
  });

  it('is false when only MYTH exists', async () => {
    expect(await isBackedUp(fakeVcs([MYTH_TAG]))).toBe(false);
  });

  it('is false when only LEGACY exists', async () => {
    expect(await isBackedUp(fakeVcs([LEGACY_TAG]))).toBe(false);
  });

  it('is true when both MYTH and LEGACY exist', async () => {
    expect(await isBackedUp(fakeVcs([MYTH_TAG, LEGACY_TAG]))).toBe(true);
  });

  it('short-circuits: never checks LEGACY once MYTH is missing', async () => {
    const vcs = fakeVcs([]);
    await isBackedUp(vcs);
    expect(vcs.tagExists).toHaveBeenCalledTimes(1);
    expect(vcs.tagExists).toHaveBeenCalledWith(MYTH_TAG);
  });
});
