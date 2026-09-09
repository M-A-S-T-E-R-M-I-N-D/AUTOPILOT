// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  resolveSocialIdentity,
  createSocialIdentityApi,
  fetchOwnSubmissions,
  fetchSocialPassReport,
  planSocialProtocol,
  type SocialCandidateAction,
} from '../../src/flight/social-pass.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

function execFor(responses: Record<string, { code: number; stdout: string }>): CliExec {
  return vi.fn(async (bin: string, args: readonly string[]) => {
    const key = [bin, ...args].join(' ');
    for (const [pattern, response] of Object.entries(responses)) {
      if (key.includes(pattern)) return response;
    }
    return { code: 1, stdout: '' };
  });
}

describe('resolveSocialIdentity', () => {
  it('resolves maintainer role when the login matches the repo owner segment', async () => {
    const exec = execFor({
      'gh api user': { code: 0, stdout: JSON.stringify({ login: 'octocat' }) },
      'gh repo view': {
        code: 0,
        stdout: JSON.stringify({
          nameWithOwner: 'octocat/hello-world',
          url: 'https://github.com/octocat/hello-world',
          isPrivate: false,
        }),
      },
    });

    expect(await resolveSocialIdentity(exec)).toEqual({
      login: 'octocat',
      nameWithOwner: 'octocat/hello-world',
      role: 'maintainer',
    });
  });

  it('resolves maintainer role case-insensitively', async () => {
    const exec = execFor({
      'gh api user': { code: 0, stdout: JSON.stringify({ login: 'OctoCat' }) },
      'gh repo view': {
        code: 0,
        stdout: JSON.stringify({
          nameWithOwner: 'octocat/hello-world',
          url: 'https://github.com/octocat/hello-world',
          isPrivate: false,
        }),
      },
    });

    expect((await resolveSocialIdentity(exec))?.role).toBe('maintainer');
  });

  it('resolves user role when the login is not the repo owner', async () => {
    const exec = execFor({
      'gh api user': { code: 0, stdout: JSON.stringify({ login: 'a-contributor' }) },
      'gh repo view': {
        code: 0,
        stdout: JSON.stringify({
          nameWithOwner: 'octocat/hello-world',
          url: 'https://github.com/octocat/hello-world',
          isPrivate: false,
        }),
      },
    });

    expect(await resolveSocialIdentity(exec)).toEqual({
      login: 'a-contributor',
      nameWithOwner: 'octocat/hello-world',
      role: 'user',
    });
  });

  it('returns undefined when the viewer login cannot be resolved', async () => {
    const exec = execFor({
      'gh api user': { code: 1, stdout: '' },
      'gh repo view': {
        code: 0,
        stdout: JSON.stringify({
          nameWithOwner: 'octocat/hello-world',
          url: 'https://github.com/octocat/hello-world',
          isPrivate: false,
        }),
      },
    });

    expect(await resolveSocialIdentity(exec)).toBeUndefined();
  });

  it('returns undefined when the repo identity cannot be resolved', async () => {
    const exec = execFor({
      'gh api user': { code: 0, stdout: JSON.stringify({ login: 'octocat' }) },
      'gh repo view': { code: 1, stdout: '' },
    });

    expect(await resolveSocialIdentity(exec)).toBeUndefined();
  });
});

describe('createSocialIdentityApi', () => {
  it('resolves the identity through the injected exec', async () => {
    const exec = execFor({
      'gh api user': { code: 0, stdout: JSON.stringify({ login: 'octocat' }) },
      'gh repo view': {
        code: 0,
        stdout: JSON.stringify({
          nameWithOwner: 'octocat/hello-world',
          url: 'https://github.com/octocat/hello-world',
          isPrivate: false,
        }),
      },
    });

    const api = createSocialIdentityApi(exec);

    expect(await api()).toEqual({
      login: 'octocat',
      nameWithOwner: 'octocat/hello-world',
      role: 'maintainer',
    });
  });

  it('degrades to undefined rather than rejecting when exec throws', async () => {
    const throwingExec = vi.fn(async () => {
      throw new Error('gh not installed');
    });

    const api = createSocialIdentityApi(throwingExec);

    await expect(api()).resolves.toBeUndefined();
  });
});

