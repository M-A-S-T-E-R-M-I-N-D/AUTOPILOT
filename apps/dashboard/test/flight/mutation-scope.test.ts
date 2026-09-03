// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Regression guard for lever 9 of EVALUATION 2026-08-27 ("wire the ~100
 * existing Stryker configs into the gate, diff-scoped"): this only tests the
 * RESOLUTION step (touched file -> its Stryker config), never runs Stryker.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  discoverMutationConfigs,
  resolveMutationConfigsForFiles,
  mutationScriptsForPatch,
  type MutationConfig,
} from '../../src/flight/mutation-scope.js';

describe('discoverMutationConfigs', () => {
  it('finds the repo-wide Stryker config set, each pointing at real file(s)', () => {
    const configs = discoverMutationConfigs();
    expect(configs.length).toBeGreaterThanOrEqual(100);
    for (const c of configs) {
      expect(c.mutate.length).toBeGreaterThan(0);
      for (const m of c.mutate) {
        expect(existsSync(join(process.cwd(), m)), `${c.file} -> missing ${m}`).toBe(true);
      }
      expect(c.script).toBe(`mutation:${c.file.slice('stryker.'.length, -'.config.mjs'.length)}`);
    }
  });

  it('finds the known gate-schedule config with its exact mutate target', () => {
    const configs = discoverMutationConfigs();
    const found = configs.find((c) => c.file === 'stryker.dashboard-gate-schedule.config.mjs');
    expect(found).toEqual({
      file: 'stryker.dashboard-gate-schedule.config.mjs',
      mutate: ['apps/dashboard/src/flight/gate-schedule.ts'],
      script: 'mutation:dashboard-gate-schedule',
    });
  });

  it('finds a config that mutates several files at once', () => {
    const configs = discoverMutationConfigs();
    const found = configs.find((c) => c.file === 'stryker.onboarding-detectors.config.mjs');
    expect(found?.mutate).toEqual([
      'packages/onboarding/src/gate/detectors/js.ts',
      'packages/onboarding/src/gate/detectors/python.ts',
      'packages/onboarding/src/gate/detectors/go.ts',
      'packages/onboarding/src/gate/detectors/rust.ts',
    ]);
  });

  describe('a malformed config', () => {
    let dir: string;

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('throws instead of silently dropping out of scope resolution', () => {
      dir = mkdtempSync(join(tmpdir(), 'autopilot-mutation-scope-'));
      mkdirSync(join(dir, 'config', 'mutation'), { recursive: true });
      writeFileSync(
        join(dir, 'config', 'mutation', 'stryker.bad.config.mjs'),
        'export default { plugins: [] };\n',
      );
      expect(() => discoverMutationConfigs(dir)).toThrow(/no parseable "mutate/);
    });
  });
});

describe('resolveMutationConfigsForFiles', () => {
  const fakeConfigs: MutationConfig[] = [
    { file: 'stryker.a.config.mjs', mutate: ['src/a.ts'], script: 'mutation:a' },
    { file: 'stryker.b.config.mjs', mutate: ['src/b.ts', 'src/b2.ts'], script: 'mutation:b' },
  ];

  it('returns only the configs whose mutate target was touched', () => {
    expect(resolveMutationConfigsForFiles(['src/a.ts'], fakeConfigs)).toEqual([fakeConfigs[0]]);
  });

  it('returns nothing for a touched file with no mutation config', () => {
    expect(resolveMutationConfigsForFiles(['src/untested.ts'], fakeConfigs)).toEqual([]);
  });

  it('matches Windows-style backslash paths against forward-slash mutate targets', () => {
    expect(resolveMutationConfigsForFiles(['src\\b.ts'], fakeConfigs)).toEqual([fakeConfigs[1]]);
  });

  it('resolves the real gate-schedule module against the real discovered configs', () => {
    const matches = resolveMutationConfigsForFiles(['apps/dashboard/src/flight/gate-schedule.ts']);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.script).toBe('mutation:dashboard-gate-schedule');
  });
});

describe('mutationScriptsForPatch', () => {
  const fakeConfigs: MutationConfig[] = [
    { file: 'stryker.a.config.mjs', mutate: ['src/a.ts'], script: 'mutation:a' },
    { file: 'stryker.b.config.mjs', mutate: ['src/b.ts'], script: 'mutation:b' },
  ];

  it('names the mutation script for a patch touching a mutated file', () => {
    const patch = 'diff --git a/src/a.ts b/src/a.ts\n+change';
    expect(mutationScriptsForPatch(patch, fakeConfigs)).toEqual(['mutation:a']);
  });

  it('returns nothing for a patch touching no mutated file', () => {
    const patch = 'diff --git a/src/untested.ts b/src/untested.ts\n+change';
    expect(mutationScriptsForPatch(patch, fakeConfigs)).toEqual([]);
  });

  it('returns nothing for text with no diff header at all', () => {
    expect(mutationScriptsForPatch('not a real patch, just prose', fakeConfigs)).toEqual([]);
  });

  it('resolves the real gate-schedule module against the real discovered configs', () => {
    const patch =
      'diff --git a/apps/dashboard/src/flight/gate-schedule.ts b/apps/dashboard/src/flight/gate-schedule.ts\n+change';
    expect(mutationScriptsForPatch(patch)).toEqual(['mutation:dashboard-gate-schedule']);
  });
});
