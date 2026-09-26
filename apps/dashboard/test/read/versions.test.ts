// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE VERSIONS SCREEN'S DATA (board ap-mui2h3s1-1, slice 1). MASTER-PLAN §7
 * promises a timeline of every version of a locked repo — MYTH (pristine),
 * LEGACY (lock-on baseline) and the FLIGHT LOG since — and nothing read it.
 * These pin the read-model: what each tier is, the order, the cap, and that
 * every question it asks git is a read.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  DEFAULT_MAX_DIFF_FILES,
  DEFAULT_MAX_FLIGHT_VERSIONS,
  gitReaderFor,
  isCommitSha,
  parseDiffNumstat,
  parseVersionLog,
  readVersionDiff,
  readVersions,
  type GitRead,
} from '../../src/read/versions.js';

const SEP = '\x1f';
const sha = (n: number): string => n.toString(16).padStart(40, '0');
const line = (n: number, subject: string): string =>
  [sha(n), `2026-09-${String(10 + n).padStart(2, '0')}T12:00:00+00:00`, subject].join(SEP);

/** A fake git answering by the revision argument, recording every argv. */
function fakeGit(answers: Record<string, string | null>): {
  git: GitRead;
  calls: string[][];
} {
  const calls: string[][] = [];
  const git: GitRead = (args) => {
    calls.push([...args]);
    const rev = args.find((a) => a.startsWith('refs/'));
    return rev === undefined ? null : (answers[rev] ?? null);
  };
  return { git, calls };
}

const RANGE = 'refs/tags/autopilot/legacy..refs/heads/autopilot/flight';

describe('parseVersionLog', () => {
  it('reads one entry per line — sha, committed-at, subject — in the order git gave them', () => {
    const out = [line(2, 'fix: second'), line(1, 'feat: first')].join('\n') + '\n';
    expect(parseVersionLog(out, 'flight')).toEqual([
      {
        kind: 'flight',
        sha: sha(2),
        committedAt: '2026-09-12T12:00:00+00:00',
        subject: 'fix: second',
      },
      {
        kind: 'flight',
        sha: sha(1),
        committedAt: '2026-09-11T12:00:00+00:00',
        subject: 'feat: first',
      },
    ]);
  });

  it('skips a line that is not a commit record instead of inventing a version', () => {
    const out = [
      'warning: something git printed',
      ['not-a-sha', '2026-09-11T12:00:00+00:00', 'x'].join(SEP),
      [sha(3), '', 'no date'].join(SEP),
      line(4, 'kept'),
    ].join('\n');
    expect(parseVersionLog(out, 'myth').map((v) => v.subject)).toEqual(['kept']);
  });

  it('keeps an empty subject as empty, not as a dropped entry', () => {
    expect(parseVersionLog([sha(5), '2026-09-15T12:00:00+00:00', ''].join(SEP), 'legacy')).toEqual([
      { kind: 'legacy', sha: sha(5), committedAt: '2026-09-15T12:00:00+00:00', subject: '' },
    ]);
  });
});

