// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  planContributorIssueList,
  fetchContributorFacingIssues,
  createContributorIssueListPreviewApi,
  type ContributorFacingIssue,
} from '../../src/flight/contributor-issue-list.js';
import { HOLD_LABELS, MAX_ISSUE_LIST } from '../../src/flight/issue-triage.js';
import {
  DECLINED_LABEL,
  fetchPoolIssues,
  isClaimedPoolIssue,
  planClaimPoolIssue,
  planClaimPoolIssueCommands,
  type PoolIssue,
} from '../../src/flight/pool-client.js';
import { claimLedger } from '../../src/flight/claim-ledger.js';
import { HOUSE_TAXONOMY_LABELS } from '../../src/flight/taxonomy-seed.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

function issue(overrides: Partial<ContributorFacingIssue> = {}): ContributorFacingIssue {
  return {
    number: 1,
    title: 'Fix the thing',
    url: 'https://github.com/org/repo/issues/1',
    labels: [],
    assignees: [],
    ...overrides,
  };
}

describe('planContributorIssueList', () => {
  it('returns an empty list for no issues', () => {
    expect(planContributorIssueList([])).toEqual([]);
  });

  it('includes an unassigned good-first-issue-labeled issue', () => {
    const result = planContributorIssueList([issue({ number: 1, labels: ['good first issue'] })]);
    expect(result).toEqual([
      {
        number: 1,
        title: 'Fix the thing',
        url: 'https://github.com/org/repo/issues/1',
        tier: 'good first issue',
      },
    ]);
  });

  it('includes an unassigned help-wanted-labeled issue', () => {
    const result = planContributorIssueList([issue({ number: 2, labels: ['help wanted'] })]);
    expect(result).toEqual([
      {
        number: 2,
        title: 'Fix the thing',
        url: 'https://github.com/org/repo/issues/1',
        tier: 'help wanted',
      },
    ]);
  });

  it('excludes an issue carrying neither label', () => {
    const result = planContributorIssueList([issue({ labels: ['bug'] })]);
    expect(result).toEqual([]);
  });

  it('excludes an already-assigned issue even when labeled', () => {
    const result = planContributorIssueList([
      issue({ labels: ['good first issue'], assignees: ['octocat'] }),
    ]);
    expect(result).toEqual([]);
  });

  it('normalizes hyphenated and mixed-case label spellings', () => {
    const result = planContributorIssueList([issue({ labels: ['Good-First-Issue'] })]);
    expect(result).toHaveLength(1);
    expect(result[0]?.tier).toBe('good first issue');
  });

  it('treats an issue carrying both labels as good-first-issue tier', () => {
    const result = planContributorIssueList([
      issue({ labels: ['good first issue', 'help wanted'] }),
    ]);
    expect(result).toEqual([expect.objectContaining({ tier: 'good first issue' })]);
  });

  it('ranks good-first-issue entries before help-wanted entries', () => {
    const result = planContributorIssueList([
      issue({ number: 1, labels: ['help wanted'] }),
      issue({ number: 2, labels: ['good first issue'] }),
    ]);
    expect(result.map((e) => e.number)).toEqual([2, 1]);
  });

  it('breaks ties within the same tier by ascending issue number', () => {
    const result = planContributorIssueList([
      issue({ number: 9, labels: ['good first issue'] }),
      issue({ number: 3, labels: ['good first issue'] }),
    ]);
    expect(result.map((e) => e.number)).toEqual([3, 9]);
  });
});

// Epic 0019 additive-only law, the Good-first list × the maintainer's marks. A
// declined or held issue stays open for its reporter to reply to
// (CONTRIBUTING.md), tier label and all. The pool claim skips it
// (pool-client.ts planClaimPoolIssue), but this list read only the assignees,
// so it steered a visiting contributor, and the 🍀 roll that ranks its
// entries, at work the maintainer had already answered.
describe("planContributorIssueList × the maintainer's declined and held issues (regression, epic 0019 additive-only law)", () => {
  const seeded = (name: string) =>
    HOUSE_TAXONOMY_LABELS.find((label) => label.name === name)?.name ?? '';
  const marks = [seeded('declined'), seeded('status: awaiting-human'), seeded('status: blocked')];
  const tiers = ['good first issue', 'help wanted'];
  const open = (tier: string) => issue({ labels: ['pool: ux', tier] });
  const marked = (tier: string, mark: string) => issue({ labels: ['pool: ux', tier, mark] });

  it('reads the labels the pool claim skips on, as the seeder stamps them', () => {
    expect([DECLINED_LABEL, ...HOLD_LABELS]).toEqual(marks);
  });

  it.each(marks)('never lists an issue marked "%s", which the claim would refuse', (mark) => {
    for (const tier of tiers) {
      expect(planClaimPoolIssue(open(tier), 'octocat').decision).toBe('claim');
      expect(planContributorIssueList([open(tier)])).toHaveLength(1);

      expect(planClaimPoolIssue(marked(tier, mark), 'octocat').decision).toBe('skip');
      expect(planContributorIssueList([marked(tier, mark)])).toEqual([]);
    }
  });

  it('drops only the marked issue and keeps the rest of the list in order', () => {
    const result = planContributorIssueList([
      issue({ number: 4, labels: ['help wanted'] }),
      issue({ number: 2, labels: ['good first issue', DECLINED_LABEL] }),
      issue({ number: 3, labels: ['good first issue'] }),
    ]);
    expect(result.map((e) => [e.number, e.tier])).toEqual([
      [3, 'good first issue'],
      [4, 'help wanted'],
    ]);
  });
});

