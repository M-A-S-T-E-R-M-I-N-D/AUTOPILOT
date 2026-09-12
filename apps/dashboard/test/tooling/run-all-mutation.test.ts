// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Regression guard for the diff-scoped half of EVALUATION 2026-08-27 lever 9
 * ("wire the ~100 existing Stryker configs into the gate, diff-scoped").
 * Only the pure/exported pieces of scripts/ci/run-all-mutation.mjs are
 * exercised here — `main()` itself stays unimported (it shells out to
 * Stryker and calls `process.exit`), same stance
 * apps/dashboard/test/flight/ci-workflow-gate.test.ts already documents for
 * this file's discovery logic.
 */
import { describe, it, expect } from 'vitest';
import {
  discoverConfigs,
  parseDiffRef,
  parseShard,
  selectConfigFiles,
  shardConfigFiles,
} from '../../../../scripts/ci/run-all-mutation.mjs';

describe('parseDiffRef', () => {
  it('returns null when --diff is absent (full-sweep mode)', () => {
    expect(parseDiffRef(['node', 'run-all-mutation.mjs', '--list'])).toBeNull();
  });

  it('defaults to HEAD~1 when --diff has no trailing ref', () => {
    expect(parseDiffRef(['node', 'run-all-mutation.mjs', '--diff'])).toBe('HEAD~1');
  });

  it('defaults to HEAD~1 when the next argv token is another flag', () => {
    expect(parseDiffRef(['node', 'run-all-mutation.mjs', '--diff', '--list'])).toBe('HEAD~1');
  });

  it('uses the explicit ref that follows --diff', () => {
    expect(parseDiffRef(['node', 'run-all-mutation.mjs', '--diff', 'main'])).toBe('main');
  });
});

describe('parseShard / shardConfigFiles (the nightly sweep split across a CI matrix, 2026-09-13)', () => {
  it('is null without --shard, so one job still runs everything', () => {
    expect(parseShard(['node', 'run-all-mutation.mjs', '--list'])).toBeNull();
  });

  it('parses <i>/<n> and refuses anything else loudly — a typo must not quietly run a full sweep six times', () => {
    expect(parseShard(['node', 'x', '--shard', '2/6'])).toEqual({ index: 2, total: 6 });
    for (const bad of ['', '0/6', '7/6', 'a/b', '2']) {
      expect(() => parseShard(['node', 'x', '--shard', bad])).toThrow(/--shard wants/);
    }
    expect(() => parseShard(['node', 'x', '--shard'])).toThrow(/--shard wants/);
  });

  it('interleaves the discovery order so every shard gets a spread, and the shards partition the whole set', () => {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    expect(shardConfigFiles(files, { index: 1, total: 3 })).toEqual(['a', 'd', 'g']);
    expect(shardConfigFiles(files, { index: 2, total: 3 })).toEqual(['b', 'e']);
    expect(shardConfigFiles(files, { index: 3, total: 3 })).toEqual(['c', 'f']);
    const all = [1, 2, 3].flatMap((index) => shardConfigFiles(files, { index, total: 3 }));
    expect([...all].sort()).toEqual([...files].sort());
    expect(shardConfigFiles(files, null)).toBe(files);
  });
});

describe('selectConfigFiles', () => {
  const configs = [
    { file: 'stryker.a.config.mjs', mutate: ['src/a.ts'] },
    { file: 'stryker.b.config.mjs', mutate: ['src/b.ts', 'src/b2.ts'] },
  ];

  it('returns every config file in full-sweep mode (diffRef null)', () => {
    expect(selectConfigFiles(configs, null, [])).toEqual([
      'stryker.a.config.mjs',
      'stryker.b.config.mjs',
    ]);
  });

  it('scopes to configs whose mutate target was touched', () => {
    expect(selectConfigFiles(configs, 'HEAD~1', ['src/a.ts'])).toEqual(['stryker.a.config.mjs']);
  });

  it('returns nothing when the diff touched no mutation-covered file', () => {
    expect(selectConfigFiles(configs, 'HEAD~1', ['src/untested.ts'])).toEqual([]);
  });

  it('matches Windows-style backslash paths against forward-slash mutate targets', () => {
    expect(selectConfigFiles(configs, 'HEAD~1', ['src\\b2.ts'])).toEqual(['stryker.b.config.mjs']);
  });
});

describe('discoverConfigs', () => {
  it('finds the repo-wide Stryker config set with parsed mutate targets', () => {
    const configs = discoverConfigs();
    expect(configs.length).toBeGreaterThanOrEqual(100);
    const found = configs.find((c) => c.file === 'stryker.dashboard-gate-schedule.config.mjs');
    expect(found?.mutate).toEqual(['apps/dashboard/src/flight/gate-schedule.ts']);
  });
});