describe('fetchOwnSubmissions', () => {
  it('calls gh issue list and gh pr list with the expected argv', async () => {
    const exec = execFor({
      'issue list': { code: 0, stdout: '[]' },
      'pr list': { code: 0, stdout: '[]' },
    });

    await fetchOwnSubmissions(exec, 'octocat');

    expect(exec).toHaveBeenCalledWith('gh', [
      'issue',
      'list',
      '--author',
      'octocat',
      '--state',
      'all',
      '--json',
      'number,title,url,state',
    ]);
    expect(exec).toHaveBeenCalledWith('gh', [
      'pr',
      'list',
      '--author',
      'octocat',
      '--state',
      'all',
      '--json',
      'number,title,url,state',
    ]);
  });

  it('merges parsed issues before PRs', async () => {
    const exec = execFor({
      'issue list': {
        code: 0,
        stdout: JSON.stringify([
          { number: 1, title: 'An issue', url: 'https://github.com/o/r/issues/1', state: 'OPEN' },
        ]),
      },
      'pr list': {
        code: 0,
        stdout: JSON.stringify([
          { number: 2, title: 'A PR', url: 'https://github.com/o/r/pull/2', state: 'MERGED' },
        ]),
      },
    });

    expect(await fetchOwnSubmissions(exec, 'octocat')).toEqual([
      {
        kind: 'issue',
        number: 1,
        title: 'An issue',
        url: 'https://github.com/o/r/issues/1',
        state: 'OPEN',
      },
      {
        kind: 'pr',
        number: 2,
        title: 'A PR',
        url: 'https://github.com/o/r/pull/2',
        state: 'MERGED',
      },
    ]);
  });

  it('degrades a failing read to an empty list without failing the other', async () => {
    const exec = execFor({
      'issue list': { code: 1, stdout: '' },
      'pr list': {
        code: 0,
        stdout: JSON.stringify([
          { number: 2, title: 'A PR', url: 'https://github.com/o/r/pull/2', state: 'MERGED' },
        ]),
      },
    });

    expect(await fetchOwnSubmissions(exec, 'octocat')).toEqual([
      {
        kind: 'pr',
        number: 2,
        title: 'A PR',
        url: 'https://github.com/o/r/pull/2',
        state: 'MERGED',
      },
    ]);
  });

  it('skips entries missing a required field', async () => {
    const exec = execFor({
      'issue list': {
        code: 0,
        stdout: JSON.stringify([{ number: 1, title: 'Missing url/state' }]),
      },
      'pr list': { code: 0, stdout: '[]' },
    });

    expect(await fetchOwnSubmissions(exec, 'octocat')).toEqual([]);
  });

  it('returns an empty list on unparseable stdout', async () => {
    const exec = execFor({
      'issue list': { code: 0, stdout: 'not json' },
      'pr list': { code: 0, stdout: '[]' },
    });

    expect(await fetchOwnSubmissions(exec, 'octocat')).toEqual([]);
  });

  it('returns an empty list when the payload is not an array', async () => {
    const exec = execFor({
      'issue list': { code: 0, stdout: JSON.stringify({ not: 'an array' }) },
      'pr list': { code: 0, stdout: '[]' },
    });

    expect(await fetchOwnSubmissions(exec, 'octocat')).toEqual([]);
  });
});