// Epic 0019 additive-only law, the Good-first list × the claims ledger. The
// pool client posts a claim as a comment and then assigns the claimant; for an
// outside contributor without triage rights the assign fails and only the
// comment lands (claim-ledger.ts, #27). The pool reads that comment as a claim
// and warns the next claimant, but this list read only the assignees, so it
// offered the claimed issue to the next visitor as free.
describe('planContributorIssueList × a claim held only by its comment (regression, epic 0019 additive-only law)', () => {
  const NOW = Date.parse('2026-10-04T12:00:00Z');
  const CLAIMANT = 'gabibi555';
  const tiers = ['good first issue', 'help wanted'];

  interface Said {
    readonly login: string;
    readonly at: string;
    readonly body: string;
  }
  const row = (labels: readonly string[], said: readonly Said[] = []) => ({
    number: 7,
    title: 'Fix the thing',
    url: 'https://github.com/example/repo/issues/7',
    labels: labels.map((name) => ({ name })),
    assignees: [] as { login: string }[],
    comments: said.map(({ login, at, body }) => ({ author: { login }, createdAt: at, body })),
  });
  type Row = ReturnType<typeof row>;

  /** A gh that answers `gh issue list` with only the fields `--json` asked
   *  for, as gh does. */
  const projectingGh = (rows: readonly Row[]) =>
    vi.fn<CliExec>(async (_cmd, args) => {
      const fields = (args[args.indexOf('--json') + 1] ?? '').split(',');
      const projected = rows.map((r) =>
        Object.fromEntries(Object.entries(r).filter(([key]) => fields.includes(key))),
      );
      return { code: 0, stdout: JSON.stringify(projected) };
    });

  /** The claim comment the pool client posts for CLAIMANT, from its own plan. */
  const claimComment = (labels: readonly string[]): string => {
    const free: PoolIssue = {
      number: 7,
      title: 'Fix the thing',
      url: 'https://github.com/example/repo/issues/7',
      labels,
      assignees: [],
    };
    const decision = planClaimPoolIssue(free, CLAIMANT, NOW);
    const comment = planClaimPoolIssueCommands(free, CLAIMANT, decision).find(
      (command) => command.args[1] === 'comment',
    );
    return comment?.args[comment.args.indexOf('--body') + 1] ?? '';
  };
  const claimed = (tier: string, more: readonly Said[] = []): Row => {
    const labels = ['pool: ux', tier];
    return row(labels, [
      { login: CLAIMANT, at: '2026-10-03T09:00:00Z', body: claimComment(labels) },
      ...more,
    ]);
  };

  it.each(tiers)('never lists a "%s" issue the pool reads as claimed', async (tier) => {
    const page = [claimed(tier)];

    const [pooled] = await fetchPoolIssues(projectingGh(page));
    expect(pooled === undefined ? false : isClaimedPoolIssue(pooled)).toBe(true);
    expect(
      pooled === undefined ? 'missing' : planClaimPoolIssue(pooled, 'octocat', NOW).decision,
    ).toBe('contest');

    expect(await createContributorIssueListPreviewApi(projectingGh(page))()).toEqual([]);
  });

  it.each(tiers)('lists the "%s" issue again once its claimant hands it back', async (tier) => {
    const page = [
      claimed(tier, [{ login: CLAIMANT, at: '2026-10-03T10:00:00Z', body: '/unclaim' }]),
    ];

    expect(
      (await createContributorIssueListPreviewApi(projectingGh(page))()).map((e) => e.tier),
    ).toEqual([tier]);
  });

  it('still lists an issue whose comments carry no claim', async () => {
    const page = [
      row(
        ['help wanted'],
        [{ login: 'octocat', at: '2026-10-03T09:00:00Z', body: 'Is anyone on this?' }],
      ),
    ];

    expect(await createContributorIssueListPreviewApi(projectingGh(page))()).toHaveLength(1);
  });

  it('skips an issue whose ledger holds a claim nobody is assigned to', () => {
    const labels = ['pool: ux', 'good first issue'];
    const claims = claimLedger(
      [],
      [{ author: CLAIMANT, createdAt: NOW, body: claimComment(labels) }],
    );

    expect(planContributorIssueList([issue({ labels })])).toHaveLength(1);
    expect(planContributorIssueList([issue({ labels, claims })])).toEqual([]);
  });

  it('keeps skipping an assigned issue even when the ledger released its assignee', () => {
    expect(
      planContributorIssueList([
        issue({ labels: ['help wanted'], assignees: ['octocat'], claims: [] }),
      ]),
    ).toEqual([]);
  });
});