describe('readVersions', () => {
  it('shows an honest empty timeline for a repo that was never locked on', () => {
    const { git } = fakeGit({});
    expect(readVersions(git)).toEqual({ myth: null, legacy: null, flight: [], truncated: false });
  });

  it('names MYTH and LEGACY by their tags and lists the flight log since LEGACY, newest first', () => {
    const { git, calls } = fakeGit({
      'refs/tags/autopilot/myth': line(1, 'chore(autopilot): baseline snapshot'),
      'refs/tags/autopilot/legacy': line(1, 'chore(autopilot): baseline snapshot'),
      [RANGE]: [line(3, 'fix: newest'), line(2, 'feat: older')].join('\n'),
    });
    const timeline = readVersions(git);
    expect(timeline.myth).toMatchObject({ kind: 'myth', sha: sha(1) });
    expect(timeline.legacy).toMatchObject({ kind: 'legacy', sha: sha(1) });
    expect(timeline.flight.map((v) => [v.kind, v.subject])).toEqual([
      ['flight', 'fix: newest'],
      ['flight', 'feat: older'],
    ]);
    expect(timeline.truncated).toBe(false);
    // Each version is a state the flight branch actually held: a lane's own
    // commits arrive through its merge, so the walk follows first parents.
    const flightCall = calls.find((c) => c.includes(RANGE));
    expect(flightCall).toContain('--first-parent');
  });

  it('asks git only to read — every argv is a `log`, never a write', () => {
    const { git, calls } = fakeGit({
      'refs/tags/autopilot/myth': line(1, 'm'),
      'refs/tags/autopilot/legacy': line(1, 'l'),
      [RANGE]: line(2, 'f'),
    });
    readVersions(git);
    expect(calls.length).toBeGreaterThan(0);
    for (const argv of calls) expect(argv[0]).toBe('log');
  });

  it('cuts the flight log at the cap and says more exists', () => {
    const lines = Array.from({ length: 4 }, (_, i) => line(10 - i, `c${i}`)).join('\n');
    const { git, calls } = fakeGit({
      'refs/tags/autopilot/myth': line(1, 'm'),
      'refs/tags/autopilot/legacy': line(1, 'l'),
      [RANGE]: lines,
    });
    const timeline = readVersions(git, 3);
    expect(timeline.flight.map((v) => v.subject)).toEqual(['c0', 'c1', 'c2']);
    expect(timeline.truncated).toBe(true);
    // One extra row is asked for — that is how "more exists" is known.
    expect(calls.find((c) => c.includes(RANGE))).toContain('--max-count=4');
  });

  it('is not truncated when the flight log holds exactly the cap', () => {
    const lines = Array.from({ length: 3 }, (_, i) => line(10 - i, `c${i}`)).join('\n');
    const { git } = fakeGit({
      'refs/tags/autopilot/myth': line(1, 'm'),
      'refs/tags/autopilot/legacy': line(1, 'l'),
      [RANGE]: lines,
    });
    const timeline = readVersions(git, 3);
    expect(timeline.flight).toHaveLength(3);
    expect(timeline.truncated).toBe(false);
  });

  it('falls back to the default cap for a cap that is not a positive whole number', () => {
    for (const bad of [0, -1, 2.5, Number.NaN]) {
      const { git, calls } = fakeGit({
        'refs/tags/autopilot/myth': line(1, 'm'),
        'refs/tags/autopilot/legacy': line(1, 'l'),
        [RANGE]: '',
      });
      readVersions(git, bad);
      expect(calls.find((c) => c.includes(RANGE))).toContain(
        `--max-count=${DEFAULT_MAX_FLIGHT_VERSIONS + 1}`,
      );
    }
  });

  it('lists no flight log without LEGACY — "since the lock-on" has no start to count from', () => {
    const { git, calls } = fakeGit({ 'refs/tags/autopilot/myth': line(1, 'm') });
    const timeline = readVersions(git);
    expect(timeline.myth).not.toBeNull();
    expect(timeline.legacy).toBeNull();
    expect(timeline.flight).toEqual([]);
    expect(calls.some((c) => c.includes(RANGE))).toBe(false);
  });

  it('keeps MYTH and LEGACY when the flight branch itself is missing', () => {
    const { git } = fakeGit({
      'refs/tags/autopilot/myth': line(1, 'm'),
      'refs/tags/autopilot/legacy': line(1, 'l'),
    });
    expect(readVersions(git)).toMatchObject({ flight: [], truncated: false });
    expect(readVersions(git).legacy).not.toBeNull();
  });
});

describe('isCommitSha', () => {
  it('accepts a full SHA-1 or SHA-256 commit id and nothing else', () => {
    expect(isCommitSha(sha(1))).toBe(true);
    expect(isCommitSha('f'.repeat(64))).toBe(true);
    for (const bad of [
      '',
      'HEAD',
      'abc1234',
      'A'.repeat(40),
      `--output=${sha(1)}`,
      'a'.repeat(41),
    ]) {
      expect(isCommitSha(bad)).toBe(false);
    }
  });
});

