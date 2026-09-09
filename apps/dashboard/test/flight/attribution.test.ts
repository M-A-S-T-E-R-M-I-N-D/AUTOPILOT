// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * ATTRIBUTION.md §3's "conversations" channel — a comment or PR review the
 * fleet posts on a thread it participates in carries a compact signature,
 * once per message. Locks `withAttribution`'s shape against the doc's own
 * example format and its composition with `withAntiFlood` in `gh-exec.ts`,
 * the same "wired, not merely written" bar `anti-flood.test.ts` holds the
 * flood guard to.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  withAttribution,
  parseConversationPost,
  conversationSignature,
  attributionEnabled,
  AUTOPILOT_REPO_URL,
} from '../../src/flight/attribution.js';
import { withAntiFlood } from '../../src/flight/anti-flood.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

describe('conversationSignature — the doc’s own example format', () => {
  it('names the tool, the operator, and the repo, once', () => {
    const signature = conversationSignature('gabibi555');
    expect(signature).toBe(
      `— ✈️ AUTOPILOT agent, on behalf of @gabibi555 · [what is this?](${AUTOPILOT_REPO_URL})`,
    );
  });
});

describe('parseConversationPost — only thread-conversation argv is inspected', () => {
  it('parses issue comments, PR comments, and PR reviews carrying a body', () => {
    expect(parseConversationPost('gh', ['issue', 'comment', '16', '--body', 'x'])?.body).toBe('x');
    expect(parseConversationPost('gh', ['pr', 'comment', '33', '--body', 'x'])?.body).toBe('x');
    expect(
      parseConversationPost('gh', ['pr', 'review', '33', '--approve', '--body', 'x'])?.body,
    ).toBe('x');
    expect(
      parseConversationPost('gh', ['pr', 'review', '33', '--request-changes', '--body', 'x'])?.body,
    ).toBe('x');
  });

  it('ignores a review with no body, filing (a different channel), labels, and git', () => {
    expect(parseConversationPost('gh', ['pr', 'review', '33', '--approve'])).toBeNull();
    expect(
      parseConversationPost('gh', ['issue', 'create', '--title', 't', '--body', 'x']),
    ).toBeNull();
    expect(parseConversationPost('gh', ['issue', 'edit', '16', '--add-label', 'epic'])).toBeNull();
    expect(parseConversationPost('git', ['commit', '-m', 'x'])).toBeNull();
  });
});

/** The `--body` value of a recorded `[bin, ...args]` call, wherever it landed. */
function bodyOf(call: string[] | undefined): string | undefined {
  if (!call) return undefined;
  const i = call.indexOf('--body');
  return i === -1 ? undefined : call[i + 1];
}

/** A fake `gh` that answers the operator-identity lookup and records every real call. */
function fakeExec(login: string | undefined, calls: string[][]): CliExec {
  return async (bin, args) => {
    calls.push([bin, ...args]);
    if (bin === 'gh' && args[0] === 'api' && args[1] === 'user') {
      return login === undefined
        ? { code: 1, stdout: '' }
        : { code: 0, stdout: JSON.stringify({ login }) };
    }
    return { code: 0, stdout: '' };
  };
}

describe('withAttribution — signs every conversational post it recognizes', () => {
  it('appends the signature to a gh issue comment body', async () => {
    const calls: string[][] = [];
    const exec = withAttribution(fakeExec('gabibi555', calls));

    await exec('gh', ['issue', 'comment', '16', '--body', 'Fixed, take a look.']);

    const post = calls.find((c) => c[1] === 'issue' && c[2] === 'comment');
    expect(bodyOf(post)).toBe(`Fixed, take a look.\n\n${conversationSignature('gabibi555')}`);
  });

  it('appends the signature to a gh pr review body', async () => {
    const calls: string[][] = [];
    const exec = withAttribution(fakeExec('gabibi555', calls));

    await exec('gh', ['pr', 'review', '33', '--approve', '--body', 'Policy-green.']);

    const post = calls.find((c) => c[1] === 'pr' && c[2] === 'review');
    expect(bodyOf(post)).toBe(`Policy-green.\n\n${conversationSignature('gabibi555')}`);
  });

  it('never double-signs a body that already carries the signature', async () => {
    const calls: string[][] = [];
    const exec = withAttribution(fakeExec('gabibi555', calls));
    const alreadySigned = `Fixed, take a look.\n\n${conversationSignature('gabibi555')}`;

    await exec('gh', ['issue', 'comment', '16', '--body', alreadySigned]);

    const post = calls.find((c) => c[1] === 'issue' && c[2] === 'comment');
    expect(bodyOf(post)).toBe(alreadySigned);
  });

  it('passes filing, labels, and git through untouched, without resolving identity', async () => {
    const calls: string[][] = [];
    const exec = withAttribution(fakeExec('gabibi555', calls));

    await exec('gh', ['issue', 'create', '--title', 't', '--body', 'A filed report.']);
    await exec('gh', ['issue', 'edit', '16', '--add-label', 'epic']);
    await exec('git', ['commit', '-m', 'x']);

    expect(calls).toEqual([
      ['gh', 'issue', 'create', '--title', 't', '--body', 'A filed report.'],
      ['gh', 'issue', 'edit', '16', '--add-label', 'epic'],
      ['git', 'commit', '-m', 'x'],
    ]);
  });

  it('fails open and posts unsigned when the operator identity cannot be resolved', async () => {
    const calls: string[][] = [];
    const notes: string[] = [];
    const exec = withAttribution(fakeExec(undefined, calls), { onVerdict: (n) => notes.push(n) });

    const run = await exec('gh', ['issue', 'comment', '16', '--body', 'Fixed, take a look.']);

    expect(run.code).toBe(0);
    const post = calls.find((c) => c[1] === 'issue' && c[2] === 'comment');
    expect(bodyOf(post)).toBe('Fixed, take a look.');
    expect(notes[0]).toContain('unresolved');
  });
});