describe('fetchContributorFacingIssues', () => {
  it('calls gh issue list with the expected argv', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: '[]' });

    await fetchContributorFacingIssues(exec);

    expect(exec).toHaveBeenCalledWith('gh', [
      'issue',
      'list',
      '--state',
      'open',
      '--limit',
      String(MAX_ISSUE_LIST),
      '--json',
      'number,title,url,labels,assignees,comments',
    ]);
  });

  it('parses labels and assignees off gh issue list output', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 1,
          title: 'Fix the thing',
          url: 'https://github.com/example/repo/issues/1',
          labels: [{ name: 'good first issue' }, { name: 'bug' }],
          assignees: [{ login: 'octocat' }],
        },
      ]),
    });

    const issues = await fetchContributorFacingIssues(exec);

    expect(issues).toEqual([
      {
        number: 1,
        title: 'Fix the thing',
        url: 'https://github.com/example/repo/issues/1',
        labels: ['good first issue', 'bug'],
        assignees: ['octocat'],
        claims: [
          {
            login: 'octocat',
            claimedAt: null,
            assigned: true,
            lastActivityAt: null,
            contested: false,
          },
        ],
      },
    ]);
  });

  it('does not filter by label — every open issue is returned for the caller to classify', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 1,
          title: 'Unlabeled',
          url: 'https://github.com/example/repo/issues/1',
          labels: [],
          assignees: [],
        },
      ]),
    });

    const issues = await fetchContributorFacingIssues(exec);

    expect(issues).toHaveLength(1);
  });

  it('drops entries missing a numeric number, string title, or string url', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 1,
          title: 'Valid',
          url: 'https://github.com/example/repo/issues/1',
        },
        {
          number: 'not-a-number',
          title: 'Bad number',
          url: 'https://github.com/example/repo/issues/2',
        },
        { title: 'Missing number', url: 'x' },
        { number: 3, title: 'Missing url' },
      ]),
    });

    const issues = await fetchContributorFacingIssues(exec);

    expect(issues).toEqual([
      {
        number: 1,
        title: 'Valid',
        url: 'https://github.com/example/repo/issues/1',
        labels: [],
        assignees: [],
        claims: [],
      },
    ]);
  });

  it('skips a null or non-object row instead of throwing away every issue around it', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        null,
        { number: 1, title: 'Valid', url: 'https://github.com/example/repo/issues/1' },
        'nope',
      ]),
    });

    const issues = await fetchContributorFacingIssues(exec);

    expect(issues).toEqual([
      {
        number: 1,
        title: 'Valid',
        url: 'https://github.com/example/repo/issues/1',
        labels: [],
        assignees: [],
        claims: [],
      },
    ]);
  });

  it('returns an empty list on a non-zero exit code', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 1, stdout: '' });

    expect(await fetchContributorFacingIssues(exec)).toEqual([]);
  });

  it('returns an empty list on unparseable stdout', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: 'not json' });

    expect(await fetchContributorFacingIssues(exec)).toEqual([]);
  });

  it('returns an empty list when stdout is valid JSON but not an array', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: '{}' });

    expect(await fetchContributorFacingIssues(exec)).toEqual([]);
  });
});

describe('createContributorIssueListPreviewApi', () => {
  it('composes fetch + plan into the GET /api/contributor-issues preview read', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 1,
          title: 'Fix the thing',
          url: 'https://github.com/example/repo/issues/1',
          labels: [{ name: 'good first issue' }],
          assignees: [],
        },
      ]),
    });

    const entries = await createContributorIssueListPreviewApi(exec)();

    expect(entries).toEqual([
      {
        number: 1,
        title: 'Fix the thing',
        url: 'https://github.com/example/repo/issues/1',
        tier: 'good first issue',
      },
    ]);
  });

  it('degrades to an empty list rather than rejecting when exec throws', async () => {
    const exec: CliExec = vi.fn().mockRejectedValue(new Error('gh unavailable'));

    await expect(createContributorIssueListPreviewApi(exec)()).resolves.toEqual([]);
  });
});
