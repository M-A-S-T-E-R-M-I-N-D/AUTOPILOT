// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  isHelpWantedItem,
  fetchHelpWantedItems,
  HELP_WANTED_LABEL,
  type HelpWantedItem,
} from '../../src/flight/help-wanted-items.js';
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
});