describe('AUTOPILOT_ATTRIBUTION=off — the doc’s one opt-out lever', () => {
  const original = process.env['AUTOPILOT_ATTRIBUTION'];

  afterEach(() => {
    if (original === undefined) delete process.env['AUTOPILOT_ATTRIBUTION'];
    else process.env['AUTOPILOT_ATTRIBUTION'] = original;
  });

  it('posts unsigned and skips the identity lookup entirely when set to off', async () => {
    process.env['AUTOPILOT_ATTRIBUTION'] = 'off';
    const calls: string[][] = [];
    const exec = withAttribution(fakeExec('gabibi555', calls));

    await exec('gh', ['issue', 'comment', '16', '--body', 'Fixed, take a look.']);

    expect(calls).toEqual([['gh', 'issue', 'comment', '16', '--body', 'Fixed, take a look.']]);
  });

  it('keeps signing for any other value, including unset', async () => {
    process.env['AUTOPILOT_ATTRIBUTION'] = 'on';
    const calls: string[][] = [];
    const exec = withAttribution(fakeExec('gabibi555', calls));

    await exec('gh', ['issue', 'comment', '16', '--body', 'Fixed, take a look.']);

    const post = calls.find((c) => c[1] === 'issue' && c[2] === 'comment');
    expect(bodyOf(post)).toBe(`Fixed, take a look.\n\n${conversationSignature('gabibi555')}`);
  });

  it("exports the same check other channels reuse (ATTRIBUTION channel 1's commit trailer, fly.ts)", () => {
    process.env['AUTOPILOT_ATTRIBUTION'] = 'off';
    expect(attributionEnabled()).toBe(false);
    process.env['AUTOPILOT_ATTRIBUTION'] = 'on';
    expect(attributionEnabled()).toBe(true);
    delete process.env['AUTOPILOT_ATTRIBUTION'];
    expect(attributionEnabled()).toBe(true);
  });
});

describe('composed with withAntiFlood — gh-exec.ts’s own ordering', () => {
  it('signs the post the flood guard let through, using its own real exec', async () => {
    const calls: string[][] = [];
    const inner: CliExec = async (bin, args) => {
      calls.push([bin, ...args]);
      if (bin === 'gh' && args[0] === 'api' && args[1] === 'user') {
        return { code: 0, stdout: JSON.stringify({ login: 'gabibi555' }) };
      }
      if (bin === 'gh' && args[0] === 'api' && String(args[1]).includes('/comments')) {
        return { code: 0, stdout: '[]' };
      }
      return { code: 0, stdout: '' };
    };
    const exec = withAntiFlood(withAttribution(inner));

    await exec('gh', ['issue', 'comment', '16', '--body', 'Fixed, take a look.']);

    const post = calls.find((c) => c[1] === 'issue' && c[2] === 'comment');
    expect(bodyOf(post)).toBe(`Fixed, take a look.\n\n${conversationSignature('gabibi555')}`);
  });

  it('never routes the flood guard’s own api reads or PATCH fold through the parser', async () => {
    const calls: string[][] = [];
    const thread = [
      { id: 1, user: { login: 'gabibi555' }, body: 'Opening this.' },
      {
        id: 2,
        user: { login: 'M-A-S-T-E-R-M-I-N-D' },
        body: 'First maintainer note about the sweep and its scope.',
      },
      {
        id: 3,
        user: { login: 'M-A-S-T-E-R-M-I-N-D' },
        body: 'Second maintainer note adding the label rationale.',
      },
    ];
    const inner: CliExec = async (bin, args) => {
      calls.push([bin, ...args]);
      if (bin === 'gh' && args[0] === 'api' && args[1] === 'user') {
        return { code: 0, stdout: JSON.stringify({ login: 'M-A-S-T-E-R-M-I-N-D' }) };
      }
      if (bin === 'gh' && args[0] === 'api' && String(args[1]).includes('/comments')) {
        return { code: 0, stdout: JSON.stringify(thread) };
      }
      return { code: 0, stdout: '' };
    };
    const exec = withAntiFlood(withAttribution(inner), {
      now: () => new Date('2026-09-09T00:00:00Z'),
    });

    await exec('gh', [
      'issue',
      'comment',
      '16',
      '--body',
      'A genuinely new finding, long enough to compare on its own merits here.',
    ]);

    const patch = calls.find((c) => c.includes('PATCH'));
    expect(patch).toBeDefined();
    expect(patch?.join(' ')).not.toContain('AUTOPILOT agent');
  });
});

describe('the helper is wired into gh-exec.ts, not merely written', () => {
  it('is exported from the flight surface and composed into the default exec', async () => {
    const mod = await import('../../src/flight/attribution.js');
    expect(typeof mod.withAttribution).toBe('function');
    expect(vi.isMockFunction(mod.withAttribution)).toBe(false);

    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const ghExecSource = readFileSync(
      fileURLToPath(new URL('../../src/flight/gh-exec.ts', import.meta.url)),
      'utf8',
    );
    expect(ghExecSource).toContain('withAttribution');
  });
});