describe('parseDiffNumstat', () => {
  it('reads one file per NUL-terminated record: lines added, lines removed, path', () => {
    const out = '3\t1\tsrc/a.ts\0' + '0\t12\tdocs/old.md\0';
    expect(parseDiffNumstat(out)).toEqual([
      { path: 'src/a.ts', added: 3, removed: 1 },
      { path: 'docs/old.md', added: 0, removed: 12 },
    ]);
  });

  it('marks a binary file with null counts instead of pretending it changed no lines', () => {
    expect(parseDiffNumstat('-\t-\tassets/logo.png\0')).toEqual([
      { path: 'assets/logo.png', added: null, removed: null },
    ]);
  });

  it('keeps a path verbatim, tabs and newlines included, because -z never quotes it', () => {
    expect(parseDiffNumstat('1\t0\tweird\tname\nhere.txt\0')).toEqual([
      { path: 'weird\tname\nhere.txt', added: 1, removed: 0 },
    ]);
  });

  it('skips a record that is not a numstat line instead of inventing a file', () => {
    expect(parseDiffNumstat('\0garbage\0' + 'x\t1\tbad.txt\0' + '2\t2\tkept.txt\0')).toEqual([
      { path: 'kept.txt', added: 2, removed: 2 },
    ]);
  });
});

describe('readVersionDiff', () => {
  function diffGit(out: string | null): { git: GitRead; calls: string[][] } {
    const calls: string[][] = [];
    return {
      calls,
      git: (args) => {
        calls.push([...args]);
        return out;
      },
    };
  }

  it('lists what changed from one version to the other, with totals', () => {
    const { git } = diffGit('3\t1\tsrc/a.ts\0' + '-\t-\tlogo.png\0' + '0\t4\tgone.md\0');
    expect(readVersionDiff(git, sha(1), sha(2))).toEqual({
      files: [
        { path: 'src/a.ts', added: 3, removed: 1 },
        { path: 'logo.png', added: null, removed: null },
        { path: 'gone.md', added: 0, removed: 4 },
      ],
      totals: { files: 3, added: 3, removed: 5 },
      truncated: false,
    });
  });

  it('asks git only to read: a plumbing diff-tree from the first version to the second', () => {
    const { git, calls } = diffGit('');
    readVersionDiff(git, sha(1), sha(2));
    expect(calls).toHaveLength(1);
    const argv = calls[0]!;
    expect(argv[0]).toBe('diff-tree');
    expect(argv).toEqual(expect.arrayContaining(['-r', '--numstat', '-z', '--no-renames']));
    // The revisions come last, in order, fenced off from any path by `--`.
    expect(argv.slice(-3)).toEqual([sha(1), sha(2), '--']);
  });

  it('never hands git a revision that is not a full commit id — no option or ref can ride in', () => {
    for (const [from, to] of [
      ['--output=owned.txt', sha(2)],
      [sha(1), '-p'],
      ['HEAD', sha(2)],
      [sha(1), 'refs/heads/autopilot/flight'],
    ] as const) {
      const { git, calls } = diffGit('1\t1\tx\0');
      expect(readVersionDiff(git, from, to)).toBeNull();
      expect(calls).toEqual([]);
    }
  });

  it('answers null when git cannot read the diff, e.g. a commit the repository does not have', () => {
    const { git } = diffGit(null);
    expect(readVersionDiff(git, sha(1), sha(2))).toBeNull();
  });

  it('shows an empty diff between two identical versions', () => {
    const { git } = diffGit('');
    expect(readVersionDiff(git, sha(1), sha(1))).toEqual({
      files: [],
      totals: { files: 0, added: 0, removed: 0 },
      truncated: false,
    });
  });

  it('cuts the file list at the cap but keeps the totals for every file', () => {
    const out = Array.from({ length: 5 }, (_, i) => `${i + 1}\t1\tf${i}.ts\0`).join('');
    const diff = readVersionDiff(diffGit(out).git, sha(1), sha(2), 2);
    expect(diff?.files.map((f) => f.path)).toEqual(['f0.ts', 'f1.ts']);
    expect(diff?.truncated).toBe(true);
    expect(diff?.totals).toEqual({ files: 5, added: 15, removed: 5 });
  });

  it('falls back to the default cap for a cap that is not a positive whole number', () => {
    const out = Array.from({ length: DEFAULT_MAX_DIFF_FILES + 1 }, (_, i) => `1\t0\tf${i}\0`).join(
      '',
    );
    for (const bad of [0, -3, 1.5, Number.NaN]) {
      const diff = readVersionDiff(diffGit(out).git, sha(1), sha(2), bad);
      expect(diff?.files).toHaveLength(DEFAULT_MAX_DIFF_FILES);
      expect(diff?.truncated).toBe(true);
    }
  });
});

