// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The Social Flight's weave-in pass (epic 0016 slice 3/6, board
 * web-mtpzzx7v-72q2dv): the toggle gate, the self-target guard, the clean
 * refusal when gh is not connected, and the read-only pass that composes
 * the identity/inventory reads with the pure protocol engine — plus a pin
 * on fly.ts's three call sites (start, interval, end), so the wiring cannot
 * be dropped silently.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  runSocialFlightPass,
  SOCIAL_FLIGHT_PASS_CAPS,
} from '../../src/flight/social-flight-pass.js';
import type { SocialCandidateAction } from '../../src/flight/social-pass.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

const ENGINE = '/the/engine/repo';
/** Long enough (≥ anti-flood's MIN_COMPARE_LENGTH) for the dedup check to apply. */
const OWN_ISSUE_TITLE = 'The README install section still names the retired npx launcher flow';

function execFor(
  responses: Record<string, { code: number; stdout: string }>,
  calls: Array<readonly string[]> = [],
): CliExec {
  return vi.fn(async (bin: string, args: readonly string[]) => {
    calls.push(args);
    const key = [bin, ...args].join(' ');
    for (const [pattern, response] of Object.entries(responses)) {
      if (key.includes(pattern)) return response;
    }
    return { code: 1, stdout: '' };
  });
}

function connectedGh(
  login: string,
  owner: string,
): Record<string, { code: number; stdout: string }> {
  return {
    'gh api user': { code: 0, stdout: JSON.stringify({ login }) },
    'gh repo view': {
      code: 0,
      stdout: JSON.stringify({
        nameWithOwner: `${owner}/hello-world`,
        url: `https://github.com/${owner}/hello-world`,
        isPrivate: false,
      }),
    },
    'issue list --author': {
      code: 0,
      stdout: JSON.stringify([
        {
          number: 1,
          title: OWN_ISSUE_TITLE,
          url: 'https://github.com/o/r/issues/1',
          state: 'OPEN',
        },
      ]),
    },
    'pr list --author': { code: 0, stdout: '[]' },
    'issue list --state': {
      code: 0,
      stdout: JSON.stringify([
        { number: 3, title: 'Someone else', url: 'https://github.com/o/r/issues/3', state: 'OPEN' },
        {
          number: 4,
          title: 'Another thread',
          url: 'https://github.com/o/r/issues/4',
          state: 'OPEN',
        },
      ]),
    },
    'pr list --state': { code: 0, stdout: '[]' },
  };
}

const isListRead = (args: readonly string[]): boolean => args[1] === 'list';
const isWrite = (args: readonly string[]): boolean =>
  args[1] === 'create' || args[1] === 'comment' || args[1] === 'edit' || args[1] === 'close';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runSocialFlightPass — the toggle gate', () => {
  it('an unset toggle never reaches gh at all, not even for a read', async () => {
    const calls: Array<readonly string[]> = [];
    const exec = execFor(connectedGh('octocat', 'octocat'), calls);

    const outcome = await runSocialFlightPass('start', undefined, { exec, engineRepo: ENGINE });

    expect(outcome).toEqual({ ran: false, phase: 'start', toggle: 'off', reason: 'toggle-off' });
    expect(calls).toEqual([]);
  });

  it('an unrecognized toggle value is off (fail-closed), not on', async () => {
    const calls: Array<readonly string[]> = [];
    const exec = execFor(connectedGh('octocat', 'octocat'), calls);

    const outcome = await runSocialFlightPass('end', 'yes', { exec, engineRepo: ENGINE });

    expect(outcome).toMatchObject({ ran: false, toggle: 'off', reason: 'toggle-off' });
    expect(calls).toEqual([]);
  });

  it('a toggle for one phase skips the other phase without a gh call', async () => {
    const calls: Array<readonly string[]> = [];
    const exec = execFor(connectedGh('octocat', 'octocat'), calls);

    expect(await runSocialFlightPass('end', 'start', { exec, engineRepo: ENGINE })).toEqual({
      ran: false,
      phase: 'end',
      toggle: 'start',
      reason: 'phase-not-enabled',
    });
    expect(await runSocialFlightPass('start', 'end', { exec, engineRepo: ENGINE })).toMatchObject({
      ran: false,
      reason: 'phase-not-enabled',
    });
    expect(calls).toEqual([]);
  });

  it('start and end each run under their own toggle value and under full', async () => {
    const exec = execFor(connectedGh('octocat', 'octocat'));

    expect(await runSocialFlightPass('start', 'start', { exec, engineRepo: ENGINE })).toMatchObject(
      {
        ran: true,
      },
    );
    expect(await runSocialFlightPass('end', 'end', { exec, engineRepo: ENGINE })).toMatchObject({
      ran: true,
    });
    expect(await runSocialFlightPass('start', 'full', { exec, engineRepo: ENGINE })).toMatchObject({
      ran: true,
    });
    expect(
      await runSocialFlightPass('interval', 'full', { exec, engineRepo: ENGINE }),
    ).toMatchObject({ ran: true, phase: 'interval' });
  });
});

