// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * gh-exec.ts is the one place `realCliExec` gets wrapped into the guarded
 * default every flight module posts through — `gh-exec-census.test.ts` locks
 * that wiring at the source-text level, and `attribution.test.ts` /
 * `anti-flood.test.ts` each already prove the COMPOSITION behavior against a
 * hand-rebuilt `withAntiFlood(withAttribution(inner))`. None of those runs
 * the actual exported `ghExec` constant itself, built from the real
 * `realCliExec` import with its `onVerdict` callback wired to
 * `process.stdout.write` — a wiring mistake specific to this file (wrong
 * argument order, a dropped wrapper, the callback going nowhere) would pass
 * every existing test and only show up here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as CliProbeModule from '../../src/connection/cli-probe.js';
import type { CliExec, CliRun } from '../../src/connection/cli-probe.js';

const execImpl = vi.fn<CliExec>();

vi.mock('../../src/connection/cli-probe.js', async (importOriginal) => {
  const actual = await importOriginal<typeof CliProbeModule>();
  return {
    ...actual,
    realCliExec: (bin: string, args: readonly string[]): Promise<CliRun> => execImpl(bin, args),
  };
});

beforeEach(() => {
  execImpl.mockReset();
});

/** The `--body` value of a recorded `[bin, ...args]` call, wherever it landed. */
function bodyOf(call: string[] | undefined): string | undefined {
  if (!call) return undefined;
  const i = call.indexOf('--body');
  return i === -1 ? undefined : call[i + 1];
}

describe('ghExec — the real export, not a hand-rebuilt equivalent', () => {
  it('signs a comment the flood guard lets through, dispatching through the real realCliExec import', async () => {
    const calls: string[][] = [];
    execImpl.mockImplementation(async (bin, args) => {
      calls.push([bin, ...args]);
      if (bin === 'gh' && args[0] === 'api' && args[1] === 'user') {
        return { code: 0, stdout: JSON.stringify({ login: 'gabibi555' }) };
      }
      if (bin === 'gh' && args[0] === 'api' && String(args[1]).includes('/comments')) {
        return { code: 0, stdout: '[]' };
      }
      return { code: 0, stdout: '' };
    });

    const { ghExec } = await import('../../src/flight/gh-exec.js');
    await ghExec('gh', ['issue', 'comment', '16', '--body', 'Fixed, take a look.']);

    const post = calls.find((c) => c[1] === 'issue' && c[2] === 'comment');
    expect(bodyOf(post)).toContain('AUTOPILOT agent, on behalf of @gabibi555');
  });

  it('suppresses a duplicate before attribution ever runs — no comment call reaches the real exec', async () => {
    const calls: string[][] = [];
    const existing = 'Fixed, take a look — pushed the change and reran the gate here.';
    execImpl.mockImplementation(async (bin, args) => {
      calls.push([bin, ...args]);
      if (bin === 'gh' && args[0] === 'api' && args[1] === 'user') {
        return { code: 0, stdout: JSON.stringify({ login: 'M-A-S-T-E-R-M-I-N-D' }) };
      }
      if (bin === 'gh' && args[0] === 'api' && String(args[1]).includes('/comments')) {
        return {
          code: 0,
          stdout: JSON.stringify([
            { id: 1, user: { login: 'M-A-S-T-E-R-M-I-N-D' }, body: existing },
          ]),
        };
      }
      return { code: 0, stdout: '' };
    });

    const { ghExec } = await import('../../src/flight/gh-exec.js');
    const run = await ghExec('gh', ['issue', 'comment', '16', '--body', existing]);

    expect(run.code).toBe(0);
    expect(calls.find((c) => c[1] === 'issue' && c[2] === 'comment')).toBeUndefined();
  });

  it('writes the anti-flood verdict note to process.stdout — the callback attribution/anti-flood tests never exercise', async () => {
    const thread = [
      {
        id: 1,
        user: { login: 'M-A-S-T-E-R-M-I-N-D' },
        body: 'First maintainer note about the sweep and its scope.',
      },
      {
        id: 2,
        user: { login: 'M-A-S-T-E-R-M-I-N-D' },
        body: 'Second maintainer note adding the label rationale.',
      },
    ];
    execImpl.mockImplementation(async (bin, args) => {
      if (bin === 'gh' && args[0] === 'api' && args[1] === 'user') {
        return { code: 0, stdout: JSON.stringify({ login: 'M-A-S-T-E-R-M-I-N-D' }) };
      }
      if (bin === 'gh' && args[0] === 'api' && String(args[1]).includes('/comments')) {
        return { code: 0, stdout: JSON.stringify(thread) };
      }
      return { code: 0, stdout: '' };
    });
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { ghExec } = await import('../../src/flight/gh-exec.js');
    await ghExec('gh', [
      'issue',
      'comment',
      '16',
      '--body',
      'A genuinely new finding, long enough to compare on its own merits here.',
    ]);

    const note = writeSpy.mock.calls.map((c) => String(c[0])).find((s) => s.includes('anti-flood'));
    expect(note).toContain('folded into comment');
    writeSpy.mockRestore();
  });
});
