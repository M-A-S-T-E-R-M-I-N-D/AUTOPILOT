// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  planDiscussionTriage,
  fetchOpenDiscussions,
  draftDiscussionReply,
  postDiscussionReply,
  type IncomingDiscussion,
  type DiscussionTriageAccept,
} from '../../src/flight/discussions-triage.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

function discussion(overrides: Partial<IncomingDiscussion> = {}): IncomingDiscussion {
  return {
    id: 'D_kwDOA1b2c84AXyZw',
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

describe('draftDiscussionReply', () => {
  function accept(overrides: Partial<DiscussionTriageAccept> = {}): DiscussionTriageAccept {
    const decision = planDiscussionTriage(discussion());
    if (decision.decision !== 'accept') throw new Error('fixture must classify as accept');
    return { ...decision, ...overrides };
  }

  it('never posts anything — pure text composition only', () => {
    const draft = draftDiscussionReply(discussion(), accept(), 'gabibi555');

    expect(draft).toEqual({
      discussionId: 'D_kwDOA1b2c84AXyZw',
      discussionNumber: 9,
      dimension: 'accessibility',
      body: expect.stringContaining('#9'),
    });
  });

  it('signs the reply with the binding conversational signature, credited to the operator', () => {
    const draft = draftDiscussionReply(discussion(), accept(), 'gabibi555');

    expect(draft.body).toContain(
      '— ✈️ AUTOPILOT agent, on behalf of @gabibi555 · ' +
        '[what is this?](https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT)',
    );
  });

  it('leads with the decision reasoning, signature trailing after a blank line', () => {
    const decision = accept();
    const draft = draftDiscussionReply(discussion(), decision, 'gabibi555');

    expect(draft.body).toBe(
      `${decision.reasoning}\n\n— ✈️ AUTOPILOT agent, on behalf of @gabibi555 · [what is this?](https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT)`,
    );
  });

  it('credits whichever operator login the caller resolves, not a hardcoded one', () => {
    const draft = draftDiscussionReply(discussion(), accept(), 'someone-else');

    expect(draft.body).toContain('on behalf of @someone-else');
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
    expect(args[7]).toContain(' id number title body isAnswered');
    expect(args[7]).toContain('locked');
  });

  it('parses id/number/title/body/category/isAnswered/locked off each discussion node', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: discussionsGraphql([
        {
          id: 'D_kwDOA1b2c84AXyZw',
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
        id: 'D_kwDOA1b2c84AXyZw',
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
          id: 'D_kwDOA1b2c84AXyZw',
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
        { id: 'D_1', number: 1, title: 'a', isAnswered: true },
        { id: 'D_2', number: 2, title: 'b', isAnswered: false },
        { id: 'D_3', number: 3, title: 'c', isAnswered: null },
      ]),
    });

    const discussions = await fetchOpenDiscussions(exec);

    expect(discussions.map((d) => d.isAnswered)).toEqual([true, false, false]);
  });

  it('drops entries missing a numeric number, string title, or string id', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: discussionsGraphql([
        { id: 'D_1', number: 'nine', title: 'bad number' },
        { id: 'D_2', title: 'no number' },
        {
          id: 'D_3',
          number: 1,
        },
        { number: 1, title: 'no id' },
      ]),
    });

    expect(await fetchOpenDiscussions(exec)).toEqual([]);
  });

  it('falls back to an empty category name when the category is missing or malformed', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: discussionsGraphql([{ id: 'D_1', number: 1, title: 'no category' }]),
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

describe('postDiscussionReply', () => {
  function draft(): ReturnType<typeof draftDiscussionReply> {
    const decision = planDiscussionTriage(discussion());
    if (decision.decision !== 'accept') throw new Error('fixture must classify as accept');
    return draftDiscussionReply(discussion(), decision, 'gabibi555');
  }

  it('spends one gh api graphql call carrying the discussion id and body as raw fields', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({ data: { addDiscussionComment: {} } }),
    });

    await postDiscussionReply(exec, draft());

    expect(exec).toHaveBeenCalledTimes(1);
    const [bin, args] = vi.mocked(exec).mock.calls[0] as [string, readonly string[]];
    expect(bin).toBe('gh');
    expect(args).toEqual([
      'api',
      'graphql',
      '-f',
      'discussionId=D_kwDOA1b2c84AXyZw',
      '-f',
      `body=${draft().body}`,
      '-f',
      expect.stringMatching(/^query=mutation\(\$discussionId: ID!, \$body: String!\)/),
    ]);
  });

  it('sends the mutation as a raw field, not a magic owner/repo placeholder', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: '{}' });

    await postDiscussionReply(exec, draft());

    const [, args] = vi.mocked(exec).mock.calls[0] as [string, readonly string[]];
    expect(args).not.toContain('-F');
    expect(args.join(' ')).toContain('addDiscussionComment(input: {discussionId: $discussionId');
  });

  it('pairs the exec result back with the discussion number, never throwing on failure', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 1, stdout: 'GraphQL error' });

    const result = await postDiscussionReply(exec, draft());

    expect(result).toEqual({ discussionNumber: 9, code: 1, stdout: 'GraphQL error' });
  });
});
