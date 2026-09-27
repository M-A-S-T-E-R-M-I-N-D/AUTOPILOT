// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  parseCodexEvents,
  buildCodexArgs,
  resolveCodexEnv,
  CodexCliModel,
  DEFAULT_CODEX_SANDBOX,
} from '../../src/adapters/codex-cli.js';

/** One JSONL stdout, shaped like `codex exec --json` (exec_events.rs's ThreadEvent). */
function jsonl(...events: readonly unknown[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n') + '\n';
}

const THREAD = { type: 'thread.started', thread_id: '0199a213-81c0-7800-8aa1-bbab2a035a53' };
const USAGE = {
  input_tokens: 24_763,
  cached_input_tokens: 24_448,
  output_tokens: 122,
  reasoning_output_tokens: 64,
};

describe('parseCodexEvents', () => {
  it('maps a completed run into a passing envelope with the thread id and uncached input split', () => {
    const stdout = jsonl(
      THREAD,
      { type: 'turn.started' },
      { type: 'item.completed', item: { id: 'item_0', type: 'reasoning', text: 'looking' } },
      {
        type: 'item.completed',
        item: { id: 'item_1', type: 'command_execution', command: 'ls', status: 'completed' },
      },
      { type: 'item.completed', item: { id: 'item_2', type: 'agent_message', text: 'done' } },
      { type: 'turn.completed', usage: USAGE },
    );
    const result = parseCodexEvents(stdout, 0, 'gpt-5-codex');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(stdout);
    expect(result.sessionId).toBe(THREAD.thread_id);
    expect(result.envelope).toEqual({
      result: 'done',
      isError: false,
      apiErrorStatus: null,
      costUsd: null,
      numTurns: null,
      durationMs: null,
      stopReason: null,
      modelUsed: 'gpt-5-codex',
      tokensIn: 315, // 24_763 input includes the 24_448 cached
      tokensOut: 122,
      cacheRead: 24_448,
      cacheCreate: null,
      sessionId: THREAD.thread_id,
    });
  });

  it('never invents a cost — costUsd stays null even with full token usage', () => {
    const stdout = jsonl(THREAD, { type: 'turn.completed', usage: USAGE });
    expect(parseCodexEvents(stdout, 0, 'gpt-5-codex').envelope?.costUsd).toBeNull();
  });

  it('keeps the LAST agent message as the result (where the METRICS line lives)', () => {
    const stdout = jsonl(
      THREAD,
      { type: 'item.completed', item: { id: 'a', type: 'agent_message', text: 'first' } },
      { type: 'item.started', item: { id: 'b', type: 'agent_message', text: 'draft' } },
      { type: 'item.completed', item: { id: 'b', type: 'agent_message', text: 'METRICS:{}' } },
      { type: 'turn.completed', usage: USAGE },
    );
    expect(parseCodexEvents(stdout, 0, 'm').envelope?.result).toBe('METRICS:{}');
  });

  it('reports cache_write_input_tokens as cacheCreate when Codex sends it', () => {
    const usage = { ...USAGE, cache_write_input_tokens: 900 };
    const stdout = jsonl(THREAD, { type: 'turn.completed', usage });
    expect(parseCodexEvents(stdout, 0, 'm').envelope?.cacheCreate).toBe(900);
  });

  it('leaves token fields null when turn.completed carries no usage object', () => {
    const envelope = parseCodexEvents(jsonl({ type: 'turn.completed' }), 0, 'm').envelope;
    expect(envelope?.tokensIn).toBeNull();
    expect(envelope?.tokensOut).toBeNull();
    expect(envelope?.cacheRead).toBeNull();
  });

  it('turns turn.failed into an error envelope whose apiErrorStatus is Codex’s own message', () => {
    const message = 'exceeded retry limit, last status: 429 Too Many Requests';
    const stdout = jsonl(THREAD, { type: 'turn.failed', error: { message } });
    const result = parseCodexEvents(stdout, 1, 'm');
    expect(result.envelope?.isError).toBe(true);
    expect(result.envelope?.apiErrorStatus).toBe(message);
    expect(result.envelope?.result).toBeNull();
    expect(result.sessionId).toBe(THREAD.thread_id);
  });

  it('turns a top-level error event into an error envelope', () => {
    const stdout = jsonl({ type: 'error', message: 'stream disconnected' });
    const envelope = parseCodexEvents(stdout, 1, 'm').envelope;
    expect(envelope?.isError).toBe(true);
    expect(envelope?.apiErrorStatus).toBe('stream disconnected');
  });

  it('marks a completed turn as an error when the process still exited non-zero', () => {
    const stdout = jsonl(THREAD, { type: 'turn.completed', usage: USAGE });
    const envelope = parseCodexEvents(stdout, 2, 'm').envelope;
    expect(envelope?.isError).toBe(true);
    expect(envelope?.apiErrorStatus).toBeNull();
  });

  it('returns no envelope when the run died before any terminal event, keeping the wire thread id', () => {
    const stdout = jsonl(THREAD, { type: 'turn.started' });
    const result = parseCodexEvents(stdout, 1, 'm');
    expect(result.envelope).toBeNull();
    expect(result.sessionId).toBe(THREAD.thread_id);
  });

  it('returns no envelope and no session for empty stdout', () => {
    const result = parseCodexEvents('', 1, 'm');
    expect(result.envelope).toBeNull();
    expect(result.sessionId).toBeNull();
  });

  it('skips non-JSON and non-object lines and tolerates CRLF', () => {
    const stdout = [
      'warning: something on stdout',
      '42',
      JSON.stringify(THREAD),
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'x', type: 'agent_message', text: 'ok' },
      }),
      JSON.stringify({ type: 'turn.completed', usage: USAGE }),
    ].join('\r\n');
    const result = parseCodexEvents(stdout, 0, 'm');
    expect(result.envelope?.result).toBe('ok');
    expect(result.envelope?.isError).toBe(false);
  });
});

