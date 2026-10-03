// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  isHelpWantedItem,
  fetchHelpWantedItems,
  HELP_WANTED_LABEL,
  type HelpWantedItem,
} from '../../src/flight/help-wanted-items.js';
import { HOLD_LABELS, MAX_ISSUE_LIST } from '../../src/flight/issue-triage.js';
import { DECLINED_LABEL, planClaimPoolIssue } from '../../src/flight/pool-client.js';
import { planContributorIssueList } from '../../src/flight/contributor-issue-list.js';
import { HOUSE_TAXONOMY_LABELS } from '../../src/flight/taxonomy-seed.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

describe('isHelpWantedItem', () => {
  it('is true when labels carry the help wanted label', () => {
    expect(isHelpWantedItem(['help wanted', 'bug'])).toBe(true);
  });

  it('is true for the hyphenated label spelling', () => {
    expect(isHelpWantedItem(['help-wanted'])).toBe(true);
  });

  it('is true regardless of label casing', () => {
    expect(isHelpWantedItem(['Help Wanted'])).toBe(true);
  });

  it('is false when labels carry no help wanted label', () => {
    expect(isHelpWantedItem(['good first issue', 'bug'])).toBe(false);
  });

  it('is false for an empty label list', () => {
    expect(isHelpWantedItem([])).toBe(false);
  });

  it('is true for a spelling padded with whitespace', () => {
    expect(isHelpWantedItem(['  help wanted '])).toBe(true);
  });

  it('is false for a label that only contains the phrase — the match is exact, not a substring', () => {
    expect(isHelpWantedItem(['help wanted: docs', 'no help wanted'])).toBe(false);
  });
});

describe('fetchHelpWantedItems', () => {
  it('calls gh issue list with the expected argv', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: '[]' });

    await fetchHelpWantedItems(exec);

    expect(exec).toHaveBeenCalledWith('gh', [
      'issue',
      'list',
      '--state',
      'open',
      '--label',
      HELP_WANTED_LABEL,
      '--limit',
      String(MAX_ISSUE_LIST),
      '--json',
      'number,title,url,labels,assignees',
    ]);
  });

  it('parses a help-wanted issue into a HelpWantedItem, assignee included as its claim state', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 22,
          title: 'Wire the export ritual',
          url: 'https://github.com/example/repo/issues/22',
          labels: [{ name: 'help wanted' }, { name: 'area: ci' }],
          assignees: [{ login: 'octocat' }],
        },
      ]),
    });

    const items = await fetchHelpWantedItems(exec);

    expect(items).toEqual<HelpWantedItem[]>([
      {
        number: 22,
        title: 'Wire the export ritual',
        url: 'https://github.com/example/repo/issues/22',
        labels: ['help wanted', 'area: ci'],
        assignees: ['octocat'],
      },
    ]);
  });

  it('keeps an unclaimed help-wanted issue with an empty assignees list', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 23,
          title: 'Unclaimed',
          url: 'https://github.com/example/repo/issues/23',
          labels: [{ name: 'help wanted' }],
          assignees: [],
        },
      ]),
    });

    const items = await fetchHelpWantedItems(exec);

    expect(items[0]?.assignees).toEqual([]);
  });

  it('drops issues that (unexpectedly) carry no help wanted label', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 1,
          title: 'Not actually help wanted',
          url: 'https://github.com/example/repo/issues/1',
          labels: [{ name: 'bug' }],
        },
      ]),
    });

    expect(await fetchHelpWantedItems(exec)).toEqual([]);
  });

  it('parses assignee logins, dropping malformed entries', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 1,
          title: 'Help-wanted item',
          url: 'https://github.com/example/repo/issues/1',
          labels: [{ name: 'help wanted' }],
          assignees: [{ login: 'octocat' }, { id: 3 }, 'nope'],
        },
      ]),
    });

    const items = await fetchHelpWantedItems(exec);

    expect(items[0]?.assignees).toEqual(['octocat']);
  });

  it('drops entries missing a numeric number, string title, or string url', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 1,
          title: 'Valid',
          url: 'https://github.com/example/repo/issues/1',
          labels: [{ name: 'help wanted' }],
        },
        {
          number: 'not-a-number',
          title: 'Bad number',
          url: 'https://github.com/example/repo/issues/2',
          labels: [{ name: 'help wanted' }],
        },
        { title: 'Missing number', url: 'x', labels: [{ name: 'help wanted' }] },
        {
          number: 3,
          title: 'Missing url',
          labels: [{ name: 'help wanted' }],
        },
      ]),
    });

    const items = await fetchHelpWantedItems(exec);

    expect(items).toEqual([
      {
        number: 1,
        title: 'Valid',
        url: 'https://github.com/example/repo/issues/1',
        labels: ['help wanted'],
        assignees: [],
      },
    ]);
  });

  it('returns an empty array on a non-zero exit', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 1, stdout: '' });

    expect(await fetchHelpWantedItems(exec)).toEqual([]);
  });

  it('returns an empty array on unparseable stdout', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: 'not json' });

    expect(await fetchHelpWantedItems(exec)).toEqual([]);
  });

  it('returns an empty array when stdout parses to a non-array', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: '{"not":"an array"}' });

    expect(await fetchHelpWantedItems(exec)).toEqual([]);
  });

  it('skips null and non-object rows instead of throwing, keeping the valid neighbor', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        null,
        7,
        'row',
        {
          number: 5,
          title: 'Still listed',
          url: 'https://github.com/example/repo/issues/5',
          labels: [{ name: 'help wanted' }],
        },
      ]),
    });

    const items = await fetchHelpWantedItems(exec);

    expect(items.map((item) => item.number)).toEqual([5]);
  });

  it('drops a row whose labels field is not an array — no label, no help-wanted item', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 6,
          title: 'Labels as a string',
          url: 'https://github.com/example/repo/issues/6',
          labels: 'help wanted',
        },
      ]),
    });

    expect(await fetchHelpWantedItems(exec)).toEqual([]);
  });

  it('reads a non-array assignees field as unclaimed rather than dropping the issue', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 8,
          title: 'Assignees as an object',
          url: 'https://github.com/example/repo/issues/8',
          labels: [{ name: 'Help-Wanted' }],
          assignees: { login: 'octocat' },
        },
      ]),
    });

    const items = await fetchHelpWantedItems(exec);

    expect(items).toEqual<HelpWantedItem[]>([
      {
        number: 8,
        title: 'Assignees as an object',
        url: 'https://github.com/example/repo/issues/8',
        labels: ['Help-Wanted'],
        assignees: [],
      },
    ]);
  });

  it('carries every assignee of a co-claimed issue, in gh order', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 9,
          title: 'Paired work',
          url: 'https://github.com/example/repo/issues/9',
          labels: [{ name: 'help wanted' }],
          assignees: [{ login: 'octocat' }, { login: 'hubot' }],
        },
      ]),
    });

    const items = await fetchHelpWantedItems(exec);

    expect(items[0]?.assignees).toEqual(['octocat', 'hubot']);
  });
});

