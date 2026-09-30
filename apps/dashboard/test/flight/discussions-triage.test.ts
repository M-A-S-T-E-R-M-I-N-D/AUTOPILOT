// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, afterEach } from 'vitest';
import { conversationSignature, SIGNATURE_MARK } from '../../src/flight/attribution.js';
import {
  planDiscussionTriage,
  planDiscussionTriageBatch,
  fetchOpenDiscussions,
  draftDiscussionReply,
  postDiscussionReply,
  fetchDiscussionLabelId,
  applyDiscussionPoolLabel,
  runDiscussionTriageRitual,
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

  it('checks locked, then answered, then the pool label — the first blocking state names the skip', () => {
    const lockedFirst = planDiscussionTriage(
      discussion({ locked: true, isAnswered: true, labels: ['pool: ux'] }),
    );
    const answeredNext = planDiscussionTriage(
      discussion({ isAnswered: true, labels: ['pool: ux'] }),
    );

    expect(lockedFirst.reasoning).toContain('locked');
    expect(lockedFirst.reasoning).not.toContain('chosen answer');
    expect(answeredNext.reasoning).toContain('chosen answer');
    expect(answeredNext.reasoning).not.toContain('pool: ux');
  });

  it('only a label starting with the exact "pool: " prefix marks a discussion handled', () => {
    const decision = planDiscussionTriage(discussion({ labels: ['no pool: ux', 'pool:ux'] }));

    expect(decision.decision).toBe('accept');
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

describe('planDiscussionTriageBatch', () => {
  it('pairs an accepted discussion with a signed draft addressed to the same discussion', () => {
    const plans = planDiscussionTriageBatch([discussion()], 'gabibi555');

    expect(plans).toHaveLength(1);
    expect(plans[0]?.decision.decision).toBe('accept');
    expect(plans[0]?.draft).toMatchObject({
      discussionId: 'D_kwDOA1b2c84AXyZw',
      discussionNumber: 9,
      dimension: 'accessibility',
    });
    expect(plans[0]?.draft?.body).toContain('on behalf of @gabibi555');
  });

  it('gives a skipped discussion a null draft — nothing to post', () => {
    const plans = planDiscussionTriageBatch([discussion({ locked: true })], 'gabibi555');

    expect(plans[0]?.decision.decision).toBe('skip');
    expect(plans[0]?.draft).toBeNull();
  });

  it('judges each discussion independently — one skip never affects a sibling accept', () => {
    const plans = planDiscussionTriageBatch(
      [discussion({ number: 1, locked: true }), discussion({ number: 2 })],
      'gabibi555',
    );

    expect(plans.map((p) => p.decision.decision)).toEqual(['skip', 'accept']);
    expect(plans[0]?.draft).toBeNull();
    expect(plans[1]?.draft).not.toBeNull();
  });

  it('returns [] for an empty batch', () => {
    expect(planDiscussionTriageBatch([], 'gabibi555')).toEqual([]);
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

  it('confirms nothing when the repository or its discussions connection comes back null', async () => {
    for (const data of [{ repository: null }, { repository: { discussions: null } }]) {
      const exec: CliExec = vi
        .fn()
        .mockResolvedValue({ code: 0, stdout: JSON.stringify({ data }) });
      expect(await fetchOpenDiscussions(exec)).toEqual([]);
    }
  });

  it('drops null nodes and reads a non-string body or non-object labels as empty', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({
        data: {
          repository: {
            discussions: {
              nodes: [null, { id: 'D_1', number: 1, title: 'odd', body: 42, labels: 'pool: ux' }],
            },
          },
        },
      }),
    });

    const discussions = await fetchOpenDiscussions(exec);

    expect(discussions).toEqual([
      {
        id: 'D_1',
        number: 1,
        title: 'odd',
        body: '',
        category: '',
        isAnswered: false,
        locked: false,
        labels: [],
      },
    ]);
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

function labelGraphql(id: string | null): string {
  return JSON.stringify({ data: { repository: { label: id === null ? null : { id } } } });
}

describe('fetchDiscussionLabelId', () => {
  it('spends one gh api graphql read carrying the label name as a raw field', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: labelGraphql('LA_abc123') });

    const id = await fetchDiscussionLabelId(exec, 'pool: accessibility');

    expect(id).toBe('LA_abc123');
    expect(exec).toHaveBeenCalledTimes(1);
    const [bin, args] = vi.mocked(exec).mock.calls[0] as [string, readonly string[]];
    expect(bin).toBe('gh');
    expect(args).toEqual([
      'api',
      'graphql',
      '-F',
      'owner={owner}',
      '-F',
      'name={repo}',
      '-f',
      'label=pool: accessibility',
      '-f',
      expect.stringMatching(/^query=query\(\$owner: String!, \$name: String!, \$label: String!\)/),
    ]);
  });

  it('returns null when the repo has no label by that exact name', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: labelGraphql(null) });

    expect(await fetchDiscussionLabelId(exec, 'pool: nope')).toBeNull();
  });

  it('returns null on a non-zero exit or unparseable stdout, never throwing', async () => {
    for (const reply of [
      { code: 1, stdout: '' },
      { code: 0, stdout: 'not json' },
      { code: 0, stdout: JSON.stringify({ data: null }) },
    ]) {
      const exec: CliExec = vi.fn().mockResolvedValue(reply);
      expect(await fetchDiscussionLabelId(exec, 'pool: accessibility')).toBeNull();
    }
  });
});

