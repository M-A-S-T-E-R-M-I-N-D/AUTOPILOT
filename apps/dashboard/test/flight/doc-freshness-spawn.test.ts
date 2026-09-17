// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * `gitLastTouchedAt`'s spawn, asserted directly.
 *
 * `doc-freshness.test.ts` drives a REAL git repository, which is the right way
 * to test what the function returns — but it can never see the options the
 * spawn was given, so `windowsHide: true` sat there unkillable by mutation.
 *
 * That flag is not cosmetic here, and this module is the call site that
 * motivated the repo-wide rule: the freshness sweep runs one `git log` PER DOC
 * PATH, and without the flag the field reported "a ton of git cmd windows
 * opening and closing" across the operator's screen. Nothing breaks when it
 * regresses — no test fails, no log line appears, the flight still ships —
 * which is exactly why it drifted the first time.
 *
 * Mocking the subprocess is also the only way to prove the failure path
 * without a repo that genuinely has no git in it.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { gitLastTouchedAt } from '../../src/flight/doc-freshness.js';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

beforeEach(() => {
  vi.mocked(execFileSync).mockReset();
});

describe('gitLastTouchedAt', () => {
  it('asks git for the last commit time of exactly that path, with the console hidden', () => {
    vi.mocked(execFileSync).mockReturnValue(
      '1789600000\n' as unknown as ReturnType<typeof execFileSync>,
    );

    expect(gitLastTouchedAt('/repo', 'docs/ROADMAP.md')).toBe(1789600000 * 1000);

    const [command, args, options] = vi.mocked(execFileSync).mock.calls[0]!;
    expect(command).toBe('git');
    expect(args).toEqual(['-C', '/repo', 'log', '-1', '--format=%ct', '--', 'docs/ROADMAP.md']);
    // windowsHide: one git log runs PER DOC PATH, so without it a single
    // freshness sweep flashes a burst of console windows at the operator.
    expect(options).toMatchObject({ encoding: 'utf8', windowsHide: true });
  });

  it('returns null rather than throwing when git is absent or the path is not in a repo', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('not a git repository');
    });

    expect(gitLastTouchedAt('/not-a-repo', 'docs/ROADMAP.md')).toBeNull();
  });

  it('returns null for an empty answer — a path git has never committed', () => {
    vi.mocked(execFileSync).mockReturnValue('' as unknown as ReturnType<typeof execFileSync>);

    expect(gitLastTouchedAt('/repo', 'docs/NEVER-COMMITTED.md')).toBeNull();
  });
});
