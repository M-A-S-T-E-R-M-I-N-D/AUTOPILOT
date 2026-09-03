// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  LIVE_STATE_LABEL,
  VIEW_CONTEXT_LABEL,
  ASK_ESCALATION_PROMPT_VERSION,
  type Activity,
} from '@autopilot/engine';
import {
  askProject,
  askProjectStream,
  askProjectEscalated,
  NO_SOURCES_ANSWER,
  type AskDeps,
  type AskStreamDeps,
  type AskEscalationDeps,
} from '../../src/ask/service.js';
import { ARCHITECT_PROPOSAL_FENCE } from '../../src/ask/architect-proposal.js';

function deps(over: Partial<AskDeps> = {}): AskDeps {
  return {
    sources: () => [
      {
        path: 'src/cart.ts',
        excerpt: 'export const total = (xs) => xs.reduce((a, b) => a + b, 0);',
      },
    ],
    projectMap: () => 'Project: Alpha\nLanguages: ts (2 files)',
    liveState: () => 'Flight: not running right now (project status: idle).\nBoard: empty',
    invoke: () => Promise.resolve('The total is a reduce over item prices. [src/cart.ts]'),
    ...over,
  };
}

function streamDeps(over: Partial<AskStreamDeps> = {}): AskStreamDeps {
  return {
    sources: () => [
      {
        path: 'src/cart.ts',
        excerpt: 'export const total = (xs) => xs.reduce((a, b) => a + b, 0);',
      },
    ],
    projectMap: () => 'Project: Alpha\nLanguages: ts (2 files)',
    liveState: () => 'Flight: not running right now (project status: idle).\nBoard: empty',
    invokeStream: (_prompt, onChunk) => {
      onChunk('The total ');
      onChunk('is a reduce. [src/cart.ts]');
      return Promise.resolve('The total is a reduce. [src/cart.ts]');
    },
    ...over,
  };
}