describe('applyDiscussionPoolLabel', () => {
  it('applies an already-resolved label id in one mutation, returning the result', async () => {
    const exec: CliExec = vi.fn().mockResolvedValueOnce({
      code: 0,
      stdout: JSON.stringify({ data: { addLabelsToLabelable: {} } }),
    });

    const result = await applyDiscussionPoolLabel(
      exec,
      { id: 'D_kwDOA1b2c84AXyZw', number: 9 },
      'LA_abc123',
    );

    expect(result).toEqual({ discussionNumber: 9, code: 0, stdout: expect.any(String) });
    expect(exec).toHaveBeenCalledTimes(1);

    const [bin, args] = vi.mocked(exec).mock.calls[0] as [string, readonly string[]];
    expect(bin).toBe('gh');
    expect(args).toEqual([
      'api',
      'graphql',
      '-f',
      'labelableId=D_kwDOA1b2c84AXyZw',
      '-f',
      expect.stringMatching(/^query=mutation\(\$labelableId: ID!\)/),
    ]);
    expect(args.join(' ')).toContain('labelIds: ["LA_abc123"]');
  });

  it('pairs a failing mutation back with the discussion number, never throwing', async () => {
    const exec: CliExec = vi.fn().mockResolvedValueOnce({ code: 1, stdout: 'GraphQL error' });

    const result = await applyDiscussionPoolLabel(
      exec,
      { id: 'D_kwDOA1b2c84AXyZw', number: 9 },
      'LA_abc123',
    );

    expect(result).toEqual({ discussionNumber: 9, code: 1, stdout: 'GraphQL error' });
  });

  it('JSON-escapes the label id into the mutation, never splicing it in raw', async () => {
    const hostileId = 'LA_"]}) { x } #\\';
    const exec: CliExec = vi.fn().mockResolvedValueOnce({ code: 0, stdout: '{}' });

    await applyDiscussionPoolLabel(exec, { id: 'D_kwDOA1b2c84AXyZw', number: 9 }, hostileId);

    const [, args] = vi.mocked(exec).mock.calls[0] as [string, readonly string[]];
    const query = args[args.length - 1] ?? '';
    expect(query).toContain(`labelIds: [${JSON.stringify(hostileId)}]`);
    expect(query).not.toContain(`labelIds: ["${hostileId}"]`);
  });
});

