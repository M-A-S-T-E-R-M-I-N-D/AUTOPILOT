// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFile, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  parseCodexExecOutput,
  CodexCliModel,
  isCodexResumeFailure,
} from '../../src/adapters/codex-cli.js';
import {
  CLI_STDIN_PROMPT_THRESHOLD,
  DEFAULT_CLI_IDLE_TIMEOUT_MS,
  DEFAULT_CLI_TIMEOUT_MS,
} from '../../src/adapters/claude-cli.js';

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

describe('isCodexResumeFailure', () => {
  const failed = { envelope: null, exitCode: 1, sessionId: null };

  it('fires only for a resume that died before thread.started, which is where `codex exec resume` fails a stale id', () => {
    expect(isCodexResumeFailure(THREAD.thread_id, failed)).toBe(true);
  });

  it('never fires without a resume, on a clean exit, or once the wire has named a thread', () => {
    expect(isCodexResumeFailure(undefined, failed)).toBe(false);
    expect(isCodexResumeFailure('', failed)).toBe(false);
    expect(isCodexResumeFailure(THREAD.thread_id, { ...failed, exitCode: 0 })).toBe(false);
    expect(isCodexResumeFailure(THREAD.thread_id, { ...failed, sessionId: THREAD.thread_id })).toBe(
      false,
    );
  });

  it('never fires on a wall-clock kill: a cold retry would only double the time the cap already spent', () => {
    expect(isCodexResumeFailure(THREAD.thread_id, { ...failed, timedOut: true })).toBe(false);
  });
});

