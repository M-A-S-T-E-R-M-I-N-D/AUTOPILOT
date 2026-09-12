// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  resolveSocialIdentity,
  createSocialIdentityApi,
  fetchOwnSubmissions,
  fetchOpenThreads,
  fetchSocialPassReport,
  planSocialProtocol,
  type SocialCandidateAction,
  type SocialSubmission,
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
      tier: 'Maintainer',
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
      // Not in TRUSTED-CONTRIBUTORS.md → the Newcomer floor (#45).
      tier: 'Newcomer',
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
      tier: 'Maintainer',
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

describe('fetchOpenThreads', () => {
  it('calls gh issue list and gh pr list filtered to open, with no --author', async () => {
    const exec = execFor({
      'issue list': { code: 0, stdout: '[]' },
      'pr list': { code: 0, stdout: '[]' },
    });

    await fetchOpenThreads(exec);

    expect(exec).toHaveBeenCalledWith('gh', [
      'issue',
      'list',
      '--state',
      'open',
      '--json',
      'number,title,url,state',
    ]);
    expect(exec).toHaveBeenCalledWith('gh', [
      'pr',
      'list',
      '--state',
      'open',
      '--json',
      'number,title,url,state',
    ]);
    expect(exec).not.toHaveBeenCalledWith('gh', expect.arrayContaining(['--author']));
  });

  it('merges parsed issues before PRs', async () => {
    const exec = execFor({
      'issue list': {
        code: 0,
        stdout: JSON.stringify([
          {
            number: 3,
            title: 'Someone else filed this',
            url: 'https://github.com/o/r/issues/3',
            state: 'OPEN',
          },
        ]),
      },
      'pr list': {
        code: 0,
        stdout: JSON.stringify([
          { number: 4, title: 'An open PR', url: 'https://github.com/o/r/pull/4', state: 'OPEN' },
        ]),
      },
    });

    expect(await fetchOpenThreads(exec)).toEqual([
      {
        kind: 'issue',
        number: 3,
        title: 'Someone else filed this',
        url: 'https://github.com/o/r/issues/3',
        state: 'OPEN',
      },
      {
        kind: 'pr',
        number: 4,
        title: 'An open PR',
        url: 'https://github.com/o/r/pull/4',
        state: 'OPEN',
      },
    ]);
  });

  it('degrades a failing read to an empty list without failing the other', async () => {
    const exec = execFor({
      'issue list': { code: 1, stdout: '' },
      'pr list': {
        code: 0,
        stdout: JSON.stringify([
          { number: 4, title: 'An open PR', url: 'https://github.com/o/r/pull/4', state: 'OPEN' },
        ]),
      },
    });

    expect(await fetchOpenThreads(exec)).toEqual([
      {
        kind: 'pr',
        number: 4,
        title: 'An open PR',
        url: 'https://github.com/o/r/pull/4',
        state: 'OPEN',
      },
    ]);
  });
});