describe('runSocialFlightPass — the self-target guard', () => {
  it('a foreign target refuses before any gh call, even with the toggle on full', async () => {
    const calls: Array<readonly string[]> = [];
    const exec = execFor(connectedGh('octocat', 'octocat'), calls);
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    const outcome = await runSocialFlightPass('start', 'full', {
      exec,
      target: '/some/other/folder',
      engineRepo: ENGINE,
    });

    expect(outcome).toEqual({
      ran: false,
      phase: 'start',
      toggle: 'full',
      reason: 'foreign-target',
    });
    expect(calls).toEqual([]);
    expect(write.mock.calls.map((c) => String(c[0])).join('')).toContain(
      'not this engine checkout',
    );
  });

  it('the engine checkout itself as the target passes the guard', async () => {
    const exec = execFor(connectedGh('octocat', 'octocat'));

    const outcome = await runSocialFlightPass('end', 'full', {
      exec,
      target: ENGINE,
      engineRepo: ENGINE,
    });

    expect(outcome).toMatchObject({ ran: true });
  });
});

describe('runSocialFlightPass — refuses cleanly when gh is not connected', () => {
  it('an unresolved identity stops before a single inventory read and says why', async () => {
    const calls: Array<readonly string[]> = [];
    // `gh api user` fails (no auth) while `gh repo view` would answer.
    const exec = execFor(
      { ...connectedGh('octocat', 'octocat'), 'gh api user': { code: 1, stdout: '' } },
      calls,
    );
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    const outcome = await runSocialFlightPass('start', 'full', { exec, engineRepo: ENGINE });

    expect(outcome).toEqual({
      ran: false,
      phase: 'start',
      toggle: 'full',
      reason: 'gh-disconnected',
    });
    expect(calls.some(isListRead)).toBe(false);
    expect(write.mock.calls.map((c) => String(c[0])).join('')).toContain('gh is not connected');
  });

  it('a throwing exec is reported as disconnected, never thrown out of the flight', async () => {
    const exec: CliExec = vi.fn(async () => {
      throw new Error('spawn gh ENOENT');
    });
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    await expect(
      runSocialFlightPass('end', 'end', { exec, engineRepo: ENGINE }),
    ).resolves.toMatchObject({ ran: false, reason: 'gh-disconnected' });
  });
});