describe('runDiscussionTriageRitual', () => {
  function openDiscussionNode(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 'D_kwDOA1b2c84AXyZw',
      number: 9,
      title: 'Keyboard nav is broken in the fleet table',
      body: 'Screen reader users are stuck',
      isAnswered: false,
      locked: false,
      category: { name: 'Q&A' },
      labels: { nodes: [] },
      ...overrides,
    };
  }

  it('resolves the pool label, posts the reply, then applies the label on a successful post', async () => {
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: discussionsGraphql([openDiscussionNode()]) })
      .mockResolvedValueOnce({ code: 0, stdout: labelGraphql('LA_abc123') })
      .mockResolvedValueOnce({ code: 0, stdout: JSON.stringify({ data: {} }) })
      .mockResolvedValueOnce({ code: 0, stdout: JSON.stringify({ data: {} }) });

    const result = await runDiscussionTriageRitual(exec, 'gabibi555');

    expect(exec).toHaveBeenCalledTimes(4);
    const calls = vi.mocked(exec).mock.calls as [string, readonly string[]][];
    expect(calls[1]?.[1]).toContain('label=pool: accessibility');
    expect(calls[2]?.[1]).toContain('discussionId=D_kwDOA1b2c84AXyZw');
    expect(calls[3]?.[1].join(' ')).toContain('labelIds: ["LA_abc123"]');
    expect(result.plans).toHaveLength(1);
    expect(result.outcomes).toEqual([
      {
        discussionNumber: 9,
        replyResult: { discussionNumber: 9, code: 0, stdout: expect.any(String) },
        labelResult: { discussionNumber: 9, code: 0, stdout: expect.any(String) },
      },
    ]);
  });

  it('never labels a discussion whose reply post failed', async () => {
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: discussionsGraphql([openDiscussionNode()]) })
      .mockResolvedValueOnce({ code: 0, stdout: labelGraphql('LA_abc123') })
      .mockResolvedValueOnce({ code: 1, stdout: 'GraphQL error' });

    const result = await runDiscussionTriageRitual(exec, 'gabibi555');

    expect(exec).toHaveBeenCalledTimes(3);
    expect(result.outcomes).toEqual([
      {
        discussionNumber: 9,
        replyResult: { discussionNumber: 9, code: 1, stdout: 'GraphQL error' },
        labelResult: null,
      },
    ]);
  });

  it('keeps going after one discussion fails to post — the next accepted one still posts and labels', async () => {
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({
        code: 0,
        stdout: discussionsGraphql([
          openDiscussionNode(),
          openDiscussionNode({ id: 'D_skip', number: 10, locked: true }),
          openDiscussionNode({
            id: 'D_next',
            number: 11,
            title: 'What is this project about?',
            body: 'Just curious.',
          }),
        ]),
      })
      .mockResolvedValueOnce({ code: 0, stdout: labelGraphql('LA_a11y') })
      .mockResolvedValueOnce({ code: 1, stdout: 'GraphQL error' })
      .mockResolvedValueOnce({ code: 0, stdout: labelGraphql('LA_info') })
      .mockResolvedValueOnce({ code: 0, stdout: JSON.stringify({ data: {} }) })
      .mockResolvedValueOnce({ code: 0, stdout: JSON.stringify({ data: {} }) });

    const result = await runDiscussionTriageRitual(exec, 'gabibi555');

    expect(exec).toHaveBeenCalledTimes(6);
    expect(result.plans.map((plan) => plan.decision.decision)).toEqual([
      'accept',
      'skip',
      'accept',
    ]);
    expect(result.outcomes.map((o) => [o.discussionNumber, o.labelResult?.code ?? null])).toEqual([
      [9, null],
      [11, 0],
    ]);
    const calls = vi.mocked(exec).mock.calls as [string, readonly string[]][];
    expect(calls[3]?.[1]).toContain('label=pool: information');
    expect(calls[4]?.[1]).toContain('discussionId=D_next');
    expect(calls[4]?.[1].join(' ')).toContain('@gabibi555');
    expect(calls[5]?.[1]).toContain('labelableId=D_next');
  });

  it('never posts a reply whose pool label cannot be resolved — an unlabeled reply would be re-posted by the next run', async () => {
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: discussionsGraphql([openDiscussionNode()]) })
      .mockResolvedValueOnce({ code: 0, stdout: labelGraphql(null) });

    const result = await runDiscussionTriageRitual(exec, 'gabibi555');

    expect(exec).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(exec).mock.calls as [string, readonly string[]][];
    expect(calls.some(([, args]) => args.join(' ').includes('addDiscussionComment'))).toBe(false);
    expect(result.outcomes).toEqual([
      {
        discussionNumber: 9,
        replyResult: null,
        labelResult: null,
        skippedReason: 'pool-label-unresolved',
      },
    ]);
  });

  it('holds back only the discussion whose label is missing — the next one still posts and labels', async () => {
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({
        code: 0,
        stdout: discussionsGraphql([
          openDiscussionNode(),
          openDiscussionNode({
            id: 'D_next',
            number: 11,
            title: 'What is this project about?',
            body: 'Just curious.',
          }),
        ]),
      })
      .mockResolvedValueOnce({ code: 1, stdout: 'gh: HTTP 502' })
      .mockResolvedValueOnce({ code: 0, stdout: labelGraphql('LA_info') })
      .mockResolvedValueOnce({ code: 0, stdout: JSON.stringify({ data: {} }) })
      .mockResolvedValueOnce({ code: 0, stdout: JSON.stringify({ data: {} }) });

    const result = await runDiscussionTriageRitual(exec, 'gabibi555');

    expect(exec).toHaveBeenCalledTimes(5);
    expect(result.outcomes.map((o) => [o.discussionNumber, o.skippedReason ?? 'posted'])).toEqual([
      [9, 'pool-label-unresolved'],
      [11, 'posted'],
    ]);
    const calls = vi.mocked(exec).mock.calls as [string, readonly string[]][];
    expect(calls[3]?.[1]).toContain('discussionId=D_next');
    expect(calls[4]?.[1]).toContain('labelableId=D_next');
  });

  it('gives a skipped discussion no outcome at all — nothing posted, nothing labeled', async () => {
    const exec: CliExec = vi.fn().mockResolvedValueOnce({
      code: 0,
      stdout: discussionsGraphql([openDiscussionNode({ locked: true })]),
    });

    const result = await runDiscussionTriageRitual(exec, 'gabibi555');

    expect(exec).toHaveBeenCalledTimes(1);
    expect(result.plans[0]?.decision.decision).toBe('skip');
    expect(result.outcomes).toEqual([]);
  });

  it('returns empty plans and outcomes when there is nothing open to triage', async () => {
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: discussionsGraphql([]) });

    const result = await runDiscussionTriageRitual(exec, 'gabibi555');

    expect(result).toEqual({ plans: [], outcomes: [] });
  });
});

