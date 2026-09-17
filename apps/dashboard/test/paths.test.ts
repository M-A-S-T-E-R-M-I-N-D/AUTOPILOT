// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { samePath } from '../src/paths.js';

/** Overrides `process.platform` for one call, then restores it — lets a
 *  single test run exercise BOTH branches of samePath's ternary regardless
 *  of the host OS running the suite. */
function withPlatform<T>(platform: NodeJS.Platform, fn: () => T): T {
  const original = process.platform;
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  try {
    return fn();
  } finally {
    Object.defineProperty(process, 'platform', { value: original, configurable: true });
  }
}

describe('samePath', () => {
  it('matches identical absolute paths', () => {
    expect(samePath('/a/b/c', '/a/b/c')).toBe(true);
  });

  it('matches through relative segments', () => {
    expect(samePath('/a/b/../b/c', '/a/b/c')).toBe(true);
  });

  it('rejects different paths', () => {
    expect(samePath('/a/b/c', '/a/b/d')).toBe(false);
  });

  it("case sensitivity of a differently-cased path matches this platform's own filesystem semantics", () => {
    const expected = process.platform === 'win32';
    expect(samePath('/some/Repo/Project', '/some/repo/project')).toBe(expected);
  });

  it('is case-insensitive on win32 (NTFS)', () => {
    withPlatform('win32', () => {
      expect(samePath('/some/Repo/Project', '/some/repo/project')).toBe(true);
      // Case-insensitive is not "anything goes": two different paths are
      // still different. Without this the win32 arm is only ever asked a
      // yes-question on a Linux runner, and an arm that always answers yes
      // passes (CI sweep 2026-09-17, shard 5).
      expect(samePath('/some/repo/project', '/some/repo/other')).toBe(false);
    });
  });

  it('is case-sensitive off win32 (POSIX)', () => {
    withPlatform('linux', () => {
      expect(samePath('/some/Repo/Project', '/some/repo/project')).toBe(false);
      expect(samePath('/some/repo/project', '/some/repo/project')).toBe(true);
    });
  });
});

describe('samePath — the case rule is a PLATFORM rule, not a preference', () => {
  it('compares case-sensitively off win32, so two paths differing only by case are different', () => {
    // A ternary that always took the win32 arm would call these the same
    // path on Linux, where they are two distinct directories.
    withPlatform('linux', () => {
      expect(samePath('/repo/Project', '/repo/project')).toBe(false);
      expect(samePath('/repo/project', '/repo/project')).toBe(true);
    });
  });
});