// Epic 0019 additive-only law, the Collaboration panel × the maintainer's
// marks. A declined or held issue stays open for its reporter to reply to
// (CONTRIBUTING.md), `help wanted` label and all. The pool claim skips it
// (pool-client.ts planClaimPoolIssue) and so does the Good-first list, which
// reads the same label (contributor-issue-list.ts planContributorIssueList).
// This read only checked the label, so the panel showed the issue as
// "Unclaimed" under "what's open to claim".
describe("fetchHelpWantedItems × the maintainer's declined and held issues (regression, epic 0019 additive-only law)", () => {
  const seeded = (name: string) =>
    HOUSE_TAXONOMY_LABELS.find((label) => label.name === name)?.name ?? '';
  const marks = [seeded('declined'), seeded('status: awaiting-human'), seeded('status: blocked')];
  const raw = (number: number, labels: readonly string[], assignees: readonly string[] = []) => ({
    number,
    title: `Issue ${number}`,
    url: `https://github.com/example/repo/issues/${number}`,
    labels: labels.map((name) => ({ name })),
    assignees: assignees.map((login) => ({ login })),
  });
  const listed = async (rows: readonly ReturnType<typeof raw>[]) => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: JSON.stringify(rows) });
    return (await fetchHelpWantedItems(exec)).map((item) => item.number);
  };
  const issue = (labels: readonly string[]) => ({
    number: 1,
    title: 'Issue 1',
    url: 'https://github.com/example/repo/issues/1',
    labels,
    assignees: [],
  });

  it('reads the labels the pool claim skips on, as the seeder stamps them', () => {
    expect([DECLINED_LABEL, ...HOLD_LABELS]).toEqual(marks);
  });

  it.each(marks)('never offers an unclaimed issue marked "%s" as open to claim', async (mark) => {
    const open = ['pool: ux', HELP_WANTED_LABEL];
    const marked = [...open, mark];

    expect(planClaimPoolIssue(issue(open), 'octocat').decision).toBe('claim');
    expect(planContributorIssueList([issue(open)])).toHaveLength(1);
    expect(await listed([raw(1, open)])).toEqual([1]);

    expect(planClaimPoolIssue(issue(marked), 'octocat').decision).toBe('skip');
    expect(planContributorIssueList([issue(marked)])).toEqual([]);
    expect(await listed([raw(1, marked)])).toEqual([]);
  });

  it('matches a mark in any casing, as the Good-first list does', async () => {
    const labels = [HELP_WANTED_LABEL, 'Status: Blocked'];

    expect(planContributorIssueList([issue(labels)])).toEqual([]);
    expect(await listed([raw(1, labels)])).toEqual([]);
  });

  it('keeps a marked issue someone already holds, so "Claimed by" and My claims still show it', async () => {
    expect(await listed([raw(7, [HELP_WANTED_LABEL, DECLINED_LABEL], ['octocat'])])).toEqual([7]);
  });

  it('drops only the unclaimed marked issue and keeps the rest in gh order', async () => {
    const rows = [
      raw(4, [HELP_WANTED_LABEL]),
      raw(2, [HELP_WANTED_LABEL, 'status: awaiting-human']),
      raw(3, [HELP_WANTED_LABEL], ['hubot']),
    ];

    expect(await listed(rows)).toEqual([4, 3]);
  });
});