describe('gitReaderFor (a real repository)', () => {
  const run = (dir: string, args: readonly string[]): string =>
    execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@localhost', ...args], {
      encoding: 'utf8',
      windowsHide: true,
    }).trim();
  const commit = (dir: string, file: string, subject: string): string => {
    writeFileSync(join(dir, file), subject);
    run(dir, ['add', file]);
    run(dir, ['commit', '-q', '--no-gpg-sign', '-m', subject]);
    return run(dir, ['rev-parse', 'HEAD']);
  };

  it('reads the ritual refs of a locked repo, following the flight branch first-parent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-versions-'));
    try {
      run(dir, ['init', '-q']);
      const base = commit(dir, 'a.txt', 'chore(autopilot): baseline snapshot');
      run(dir, ['tag', 'autopilot/myth']);
      run(dir, ['tag', 'autopilot/legacy']);
      run(dir, ['checkout', '-q', '-b', 'autopilot/flight']);
      commit(dir, 'b.txt', 'feat: on the flight');
      run(dir, ['checkout', '-q', '-b', 'lane']);
      commit(dir, 'c.txt', 'fix: inside a lane');
      run(dir, ['checkout', '-q', 'autopilot/flight']);
      run(dir, ['merge', '-q', '--no-ff', '--no-gpg-sign', '-m', 'chore: land lane', 'lane']);

      const timeline = readVersions(gitReaderFor(dir));
      expect(timeline.myth?.sha).toBe(base);
      expect(timeline.legacy?.sha).toBe(base);
      expect(timeline.flight.map((v) => v.subject)).toEqual([
        'chore: land lane',
        'feat: on the flight',
      ]);
      expect(timeline.flight[0]?.committedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('diffs LEGACY against the flight head, and reads nothing for a commit the repo lacks', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-versions-diff-'));
    try {
      run(dir, ['init', '-q']);
      writeFileSync(join(dir, 'keep.txt'), 'one\ntwo\n');
      writeFileSync(join(dir, 'drop.txt'), 'bye\n');
      run(dir, ['add', '.']);
      run(dir, ['commit', '-q', '--no-gpg-sign', '-m', 'base']);
      const base = run(dir, ['rev-parse', 'HEAD']);
      writeFileSync(join(dir, 'keep.txt'), 'one\n2\nthree\n');
      run(dir, ['add', 'keep.txt']);
      run(dir, ['rm', '-q', 'drop.txt']);
      const head = commit(dir, 'new.txt', 'feat: new');

      const diff = readVersionDiff(gitReaderFor(dir), base, head);
      expect(diff?.files).toEqual([
        { path: 'drop.txt', added: 0, removed: 1 },
        { path: 'keep.txt', added: 2, removed: 1 },
        { path: 'new.txt', added: 1, removed: 0 },
      ]);
      expect(diff?.totals).toEqual({ files: 3, added: 3, removed: 2 });
      expect(readVersionDiff(gitReaderFor(dir), base, sha(9))).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('answers null for a folder that is not a repository, which reads as an empty timeline', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-versions-plain-'));
    try {
      expect(readVersions(gitReaderFor(dir))).toEqual({
        myth: null,
        legacy: null,
        flight: [],
        truncated: false,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