describe('askProject', () => {
  it('retrieves sources, builds the grounded prompt, and returns the answer + cited paths', async () => {
    const invoke = vi.fn((_prompt: string) =>
      Promise.resolve<string | null>('The total is a reduce over item prices. [src/cart.ts]'),
    );
    const result = await askProject(deps({ invoke }), 'p1', 'how is the total computed?');

    expect(result.ok).toBe(true);
    expect(result.answer).toContain('reduce');
    expect(result.sources).toContain('src/cart.ts');
    // The prompt the model saw is grounded: fenced excerpt + the question.
    const prompt = invoke.mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('PROJECT_CONTENT');
    expect(prompt).toContain('export const total');
    expect(prompt).toContain('how is the total computed?');
  });

  it('short-circuits ONLY when live state, project map, AND content are all unavailable (no quota)', async () => {
    const invoke = vi.fn(() => Promise.resolve<string | null>('should not be called'));
    const result = await askProject(
      deps({ sources: () => [], projectMap: () => null, liveState: () => null, invoke }),
      'p1',
      'anything?',
    );

    expect(result.ok).toBe(true);
    expect(result.answer).toBe(NO_SOURCES_ANSWER);
    expect(result.sources).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('escalates instead of short-circuiting when zero sources AND an escalation dep is wired (epic 0012 slice 2)', async () => {
    const invoke = vi.fn(() => Promise.resolve<string | null>('should not be called'));
    const escalate = vi.fn((_prompt: string) =>
      Promise.resolve<string | null>('Found the answer by reading src/cart.ts.'),
    );
    const result = await askProject(
      deps({
        sources: () => [],
        projectMap: () => null,
        liveState: () => null,
        invoke,
        escalation: { invoke: escalate },
      }),
      'p1',
      'anything?',
    );

    expect(invoke).not.toHaveBeenCalled(); // tier-1 tool-less call is skipped entirely
    expect(escalate).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.answer).toContain('src/cart.ts');
    expect(result.answer).not.toBe(NO_SOURCES_ANSWER);
  });

  it('deep:true forces escalation even when tier 1 would have found sources (epic 0012 slice 3)', async () => {
    const invoke = vi.fn(() => Promise.resolve<string | null>('should not be called'));
    const escalate = vi.fn((_prompt: string) =>
      Promise.resolve<string | null>('Found it by reading src/cart.ts.'),
    );
    const result = await askProject(
      deps({ invoke, escalation: { invoke: escalate } }),
      'p1',
      'how is the total computed?',
      undefined,
      undefined,
      true,
    );

    expect(invoke).not.toHaveBeenCalled();
    expect(escalate).toHaveBeenCalledTimes(1);
    expect(result.answer).toContain('src/cart.ts');
  });

  it('deep:true with no escalation dep wired falls through to the normal tier-1 flow', async () => {
    const invoke = vi.fn(() => Promise.resolve<string | null>('normal tier-1 answer'));
    const result = await askProject(
      deps({ invoke }),
      'p1',
      'how is the total computed?',
      undefined,
      undefined,
      true,
    );

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(result.answer).toBe('normal tier-1 answer');
  });

  it('NO_SOURCES_ANSWER explains why, not just that, nothing was found', () => {
    expect(NO_SOURCES_ANSWER).toContain('try different words');
  });

  it('live state is ALWAYS the first source, ahead of the project map and content', async () => {
    const invoke = vi.fn((_p: string) => Promise.resolve<string | null>('ok'));
    const result = await askProject(deps({ invoke }), 'p1', 'is a flight running right now?');
    expect(result.sources[0]).toBe(LIVE_STATE_LABEL);
    expect(result.sources).toContain('(project structure)');
    expect(result.sources).toContain('src/cart.ts');
    const prompt = invoke.mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('Flight: not running right now');
  });

  it('threads the current view into the grounded prompt, ahead of live state', async () => {
    const invoke = vi.fn((_p: string) => Promise.resolve<string | null>('ok'));
    const result = await askProject(
      deps({ invoke }),
      'p1',
      'what should I focus on next?',
      undefined,
      'project page: p1',
    );
    expect(result.sources[0]).toBe(VIEW_CONTEXT_LABEL);
    expect(result.sources[1]).toBe(LIVE_STATE_LABEL);
    const prompt = invoke.mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('project page: p1');
  });

  it('omits the view source entirely when none is supplied', async () => {
    const invoke = vi.fn((_p: string) => Promise.resolve<string | null>('ok'));
    const result = await askProject(deps({ invoke }), 'p1', 'q?');
    expect(result.sources).not.toContain(VIEW_CONTEXT_LABEL);
  });

  it('trims a view with surrounding whitespace before including it as a source', async () => {
    const invoke = vi.fn((_p: string) => Promise.resolve<string | null>('ok'));
    await askProject(deps({ invoke }), 'p1', 'q?', undefined, '  MARKER123  ');
    const prompt = invoke.mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain(`[${VIEW_CONTEXT_LABEL}]\nMARKER123`);
  });

  it('answers STRUCTURE questions from the project map even with zero content matches', async () => {
    const invoke = vi.fn((_p: string) =>
      Promise.resolve<string | null>('It is a TS project with 2 files.'),
    );
    const result = await askProject(
      deps({ sources: () => [], liveState: () => null, invoke }),
      'p1',
      'what is this project?',
    );

    expect(result.ok).toBe(true);
    expect(result.answer).toContain('TS project');
    expect(result.sources).toEqual(['(project structure)']);
    const prompt = invoke.mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('Project: Alpha'); // the map grounds the answer
  });

  it('the project map leads when live state is unavailable, alongside content hits', async () => {
    const invoke = vi.fn((_p: string) => Promise.resolve<string | null>('ok'));
    const result = await askProject(
      deps({ liveState: () => null, invoke }),
      'p1',
      'how is the total computed?',
    );
    expect(result.sources[0]).toBe('(project structure)');
    expect(result.sources).toContain('src/cart.ts');
  });

  it('rejects a blank question without calling anything', async () => {
    const invoke = vi.fn(() => Promise.resolve('x'));
    const result = await askProject(deps({ invoke }), 'p1', '   ');
    expect(result.ok).toBe(false);
    expect(result.answer).toContain('question');
    expect(result.sources).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('degrades honestly when the model returns nothing (quota/error)', async () => {
    const result = await askProject(deps({ invoke: () => Promise.resolve(null) }), 'p1', 'q?');
    expect(result.ok).toBe(false);
    expect(result.answer.toLowerCase()).toContain('unavailable');
  });

  it('degrades honestly when the model returns only whitespace', async () => {
    const result = await askProject(deps({ invoke: () => Promise.resolve('   ') }), 'p1', 'q?');
    expect(result.ok).toBe(false);
    expect(result.answer.toLowerCase()).toContain('unavailable');
  });

  it('trims surrounding whitespace from the model answer', async () => {
    const result = await askProject(
      deps({ invoke: () => Promise.resolve('  padded answer  ') }),
      'p1',
      'q?',
    );
    expect(result.answer).toBe('padded answer');
  });

  it('caps the number of sources sent to the model', async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      path: `f${i}.ts`,
      excerpt: 'content',
    }));
    const invoke = vi.fn(() => Promise.resolve('ok'));
    const result = await askProject(deps({ sources: () => many, invoke }), 'p1', 'q?');
    expect(result.sources.length).toBeLessThanOrEqual(5); // live state + map + 3 content
  });

  it('threads prior turns into the grounded prompt for follow-up context', async () => {
    const invoke = vi.fn((_p: string) => Promise.resolve<string | null>('ok'));
    await askProject(deps({ invoke }), 'p1', 'and what calls it?', [
      { question: 'how is the total computed?', answer: 'A reduce over item prices.' },
    ]);
    const prompt = invoke.mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('how is the total computed?');
    expect(prompt).toContain('A reduce over item prices.');
  });

  it('caps history to the most recent turns so a long chat cannot balloon the prompt', async () => {
    const invoke = vi.fn((_p: string) => Promise.resolve<string | null>('ok'));
    const history = Array.from({ length: 10 }, (_, i) => ({
      question: `question ${i}`,
      answer: `answer ${i}`,
    }));
    await askProject(deps({ invoke }), 'p1', 'latest question', history);
    const prompt = invoke.mock.calls[0]?.[0] ?? '';
    expect(prompt).not.toContain('question 0');
    expect(prompt).toContain('question 9');
  });
});