describe('fetchSocialPassReport', () => {
  it('composes identity, own-submissions, and open-threads behind one call', async () => {
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
      'issue list --author': {
        code: 0,
        stdout: JSON.stringify([
          { number: 1, title: 'An issue', url: 'https://github.com/o/r/issues/1', state: 'OPEN' },
        ]),
      },
      'pr list --author': { code: 0, stdout: '[]' },
      'issue list --state': {
        code: 0,
        stdout: JSON.stringify([
          {
            number: 3,
            title: 'Someone else filed this',
            url: 'https://github.com/o/r/issues/3',
            state: 'OPEN',
          },
        ]),
      },
      'pr list --state': { code: 0, stdout: '[]' },
    });

    const report = await fetchSocialPassReport(exec);

    expect(report.identity).toEqual({
      login: 'octocat',
      nameWithOwner: 'octocat/hello-world',
      role: 'maintainer',
      tier: 'Maintainer',
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
    expect(report.openThreads).toEqual([
      {
        kind: 'issue',
        number: 3,
        title: 'Someone else filed this',
        url: 'https://github.com/o/r/issues/3',
        state: 'OPEN',
      },
    ]);
  });

  it('skips the own-submissions read but still fetches open-threads when identity is unresolved', async () => {
    const exec = execFor({
      'gh api user': { code: 1, stdout: '' },
      'issue list --state': { code: 0, stdout: '[]' },
      'pr list --state': { code: 0, stdout: '[]' },
    });

    const report = await fetchSocialPassReport(exec);

    expect(report.identity).toBeUndefined();
    expect(report.ownSubmissions).toEqual([]);
    expect(report.openThreads).toEqual([]);
    expect(exec).not.toHaveBeenCalledWith('gh', expect.arrayContaining(['--author']));
    expect(exec).toHaveBeenCalledWith('gh', expect.arrayContaining(['--state', 'open']));
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

  it('returns empty allowed/queued/duplicate/refused for zero candidates', () => {
    expect(planSocialProtocol([], { maxNewIssues: 3, maxComments: 3 })).toEqual({
      allowed: [],
      queued: [],
      duplicate: [],
      refused: [],
    });
  });

  it('diverts a new-issue candidate matching an own issue title to duplicate (law 1)', () => {
    const ownSubmissions: SocialSubmission[] = [
      {
        kind: 'issue',
        number: 1,
        title: 'The dashboard fails to render the fleet view on narrow viewports',
        url: 'https://github.com/o/r/issues/1',
        state: 'OPEN',
      },
    ];
    const candidates: SocialCandidateAction[] = [
      {
        kind: 'new-issue',
        reasoning: 'found the same bug independently',
        title: 'Dashboard fails to render the fleet view on narrow viewports',
      },
    ];

    const verdict = planSocialProtocol(
      candidates,
      { maxNewIssues: 5, maxComments: 5 },
      ownSubmissions,
    );

    expect(verdict.duplicate).toEqual(candidates);
    expect(verdict.allowed).toEqual([]);
    expect(verdict.queued).toEqual([]);
  });

  it('does not count a duplicate candidate against the new-issue cap', () => {
    const ownSubmissions: SocialSubmission[] = [
      {
        kind: 'issue',
        number: 1,
        title: 'The dashboard fails to render the fleet view on narrow viewports',
        url: 'https://github.com/o/r/issues/1',
        state: 'OPEN',
      },
    ];
    const candidates: SocialCandidateAction[] = [
      {
        kind: 'new-issue',
        reasoning: 'duplicate of #1',
        title: 'Dashboard fails to render the fleet view on narrow viewports',
      },
      { kind: 'new-issue', reasoning: 'genuinely new finding' },
    ];

    const verdict = planSocialProtocol(
      candidates,
      { maxNewIssues: 1, maxComments: 5 },
      ownSubmissions,
    );

    expect(verdict.duplicate).toEqual([candidates[0]]);
    expect(verdict.allowed).toEqual([candidates[1]]);
    expect(verdict.queued).toEqual([]);
  });

  it('diverts a new-issue candidate matching an OPEN THREAD title to duplicate, even when ownSubmissions is empty (law 1 beyond "already ours")', () => {
    const openThreads: SocialSubmission[] = [
      {
        kind: 'issue',
        number: 9,
        title: 'The dashboard fails to render the fleet view on narrow viewports',
        url: 'https://github.com/o/r/issues/9',
        state: 'OPEN',
      },
    ];
    const candidates: SocialCandidateAction[] = [
      {
        kind: 'new-issue',
        reasoning: 'found the same bug someone else already filed',
        title: 'Dashboard fails to render the fleet view on narrow viewports',
      },
    ];

    const verdict = planSocialProtocol(
      candidates,
      { maxNewIssues: 5, maxComments: 5 },
      [],
      'user',
      openThreads,
    );

    expect(verdict.duplicate).toEqual(candidates);
    expect(verdict.allowed).toEqual([]);
  });

  it('does not count an open-thread duplicate against the new-issue cap', () => {
    const openThreads: SocialSubmission[] = [
      {
        kind: 'issue',
        number: 9,
        title: 'The dashboard fails to render the fleet view on narrow viewports',
        url: 'https://github.com/o/r/issues/9',
        state: 'OPEN',
      },
    ];
    const candidates: SocialCandidateAction[] = [
      {
        kind: 'new-issue',
        reasoning: 'duplicate of open #9',
        title: 'Dashboard fails to render the fleet view on narrow viewports',
      },
      { kind: 'new-issue', reasoning: 'genuinely new finding' },
    ];

    const verdict = planSocialProtocol(
      candidates,
      { maxNewIssues: 1, maxComments: 5 },
      [],
      'user',
      openThreads,
    );

    expect(verdict.duplicate).toEqual([candidates[0]]);
    expect(verdict.allowed).toEqual([candidates[1]]);
    expect(verdict.queued).toEqual([]);
  });

  it('defaults openThreads to empty, allowing a titled candidate with no open-thread corpus to dedup against', () => {
    const candidates: SocialCandidateAction[] = [
      {
        kind: 'new-issue',
        reasoning: 'first ever finding',
        title: 'The onboarding flow skips step 3 silently',
      },
    ];

    const verdict = planSocialProtocol(candidates, { maxNewIssues: 5, maxComments: 5 }, []);

    expect(verdict.duplicate).toEqual([]);
    expect(verdict.allowed).toEqual(candidates);
  });

  it('allows a new-issue candidate whose title genuinely differs from own submissions', () => {
    const ownSubmissions: SocialSubmission[] = [
      {
        kind: 'issue',
        number: 1,
        title: 'The dashboard fails to render the fleet view on narrow viewports',
        url: 'https://github.com/o/r/issues/1',
        state: 'OPEN',
      },
    ];
    const candidates: SocialCandidateAction[] = [
      {
        kind: 'new-issue',
        reasoning: 'unrelated finding',
        title: 'The release notes link to a documentation page that returns 404',
      },
    ];

    const verdict = planSocialProtocol(
      candidates,
      { maxNewIssues: 5, maxComments: 5 },
      ownSubmissions,
    );

    expect(verdict.allowed).toEqual(candidates);
    expect(verdict.duplicate).toEqual([]);
  });

  it('never flags a comment candidate as a duplicate, regardless of ownSubmissions', () => {
    const ownSubmissions: SocialSubmission[] = [
      {
        kind: 'issue',
        number: 1,
        title: 'The dashboard fails to render the fleet view on narrow viewports',
        url: 'https://github.com/o/r/issues/1',
        state: 'OPEN',
      },
    ];
    const candidates: SocialCandidateAction[] = [
      {
        kind: 'comment',
        reasoning: 'The dashboard fails to render the fleet view on narrow viewports',
      },
    ];

    const verdict = planSocialProtocol(
      candidates,
      { maxNewIssues: 5, maxComments: 5 },
      ownSubmissions,
    );

    expect(verdict.duplicate).toEqual([]);
    expect(verdict.allowed).toEqual(candidates);
  });

  it('skips the duplicate check for a new-issue candidate with no title', () => {
    const ownSubmissions: SocialSubmission[] = [
      {
        kind: 'issue',
        number: 1,
        title: 'The dashboard fails to render the fleet view on narrow viewports',
        url: 'https://github.com/o/r/issues/1',
        state: 'OPEN',
      },
    ];
    const candidates: SocialCandidateAction[] = [{ kind: 'new-issue', reasoning: 'no title yet' }];

    const verdict = planSocialProtocol(
      candidates,
      { maxNewIssues: 5, maxComments: 5 },
      ownSubmissions,
    );

    expect(verdict.duplicate).toEqual([]);
    expect(verdict.allowed).toEqual(candidates);
  });

  it('exempts short titles from the duplicate check (too little signal to compare)', () => {
    const ownSubmissions: SocialSubmission[] = [
      {
        kind: 'issue',
        number: 1,
        title: 'Fix bug',
        url: 'https://github.com/o/r/issues/1',
        state: 'OPEN',
      },
    ];
    const candidates: SocialCandidateAction[] = [
      { kind: 'new-issue', reasoning: 'short title', title: 'Fix bug' },
    ];

    const verdict = planSocialProtocol(
      candidates,
      { maxNewIssues: 5, maxComments: 5 },
      ownSubmissions,
    );

    expect(verdict.duplicate).toEqual([]);
    expect(verdict.allowed).toEqual(candidates);
  });

  it('defaults ownSubmissions to empty, allowing a titled candidate with no corpus to dedup against', () => {
    const candidates: SocialCandidateAction[] = [
      {
        kind: 'new-issue',
        reasoning: 'first ever finding',
        title: 'The onboarding flow skips step 3 silently',
      },
    ];

    const verdict = planSocialProtocol(candidates, { maxNewIssues: 5, maxComments: 5 });

    expect(verdict.duplicate).toEqual([]);
    expect(verdict.allowed).toEqual(candidates);
  });

  it('refuses a maintainer-only candidate when the role is user (law 5)', () => {
    const candidates: SocialCandidateAction[] = [
      { kind: 'comment', reasoning: 'triage label', requiresMaintainer: true },
    ];

    const verdict = planSocialProtocol(candidates, { maxNewIssues: 5, maxComments: 5 }, [], 'user');

    expect(verdict.refused).toEqual(candidates);
    expect(verdict.allowed).toEqual([]);
    expect(verdict.queued).toEqual([]);
  });

  it('admits a maintainer-only candidate when the role is maintainer', () => {
    const candidates: SocialCandidateAction[] = [
      { kind: 'comment', reasoning: 'triage label', requiresMaintainer: true },
    ];

    const verdict = planSocialProtocol(
      candidates,
      { maxNewIssues: 5, maxComments: 5 },
      [],
      'maintainer',
    );

    expect(verdict.allowed).toEqual(candidates);
    expect(verdict.refused).toEqual([]);
  });

  it('defaults role to user, refusing a maintainer-only candidate when role is omitted', () => {
    const candidates: SocialCandidateAction[] = [
      { kind: 'new-issue', reasoning: 'authoritative filing', requiresMaintainer: true },
    ];

    const verdict = planSocialProtocol(candidates, { maxNewIssues: 5, maxComments: 5 });

    expect(verdict.refused).toEqual(candidates);
    expect(verdict.allowed).toEqual([]);
  });

  it('never refuses a candidate that does not require maintainer verbs, regardless of role', () => {
    const candidates: SocialCandidateAction[] = [{ kind: 'comment', reasoning: 'ordinary reply' }];

    const verdict = planSocialProtocol(candidates, { maxNewIssues: 5, maxComments: 5 }, [], 'user');

    expect(verdict.refused).toEqual([]);
    expect(verdict.allowed).toEqual(candidates);
  });

  it('does not count a refused candidate against its kind cap', () => {
    const candidates: SocialCandidateAction[] = [
      { kind: 'comment', reasoning: 'refused first', requiresMaintainer: true },
      { kind: 'comment', reasoning: 'ordinary reply that should still fit the cap' },
    ];

    const verdict = planSocialProtocol(candidates, { maxNewIssues: 5, maxComments: 1 }, [], 'user');

    expect(verdict.refused).toEqual([candidates[0]]);
    expect(verdict.allowed).toEqual([candidates[1]]);
    expect(verdict.queued).toEqual([]);
  });
});

describe("resolveSocialIdentity — the viewer's tier rides the identity (#45)", () => {
  const exec = (async (_bin: string, args: readonly string[]) => {
    if (args[0] === 'api' && args[1] === 'user')
      return { code: 0, stdout: JSON.stringify({ login: 'gabibi555' }) };
    if (args[0] === 'repo' && args[1] === 'view')
      return {
        code: 0,
        stdout: JSON.stringify({
          nameWithOwner: 'M-A-S-T-E-R-M-I-N-D/AUTOPILOT',
          url: 'https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT',
          isPrivate: false,
        }),
      };
    return { code: 1, stdout: '' };
  }) as unknown as CliExec;

  it('asks the registry for a user and carries the answer', async () => {
    const seen: string[] = [];
    const identity = await resolveSocialIdentity(exec, (login) => {
      seen.push(login);
      return 'Active partner';
    });
    expect(identity).toMatchObject({ login: 'gabibi555', role: 'user', tier: 'Active partner' });
    expect(seen).toEqual(['gabibi555']);
  });
});
