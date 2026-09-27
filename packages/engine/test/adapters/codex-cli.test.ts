// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { parseCodexExecOutput } from '../../src/adapters/codex-cli.js';

/** One `codex exec --json` stdout, a JSON object per line (exec_events.rs). */
function jsonl(...events: readonly unknown[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n') + '\n';
}

const THREAD = { type: 'thread.started', thread_id: '0199a213-81c0-7800-8aa1-bbab2a035a53' };
const TURN_STARTED = { type: 'turn.started' };

function agentMessage(id: string, text: string): unknown {
  return { type: 'item.completed', item: { id, type: 'agent_message', text } };
}

function completed(usage: Record<string, number>): unknown {
  return { type: 'turn.completed', usage };
}

describe('parseCodexExecOutput', () => {
  it('maps a completed run into a passing envelope with the last agent message as its result', () => {
    const stdout = jsonl(
      THREAD,
      TURN_STARTED,
      { type: 'item.completed', item: { id: 'item_0', type: 'reasoning', text: 'looking around' } },
      agentMessage('item_1', 'first draft'),
      {
        type: 'item.completed',
        item: { id: 'item_2', type: 'command_execution', command: 'ls', status: 'completed' },
      },
      agentMessage('item_3', 'Repo contains docs, sdk, and examples directories.'),
      completed({
        input_tokens: 24763,
        cached_input_tokens: 24448,
        cache_write_input_tokens: 0,
        output_tokens: 122,
        reasoning_output_tokens: 64,
      }),
    );

    const response = parseCodexExecOutput(stdout, 0, 'gpt-5-codex');

    expect(response.exitCode).toBe(0);
    expect(response.stdout).toBe(stdout);
    expect(response.sessionId).toBe(THREAD.thread_id);
    expect(response.envelope).toEqual({
      result: 'Repo contains docs, sdk, and examples directories.',
      isError: false,
      apiErrorStatus: null,
      costUsd: null,
      numTurns: null,
      durationMs: null,
      stopReason: null,
      modelUsed: 'gpt-5-codex',
      tokensIn: 315, // 24763 total input − 24448 cached: the uncached share only
      tokensOut: 122,
      cacheRead: 24448,
      cacheCreate: 0,
      sessionId: THREAD.thread_id,
    });
  });

  it('never invents a cost, even when the run reported token usage', () => {
    const response = parseCodexExecOutput(
      jsonl(
        THREAD,
        completed({ input_tokens: 1_000_000, cached_input_tokens: 0, output_tokens: 1_000_000 }),
      ),
      0,
      'gpt-5-codex',
    );
    expect(response.envelope?.costUsd).toBeNull();
    expect(response.envelope?.tokensIn).toBe(1_000_000);
  });

  it('reports a failed turn as an error envelope carrying its message and no tokens', () => {
    const response = parseCodexExecOutput(
      jsonl(THREAD, TURN_STARTED, {
        type: 'turn.failed',
        error: { message: 'stream disconnected before completion' },
      }),
      1,
      'gpt-5-codex',
    );
    expect(response.exitCode).toBe(1);
    expect(response.sessionId).toBe(THREAD.thread_id);
    expect(response.envelope).toMatchObject({
      result: 'stream disconnected before completion',
      isError: true,
      costUsd: null,
      tokensIn: null,
      tokensOut: null,
      cacheRead: null,
      cacheCreate: null,
    });
  });

  it('returns no envelope for a run killed before its turn ended, but keeps the wire session id', () => {
    const response = parseCodexExecOutput(
      jsonl(THREAD, TURN_STARTED, agentMessage('item_0', 'halfway there')),
      143,
      'gpt-5-codex',
    );
    expect(response.envelope).toBeNull();
    expect(response.sessionId).toBe(THREAD.thread_id);
    expect(response.exitCode).toBe(143);
  });

  it('returns no envelope and no session for empty or non-JSON output', () => {
    for (const stdout of ['', 'error: unknown option --json\n', '[1,2]\n"text"\n']) {
      const response = parseCodexExecOutput(stdout, 2, 'gpt-5-codex');
      expect(response.envelope).toBeNull();
      expect(response.sessionId).toBeNull();
      expect(response.stdout).toBe(stdout);
    }
  });

  it('skips log noise, a torn line, and CRLF endings without losing the events around them', () => {
    const stdout = [
      'Reading prompt from stdin...',
      JSON.stringify(THREAD),
      '{"type":"item.completed","item":{"id":"item_0","ty',
      JSON.stringify(agentMessage('item_1', 'done')),
      JSON.stringify(completed({ input_tokens: 10, cached_input_tokens: 4, output_tokens: 3 })),
    ].join('\r\n');
    const response = parseCodexExecOutput(stdout, 0, 'gpt-5-codex');
    expect(response.sessionId).toBe(THREAD.thread_id);
    expect(response.envelope).toMatchObject({ result: 'done', isError: false, tokensIn: 6 });
  });

  it('takes the LAST turn.completed usage, because Codex reports a running total, not a delta', () => {
    const response = parseCodexExecOutput(
      jsonl(
        THREAD,
        completed({ input_tokens: 100, cached_input_tokens: 0, output_tokens: 10 }),
        agentMessage('item_0', 'second turn'),
        completed({ input_tokens: 250, cached_input_tokens: 100, output_tokens: 30 }),
      ),
      0,
      'gpt-5-codex',
    );
    expect(response.envelope).toMatchObject({
      result: 'second turn',
      tokensIn: 150,
      tokensOut: 30,
      cacheRead: 100,
    });
  });

  it('lets the last terminal event decide: a failed turn after a completed one is a failure', () => {
    const response = parseCodexExecOutput(
      jsonl(THREAD, completed({ input_tokens: 5, cached_input_tokens: 0, output_tokens: 1 }), {
        type: 'turn.failed',
        error: { message: 'usage limit reached' },
      }),
      1,
      'gpt-5-codex',
    );
    expect(response.envelope).toMatchObject({
      isError: true,
      result: 'usage limit reached',
      tokensIn: null,
    });
  });

  it('treats a retryable error event and a warning item as non-fatal when the turn completes', () => {
    const response = parseCodexExecOutput(
      jsonl(
        THREAD,
        { type: 'error', message: 'Reconnecting... 1/5' },
        {
          type: 'item.completed',
          item: { id: 'item_0', type: 'error', message: 'model rerouted' },
        },
        agentMessage('item_1', 'all good'),
        completed({ input_tokens: 2, cached_input_tokens: 0, output_tokens: 1 }),
      ),
      0,
      'gpt-5-codex',
    );
    expect(response.envelope).toMatchObject({ isError: false, result: 'all good' });
  });

  it('does not treat a bare error event as terminal: without a turn end there is no envelope', () => {
    const response = parseCodexExecOutput(
      jsonl(THREAD, { type: 'error', message: 'Reconnecting... 1/5' }),
      1,
      'gpt-5-codex',
    );
    expect(response.envelope).toBeNull();
    expect(response.sessionId).toBe(THREAD.thread_id);
  });

  it('keeps absent token fields null instead of zero, and floors a cached count above input', () => {
    const sparse = parseCodexExecOutput(
      jsonl(THREAD, completed({ output_tokens: 7 })),
      0,
      'gpt-5-codex',
    );
    expect(sparse.envelope).toMatchObject({
      tokensIn: null,
      tokensOut: 7,
      cacheRead: null,
      cacheCreate: null,
    });

    const uncached = parseCodexExecOutput(
      jsonl(THREAD, completed({ input_tokens: 12 })),
      0,
      'gpt-5-codex',
    );
    expect(uncached.envelope).toMatchObject({ tokensIn: 12, cacheRead: null });

    const skewed = parseCodexExecOutput(
      jsonl(THREAD, completed({ input_tokens: 3, cached_input_tokens: 9, output_tokens: 1 })),
      0,
      'gpt-5-codex',
    );
    expect(skewed.envelope?.tokensIn).toBe(0);
    expect(skewed.envelope?.cacheRead).toBe(9);
  });

  it('keeps the first thread id and ignores malformed fields rather than trusting them', () => {
    const response = parseCodexExecOutput(
      jsonl(
        THREAD,
        { type: 'thread.started', thread_id: 'a-second-id' },
        { type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'kept' } },
        { type: 'item.completed', item: { id: 'item_1', type: 'agent_message', text: 42 } },
        { type: 'item.completed', item: null },
        { type: 'turn.completed', usage: 'not-an-object' },
      ),
      0,
      'gpt-5-codex',
    );
    expect(response.sessionId).toBe(THREAD.thread_id);
    expect(response.envelope).toMatchObject({ result: 'kept', tokensIn: null, tokensOut: null });
  });

  it('reports no model when none was requested, since the wire never names one', () => {
    const response = parseCodexExecOutput(jsonl(THREAD, completed({ output_tokens: 1 })), 0, '');
    expect(response.envelope?.modelUsed).toBeNull();
  });

  it('reports a failed turn with no message as a null result, still an error', () => {
    const response = parseCodexExecOutput(jsonl(THREAD, { type: 'turn.failed' }), 1, 'gpt-5-codex');
    expect(response.envelope).toMatchObject({ isError: true, result: null });
  });
});
