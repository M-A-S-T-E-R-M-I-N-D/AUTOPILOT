// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for the pure parts of scripts/ci/check-doc-commit-refs.mjs, the CI
 * gate that fails a run if a doc cites a commit SHA unreachable from HEAD: the
 * findShaCitations() extractor, and checkAncestry() / describeGitFailure(),
 * which turn `git merge-base --is-ancestor` runs into a verdict. `main()`
 * itself stays unimported — it shells out to `git ls-files` / `git merge-base`
 * and reads the whole tree, same stance
 * apps/dashboard/test/tooling/secret-scan.test.ts takes for its sibling script.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  checkAncestry,
  describeGitFailure,
  findShaCitations,
  type GitRun,
} from '../../../../scripts/ci/check-doc-commit-refs.mjs';

describe('findShaCitations', () => {
  it('returns no citations for clean text', () => {
    expect(findShaCitations('Just some prose with no code spans at all.')).toEqual([]);
  });

  it('extracts a backtick-quoted 7-char SHA followed by a closing backtick', () => {
    expect(findShaCitations('Fixed in `abc1234` yesterday.')).toEqual([
      { line: 1, sha: 'abc1234' },
    ]);
  });

  it('extracts a backtick-quoted SHA followed by trailing prose inside the same span', () => {
    expect(findShaCitations('`abc1234 fix(x): the message` landed the change.')).toEqual([
      { line: 1, sha: 'abc1234' },
    ]);
  });

  it('extracts a full 40-char SHA', () => {
    const sha = '0123456789abcdef0123456789abcdef01234567';
    expect(findShaCitations('See `' + sha + '` for the patch.')).toEqual([{ line: 1, sha }]);
  });

  it('reports 1-indexed line numbers for a citation past the first line', () => {
    const text = 'intro\nmore prose\nfixed by `deadbee` today';
    expect(findShaCitations(text)).toEqual([{ line: 3, sha: 'deadbee' }]);
  });

  it('collects one citation per matching span across multiple lines', () => {
    const text = '`aaaaaaa` first\nprose\n`bbbbbbb` second';
    expect(findShaCitations(text)).toEqual([
      { line: 1, sha: 'aaaaaaa' },
      { line: 3, sha: 'bbbbbbb' },
    ]);
  });

  it('collects every citation on a single line, in document order — a second SHA must not hide behind the first', () => {
    // A refactor from `matchAll` to a single `match`/`exec` would keep every
    // other fixture green (each has at most one span per line) while silently
    // dropping the second citation — and main() would then never ask git
    // whether that second SHA is reachable at all.
    expect(findShaCitations('reverted in `aaaaaaa`, relanded as `bbbbbbb` the same day.')).toEqual([
      { line: 1, sha: 'aaaaaaa' },
      { line: 1, sha: 'bbbbbbb' },
    ]);
  });

  it('does not flag a bare unquoted hex word in prose — a URL fragment or article slug, not a citation (the false positive this scanner is deliberately narrow to avoid)', () => {
    const text = 'See the writeup ending in 71923df63d01 for background.';
    expect(findShaCitations(text)).toEqual([]);
  });

  it('does not flag a hex-looking word inside a longer identifier with no backtick boundary', () => {
    expect(findShaCitations('commit_abc1234_backup.tar.gz')).toEqual([]);
  });

  it('does not flag a hex run longer than 40 chars inside a single code span — a SHA-256 content hash or lockfile digest, not a truncated commit SHA', () => {
    const hash64 = 'a'.repeat(64);
    expect(findShaCitations('digest `' + hash64 + '` matches.')).toEqual([]);
  });

  it('does not flag a backtick-quoted hex run shorter than 7 chars', () => {
    expect(findShaCitations('`ab12` is too short to be a SHA.')).toEqual([]);
  });

  it('does not flag backtick-quoted non-hex content', () => {
    expect(findShaCitations('run `pnpm install` first.')).toEqual([]);
  });

  it('does not flag prose that merely mentions commits without a code span', () => {
    expect(findShaCitations('The commit fixed the bug, see the changelog above.')).toEqual([]);
  });
});

/** One `git merge-base --is-ancestor` run that exited with `status`. */
function exited(status: number, stderr = ''): GitRun {
  return { status, signal: null, stderr, spawnError: null };
}

const NOT_AN_OBJECT = 'fatal: Not a valid object name deadbee\n';

