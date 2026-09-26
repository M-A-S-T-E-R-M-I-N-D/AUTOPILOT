// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  createDiscussionsTriagePreviewApi,
  createDiscussionsTriageExecuteApi,
} from '../../src/flight/discussions-triage-execute.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

const DISCUSSION_ID = 'D_kwDOA1b2c84AXyZw';

function openDiscussionNode(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: DISCUSSION_ID,
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

/** A `CliExec` stub answering the identity reads (`gh api user`, `gh repo
 *  view`), the discussions GraphQL read, the label-ID lookup, and every
 *  mutation with a bare success — `login: undefined` fails the identity
 *  read the way an unauthenticated `gh` would. */
function ghStub(opts: {
  readonly login: string | undefined;
  readonly ownerLogin?: string;
  readonly discussions?: readonly unknown[];
  /** `gh repo view` exits 1 — the owner half of the identity read fails. */
  readonly repoViewFails?: boolean;
  /** The discussions read's exit code; non-zero fails that read. */
  readonly discussionsCode?: number;
  /** The label-ID lookup's answer; `null` when the `pool:` label does not exist. */
  readonly labelId?: string | null;
}): CliExec {
  const ownerLogin = opts.ownerLogin ?? opts.login ?? 'someone';
  return vi.fn(async (_bin: string, args: readonly string[]) => {
    if (args[0] === 'api' && args[1] === 'user') {
      return opts.login === undefined
        ? { code: 1, stdout: '' }
        : { code: 0, stdout: JSON.stringify({ login: opts.login }) };
    }
    if (args[0] === 'repo' && args[1] === 'view') {
      if (opts.repoViewFails === true) return { code: 1, stdout: '' };
      return {
        code: 0,
        stdout: JSON.stringify({
          nameWithOwner: `${ownerLogin}/hello-world`,
          url: `https://github.com/${ownerLogin}/hello-world`,
          isPrivate: false,
        }),
      };
    }
    const query = args.find((a) => a.startsWith('query=')) ?? '';
    if (query.includes('discussions(states: OPEN')) {
      const code = opts.discussionsCode ?? 0;
      if (code !== 0) return { code, stdout: '' };
      return {
        code: 0,
        stdout: JSON.stringify({
          data: { repository: { discussions: { nodes: opts.discussions ?? [] } } },
        }),
      };
    }
    if (query.includes('label(name: $label)')) {
      const label = opts.labelId === null ? null : { id: opts.labelId ?? 'LA_1' };
      return {
        code: 0,
        stdout: JSON.stringify({ data: { repository: { label } } }),
      };
    }
    return { code: 0, stdout: JSON.stringify({ data: {} }) };
  });
}

/** Every `gh api graphql` argv the stub saw, as joined strings — mutations
 *  are the ones carrying `query=mutation`. */
function mutationCalls(exec: CliExec): string[] {
  return vi
    .mocked(exec)
    .mock.calls.map(([, args]) => args.join(' '))
    .filter((argv) => argv.includes('query=mutation'));
}

describe('createDiscussionsTriagePreviewApi', () => {
  it('resolves the identity, then plans a signed reply draft for every open discussion, never mutating', async () => {
    const exec = ghStub({
      login: 'gabibi555',
      discussions: [openDiscussionNode(), openDiscussionNode({ number: 10, locked: true })],
    });

    const report = await createDiscussionsTriagePreviewApi(exec)();

    expect(report.skippedReason).toBeUndefined();
    expect(report.identity).toMatchObject({ login: 'gabibi555', role: 'maintainer' });
    expect(report.plans).toHaveLength(2);
    expect(report.plans[0]?.decision.decision).toBe('accept');
    expect(report.plans[0]?.draft?.body).toContain('on behalf of @gabibi555');
    expect(report.plans[1]?.decision.decision).toBe('skip');
    expect(report.plans[1]?.draft).toBeNull();
    // Read-only: identity (2 reads) + the discussions read, no mutation.
    expect(exec).toHaveBeenCalledTimes(3);
    expect(mutationCalls(exec)).toEqual([]);
  });

  it('still previews for a guest — read-only, so role honesty only bites on execute', async () => {
    const exec = ghStub({
      login: 'visitor',
      ownerLogin: 'gabibi555',
      discussions: [openDiscussionNode()],
    });

    const report = await createDiscussionsTriagePreviewApi(exec)();

    expect(report.identity?.role).toBe('user');
    expect(report.skippedReason).toBeUndefined();
    expect(report.plans).toHaveLength(1);
    expect(mutationCalls(exec)).toEqual([]);
  });

  it('reports identity-unresolved without spending the discussions read when gh cannot say who is acting', async () => {
    const exec = ghStub({ login: undefined, discussions: [openDiscussionNode()] });

    const report = await createDiscussionsTriagePreviewApi(exec)();

    expect(report).toEqual({
      identity: undefined,
      plans: [],
      skippedReason: 'identity-unresolved',
    });
    const queries = vi.mocked(exec).mock.calls.filter(([, args]) => args[1] === 'graphql');
    expect(queries).toEqual([]);
  });

  it('reports identity-unresolved when the login resolves but gh repo view fails — an unknown owner leaves role undecidable', async () => {
    const exec = ghStub({
      login: 'gabibi555',
      repoViewFails: true,
      discussions: [openDiscussionNode()],
    });

    const report = await createDiscussionsTriagePreviewApi(exec)();

    expect(report).toEqual({
      identity: undefined,
      plans: [],
      skippedReason: 'identity-unresolved',
    });
    const queries = vi.mocked(exec).mock.calls.filter(([, args]) => args[1] === 'graphql');
    expect(queries).toEqual([]);
  });

  it('previews an empty plan list with no skippedReason when the discussions read itself fails', async () => {
    const exec = ghStub({
      login: 'gabibi555',
      discussionsCode: 1,
      discussions: [openDiscussionNode()],
    });

    const report = await createDiscussionsTriagePreviewApi(exec)();

    expect(report.identity).toMatchObject({ login: 'gabibi555', role: 'maintainer' });
    expect(report.plans).toEqual([]);
    expect(report.skippedReason).toBeUndefined();
    expect(mutationCalls(exec)).toEqual([]);
  });

  it('defaults to the guarded gh exec when none is injected', () => {
    expect(() => createDiscussionsTriagePreviewApi()).not.toThrow();
  });
});

describe('createDiscussionsTriageExecuteApi', () => {
  it('runs the full ritual as the maintainer: posts the signed reply then applies the pool label', async () => {
    const exec = ghStub({ login: 'gabibi555', discussions: [openDiscussionNode()] });

    const report = await createDiscussionsTriageExecuteApi(exec)();

    expect(report.skippedReason).toBeUndefined();
    expect(report.identity).toMatchObject({ login: 'gabibi555', role: 'maintainer' });
    expect(report.plans).toHaveLength(1);
    expect(report.outcomes).toEqual([
      {
        discussionNumber: 9,
        replyResult: { discussionNumber: 9, code: 0, stdout: expect.any(String) },
        labelResult: { discussionNumber: 9, code: 0, stdout: expect.any(String) },
      },
    ]);
    const mutations = mutationCalls(exec);
    expect(mutations).toHaveLength(2);
    expect(mutations[0]).toContain('addDiscussionComment');
    expect(mutations[0]).toContain(`discussionId=${DISCUSSION_ID}`);
    expect(mutations[0]).toContain('on behalf of @gabibi555');
    expect(mutations[1]).toContain('addLabelsToLabelable');
    expect(mutations[1]).toContain(`labelableId=${DISCUSSION_ID}`);
  });

  it('refuses to post for a guest — skippedReason guest, zero mutations, identity still reported', async () => {
    const exec = ghStub({
      login: 'visitor',
      ownerLogin: 'gabibi555',
      discussions: [openDiscussionNode()],
    });

    const report = await createDiscussionsTriageExecuteApi(exec)();

    expect(report).toEqual({
      identity: expect.objectContaining({ login: 'visitor', role: 'user' }),
      plans: [],
      outcomes: [],
      skippedReason: 'guest',
    });
    expect(mutationCalls(exec)).toEqual([]);
  });

  it('refuses to post when gh cannot say who is acting — skippedReason identity-unresolved, no reads spent', async () => {
    const exec = ghStub({ login: undefined, discussions: [openDiscussionNode()] });

    const report = await createDiscussionsTriageExecuteApi(exec)();

    expect(report).toEqual({
      identity: undefined,
      plans: [],
      outcomes: [],
      skippedReason: 'identity-unresolved',
    });
    const queries = vi.mocked(exec).mock.calls.filter(([, args]) => args[1] === 'graphql');
    expect(queries).toEqual([]);
  });

  it('treats an owner segment that differs only in case as the maintainer, and signs with the resolved login', async () => {
    const exec = ghStub({
      login: 'Gabibi555',
      ownerLogin: 'gabibi555',
      discussions: [openDiscussionNode()],
    });

    const report = await createDiscussionsTriageExecuteApi(exec)();

    expect(report.skippedReason).toBeUndefined();
    expect(report.identity).toMatchObject({ login: 'Gabibi555', role: 'maintainer' });
    const mutations = mutationCalls(exec);
    expect(mutations).toHaveLength(2);
    expect(mutations[0]).toContain('on behalf of @Gabibi555');
  });

  it.each([
    ['a prefix of the owner', 'gabibi'],
    ['the owner plus a suffix', 'gabibi555-bot'],
  ])(
    'refuses a login that is only %s — the role gate is exact, not a substring match',
    async (_label, login) => {
      const exec = ghStub({ login, ownerLogin: 'gabibi555', discussions: [openDiscussionNode()] });

      const report = await createDiscussionsTriageExecuteApi(exec)();

      expect(report.skippedReason).toBe('guest');
      expect(report.identity).toMatchObject({ login, role: 'user' });
      expect(report.outcomes).toEqual([]);
      expect(mutationCalls(exec)).toEqual([]);
    },
  );

  it('refuses to post when the login resolves but gh repo view fails — identity-unresolved, no reads spent', async () => {
    const exec = ghStub({
      login: 'gabibi555',
      repoViewFails: true,
      discussions: [openDiscussionNode()],
    });

    const report = await createDiscussionsTriageExecuteApi(exec)();

    expect(report).toEqual({
      identity: undefined,
      plans: [],
      outcomes: [],
      skippedReason: 'identity-unresolved',
    });
    const queries = vi.mocked(exec).mock.calls.filter(([, args]) => args[1] === 'graphql');
    expect(queries).toEqual([]);
  });

  it('mutates only accepted discussions: locked and answered ones stay in plans with no outcome', async () => {
    const exec = ghStub({
      login: 'gabibi555',
      discussions: [
        openDiscussionNode(),
        openDiscussionNode({ id: 'D_locked', number: 10, locked: true }),
        openDiscussionNode({ id: 'D_answered', number: 11, isAnswered: true }),
      ],
    });

    const report = await createDiscussionsTriageExecuteApi(exec)();

    expect(report.plans.map((p) => [p.discussion.number, p.decision.decision])).toEqual([
      [9, 'accept'],
      [10, 'skip'],
      [11, 'skip'],
    ]);
    expect(report.outcomes.map((o) => o.discussionNumber)).toEqual([9]);
    const mutations = mutationCalls(exec);
    expect(mutations).toHaveLength(2);
    for (const argv of mutations) {
      expect(argv).toContain(DISCUSSION_ID);
      expect(argv).not.toContain('D_locked');
      expect(argv).not.toContain('D_answered');
    }
  });

  it('reports pool-label-unresolved and sends zero mutations when the pool label does not exist', async () => {
    const exec = ghStub({
      login: 'gabibi555',
      labelId: null,
      discussions: [openDiscussionNode()],
    });

    const report = await createDiscussionsTriageExecuteApi(exec)();

    expect(report.skippedReason).toBeUndefined();
    expect(report.plans).toHaveLength(1);
    expect(report.outcomes).toEqual([
      {
        discussionNumber: 9,
        replyResult: null,
        labelResult: null,
        skippedReason: 'pool-label-unresolved',
      },
    ]);
    expect(mutationCalls(exec)).toEqual([]);
  });

  it('runs nothing when the discussions read fails: empty plans and outcomes, no skippedReason, zero mutations', async () => {
    const exec = ghStub({
      login: 'gabibi555',
      discussionsCode: 1,
      discussions: [openDiscussionNode()],
    });

    const report = await createDiscussionsTriageExecuteApi(exec)();

    expect(report.identity).toMatchObject({ login: 'gabibi555', role: 'maintainer' });
    expect(report.plans).toEqual([]);
    expect(report.outcomes).toEqual([]);
    expect(report.skippedReason).toBeUndefined();
    expect(mutationCalls(exec)).toEqual([]);
  });

  it('defaults to the guarded gh exec when none is injected', () => {
    expect(() => createDiscussionsTriageExecuteApi()).not.toThrow();
  });
});