describe('buildCodexArgs', () => {
  it('builds a cold exec that reads the prompt from stdin', () => {
    expect(buildCodexArgs('gpt-5-codex', DEFAULT_CODEX_SANDBOX)).toEqual([
      'exec',
      '--json',
      '--model',
      'gpt-5-codex',
      '--sandbox',
      'workspace-write',
      '--skip-git-repo-check',
      '-',
    ]);
  });

  it('puts every flag before `resume <id>` and still reads the prompt from stdin', () => {
    const args = buildCodexArgs('m', 'read-only', 'thread-1');
    expect(args.slice(-3)).toEqual(['resume', 'thread-1', '-']);
    expect(args.indexOf('--sandbox')).toBeLessThan(args.indexOf('resume'));
    expect(args).toContain('read-only');
  });

  it('treats an empty resume id as a cold spawn', () => {
    expect(buildCodexArgs('m', DEFAULT_CODEX_SANDBOX, '')).not.toContain('resume');
  });
});

describe('resolveCodexEnv', () => {
  it('strips every Anthropic credential and routing switch but keeps Codex’s own', () => {
    const base = {
      PATH: '/usr/bin',
      OPENAI_API_KEY: 'openai-test-value',
      ANTHROPIC_API_KEY: 'anthropic-test-value',
      CLAUDE_CODE_OAUTH_TOKEN: 'oauth-test-value',
      ANTHROPIC_BASE_URL: 'http://gateway.test',
      CLAUDE_CODE_USE_BEDROCK: '1',
      CLAUDE_CODE_USE_VERTEX: '1',
    };
    const env = resolveCodexEnv(base);
    expect(env).toEqual({ PATH: '/usr/bin', OPENAI_API_KEY: 'openai-test-value' });
    expect(base.ANTHROPIC_API_KEY).toBe('anthropic-test-value'); // input never mutated
  });
});

describe('CodexCliModel', () => {
  it('resolves (never rejects) with a failed response when the binary does not exist', async () => {
    const model = new CodexCliModel({
      repo: process.cwd(),
      binary: 'autopilot-no-such-codex-binary',
      timeoutMs: 10_000,
    });
    const result = await model.invoke('m', 'hello');
    expect(result.exitCode).not.toBe(0);
    expect(result.envelope).toBeNull();
    expect(result.stdout).toMatch(/ENOENT|not found|autopilot-no-such-codex-binary/i);
  });
});
