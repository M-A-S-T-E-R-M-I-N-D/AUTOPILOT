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
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import {
  discoverConfigs,
  formatFailureSummary,
  mutationFailureReason,
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

  // THE BOUNDS ARE INCLUSIVE ON BOTH ENDS (2026-09-24): the first real run of
  // the config that mutates this file found `<` → `<=` and `>` → `>=` alive,
  // because no test stood exactly on 1 or exactly on n.
  it('accepts the first shard, the last shard, and a single-shard sweep', () => {
    expect(parseShard(['node', 'x', '--shard', '1/6'])).toEqual({ index: 1, total: 6 });
    expect(parseShard(['node', 'x', '--shard', '6/6'])).toEqual({ index: 6, total: 6 });
    expect(parseShard(['node', 'x', '--shard', '1/1'])).toEqual({ index: 1, total: 1 });
  });

  it('reads multi-digit values on both sides of the slash', () => {
    expect(parseShard(['node', 'x', '--shard', '12/20'])).toEqual({ index: 12, total: 20 });
    expect(parseShard(['node', 'x', '--shard', '2/12'])).toEqual({ index: 2, total: 12 });
  });

  it('refuses anything before or after the <i>/<n>, not just a malformed middle', () => {
    expect(() => parseShard(['node', 'x', '--shard', 'x2/6'])).toThrow(/--shard wants/);
    expect(() => parseShard(['node', 'x', '--shard', '2/6x'])).toThrow(/--shard wants/);
  });

  it('refuses a shard past the end and a zero total', () => {
    expect(() => parseShard(['node', 'x', '--shard', '2/1'])).toThrow(/--shard wants/);
    expect(() => parseShard(['node', 'x', '--shard', '6/0'])).toThrow(/--shard wants/);
  });

  it('names the value it refused, verbatim, and says what it wanted instead', () => {
    expect(() => parseShard(['node', 'x', '--shard', 'a/b'])).toThrow(
      "run-all-mutation: --shard wants <i>/<n> with 1 ≤ i ≤ n, got 'a/b'",
    );
    // a missing value is reported as the empty string, not as the flag before it
    expect(() => parseShard(['node', 'x', '--shard'])).toThrow(
      "run-all-mutation: --shard wants <i>/<n> with 1 ≤ i ≤ n, got ''",
    );
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
  /**
   * THE REAL DIRECTORY CANNOT PROVE THE FILTER (2026-09-24). Every file under
   * config/mutation/ that starts with `stryker.` also ends with `.config.mjs`,
   * so a filter loosened to `true`, to `||`, or to an empty prefix returned the
   * same set and survived the first real run of the config that mutates this
   * file. A directory of decoys is what makes the filter observable.
   */
  it('keeps only stryker.*.config.mjs, in lexical order, against a directory of decoys', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-discover-'));
    try {
      const write = (name: string, body = "export default { mutate: ['src/x.ts'] };\n"): void =>
        writeFileSync(join(dir, name), body);
      // created out of lexical order, with one decoy per way the filter can loosen
      write('stryker.zeta.config.mjs');
      write('vitest.alpha.config.ts', 'export default {};\n'); // right suffix family, wrong prefix
      write('other.beta.config.mjs'); // exact right suffix, wrong prefix
      write('stryker.alpha.config.mjs');
      write('stryker.notes.md', '# not a config\n'); // right prefix, wrong suffix
      write('shim.thing.ts', 'export {};\n'); // neither
      write('stryker.mid.config.mjs');
      write('stryker.nomut.config.mjs', 'export default {};\n'); // no mutate array at all
      expect(discoverConfigs(dir).map((c) => c.file)).toEqual([
        'stryker.alpha.config.mjs',
        'stryker.mid.config.mjs',
        'stryker.nomut.config.mjs',
        'stryker.zeta.config.mjs',
      ]);
      // still discovered, with nothing a diff could ever match
      expect(
        discoverConfigs(dir).find((c) => c.file === 'stryker.nomut.config.mjs')?.mutate,
      ).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('finds the repo-wide Stryker config set with parsed mutate targets', () => {
    const configs = discoverConfigs();
    expect(configs.length).toBeGreaterThanOrEqual(100);
    const found = configs.find((c) => c.file === 'stryker.dashboard-gate-schedule.config.mjs');
    expect(found?.mutate).toEqual(['apps/dashboard/src/flight/gate-schedule.ts']);
  });
});

/**
 * A FAILED CONFIG MUST SAY WHY (2026-09-21). The nightly sweep went red on a
 * config that had been green at the same commit the day before. The log said
 * only `FAILED — stryker.engine-claude-cli.config.mjs`, which is what it also
 * says when a mutant survives, so the diagnosis cost a download of the whole
 * six-shard log to find one bare `Killed` line: the process had been killed
 * at 80 of 426 mutants and never scored anything. Those two endings call for
 * opposite responses — write a test, or give the job headroom — and the
 * runner used to print them identically.
 */
describe('mutationFailureReason', () => {
  it('names the signal and says a killed process is the environment, not a survivor', () => {
    const reason = mutationFailureReason({ status: null, signal: 'SIGKILL' });
    expect(reason).toContain('SIGKILL');
    expect(reason).toContain('not a surviving mutant');
  });

  it('reads exit 1 as the break threshold, which is the one failure the sweep is for', () => {
    expect(mutationFailureReason({ status: 1, signal: null })).toBe(
      'exit 1 — below the break threshold: a mutant survived',
    );
  });

  it('reports any other exit code as stryker failing before it could score', () => {
    expect(mutationFailureReason({ status: 127, signal: null })).toBe(
      'exit 127 — stryker failed before it could score',
    );
  });

  it('prefers the signal over the exit code when a throw carries both', () => {
    expect(mutationFailureReason({ status: 137, signal: 'SIGKILL' })).toContain(
      'killed by SIGKILL',
    );
  });

  it('survives a throw that carries neither, rather than printing "undefined"', () => {
    expect(mutationFailureReason(undefined)).toBe('no exit code and no signal — stryker never ran');
    expect(mutationFailureReason({})).toBe('no exit code and no signal — stryker never ran');
  });

  it('treats exit code 0 as a real code, not as a missing one', () => {
    expect(mutationFailureReason({ status: 0, signal: null })).toBe(
      'exit 0 — stryker failed before it could score',
    );
  });
});

describe('formatFailureSummary', () => {
  it('is the tally alone when every config passed', () => {
    expect(formatFailureSummary(110, [])).toEqual(['run-all-mutation: 110/110 passed']);
  });

  it('names every failing config and its reason under the tally', () => {
    const lines = formatFailureSummary(110, [
      { file: 'stryker.engine-claude-cli.config.mjs', reason: 'killed by SIGKILL' },
      { file: 'stryker.dashboard-markdown.config.mjs', reason: 'exit 1 — a mutant survived' },
    ]);
    expect(lines[0]).toBe('run-all-mutation: 108/110 passed');
    expect(lines[1]).toBe(
      'run-all-mutation: FAILED stryker.engine-claude-cli.config.mjs — killed by SIGKILL',
    );
    expect(lines[2]).toBe(
      'run-all-mutation: FAILED stryker.dashboard-markdown.config.mjs — exit 1 — a mutant survived',
    );
    expect(lines).toHaveLength(3);
  });

  it('subtracts the failures from the total rather than reporting the total twice', () => {
    expect(formatFailureSummary(3, [{ file: 'a', reason: 'r' }])[0]).toBe(
      'run-all-mutation: 2/3 passed',
    );
  });
});