describe('askProjectStream', () => {
  it('relays chunks via onChunk as they arrive, then resolves the grounded answer + sources', async () => {
    const chunks: string[] = [];
    const result = await askProjectStream(
      streamDeps(),
      'p1',
      'how is the total computed?',
      (text) => chunks.push(text),
    );

    expect(chunks).toEqual(['The total ', 'is a reduce. [src/cart.ts]']);
    expect(result.ok).toBe(true);
    expect(result.answer).toContain('reduce');
    expect(result.sources).toContain('src/cart.ts');
  });

  it('short-circuits ONLY when live state, project map, AND content are all unavailable (no quota, no chunks)', async () => {
    const invokeStream = vi.fn((_p: string, _onChunk: (t: string) => void) =>
      Promise.resolve<string | null>('should not be called'),
    );
    const result = await askProjectStream(
      streamDeps({
        sources: () => [],
        projectMap: () => null,
        liveState: () => null,
        invokeStream,
      }),
      'p1',
      'anything?',
      () => {
        throw new Error('onChunk should not fire on short-circuit');
      },
    );

    expect(result.ok).toBe(true);
    expect(result.answer).toBe(NO_SOURCES_ANSWER);
    expect(result.sources).toEqual([]);
    expect(invokeStream).not.toHaveBeenCalled();
  });

  it('escalates instead of short-circuiting when zero sources AND an escalation dep is wired (epic 0012 slice 2)', async () => {
    const invokeStream = vi.fn((_p: string, _onChunk: (t: string) => void) =>
      Promise.resolve<string | null>('should not be called'),
    );
    const escalate = vi.fn((_prompt: string) =>
      Promise.resolve<string | null>('Found the answer by reading src/cart.ts.'),
    );
    const result = await askProjectStream(
      streamDeps({
        sources: () => [],
        projectMap: () => null,
        liveState: () => null,
        invokeStream,
        escalation: { invoke: escalate },
      }),
      'p1',
      'anything?',
      () => {},
    );

    expect(invokeStream).not.toHaveBeenCalled();
    expect(escalate).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.answer).toContain('src/cart.ts');
    expect(result.answer).not.toBe(NO_SOURCES_ANSWER);
  });

  it('deep:true forces escalation even when tier 1 would have found sources, and relays activity (epic 0012 slice 3)', async () => {
    const invokeStream = vi.fn((_p: string, _onChunk: (t: string) => void) =>
      Promise.resolve<string | null>('should not be called'),
    );
    const escalate = vi.fn((_prompt: string, onActivity?: (a: Activity) => void) => {
      onActivity?.({
        tool: 'Read',
        target: 'src/cart.ts',
        kind: 'file',
        reasoning: null,
        model: null,
        tokensIn: null,
        tokensOut: null,
      });
      return Promise.resolve<string | null>('Found it by reading src/cart.ts.');
    });
    const activities: unknown[] = [];
    const result = await askProjectStream(
      streamDeps({ invokeStream, escalation: { invoke: escalate } }),
      'p1',
      'how is the total computed?',
      () => {},
      undefined,
      undefined,
      true,
      (a) => activities.push(a),
    );

    expect(invokeStream).not.toHaveBeenCalled();
    expect(escalate).toHaveBeenCalledTimes(1);
    expect(activities).toEqual([
      {
        tool: 'Read',
        target: 'src/cart.ts',
        kind: 'file',
        reasoning: null,
        model: null,
        tokensIn: null,
        tokensOut: null,
      },
    ]);
    expect(result.answer).toContain('src/cart.ts');
  });

  it('rejects a blank question without calling anything', async () => {
    const invokeStream = vi.fn(() => Promise.resolve('x'));
    const result = await askProjectStream(streamDeps({ invokeStream }), 'p1', '   ', () => {
      throw new Error('onChunk should not fire');
    });
    expect(result.ok).toBe(false);
    expect(result.answer).toContain('question');
    expect(result.sources).toEqual([]);
    expect(invokeStream).not.toHaveBeenCalled();
  });

  it('degrades honestly when the model returns nothing (quota/error)', async () => {
    const result = await askProjectStream(
      streamDeps({ invokeStream: () => Promise.resolve(null) }),
      'p1',
      'q?',
      () => {},
    );
    expect(result.ok).toBe(false);
    expect(result.answer.toLowerCase()).toContain('unavailable');
  });

  it('degrades honestly when the model returns only whitespace', async () => {
    const result = await askProjectStream(
      streamDeps({ invokeStream: () => Promise.resolve('   ') }),
      'p1',
      'q?',
      () => {},
    );
    expect(result.ok).toBe(false);
    expect(result.answer.toLowerCase()).toContain('unavailable');
  });

  it('trims surrounding whitespace from the model answer', async () => {
    const result = await askProjectStream(
      streamDeps({ invokeStream: () => Promise.resolve('  padded  ') }),
      'p1',
      'q?',
      () => {},
    );
    expect(result.answer).toBe('padded');
  });

  it('threads prior turns into the grounded prompt', async () => {
    const invokeStream = vi.fn((_p: string, onChunk: (t: string) => void) => {
      onChunk('ok');
      return Promise.resolve<string | null>('ok');
    });
    await askProjectStream(streamDeps({ invokeStream }), 'p1', 'and what calls it?', () => {}, [
      { question: 'how is the total computed?', answer: 'A reduce over item prices.' },
    ]);
    const prompt = invokeStream.mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('how is the total computed?');
  });

  it('caps history to the most recent turns so a long chat cannot balloon the prompt', async () => {
    const invokeStream = vi.fn((_p: string, onChunk: (t: string) => void) => {
      onChunk('ok');
      return Promise.resolve<string | null>('ok');
    });
    const history = Array.from({ length: 10 }, (_, i) => ({
      question: `question ${i}`,
      answer: `answer ${i}`,
    }));
    await askProjectStream(
      streamDeps({ invokeStream }),
      'p1',
      'latest question',
      () => {},
      history,
    );
    const prompt = invokeStream.mock.calls[0]?.[0] ?? '';
    expect(prompt).not.toContain('question 0');
    expect(prompt).toContain('question 9');
  });

  it('threads the current view into the grounded prompt, ahead of live state', async () => {
    const invokeStream = vi.fn((_p: string, onChunk: (t: string) => void) => {
      onChunk('ok');
      return Promise.resolve<string | null>('ok');
    });
    const result = await askProjectStream(
      streamDeps({ invokeStream }),
      'p1',
      'what should I focus on next?',
      () => {},
      undefined,
      'fleet page (all projects)',
    );
    expect(result.sources[0]).toBe(VIEW_CONTEXT_LABEL);
    const prompt = invokeStream.mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('fleet page (all projects)');
  });
});

