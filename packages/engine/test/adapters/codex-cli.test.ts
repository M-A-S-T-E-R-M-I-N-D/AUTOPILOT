// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFile, spawn } from 'node:child_process';
import { parseCodexExecOutput, CodexCliModel } from '../../src/adapters/codex-cli.js';
import { DEFAULT_CLI_TIMEOUT_MS } from '../../src/adapters/claude-cli.js';

vi.mock('node:child_process', () => ({ execFile: vi.fn(), spawn: vi.fn() }));

// execFile is heavily overloaded (options shape picks the callback signature);
// fighting that overload set from a test double buys nothing, so the mock is
// driven through its untyped vi.fn() surface instead — same approach as
// claude-cli.test.ts.
const execFileMock = vi.mocked(execFile) as unknown as {
  mockReset(): void;
  mockImplementation(impl: (...args: unknown[]) => unknown): void;
  mock: { calls: unknown[][] };
};
const spawnMock = vi.mocked(spawn);

type ExecFileCallback = (
  error: (Error & { code?: unknown }) | null,
  stdout: string | null,
  stderr: string,
) => void;

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

describe('CodexCliModel', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    // ORPHAN SWEEP (claude-cli.ts's reapCliDescendants, reused here): an
    // on-able stub keeps the win32 taskkill reap inert under this mock,
    // same as claude-cli.test.ts's ClaudeCliModel suite.
    spawnMock.mockReset();
    spawnMock.mockReturnValue({ on: vi.fn() } as never);
  });

  function mockExecFileResult(
    error: (Error & { code?: unknown }) | null,
    stdout: string | null,
  ): void {
    execFileMock.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecFileCallback;
      queueMicrotask(() => cb(error, stdout, ''));
      return { pid: 4321 };
    });
  }

  it('resolves the parsed envelope from a clean run', async () => {
    const stdout = jsonl(
      THREAD,
      completed({ input_tokens: 10, cached_input_tokens: 0, output_tokens: 3 }),
      agentMessage('item_0', 'done'),
    );
    mockExecFileResult(null, stdout);

    const model = new CodexCliModel({ repo: '/work/sbx' });
    const res = await model.invoke('gpt-5-codex', 'do it');

    expect(res).toEqual(parseCodexExecOutput(stdout, 0, 'gpt-5-codex'));
  });

  it('spawns the default "codex" binary with --json, the model, a workspace-write sandbox, and the prompt last', async () => {
    mockExecFileResult(null, '');

    const model = new CodexCliModel({ repo: '/work/sbx' });
    await model.invoke('gpt-5-codex', 'do it');

    expect(execFileMock.mock.calls).toHaveLength(1);
    const [binary, args, options] = execFileMock.mock.calls[0] as [
      string,
      string[],
      Record<string, unknown>,
    ];
    expect(binary).toBe('codex');
    expect(args[0]).toBe('exec');
    expect(args).toContain('--json');
    expect(args[args.indexOf('--model') + 1]).toBe('gpt-5-codex');
    expect(args[args.indexOf('--sandbox') + 1]).toBe('workspace-write');
    expect(args).not.toContain('resume');
    expect(args[args.length - 1]).toBe('do it');
    expect(options).toMatchObject({
      cwd: '/work/sbx',
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      timeout: DEFAULT_CLI_TIMEOUT_MS,
      encoding: 'utf8',
    });
  });

  it('inserts "resume <id>" before the prompt when a session id is given', async () => {
    mockExecFileResult(null, '');

    const model = new CodexCliModel({ repo: '/work/sbx' });
    await model.invoke('gpt-5-codex', 'continue', THREAD.thread_id);

    const [, args] = execFileMock.mock.calls[0] as [string, string[]];
    const resumeAt = args.indexOf('resume');
    expect(resumeAt).toBeGreaterThan(-1);
    expect(args[resumeAt + 1]).toBe(THREAD.thread_id);
    expect(args[args.length - 1]).toBe('continue');
  });

  it('omits "resume" for an empty session id (an ordinary cold spawn)', async () => {
    mockExecFileResult(null, '');

    const model = new CodexCliModel({ repo: '/work/sbx' });
    await model.invoke('gpt-5-codex', 'do it', '');

    const [, args] = execFileMock.mock.calls[0] as [string, string[]];
    expect(args).not.toContain('resume');
  });

  it('honors a caller-supplied sandbox level and binary path', async () => {
    mockExecFileResult(null, '');

    const model = new CodexCliModel({
      repo: '/work/sbx',
      binary: '/opt/codex',
      sandbox: 'danger-full-access',
    });
    await model.invoke('gpt-5-codex', 'do it');

    const [binary, args] = execFileMock.mock.calls[0] as [string, string[]];
    expect(binary).toBe('/opt/codex');
    expect(args[args.indexOf('--sandbox') + 1]).toBe('danger-full-access');
  });

  it('passes a caller-supplied timeoutMs through to execFile', async () => {
    mockExecFileResult(null, '');

    const model = new CodexCliModel({ repo: '/work/sbx', timeoutMs: 5000 });
    await model.invoke('gpt-5-codex', 'do it');

    const [, , options] = execFileMock.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(options['timeout']).toBe(5000);
  });

  it('maps a numeric err.code straight through as the exit code', async () => {
    mockExecFileResult(Object.assign(new Error('boom'), { code: 17 }), 'partial');

    const model = new CodexCliModel({ repo: '/work/sbx' });
    const res = await model.invoke('gpt-5-codex', 'do it');

    expect(res.exitCode).toBe(17);
  });

  it('never rejects on a spawn failure (binary missing) — resolves a no-envelope response instead', async () => {
    mockExecFileResult(Object.assign(new Error('spawn codex ENOENT')), null);

    const model = new CodexCliModel({ repo: '/work/sbx' });
    const res = await model.invoke('gpt-5-codex', 'do it');

    expect(res.exitCode).toBe(1);
    expect(res.envelope).toBeNull();
    expect(res.stdout).toBe('');
  });

  it('ORPHAN SWEEP crash-path follow-up (board ap-mt2ukjg5-2): tracks the child pid on spawn, untracks it once settled', async () => {
    mockExecFileResult(null, '');
    const pidRegistry = { track: vi.fn(), untrack: vi.fn() };

    await new CodexCliModel({ repo: '/work/sbx', pidRegistry }).invoke('gpt-5-codex', 'do it');

    expect(pidRegistry.track).toHaveBeenCalledWith(4321);
    expect(pidRegistry.untrack).toHaveBeenCalledWith(4321);
  });

  it('untracks the child pid on an error exit too', async () => {
    mockExecFileResult(Object.assign(new Error('exit 55'), { code: 55 }), '');
    const pidRegistry = { track: vi.fn(), untrack: vi.fn() };

    await new CodexCliModel({ repo: '/work/sbx', pidRegistry }).invoke('gpt-5-codex', 'do it');

    expect(pidRegistry.untrack).toHaveBeenCalledWith(4321);
  });

  it('never touches the pid registry when none was configured', async () => {
    mockExecFileResult(null, '');

    await expect(
      new CodexCliModel({ repo: '/work/sbx' }).invoke('gpt-5-codex', 'do it'),
    ).resolves.toBeDefined();
  });

  it('neither tracks nor untracks a child that never got a pid — there is nothing to hand the registry', async () => {
    execFileMock.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecFileCallback;
      queueMicrotask(() =>
        cb(Object.assign(new Error('spawn codex ENOENT'), { code: 'ENOENT' }), null, ''),
      );
      return {}; // spawn failed before a pid existed
    });
    const pidRegistry = { track: vi.fn(), untrack: vi.fn() };

    const res = await new CodexCliModel({ repo: '/work/sbx', pidRegistry }).invoke(
      'gpt-5-codex',
      'do it',
    );

    expect(res.exitCode).toBe(1);
    expect(pidRegistry.track).not.toHaveBeenCalled();
    expect(pidRegistry.untrack).not.toHaveBeenCalled();
  });

  it("ORPHAN SWEEP (board web-msu3sv1w-hfj87n): reaps the child's descendant tree once the invocation settles", async () => {
    mockExecFileResult(null, '');
    const reapDescendants = vi.fn();

    await new CodexCliModel({ repo: '/work/sbx', reapDescendants }).invoke('gpt-5-codex', 'do it');

    expect(reapDescendants).toHaveBeenCalledTimes(1);
    expect(reapDescendants).toHaveBeenCalledWith(4321);
  });

  it('ORPHAN SWEEP: reaps on a spawn failure too, handing over the pid it never got', async () => {
    execFileMock.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecFileCallback;
      queueMicrotask(() =>
        cb(Object.assign(new Error('spawn codex ENOENT'), { code: 'ENOENT' }), null, ''),
      );
      return {};
    });
    const reapDescendants = vi.fn();

    await new CodexCliModel({ repo: '/work/sbx', reapDescendants }).invoke('gpt-5-codex', 'do it');

    expect(reapDescendants).toHaveBeenCalledWith(undefined);
  });

  describe('THIRD CAP — timedOut on the response (the wall-clock cap, not any kill)', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    /** execFile whose callback fires only after the (fake) clock has moved `elapsedMs`. */
    function mockExecFileAfter(
      elapsedMs: number,
      error: (Error & { code?: unknown; killed?: boolean }) | null,
      stdout = '',
    ): void {
      execFileMock.mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1] as ExecFileCallback;
        queueMicrotask(() => {
          vi.setSystemTime(Date.now() + elapsedMs);
          cb(error, stdout, '');
        });
        return { pid: 4321 };
      });
    }

    it('signal-killed AT the cap → timedOut: true, with the wire session id kept resumable', async () => {
      vi.useFakeTimers();
      mockExecFileAfter(
        5000,
        Object.assign(new Error('killed'), { killed: true }),
        jsonl(THREAD, TURN_STARTED),
      );

      const res = await new CodexCliModel({ repo: '/work/sbx', timeoutMs: 5000 }).invoke(
        'gpt-5-codex',
        'do it',
      );

      expect(res.exitCode).toBe(1);
      expect(res.envelope).toBeNull();
      expect(res.sessionId).toBe(THREAD.thread_id);
      expect(res.timedOut).toBe(true);
    });

    it('exited on its own past the cap (no signal) → the key stays off', async () => {
      vi.useFakeTimers();
      mockExecFileAfter(5000, Object.assign(new Error('exit 1'), { code: 1, killed: false }));

      const res = await new CodexCliModel({ repo: '/work/sbx', timeoutMs: 5000 }).invoke(
        'gpt-5-codex',
        'do it',
      );

      expect(res.exitCode).toBe(1);
      expect('timedOut' in res).toBe(false);
    });

    it('signal-killed well UNDER the cap (an unrelated external kill) → the key stays off', async () => {
      // Real clock: the callback fires microseconds after spawn, nowhere near 90 minutes.
      mockExecFileResult(Object.assign(new Error('killed'), { killed: true }), '');

      const res = await new CodexCliModel({ repo: '/work/sbx' }).invoke('gpt-5-codex', 'do it');

      expect(res.exitCode).toBe(1);
      expect('timedOut' in res).toBe(false);
    });
  });
});