describe('describeGitFailure', () => {
  it("names the exit code and git's own error, trimmed of the trailing newline", () => {
    expect(describeGitFailure(exited(128, NOT_AN_OBJECT))).toBe(
      'exit 128: fatal: Not a valid object name deadbee',
    );
  });

  it('names just the exit code when git printed nothing', () => {
    expect(describeGitFailure(exited(129))).toBe('exit 129');
  });

  it('treats whitespace-only stderr as printing nothing', () => {
    expect(describeGitFailure(exited(128, '\n'))).toBe('exit 128');
  });

  it('names the signal when git was killed instead of exiting', () => {
    expect(
      describeGitFailure({ status: null, signal: 'SIGTERM', stderr: '', spawnError: null }),
    ).toBe('killed by SIGTERM');
  });

  it('names the spawn error when git never started', () => {
    expect(
      describeGitFailure({
        status: null,
        signal: null,
        stderr: '',
        spawnError: 'spawnSync git EAGAIN',
      }),
    ).toBe('git did not start: spawnSync git EAGAIN');
  });
});

describe('checkAncestry', () => {
  /** Feeds `runs` to checkAncestry one attempt at a time, recording every call. */
  function harness(runs: GitRun[], maxAttempts = 3) {
    const queue = [...runs];
    const runOnce = vi.fn((_sha: string) => {
      const next = queue.shift();
      if (next === undefined) throw new Error('checkAncestry ran git more times than expected');
      return next;
    });
    const sleep = vi.fn((_ms: number) => undefined);
    const warn = vi.fn((_line: string) => undefined);
    const result = checkAncestry('abc1234', {
      runOnce,
      sleep,
      warn,
      maxAttempts,
      baseDelayMs: 100,
    });
    return { result, runOnce, sleep, warn };
  }

  it('reports an ancestor of HEAD (exit 0) as reachable after one run', () => {
    const { result, runOnce, sleep, warn } = harness([exited(0)]);
    expect(result).toEqual({ verdict: 'reachable' });
    expect(runOnce.mock.calls).toEqual([['abc1234']]);
    expect(sleep).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("reports exit 1 as unreachable without a retry — it is git's definite answer that the commit is not an ancestor", () => {
    const { result, runOnce, sleep } = harness([exited(1)]);
    expect(result).toEqual({ verdict: 'unreachable' });
    expect(runOnce).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries a failed git call instead of calling the citation unreachable — the transient error that reverted b7a7d0df', () => {
    // dd079e5e: under five-lane load a real ancestor came back "not reachable
    // from HEAD", because every non-zero exit used to read as "not an
    // ancestor". A failed call says nothing about history: retry it.
    const { result, runOnce, sleep, warn } = harness([
      exited(128, 'fatal: bad object\n'),
      exited(0),
    ]);
    expect(result).toEqual({ verdict: 'reachable' });
    expect(runOnce).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls).toEqual([[100]]);
    expect(warn.mock.calls).toEqual([
      [
        'check-doc-commit-refs: git could not check `abc1234` (exit 128: fatal: bad object); ' +
          'retrying in 100ms (attempt 1/3)',
      ],
    ]);
  });

  it('uses the answer of a retry that gets one, even when that answer is "not an ancestor"', () => {
    const { result, runOnce } = harness([exited(128), exited(1)]);
    expect(result).toEqual({ verdict: 'unreachable' });
    expect(runOnce).toHaveBeenCalledTimes(2);
  });

  it("reports a call that keeps failing as failed, with git's last error, after maxAttempts runs and a growing pause between them", () => {
    const { result, runOnce, sleep, warn } = harness([
      exited(128, 'fatal: first\n'),
      exited(128, 'fatal: second\n'),
      exited(128, NOT_AN_OBJECT),
    ]);
    expect(result).toEqual({
      verdict: 'failed',
      attempts: 3,
      detail: 'exit 128: fatal: Not a valid object name deadbee',
    });
    expect(runOnce).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[100], [200]]);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1]).toEqual([
      'check-doc-commit-refs: git could not check `abc1234` (exit 128: fatal: second); ' +
        'retrying in 200ms (attempt 2/3)',
    ]);
  });

  it('gives up after a single failed run when maxAttempts is 1, without pausing', () => {
    const { result, sleep, warn } = harness([exited(128)], 1);
    expect(result).toEqual({ verdict: 'failed', attempts: 1, detail: 'exit 128' });
    expect(sleep).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
