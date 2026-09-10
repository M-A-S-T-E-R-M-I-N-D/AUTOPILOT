// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  planDiscussionTriage,
  fetchOpenDiscussions,
  type IncomingDiscussion,
} from '../../src/flight/discussions-triage.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

function discussion(overrides: Partial<IncomingDiscussion> = {}): IncomingDiscussion {
  return {
    number: 9,
    title: 'Keyboard nav is broken in the fleet table',
    body: 'Screen reader users are stuck',
    category: 'Q&A',
    isAnswered: false,
    locked: false,
    ...overrides,
  };
}

describe('planDiscussionTriage', () => {
  it('accepts and classifies a genuinely open discussion by its strongest dimension signal', () => {
    const decision = planDiscussionTriage(discussion());

    expect(decision).toMatchObject({ decision: 'accept', dimension: 'accessibility' });
    expect(decision.reasoning).toContain('#9');
    expect(decision.reasoning).toContain('pool: accessibility');
    expect(decision.reasoning).toContain('Q&A');
  });

  it('skips a locked discussion regardless of its answered state', () => {
    const decision = planDiscussionTriage(discussion({ locked: true }));

    expect(decision.decision).toBe('skip');
    expect(decision.reasoning).toContain('locked');
  });

  it('skips a discussion that already has a human-chosen answer', () => {
    const decision = planDiscussionTriage(discussion({ isAnswered: true }));

    expect(decision.decision).toBe('skip');
    expect(decision.reasoning).toContain('chosen answer');
  });

  it('treats a null/false isAnswered the same — not yet answered', () => {
    expect(planDiscussionTriage(discussion({ isAnswered: false })).decision).toBe('accept');
  });

  it('skips a discussion already carrying a pool label from a previous pass', () => {
    const decision = planDiscussionTriage(discussion({ labels: ['pool: accessibility'] }));

    expect(decision.decision).toBe('skip');
    expect(decision.reasoning).toContain('pool: accessibility');
  });

  it('does not skip a discussion carrying an unrelated label', () => {
    const decision = planDiscussionTriage(discussion({ labels: ['good first issue'] }));

    expect(decision.decision).toBe('accept');
  });

  it('falls back to information when nothing in the title/body matches a dimension', () => {
    const decision = planDiscussionTriage(
      discussion({ title: 'What is this project about?', body: 'Just curious.' }),
    );

    expect(decision).toMatchObject({ decision: 'accept', dimension: 'information' });
  });
});

function discussionsGraphql(nodes: readonly Record<string, unknown>[] | null): string {
  return JSON.stringify({ data: { repository: { discussions: { nodes } } } });
}

describe('fetchOpenDiscussions', () => {
  it('spends one gh api graphql read scoped to the current repo via {owner}/{repo} placeholders', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: discussionsGraphql([]) });

    await fetchOpenDiscussions(exec);

    expect(exec).toHaveBeenCalledTimes(1);
    const [bin, args] = vi.mocked(exec).mock.calls[0] as [string, readonly string[]];
    expect(bin).toBe('gh');
    expect(args.slice(0, 7)).toEqual([
      'api',
      'graphql',
      '-F',
      'owner={owner}',
      '-F',
      'name={repo}',
      '-f',
    ]);
    expect(args[7]).toMatch(/^query=/);
    expect(args[7]).toContain('discussions(states: OPEN, first: 50');
    expect(args[7]).toContain('isAnswered');
    expect(args[7]).toContain('locked');
  });

  it('parses number/title/body/category/isAnswered/locked off each discussion node', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: discussionsGraphql([
        {
          number: 9,
          title: 'Show and tell',
          body: 'Flew a repo',
          isAnswered: null,
          locked: false,
          category: { name: 'Show and tell' },
          labels: { nodes: [] },
        },
      ]),
    });

    const discussions = await fetchOpenDiscussions(exec);

    expect(discussions).toEqual([
      {
        number: 9,
        title: 'Show and tell',
        body: 'Flew a repo',
        category: 'Show and tell',
        isAnswered: false,
        locked: false,
        labels: [],
      },
    ]);
  });

  it('unwraps the LabelConnection, dropping malformed label entries', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: discussionsGraphql([
        {
          number: 9,
          title: 'Labeled',
          labels: { nodes: [{ name: 'pool: ux' }, { id: 3 }, 'nope'] },
        },
      ]),
    });

    const discussions = await fetchOpenDiscussions(exec);

    expect(discussions[0]?.labels).toEqual(['pool: ux']);
  });

  it('only treats isAnswered === true as answered', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: discussionsGraphql([
        { number: 1, title: 'a', isAnswered: true },
        { number: 2, title: 'b', isAnswered: false },
        { number: 3, title: 'c', isAnswered: null },
      ]),
    });

    const discussions = await fetchOpenDiscussions(exec);

    expect(discussions.map((d) => d.isAnswered)).toEqual([true, false, false]);
  });

  it('drops entries missing a numeric number or string title', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: discussionsGraphql([
        { number: 'nine', title: 'bad number' },
        { title: 'no number' },
        {
          number: 1,
        },
      ]),
    });

    expect(await fetchOpenDiscussions(exec)).toEqual([]);
  });

  it('falls back to an empty category name when the category is missing or malformed', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: discussionsGraphql([{ number: 1, title: 'no category' }]),
    });

    const discussions = await fetchOpenDiscussions(exec);

    expect(discussions[0]?.category).toBe('');
  });

  it('confirms nothing when the read fails or the output is unreadable', async () => {
    for (const reply of [
      { code: 1, stdout: '' },
      { code: 0, stdout: 'not json' },
      { code: 0, stdout: JSON.stringify({ data: null }) },
      { code: 0, stdout: discussionsGraphql(null) },
    ]) {
      const exec: CliExec = vi.fn().mockResolvedValue(reply);
      expect(await fetchOpenDiscussions(exec)).toEqual([]);
    }
  });
});
