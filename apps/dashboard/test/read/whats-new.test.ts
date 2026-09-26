// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * WHAT'S NEW (operator, 2026-09-24): the facts behind the once-per-version
 * message — the running version's CHANGELOG section, GitHub's open work, CI.
 */
import { describe, it, expect } from 'vitest';
import {
  changelogRelease,
  parseChangelogItem,
  githubPulse,
  ciPulse,
  createWhatsNewApi,
} from '../../src/read/whats-new.js';
import type { WorkflowRunStatus } from '../../src/control/ci-status.js';

const CHANGELOG = [
  '# Changelog',
  '',
  '## [Unreleased]',
  '',
  '- feat(x): not shipped yet',
  '',
  '## [0.54.0] — 2026-09-24',
  '',
  '### Added',
  '',
  '- feat(pool): a claimed issue goes to its checkout',
  '- feat: a scopeless feature',
  '',
  '### Fixed',
  '',
  '- fix(gate): twenty minutes',
  '',
  '### Also in this release',
  '',
  '- perf(ci): faster',
  '',
  '### Empty',
  '',
  '## [0.53.0] — 2026-09-21',
  '',
  '### Added',
  '',
  '- feat(old): must not leak into 0.54.0',
].join('\n');

describe('parseChangelogItem', () => {
  it('splits a Conventional Commit subject into kind, scope and text', () => {
    expect(parseChangelogItem('feat(pool): routes by repo')).toEqual({
      kind: 'feat',
      scope: 'pool',
      text: 'routes by repo',
    });
    expect(parseChangelogItem('fix: plain')).toEqual({ kind: 'fix', scope: null, text: 'plain' });
    expect(parseChangelogItem('feat!: breaking')).toEqual({
      kind: 'feat',
      scope: null,
      text: 'breaking',
    });
    expect(parseChangelogItem('feat(api)!: remove the old field')).toEqual({
      kind: 'feat',
      scope: 'api',
      text: 'remove the old field',
    });
  });

  it('keeps any other bullet whole rather than guessing a kind', () => {
    for (const line of ['Just prose', 'Note: a colon in prose', 'feat(open: no close paren']) {
      expect(parseChangelogItem(line)).toEqual({ kind: null, scope: null, text: line });
    }
  });
});

describe('changelogRelease', () => {
  it('reads only the running version, grouped, with its date — never Unreleased or older', () => {
    const rel = changelogRelease(CHANGELOG, '0.54.0');
    expect(rel?.date).toBe('2026-09-24');
    expect(rel?.groups.map((g) => g.title)).toEqual(['Added', 'Fixed', 'Also in this release']);
    expect(rel?.groups[0]?.items).toHaveLength(2);
    expect(JSON.stringify(rel)).not.toContain('must not leak');
    expect(JSON.stringify(rel)).not.toContain('not shipped yet');
  });

  it('reads the last section to the end of the file', () => {
    const rel = changelogRelease(CHANGELOG, '0.53.0');
    expect(rel?.groups[0]?.items[0]?.scope).toBe('old');
  });

  it('is null for a version with no section, and does not match a longer version', () => {
    expect(changelogRelease(CHANGELOG, '0.55.0')).toBeNull();
    expect(
      changelogRelease('## [0.54.01] — 2026-01-01\n### Added\n- feat: x', '0.54.0'),
    ).toBeNull();
  });

  it('reads CRLF files and a section with no date', () => {
    const rel = changelogRelease('## [1.0.0]\r\n### Fixed\r\n- fix: y\r\n', '1.0.0');
    expect(rel).toEqual({
      version: '1.0.0',
      date: null,
      groups: [{ title: 'Fixed', items: [{ kind: 'fix', scope: null, text: 'y' }] }],
    });
  });
});

describe('githubPulse', () => {
  it('subtracts the open pull requests from GitHub combined open count', () => {
    const calls: string[] = [];
    const pulse = githubPulse('o/r', (args) => {
      calls.push(args.join(' '));
      return args[1] === 'repos/o/r' ? '12\n' : '5\n';
    });
    expect(pulse).toEqual({ repo: 'o/r', openIssues: 7, openPrs: 5 });
    expect(calls[1]).toContain('search/issues?q=repo:o/r+is:pr+is:open');
  });

  it('says unknown for both when either read fails or is not a count', () => {
    expect(
      githubPulse('o/r', () => {
        throw new Error('gh missing');
      }),
    ).toEqual({ repo: 'o/r', openIssues: null, openPrs: null });
    expect(githubPulse('o/r', (a) => (a[1] === 'repos/o/r' ? '3' : 'oops'))).toEqual({
      repo: 'o/r',
      openIssues: null,
      openPrs: null,
    });
  });
});

const run = (workflow: string, conclusion: string | null, ok: boolean): WorkflowRunStatus => ({
  workflow,
  conclusion,
  ok,
  ageLabel: null,
  createdAtMs: null,
  runId: null,
  detail: '',
});

describe('ciPulse', () => {
  it('counts finished runs and leaves out the ones still running', () => {
    expect(
      ciPulse([
        run('ci.yml', 'success', true),
        run('e2e.yml', 'failure', false),
        run('x.yml', null, true),
      ]),
    ).toEqual({
      passing: 1,
      failing: 1,
      workflows: [
        { workflow: 'ci.yml', ok: true },
        { workflow: 'e2e.yml', ok: false },
      ],
    });
  });
});

describe('createWhatsNewApi', () => {
  const round = {
    roundStartAt: 1,
    tagName: 'v0.53.0',
    firings: 10,
    shipped: 7,
    cost: 20,
    shipRate: 0.7,
    costPerShipped: 2.86,
  };

  it('assembles every part and reuses the GitHub read within its window', async () => {
    let now = 0;
    let githubReads = 0;
    const api = createWhatsNewApi({
      version: '0.54.0',
      readChangelog: () => CHANGELOG,
      round: () => round,
      github: () => {
        githubReads += 1;
        return { repo: 'o/r', openIssues: 1, openPrs: 2 };
      },
      ciStatus: async () => [run('ci.yml', 'success', true)],
      githubTtlMs: 1000,
      now: () => now,
    });
    const first = await api();
    expect(first.version).toBe('0.54.0');
    expect(first.release?.groups).toHaveLength(3);
    expect(first.round).toBe(round);
    expect(first.github).toEqual({ repo: 'o/r', openIssues: 1, openPrs: 2 });
    expect(first.ci?.passing).toBe(1);
    now = 999;
    await api();
    expect(githubReads).toBe(1);
    now = 1000;
    await api();
    expect(githubReads).toBe(2);
  });

  it('degrades each part to null on its own', async () => {
    const boom = (): never => {
      throw new Error('boom');
    };
    const api = createWhatsNewApi({
      version: '0.54.0',
      readChangelog: boom,
      round: boom,
      github: boom,
      ciStatus: async () => boom(),
    });
    expect(await api()).toEqual({
      version: '0.54.0',
      release: null,
      round: null,
      github: null,
      ci: null,
    });
  });

  it('has no release for a build whose version the CHANGELOG has not cut yet', async () => {
    const api = createWhatsNewApi({
      version: '9.9.9',
      readChangelog: () => CHANGELOG,
      round: () => null,
      github: () => null,
      ciStatus: async () => [],
    });
    expect((await api()).release).toBeNull();
  });
});