// EPIC 0019 additive-only law (board web-mtsylqbd-q2rg8k), the KEEPER
// Discussions ritual against the attribution channel it posts on. ATTRIBUTION.md
// §3 names discussions among the conversations it signs, and its one opt-out
// lever, AUTOPILOT_ATTRIBUTION=off, covers every channel. Every other
// conversational post gets signed by withAttribution, which only reads
// `gh issue|pr comment` and `gh pr review` argv. A discussion reply goes out as
// `gh api graphql`, which that wrapper never matches, so the reply signs itself.
// It used a hand-written copy of the signature and ignored the lever, so an
// operator who opted out still had every discussion reply signed.
describe("the discussion reply and attribution.ts's one signature and one lever", () => {
  const original = process.env['AUTOPILOT_ATTRIBUTION'];

  afterEach(() => {
    if (original === undefined) delete process.env['AUTOPILOT_ATTRIBUTION'];
    else process.env['AUTOPILOT_ATTRIBUTION'] = original;
  });

  function accepted(): DiscussionTriageAccept {
    const decision = planDiscussionTriage(discussion());
    if (decision.decision !== 'accept') throw new Error('fixture must classify as accept');
    return decision;
  }

  it('signs with the same conversationSignature every other channel-3 post carries', () => {
    delete process.env['AUTOPILOT_ATTRIBUTION'];
    const decision = accepted();

    const draft = draftDiscussionReply(discussion(), decision, 'gabibi555');

    expect(draft.body).toBe(`${decision.reasoning}\n\n${conversationSignature('gabibi555')}`);
  });

  it('keeps signing for any value but off', () => {
    process.env['AUTOPILOT_ATTRIBUTION'] = 'on';

    const draft = draftDiscussionReply(discussion(), accepted(), 'gabibi555');

    expect(draft.body).toContain(conversationSignature('gabibi555'));
  });

  it('drafts the reasoning alone, with no signature, under AUTOPILOT_ATTRIBUTION=off', () => {
    process.env['AUTOPILOT_ATTRIBUTION'] = 'off';
    const decision = accepted();

    const draft = draftDiscussionReply(discussion(), decision, 'gabibi555');

    expect(draft.body).toBe(decision.reasoning);
    expect(draft.body).not.toContain(SIGNATURE_MARK);
  });

  it('posts an unsigned reply through the whole ritual under AUTOPILOT_ATTRIBUTION=off', async () => {
    process.env['AUTOPILOT_ATTRIBUTION'] = 'off';
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({
        code: 0,
        stdout: discussionsGraphql([
          {
            id: 'D_kwDOA1b2c84AXyZw',
            number: 9,
            title: 'Keyboard nav is broken in the fleet table',
            body: 'Screen reader users are stuck',
            category: { name: 'Q&A' },
            labels: { nodes: [] },
          },
        ]),
      })
      .mockResolvedValueOnce({ code: 0, stdout: labelGraphql('LA_abc123') })
      .mockResolvedValueOnce({ code: 0, stdout: JSON.stringify({ data: {} }) })
      .mockResolvedValueOnce({ code: 0, stdout: JSON.stringify({ data: {} }) });

    await runDiscussionTriageRitual(exec, 'gabibi555');

    const calls = vi.mocked(exec).mock.calls as [string, readonly string[]][];
    const posted = calls[2]?.[1].find((arg) => arg.startsWith('body='));
    expect(posted).toMatch(/^body=#9 /);
    expect(posted).not.toContain(SIGNATURE_MARK);
    expect(posted).not.toContain('on behalf of');
  });
});