describe('CodexCliModel', () => {
  let stdinEnd: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    execFileMock.mockReset();
    // ORPHAN SWEEP (claude-cli.ts's reapCliDescendants, reused here): an
    // on-able stub keeps the win32 taskkill reap inert under this mock,
    // same as claude-cli.test.ts's ClaudeCliModel suite.
    spawnMock.mockReset();
    spawnMock.mockReturnValue({ on: vi.fn() } as never);
    stdinEnd = vi.fn();
  });

  function mockExecFileResult(
    error: (Error & { code?: unknown }) | null,
    stdout: string | null,
  ): void {
    execFileMock.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecFileCallback;
      queueMicrotask(() => cb(error, stdout, ''));
      return { pid: 4321, stdin: Object.assign(new EventEmitter(), { end: stdinEnd }) };
    });
  }

  function spawnedArgs(): string[] {
    return (execFileMock.mock.calls[0] as [string, string[]])[1];
  }

  it('closes stdin empty for an argv prompt: with a prompt given, `codex exec` still reads a piped stdin to EOF to append it, so an open pipe would hang the run to the cap', async () => {
    mockExecFileResult(null, '');

    await new CodexCliModel({ repo: '/work/sbx' }).invoke('gpt-5-codex', 'do it');

    expect(spawnedArgs()[spawnedArgs().length - 1]).toBe('do it');
    expect(stdinEnd).toHaveBeenCalledTimes(1);
    expect(stdinEnd).toHaveBeenCalledWith();
  });

  it('pipes an over-threshold prompt on stdin behind "-" instead of argv (the Windows command-line ceiling)', async () => {
    mockExecFileResult(null, '');
    const long = 'x'.repeat(CLI_STDIN_PROMPT_THRESHOLD + 1);

    await new CodexCliModel({ repo: '/work/sbx' }).invoke('gpt-5-codex', long);

    const args = spawnedArgs();
    expect(args).not.toContain(long);
    expect(args[args.length - 1]).toBe('-');
    expect(stdinEnd).toHaveBeenCalledWith(long);
  });

  it('keeps a prompt exactly at the threshold on argv', async () => {
    mockExecFileResult(null, '');
    const atLimit = 'y'.repeat(CLI_STDIN_PROMPT_THRESHOLD);

    await new CodexCliModel({ repo: '/work/sbx' }).invoke('gpt-5-codex', atLimit);

    expect(spawnedArgs()[spawnedArgs().length - 1]).toBe(atLimit);
    expect(stdinEnd).toHaveBeenCalledWith();
  });

  it('pipes an over-threshold resume prompt too: "resume <id> -", since resume reads stdin only for "-"', async () => {
    mockExecFileResult(null, '');
    const long = 'z'.repeat(CLI_STDIN_PROMPT_THRESHOLD + 1);

    await new CodexCliModel({ repo: '/work/sbx' }).invoke('gpt-5-codex', long, THREAD.thread_id);

    expect(spawnedArgs().slice(-3)).toEqual(['resume', THREAD.thread_id, '-']);
    expect(stdinEnd).toHaveBeenCalledWith(long);
  });

  it('pipes a prompt that starts with "-", which clap would read as a flag (or "-" itself as a stdin read)', async () => {
    mockExecFileResult(null, '');

    await new CodexCliModel({ repo: '/work/sbx' }).invoke('gpt-5-codex', '- fix the build');

    expect(spawnedArgs()).not.toContain('- fix the build');
    expect(spawnedArgs()[spawnedArgs().length - 1]).toBe('-');
    expect(stdinEnd).toHaveBeenCalledWith('- fix the build');
  });

  it('swallows a stdin pipe error (EPIPE: the CLI exited before reading) instead of crashing the host', async () => {
    const stdin = Object.assign(new EventEmitter(), { end: stdinEnd });
    execFileMock.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecFileCallback;
      queueMicrotask(() => cb(Object.assign(new Error('exit 55'), { code: 55 }), '', ''));
      return { pid: 4321, stdin };
    });

    const res = await new CodexCliModel({ repo: '/work/sbx' }).invoke(
      'gpt-5-codex',
      'z'.repeat(CLI_STDIN_PROMPT_THRESHOLD + 1),
    );

    expect(() => stdin.emit('error', new Error('write EPIPE'))).not.toThrow();
    expect(res.exitCode).toBe(55);
  });

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

  describe('resume fallback and resumed telemetry (epic 0009 parity with ClaudeCliModel)', () => {
    const COLD_THREAD = {
      type: 'thread.started',
      thread_id: '0199a213-81c0-7800-8aa1-cccccccccccc',
    };
    const DONE = [completed({ input_tokens: 4, output_tokens: 2 }), agentMessage('item_0', 'done')];

    /** One execFile outcome per spawn, in order; the last repeats. */
    function mockExecFileRuns(
      ...runs: readonly (readonly [(Error & { code?: unknown }) | null, string])[]
    ): void {
      let calls = 0;
      execFileMock.mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1] as ExecFileCallback;
        const run = runs[Math.min(calls, runs.length - 1)];
        calls += 1;
        queueMicrotask(() => cb(run?.[0] ?? null, run?.[1] ?? '', ''));
        return { pid: 4321, stdin: Object.assign(new EventEmitter(), { end: stdinEnd }) };
      });
    }

    const exit1 = (): Error & { code: number } => Object.assign(new Error('exit 1'), { code: 1 });

    it('retries once, cold, when `codex exec resume` rejects the session id before starting a thread', async () => {
      mockExecFileRuns([exit1(), ''], [null, jsonl(COLD_THREAD, ...DONE)]);

      const res = await new CodexCliModel({ repo: '/work/sbx' }).invoke(
        'gpt-5-codex',
        'continue',
        THREAD.thread_id,
      );

      expect(execFileMock.mock.calls).toHaveLength(2);
      const [, retryArgs] = execFileMock.mock.calls[1] as [string, string[]];
      expect(retryArgs).not.toContain('resume');
      expect(retryArgs[retryArgs.length - 1]).toBe('continue');
      expect(res.resumed).toBe(false);
      expect(res.sessionId).toBe(COLD_THREAD.thread_id);
      expect(res.envelope?.result).toBe('done');
    });

    it('reports resumed: true when the wire names the thread it was asked to resume', async () => {
      mockExecFileRuns([null, jsonl(THREAD, ...DONE)]);

      const res = await new CodexCliModel({ repo: '/work/sbx' }).invoke(
        'gpt-5-codex',
        'continue',
        THREAD.thread_id,
      );

      expect(execFileMock.mock.calls).toHaveLength(1);
      expect(res.resumed).toBe(true);
    });

    it('reports resumed: false when the wire names a different thread: a session name Codex could not find starts a fresh one silently', async () => {
      mockExecFileRuns([null, jsonl(COLD_THREAD, ...DONE)]);

      const res = await new CodexCliModel({ repo: '/work/sbx' }).invoke(
        'gpt-5-codex',
        'continue',
        'nightly-lane',
      );

      expect(execFileMock.mock.calls).toHaveLength(1);
      expect(res.resumed).toBe(false);
    });

    it('never retries a resumed run that died mid-turn: the thread it named proves the resume took', async () => {
      mockExecFileRuns([exit1(), jsonl(THREAD, TURN_STARTED)]);

      const res = await new CodexCliModel({ repo: '/work/sbx' }).invoke(
        'gpt-5-codex',
        'continue',
        THREAD.thread_id,
      );

      expect(execFileMock.mock.calls).toHaveLength(1);
      expect(res.envelope).toBeNull();
      expect(res.resumed).toBe(true);
    });

    it('never retries a failed turn on a resumed thread: that is a model failure, not a resume failure', async () => {
      mockExecFileRuns([
        exit1(),
        jsonl(THREAD, { type: 'turn.failed', error: { message: 'quota' } }),
      ]);

      const res = await new CodexCliModel({ repo: '/work/sbx' }).invoke(
        'gpt-5-codex',
        'continue',
        THREAD.thread_id,
      );

      expect(execFileMock.mock.calls).toHaveLength(1);
      expect(res.envelope).toMatchObject({ isError: true, result: 'quota' });
      expect(res.resumed).toBe(true);
    });

    it('leaves resumed off for a cold spawn, and never retries a cold spawn that failed', async () => {
      mockExecFileRuns([exit1(), '']);

      const res = await new CodexCliModel({ repo: '/work/sbx' }).invoke('gpt-5-codex', 'do it');

      expect(execFileMock.mock.calls).toHaveLength(1);
      expect('resumed' in res).toBe(false);
    });
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

    it('a resume killed AT the cap before naming a thread is not retried cold, and claims no resume either way', async () => {
      vi.useFakeTimers();
      mockExecFileAfter(5000, Object.assign(new Error('killed'), { killed: true }));

      const res = await new CodexCliModel({ repo: '/work/sbx', timeoutMs: 5000 }).invoke(
        'gpt-5-codex',
        'continue',
        THREAD.thread_id,
      );

      expect(execFileMock.mock.calls).toHaveLength(1);
      expect(res.timedOut).toBe(true);
      expect('resumed' in res).toBe(false);
    });

    it('signal-killed well UNDER the cap (an unrelated external kill) → the key stays off', async () => {
      // Real clock: the callback fires microseconds after spawn, nowhere near 90 minutes.
      mockExecFileResult(Object.assign(new Error('killed'), { killed: true }), '');

      const res = await new CodexCliModel({ repo: '/work/sbx' }).invoke('gpt-5-codex', 'do it');

      expect(res.exitCode).toBe(1);
      expect('timedOut' in res).toBe(false);
    });
  });

  describe('idle cap — a silent child is killed long before the wall clock (StreamingClaudeCliModel parity)', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    /** A child that stays alive until killed: `kill()` settles execFile's
     *  callback the way a real kill does (err.killed, no envelope), and
     *  `stdout` is the stream the adapter watches for signs of life. */
    function mockLiveChild(stdoutSoFar: string): {
      readonly kill: ReturnType<typeof vi.fn>;
      readonly stdout: EventEmitter;
      readonly exitCleanly: (out: string) => void;
    } {
      const stdout = new EventEmitter();
      let settle: ExecFileCallback = () => undefined;
      const kill = vi.fn(() => {
        queueMicrotask(() =>
          settle(Object.assign(new Error('killed'), { killed: true, code: 1 }), stdoutSoFar, ''),
        );
        return true;
      });
      execFileMock.mockImplementation((...args: unknown[]) => {
        settle = args[args.length - 1] as ExecFileCallback;
        return {
          pid: 4321,
          stdout,
          kill,
          stdin: Object.assign(new EventEmitter(), { end: stdinEnd }),
        };
      });
      return { kill, stdout, exitCleanly: (out) => settle(null, out, '') };
    }

    it('kills a child silent for DEFAULT_CLI_IDLE_TIMEOUT_MS and reports it timedOut, keeping the wire thread resumable', async () => {
      vi.useFakeTimers();
      const child = mockLiveChild(jsonl(THREAD, TURN_STARTED));

      const pending = new CodexCliModel({ repo: '/work/sbx' }).invoke('gpt-5-codex', 'do it');
      await vi.advanceTimersByTimeAsync(DEFAULT_CLI_IDLE_TIMEOUT_MS - 1);
      expect(child.kill).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      // Asserted before awaiting: without the cap the promise never settles.
      expect(child.kill).toHaveBeenCalledTimes(1);
      const res = await pending;

      expect(DEFAULT_CLI_IDLE_TIMEOUT_MS).toBeLessThan(DEFAULT_CLI_TIMEOUT_MS);
      expect(res.timedOut).toBe(true);
      expect(res.envelope).toBeNull();
      expect(res.sessionId).toBe(THREAD.thread_id);
    });

    it('re-arms on every stdout chunk: a child that keeps printing events is never idle-killed', async () => {
      vi.useFakeTimers();
      const child = mockLiveChild('');
      const done = jsonl(THREAD, completed({ input_tokens: 4, output_tokens: 2 }));

      const pending = new CodexCliModel({ repo: '/work/sbx', idleTimeoutMs: 1000 }).invoke(
        'gpt-5-codex',
        'do it',
      );
      for (let i = 0; i < 5; i += 1) {
        await vi.advanceTimersByTimeAsync(900);
        child.stdout.emit('data', '{"type":"item.started"}\n');
      }
      child.exitCleanly(done);
      const res = await pending;

      expect(child.kill).not.toHaveBeenCalled();
      expect('timedOut' in res).toBe(false);
      expect(res.envelope?.isError).toBe(false);
    });

    it('disarms once the child settles: a finished run leaves no timer behind to kill a dead pid', async () => {
      vi.useFakeTimers();
      const child = mockLiveChild('');

      const pending = new CodexCliModel({ repo: '/work/sbx', idleTimeoutMs: 1000 }).invoke(
        'gpt-5-codex',
        'do it',
      );
      child.exitCleanly('');
      await pending;
      await vi.advanceTimersByTimeAsync(5000);

      expect(child.kill).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('never retries a resume the idle cap killed before it named a thread: a hung CLI would only hang again', async () => {
      vi.useFakeTimers();
      const child = mockLiveChild('');

      const pending = new CodexCliModel({ repo: '/work/sbx', idleTimeoutMs: 1000 }).invoke(
        'gpt-5-codex',
        'continue',
        THREAD.thread_id,
      );
      await vi.advanceTimersByTimeAsync(1000);
      expect(child.kill).toHaveBeenCalledTimes(1);
      const res = await pending;

      expect(execFileMock.mock.calls).toHaveLength(1);
      expect(res.timedOut).toBe(true);
      expect('resumed' in res).toBe(false);
    });
  });
});