function escalationDeps(over: Partial<AskEscalationDeps> = {}): AskEscalationDeps {
  return {
    invoke: () => Promise.resolve('Found it by reading src/cart.ts.'),
    ...over,
  };
}

describe('askProjectEscalated', () => {
  it('invokes the escalation prompt directly — no source retrieval, no "no sources" short-circuit', async () => {
    const invoke = vi.fn((_prompt: string) =>
      Promise.resolve<string | null>('Found it by reading src/cart.ts.'),
    );
    const result = await askProjectEscalated(
      escalationDeps({ invoke }),
      'how is the total computed?',
    );

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.answer).toContain('src/cart.ts');
    expect(result.sources).toEqual([]);
    expect(result.promptVersion).toBe(ASK_ESCALATION_PROMPT_VERSION);
    const prompt = invoke.mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('how is the total computed?');
    expect(prompt).toMatch(/Read, Grep, and Glob/);
  });

  it('rejects a blank question without calling anything', async () => {
    const invoke = vi.fn(() => Promise.resolve('x'));
    const result = await askProjectEscalated(escalationDeps({ invoke }), '   ');
    expect(result.ok).toBe(false);
    expect(result.answer).toContain('question');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('degrades honestly when the model returns nothing (quota/error)', async () => {
    const result = await askProjectEscalated(
      escalationDeps({ invoke: () => Promise.resolve(null) }),
      'q?',
    );
    expect(result.ok).toBe(false);
    expect(result.answer.toLowerCase()).toContain('unavailable');
  });

  it('degrades honestly when the model returns only whitespace', async () => {
    const result = await askProjectEscalated(
      escalationDeps({ invoke: () => Promise.resolve('   ') }),
      'q?',
    );
    expect(result.ok).toBe(false);
    expect(result.answer.toLowerCase()).toContain('unavailable');
  });

  it('trims surrounding whitespace from the model answer', async () => {
    const result = await askProjectEscalated(
      escalationDeps({ invoke: () => Promise.resolve('  padded answer  ') }),
      'q?',
    );
    expect(result.answer).toBe('padded answer');
  });

  it('threads prior turns into the escalation prompt for follow-up context', async () => {
    const invoke = vi.fn((_prompt: string) => Promise.resolve<string | null>('ok'));
    await askProjectEscalated(escalationDeps({ invoke }), 'and what calls it?', [
      { question: 'how is the total computed?', answer: 'A reduce over item prices.' },
    ]);
    const prompt = invoke.mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('how is the total computed?');
    expect(prompt).toContain('A reduce over item prices.');
  });

  it('caps history to the most recent turns so a long chat cannot balloon the prompt', async () => {
    const invoke = vi.fn((_prompt: string) => Promise.resolve<string | null>('ok'));
    const history = Array.from({ length: 10 }, (_, i) => ({
      question: `question ${i}`,
      answer: `answer ${i}`,
    }));
    await askProjectEscalated(escalationDeps({ invoke }), 'latest question', history);
    const prompt = invoke.mock.calls[0]?.[0] ?? '';
    expect(prompt).not.toContain('question 0');
    expect(prompt).toContain('question 9');
  });
});

describe('ARCHITECT persona (epic 0011 slice 3)', () => {
  const PROPOSAL_ANSWER = [
    'Move it to queued.',
    '',
    '```' + ARCHITECT_PROPOSAL_FENCE,
    '{"tool":"tasks_set_status","args":{"taskId":"t1","status":"queued"}}',
    '```',
  ].join('\n');

  it('askProject appends the ARCHITECT addendum to the grounded prompt', async () => {
    const invoke = vi.fn((_p: string) => Promise.resolve<string | null>('ok'));
    await askProject(deps({ invoke }), 'p1', 'q?', undefined, undefined, undefined, 'architect');
    const prompt = invoke.mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('ARCHITECT mode');
    expect(prompt).toContain(ARCHITECT_PROPOSAL_FENCE);
    // The addendum comes AFTER the grounded prompt, not instead of it.
    expect(prompt).toContain('PROJECT_CONTENT');
  });

  it('askProject leaves the prompt addendum-free for the default persona', async () => {
    const invoke = vi.fn((_p: string) => Promise.resolve<string | null>('ok'));
    await askProject(deps({ invoke }), 'p1', 'q?');
    const prompt = invoke.mock.calls[0]?.[0] ?? '';
    expect(prompt).not.toContain('ARCHITECT mode');
  });

  it('lifts a valid proposal block out of the architect answer into result.proposal', async () => {
    const result = await askProject(
      deps({ invoke: () => Promise.resolve(PROPOSAL_ANSWER) }),
      'p1',
      'queue task t1',
      undefined,
      undefined,
      undefined,
      'architect',
    );
    expect(result.ok).toBe(true);
    expect(result.answer).toBe('Move it to queued.');
    expect(result.proposal).toEqual({
      tool: 'tasks_set_status',
      args: { taskId: 't1', status: 'queued' },
      safety: 'write',
    });
  });

  it('carries no proposal when the architect answer has no block, answer untouched', async () => {
    const result = await askProject(
      deps({ invoke: () => Promise.resolve('Just an answer.') }),
      'p1',
      'q?',
      undefined,
      undefined,
      undefined,
      'architect',
    );
    expect(result.answer).toBe('Just an answer.');
    expect(result.proposal).toBeUndefined();
  });

  it('does NOT parse proposal blocks for the default persona — the block stays visible', async () => {
    const result = await askProject(
      deps({ invoke: () => Promise.resolve(PROPOSAL_ANSWER) }),
      'p1',
      'q?',
    );
    expect(result.answer).toContain(ARCHITECT_PROPOSAL_FENCE);
    expect(result.proposal).toBeUndefined();
  });

  it('architect + deep escalation: no addendum on the escalation prompt, no proposal (tier-1 only)', async () => {
    const escalate = vi.fn((_prompt: string) => Promise.resolve<string | null>('escalated answer'));
    const result = await askProject(
      deps({ escalation: { invoke: escalate } }),
      'p1',
      'q?',
      undefined,
      undefined,
      true,
      'architect',
    );
    expect(escalate).toHaveBeenCalledTimes(1);
    const prompt = escalate.mock.calls[0]?.[0] ?? '';
    expect(prompt).not.toContain('ARCHITECT mode');
    expect(result.proposal).toBeUndefined();
  });

  it('askProjectStream appends the addendum and lifts the proposal from the terminal answer', async () => {
    const chunks: string[] = [];
    const invokeStream = vi.fn((_p: string, onChunk: (t: string) => void) => {
      onChunk(PROPOSAL_ANSWER);
      return Promise.resolve<string | null>(PROPOSAL_ANSWER);
    });
    const result = await askProjectStream(
      streamDeps({ invokeStream }),
      'p1',
      'queue task t1',
      (text) => chunks.push(text),
      undefined,
      undefined,
      undefined,
      undefined,
      'architect',
    );
    const prompt = invokeStream.mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('ARCHITECT mode');
    // Chunks stream raw — only the terminal result carries the stripped prose.
    expect(chunks[0]).toContain(ARCHITECT_PROPOSAL_FENCE);
    expect(result.answer).toBe('Move it to queued.');
    expect(result.proposal).toEqual({
      tool: 'tasks_set_status',
      args: { taskId: 't1', status: 'queued' },
      safety: 'write',
    });
  });

  it('askProjectStream leaves the prompt addendum-free for the default persona', async () => {
    const invokeStream = vi.fn((_p: string, onChunk: (t: string) => void) => {
      onChunk('ok');
      return Promise.resolve<string | null>('ok');
    });
    await askProjectStream(streamDeps({ invokeStream }), 'p1', 'q?', () => {});
    const prompt = invokeStream.mock.calls[0]?.[0] ?? '';
    expect(prompt).not.toContain('ARCHITECT mode');
  });
});