describe('runSocialFlightPass — the read-only pass', () => {
  it('inventories as the resolved identity and plans an empty verdict with the default caps', async () => {
    const calls: Array<readonly string[]> = [];
    const exec = execFor(connectedGh('octocat', 'octocat'), calls);
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    const outcome = await runSocialFlightPass('end', 'full', { exec, engineRepo: ENGINE });

    expect(outcome).toEqual({
      ran: true,
      phase: 'end',
      toggle: 'full',
      identity: {
        login: 'octocat',
        nameWithOwner: 'octocat/hello-world',
        role: 'maintainer',
        tier: 'Maintainer',
      },
      ownSubmissions: 1,
      openThreads: 2,
      caps: SOCIAL_FLIGHT_PASS_CAPS,
      verdict: { allowed: [], queued: [], duplicate: [], refused: [] },
    });
    // Reads only: identity, own submissions (issue + pr), open threads (issue + pr).
    expect(calls.filter(isListRead)).toHaveLength(4);
    expect(calls.some(isWrite)).toBe(false);
    // Epic law 4: the caps are visible in the flight log every time the pass runs.
    const log = write.mock.calls.map((c) => String(c[0])).join('');
    expect(log).toContain('caps ≤1 new issue(s), ≤3 comment(s)');
    expect(log).toContain('as @octocat [maintainer]');
    expect(log).toContain('nothing posted');
  });

  it('routes handed-in candidates through the protocol engine — role, who was asked, dedup and caps — and still posts nothing', async () => {
    const calls: Array<readonly string[]> = [];
    // A guest (not the repo owner) flying as themselves.
    const exec = execFor(connectedGh('guest', 'octocat'), calls);
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const candidates: readonly SocialCandidateAction[] = [
      { kind: 'comment', reasoning: 'triage', requiresMaintainer: true, issueNumber: 3, body: 'x' },
      { kind: 'new-issue', reasoning: 'dup', title: OWN_ISSUE_TITLE, body: 'x' },
      { kind: 'new-issue', reasoning: 'first', title: 'A fresh finding about links', body: 'x' },
      {
        kind: 'new-issue',
        reasoning: 'second',
        title: 'Another fresh finding entirely',
        body: 'x',
      },
      // Law 5's second half: the pass passes the resolved login to the
      // engine, so a question asked of the OWNER is not the guest's to answer
      // while one asked of the guest themselves is.
      {
        kind: 'comment',
        reasoning: 'asked of the owner',
        askedOf: 'octocat',
        issueNumber: 4,
        body: 'x',
      },
      { kind: 'comment', reasoning: 'asked of me', askedOf: 'guest', issueNumber: 4, body: 'x' },
    ];

    const outcome = await runSocialFlightPass('start', 'start', {
      exec,
      engineRepo: ENGINE,
      candidates,
      caps: { maxNewIssues: 1, maxComments: 1 },
    });

    expect(outcome).toMatchObject({
      ran: true,
      identity: { login: 'guest', role: 'user' },
      verdict: {
        refused: [candidates[0], candidates[4]],
        duplicate: [candidates[1]],
        allowed: [candidates[2], candidates[5]],
        queued: [candidates[3]],
      },
    });
    // Allowed is a plan, not a post: this slice never executes a command.
    expect(calls.some(isWrite)).toBe(false);
  });
});

describe('fly.ts weaves the pass in at its start, interval and end phases', () => {
  it('calls runSocialFlightPass for all three phases from the raw env toggle, self-target guarded', () => {
    const fly = readFileSync(new URL('../../src/fly.ts', import.meta.url), 'utf8');
    expect(fly).toContain(
      "runSocialFlightPass('start', process.env['AUTOPILOT_SOCIAL_FLIGHT'], { target })",
    );
    expect(fly).toContain(
      "runSocialFlightPass('interval', process.env['AUTOPILOT_SOCIAL_FLIGHT'], { target })",
    );
    expect(fly).toContain(
      "runSocialFlightPass('end', process.env['AUTOPILOT_SOCIAL_FLIGHT'], { target })",
    );
  });

  it('gates the interval call on isBetweenFirings, so the last firing never doubles with the end pass', () => {
    const fly = readFileSync(new URL('../../src/fly.ts', import.meta.url), 'utf8');
    expect(fly).toContain('if (isBetweenFirings(firingsCompletedThisFlight, firings))');
  });
});