describe('fetchSocialPassReport', () => {
  it('composes identity and own-submissions behind one call', async () => {
    const exec = execFor({
      'gh api user': { code: 0, stdout: JSON.stringify({ login: 'octocat' }) },
      'gh repo view': {
        code: 0,
        stdout: JSON.stringify({
          nameWithOwner: 'octocat/hello-world',
          url: 'https://github.com/octocat/hello-world',
          isPrivate: false,
        }),
      },
      'issue list': {
        code: 0,
        stdout: JSON.stringify([
          { number: 1, title: 'An issue', url: 'https://github.com/o/r/issues/1', state: 'OPEN' },
        ]),
      },
      'pr list': { code: 0, stdout: '[]' },
    });

    const report = await fetchSocialPassReport(exec);

    expect(report.identity).toEqual({
      login: 'octocat',
      nameWithOwner: 'octocat/hello-world',
      role: 'maintainer',
    });
    expect(report.ownSubmissions).toEqual([
      {
        kind: 'issue',
        number: 1,
        title: 'An issue',
        url: 'https://github.com/o/r/issues/1',
        state: 'OPEN',
      },
    ]);
  });

  it('skips the own-submissions read entirely when identity is unresolved', async () => {
    const exec = execFor({
      'gh api user': { code: 1, stdout: '' },
    });

    const report = await fetchSocialPassReport(exec);

    expect(report.identity).toBeUndefined();
    expect(report.ownSubmissions).toEqual([]);
    expect(exec).not.toHaveBeenCalledWith('gh', expect.arrayContaining(['--author']));
  });
});

describe('planSocialProtocol', () => {
  it('admits every candidate when none exceed their cap', () => {
    const candidates: SocialCandidateAction[] = [
      { kind: 'new-issue', reasoning: 'first' },
      { kind: 'comment', reasoning: 'second' },
    ];

    const verdict = planSocialProtocol(candidates, { maxNewIssues: 2, maxComments: 2 });

    expect(verdict.allowed).toEqual(candidates);
    expect(verdict.queued).toEqual([]);
  });

  it('queues new-issue candidates once the new-issue cap is reached', () => {
    const candidates: SocialCandidateAction[] = [
      { kind: 'new-issue', reasoning: 'first' },
      { kind: 'new-issue', reasoning: 'second' },
      { kind: 'new-issue', reasoning: 'third' },
    ];

    const verdict = planSocialProtocol(candidates, { maxNewIssues: 1, maxComments: 5 });

    expect(verdict.allowed).toEqual([candidates[0]]);
    expect(verdict.queued).toEqual([candidates[1], candidates[2]]);
  });

  it('budgets new-issue and comment caps independently', () => {
    const candidates: SocialCandidateAction[] = [
      { kind: 'new-issue', reasoning: 'issue one' },
      { kind: 'comment', reasoning: 'comment one' },
      { kind: 'comment', reasoning: 'comment two' },
    ];

    const verdict = planSocialProtocol(candidates, { maxNewIssues: 1, maxComments: 1 });

    expect(verdict.allowed).toEqual([candidates[0], candidates[1]]);
    expect(verdict.queued).toEqual([candidates[2]]);
  });

  it('never drops a candidate — every input lands in allowed or queued exactly once', () => {
    const candidates: SocialCandidateAction[] = Array.from({ length: 10 }, (_, i) => ({
      kind: i % 2 === 0 ? 'new-issue' : 'comment',
      reasoning: `candidate ${i}`,
    }));

    const verdict = planSocialProtocol(candidates, { maxNewIssues: 2, maxComments: 2 });

    expect(verdict.allowed.length + verdict.queued.length).toBe(candidates.length);
    expect(
      [...verdict.allowed, ...verdict.queued].sort((a, b) =>
        a.reasoning.localeCompare(b.reasoning),
      ),
    ).toEqual([...candidates].sort((a, b) => a.reasoning.localeCompare(b.reasoning)));
  });

  it('returns empty allowed/queued for zero candidates', () => {
    expect(planSocialProtocol([], { maxNewIssues: 3, maxComments: 3 })).toEqual({
      allowed: [],
      queued: [],
    });
  });
});
