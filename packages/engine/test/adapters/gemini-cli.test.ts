// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFile, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { parseGeminiJsonOutput, GeminiCliModel } from '../../src/adapters/gemini-cli.js';
import {
  CLI_STDIN_PROMPT_THRESHOLD,
  DEFAULT_CLI_TIMEOUT_MS,
} from '../../src/adapters/claude-cli.js';

vi.mock('node:child_process', () => ({ execFile: vi.fn(), spawn: vi.fn() }));

// execFile's overload set is driven through its untyped vi.fn() surface, the
// same approach as codex-cli.test.ts and claude-cli.test.ts.
const execFileMock = vi.mocked(execFile) as unknown as {
  mockReset(): void;
  mockImplementation(impl: (...args: unknown[]) => unknown): void;
  mock: { calls: unknown[][] };
};
const spawnMock = vi.mocked(spawn);

type ExecFileCallback = (
  error: (Error & { code?: unknown }) | null,
  stdout: string | null,
  stderr: string | null,
) => void;

const SESSION = '5c1d2a8e-3f4b-4e9a-9b7c-0d6e1f2a3b4c';

/** One model's `SessionMetrics.models[name]` entry (uiTelemetry.ts). */
function modelMetrics(tokens: Record<string, number>): unknown {
  return {
    api: { totalRequests: 3, totalErrors: 0, totalLatencyMs: 8123 },
    tokens: {
      input: 0,
      prompt: 0,
      candidates: 0,
      total: 0,
      cached: 0,
      thoughts: 0,
      tool: 0,
      ...tokens,
    },
    roles: {},
  };
}

function stats(models: Record<string, unknown>): unknown {
  return {
    models,
    tools: { totalCalls: 2, totalSuccess: 2, totalFail: 0, totalDurationMs: 40, byName: {} },
    files: { totalLinesAdded: 4, totalLinesRemoved: 1 },
  };
}

/** What `JsonFormatter.format` writes: one object, pretty-printed with 2 spaces. */
function pretty(output: unknown): string {
  return JSON.stringify(output, null, 2);
}

describe('parseGeminiJsonOutput', () => {
  it('maps a finished run into a passing envelope with the response as its result', () => {
    const stdout = pretty({
      session_id: SESSION,
      response: 'Added the missing test and the gate is green.',
      stats: stats({
        'gemini-2.5-pro': modelMetrics({
          input: 1_200,
          prompt: 31_200,
          candidates: 410,
          total: 32_050,
          cached: 30_000,
          thoughts: 440,
        }),
      }),
    });

    const response = parseGeminiJsonOutput(stdout, 0, 'gemini-2.5-pro');

    expect(response.exitCode).toBe(0);
    expect(response.stdout).toBe(stdout);
    expect(response.sessionId).toBe(SESSION);
    expect(response.envelope).toEqual({
      result: 'Added the missing test and the gate is green.',
      isError: false,
      apiErrorStatus: null,
      costUsd: null,
      numTurns: null,
      durationMs: null,
      stopReason: null,
      modelUsed: 'gemini-2.5-pro',
      tokensIn: 1_200, // the CLI's own uncached share: prompt − cached
      tokensOut: 410,
      cacheRead: 30_000,
      cacheCreate: null,
      sessionId: SESSION,
    });
  });

  it('never invents a cost, even when the run reported token usage', () => {
    const response = parseGeminiJsonOutput(
      pretty({
        session_id: SESSION,
        response: 'ok',
        stats: stats({
          'gemini-2.5-pro': modelMetrics({ input: 1_000_000, candidates: 1_000_000 }),
        }),
      }),
      0,
      'gemini-2.5-pro',
    );
    expect(response.envelope?.costUsd).toBeNull();
    expect(response.envelope?.tokensIn).toBe(1_000_000);
  });

  it('sums tokens over every model the run used and names the requested model when there are several', () => {
    const response = parseGeminiJsonOutput(
      pretty({
        session_id: SESSION,
        response: 'routed',
        stats: stats({
          'gemini-2.5-flash-lite': modelMetrics({ input: 90, candidates: 5, cached: 0 }),
          'gemini-2.5-pro': modelMetrics({ input: 700, candidates: 200, cached: 3_000 }),
        }),
      }),
      0,
      'auto',
    );
    expect(response.envelope).toMatchObject({
      modelUsed: 'auto',
      tokensIn: 790,
      tokensOut: 205,
      cacheRead: 3_000,
    });
  });

  it('reads a fatal error from stderr, behind its [ERROR] prefix, when stdout has no object', () => {
    const stderr = `[ERROR] ${pretty({
      session_id: SESSION,
      error: {
        type: 'FatalTurnLimitedError',
        message: 'Reached max session turns for this session.',
        code: 53,
      },
    })}\n`;

    const response = parseGeminiJsonOutput('', 53, 'gemini-2.5-pro', stderr);

    expect(response.stdout).toBe('');
    expect(response.exitCode).toBe(53);
    expect(response.sessionId).toBe(SESSION);
    expect(response.envelope).toMatchObject({
      result: 'Reached max session turns for this session.',
      isError: true,
      apiErrorStatus: '53',
      costUsd: null,
      modelUsed: 'gemini-2.5-pro',
      tokensIn: null,
      tokensOut: null,
      cacheRead: null,
    });
  });

  it('prefers the stdout object over stderr when both carry one', () => {
    const response = parseGeminiJsonOutput(
      pretty({ session_id: SESSION, response: 'from stdout' }),
      0,
      'gemini-2.5-pro',
      `[ERROR] ${pretty({ error: { type: 'Error', message: 'from stderr' } })}`,
    );
    expect(response.envelope).toMatchObject({ isError: false, result: 'from stdout' });
  });

  it('treats an error riding next to a partial response as a failure carrying the error message', () => {
    const response = parseGeminiJsonOutput(
      pretty({
        session_id: SESSION,
        response: 'half an ans',
        stats: stats({ 'gemini-2.5-pro': modelMetrics({ input: 10, candidates: 3 }) }),
        error: { type: 'INVALID_STREAM', message: 'Model stream ended with an invalid chunk.' },
      }),
      0,
      'gemini-2.5-pro',
    );
    expect(response.envelope).toMatchObject({
      isError: true,
      result: 'Model stream ended with an invalid chunk.',
      apiErrorStatus: null,
      tokensIn: 10,
      tokensOut: 3,
    });
  });

  it('carries a string error code through as the api error status', () => {
    const response = parseGeminiJsonOutput(
      '',
      1,
      'gemini-2.5-pro',
      `[ERROR] ${pretty({ error: { type: 'Error', message: 'Quota exceeded', code: 'RESOURCE_EXHAUSTED' } })}`,
    );
    expect(response.envelope).toMatchObject({
      isError: true,
      apiErrorStatus: 'RESOURCE_EXHAUSTED',
      result: 'Quota exceeded',
    });
    expect(response.sessionId).toBeNull();
  });

  it('returns no envelope and no session for empty, non-JSON, or unrelated JSON output', () => {
    for (const [stdout, stderr] of [
      ['', ''],
      ['Error: Unknown argument: output-format\n', 'Usage: gemini [options]\n'],
      ['[1,2]\n"text"\n', ''],
      ['{"level":"info","msg":"starting"}\n', ''],
    ] as const) {
      const response = parseGeminiJsonOutput(stdout, 1, 'gemini-2.5-pro', stderr);
      expect(response.envelope).toBeNull();
      expect(response.sessionId).toBeNull();
      expect(response.stdout).toBe(stdout);
    }
  });

  it('returns no envelope for an object torn by a kill mid-write', () => {
    const whole = pretty({ session_id: SESSION, response: 'never finished {' });
    const response = parseGeminiJsonOutput(whole.slice(0, whole.length - 3), 143, 'gemini-2.5-pro');
    expect(response.envelope).toBeNull();
    expect(response.exitCode).toBe(143);
  });

  it('skips log lines before the object, CRLF endings, and a stray JSON log line', () => {
    const stdout = [
      'Loaded cached credentials.',
      '{"level":"debug","msg":"not the output"}',
      ...pretty({ session_id: SESSION, response: 'done' }).split('\n'),
      '',
    ].join('\r\n');
    const response = parseGeminiJsonOutput(stdout, 0, 'gemini-2.5-pro');
    expect(response.sessionId).toBe(SESSION);
    expect(response.envelope).toMatchObject({ isError: false, result: 'done' });
  });

  it('reads compact single-line JSON as well as the pretty-printed form', () => {
    const response = parseGeminiJsonOutput(
      `${JSON.stringify({ session_id: SESSION, response: 'compact' })}\n`,
      0,
      'gemini-2.5-pro',
    );
    expect(response.envelope).toMatchObject({ result: 'compact', sessionId: SESSION });
  });

  it('keeps tokens null without stats, and when any model lacks a number rather than under-counting', () => {
    const bare = parseGeminiJsonOutput(pretty({ response: 'no stats' }), 0, 'gemini-2.5-pro');
    expect(bare.envelope).toMatchObject({
      tokensIn: null,
      tokensOut: null,
      cacheRead: null,
      modelUsed: 'gemini-2.5-pro',
    });

    const partial = parseGeminiJsonOutput(
      pretty({
        response: 'one model is malformed',
        stats: stats({
          'gemini-2.5-pro': modelMetrics({ input: 50, candidates: 9, cached: 1 }),
          'gemini-2.5-flash': { tokens: { input: 'lots', candidates: 2 } },
        }),
      }),
      0,
      'gemini-2.5-pro',
    );
    expect(partial.envelope).toMatchObject({ tokensIn: null, tokensOut: 11, cacheRead: null });
  });

  it('ignores malformed fields rather than trusting them', () => {
    const response = parseGeminiJsonOutput(
      pretty({ session_id: 42, response: ['not', 'a', 'string'], stats: 'not-an-object' }),
      0,
      'gemini-2.5-pro',
    );
    expect(response.sessionId).toBeNull();
    expect(response.envelope).toMatchObject({ result: null, isError: false, tokensIn: null });

    const emptySession = parseGeminiJsonOutput(
      pretty({ session_id: '', response: 'x' }),
      0,
      'gemini-2.5-pro',
    );
    expect(emptySession.sessionId).toBeNull();

    const arrayError = parseGeminiJsonOutput(
      pretty({ response: 'fine', error: ['not', 'an', 'object'] }),
      0,
      'gemini-2.5-pro',
    );
    expect(arrayError.envelope).toMatchObject({ isError: false, result: 'fine' });
  });

  it('reports a failure with no message as a null result, still an error', () => {
    const response = parseGeminiJsonOutput(
      pretty({ error: { type: 'Error' } }),
      1,
      'gemini-2.5-pro',
    );
    expect(response.envelope).toMatchObject({ isError: true, result: null, apiErrorStatus: null });
  });

  it('reports no model when none was requested and stats name none', () => {
    const response = parseGeminiJsonOutput(pretty({ response: 'x' }), 0, '');
    expect(response.envelope?.modelUsed).toBeNull();
  });
});

describe('GeminiCliModel', () => {
  let stdinEnd: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    execFileMock.mockReset();
    // reapCliDescendants (claude-cli.ts) spawns taskkill on win32; an on-able
    // stub keeps it inert under this mock, as in codex-cli.test.ts.
    spawnMock.mockReset();
    spawnMock.mockReturnValue({ on: vi.fn() } as never);
    stdinEnd = vi.fn();
  });

  function mockExecFileResult(
    error: (Error & { code?: unknown }) | null,
    stdout: string | null,
    stderr: string | null = '',
  ): void {
    execFileMock.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecFileCallback;
      queueMicrotask(() => cb(error, stdout, stderr));
      return { pid: 4321, stdin: Object.assign(new EventEmitter(), { end: stdinEnd }) };
    });
  }

  function spawnedArgs(): string[] {
    return (execFileMock.mock.calls[0] as [string, string[]])[1];
  }

  it('resolves the parsed envelope from a clean run', async () => {
    const stdout = pretty({
      session_id: SESSION,
      response: 'done',
      stats: stats({ 'gemini-2.5-pro': modelMetrics({ input: 10, candidates: 3 }) }),
    });
    mockExecFileResult(null, stdout);

    const res = await new GeminiCliModel({ repo: '/work/sbx' }).invoke('gemini-2.5-pro', 'do it');

    expect(res).toEqual(parseGeminiJsonOutput(stdout, 0, 'gemini-2.5-pro'));
    expect(res.sessionId).toBe(SESSION);
  });

  it('spawns the default "gemini" binary headless with JSON output, the model, yolo approval, and the prompt last', async () => {
    mockExecFileResult(null, '');

    await new GeminiCliModel({ repo: '/work/sbx' }).invoke('gemini-2.5-pro', 'do it');

    expect(execFileMock.mock.calls).toHaveLength(1);
    const [binary, args, options] = execFileMock.mock.calls[0] as [
      string,
      string[],
      Record<string, unknown>,
    ];
    expect(binary).toBe('gemini');
    expect(args[args.indexOf('--model') + 1]).toBe('gemini-2.5-pro');
    expect(args[args.indexOf('--output-format') + 1]).toBe('json');
    expect(args[args.indexOf('--approval-mode') + 1]).toBe('yolo');
    expect(args).not.toContain('--resume');
    expect(args).not.toContain('--skip-trust');
    expect(args.slice(-2)).toEqual(['--prompt', 'do it']);
    expect(options).toMatchObject({
      cwd: '/work/sbx',
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      timeout: DEFAULT_CLI_TIMEOUT_MS,
      detached: true,
      encoding: 'utf8',
    });
  });

  it('closes stdin empty for an argv prompt, so the CLI never waits on piped input', async () => {
    mockExecFileResult(null, '');

    await new GeminiCliModel({ repo: '/work/sbx' }).invoke('gemini-2.5-pro', 'do it');

    expect(stdinEnd).toHaveBeenCalledTimes(1);
    expect(stdinEnd).toHaveBeenCalledWith();
  });

  it('pipes an over-threshold prompt on stdin instead of argv (the Windows command-line ceiling)', async () => {
    mockExecFileResult(null, '');
    const long = 'x'.repeat(CLI_STDIN_PROMPT_THRESHOLD + 1);

    await new GeminiCliModel({ repo: '/work/sbx' }).invoke('gemini-2.5-pro', long);

    const args = spawnedArgs();
    expect(args).not.toContain('--prompt');
    expect(args).not.toContain(long);
    expect(stdinEnd).toHaveBeenCalledWith(long);
  });

  it('swallows a stdin pipe error (EPIPE: the CLI exited before reading) instead of crashing the host', async () => {
    const stdin = Object.assign(new EventEmitter(), { end: stdinEnd });
    execFileMock.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecFileCallback;
      queueMicrotask(() => cb(Object.assign(new Error('exit 55'), { code: 55 }), '', ''));
      return { pid: 4321, stdin };
    });

    const res = await new GeminiCliModel({ repo: '/work/sbx' }).invoke(
      'gemini-2.5-pro',
      'z'.repeat(CLI_STDIN_PROMPT_THRESHOLD + 1),
    );

    expect(() => stdin.emit('error', new Error('write EPIPE'))).not.toThrow();
    expect(res.exitCode).toBe(55);
  });

  it('keeps a prompt exactly at the threshold on argv', async () => {
    mockExecFileResult(null, '');
    const atLimit = 'y'.repeat(CLI_STDIN_PROMPT_THRESHOLD);

    await new GeminiCliModel({ repo: '/work/sbx' }).invoke('gemini-2.5-pro', atLimit);

    expect(spawnedArgs().slice(-2)).toEqual(['--prompt', atLimit]);
  });

  it('passes "--resume <id>" when a session id is given, and omits it for an empty one', async () => {
    mockExecFileResult(null, '');
    const model = new GeminiCliModel({ repo: '/work/sbx' });

    await model.invoke('gemini-2.5-pro', 'continue', SESSION);
    const resumed = spawnedArgs();
    expect(resumed[resumed.indexOf('--resume') + 1]).toBe(SESSION);
    expect(resumed.slice(-2)).toEqual(['--prompt', 'continue']);

    execFileMock.mockReset();
    mockExecFileResult(null, '');
    await model.invoke('gemini-2.5-pro', 'do it', '');
    expect(spawnedArgs()).not.toContain('--resume');
  });

  it('honors a caller-supplied binary, approval mode, workspace trust, env, and timeout', async () => {
    mockExecFileResult(null, '');
    const env = { PATH: '/opt/bin' };

    await new GeminiCliModel({
      repo: '/work/sbx',
      binary: '/opt/gemini',
      approvalMode: 'auto_edit',
      trustWorkspace: true,
      env,
      timeoutMs: 5000,
    }).invoke('gemini-2.5-pro', 'do it');

    const [binary, args, options] = execFileMock.mock.calls[0] as [
      string,
      string[],
      Record<string, unknown>,
    ];
    expect(binary).toBe('/opt/gemini');
    expect(args[args.indexOf('--approval-mode') + 1]).toBe('auto_edit');
    expect(args).toContain('--skip-trust');
    expect(options['env']).toBe(env);
    expect(options['timeout']).toBe(5000);
  });

  it('hands the containment guard settings to the child as its system settings file, without touching the caller env', async () => {
    mockExecFileResult(null, '');
    const env = { PATH: '/opt/bin' };

    await new GeminiCliModel({
      repo: '/work/sbx',
      env,
      guardSettingsPath: '/run/guard-settings.json',
    }).invoke('gemini-2.5-pro', 'do it');

    const options = (execFileMock.mock.calls[0] as [string, string[], Record<string, unknown>])[2];
    expect(options['env']).toEqual({
      PATH: '/opt/bin',
      GEMINI_CLI_SYSTEM_SETTINGS_PATH: '/run/guard-settings.json',
    });
    expect(env).toEqual({ PATH: '/opt/bin' });
  });

  it('passes the env through unchanged for an empty guard settings path', async () => {
    mockExecFileResult(null, '');
    const env = { PATH: '/opt/bin' };

    await new GeminiCliModel({ repo: '/work/sbx', env, guardSettingsPath: '' }).invoke(
      'gemini-2.5-pro',
      'do it',
    );

    expect(
      (execFileMock.mock.calls[0] as [string, string[], Record<string, unknown>])[2]['env'],
    ).toBe(env);
  });

  it('reads a fatal error object off stderr and keeps the numeric exit code', async () => {
    const stderr = `[ERROR] ${pretty({
      session_id: SESSION,
      error: { type: 'FatalTurnLimitedError', message: 'Reached max session turns', code: 53 },
    })}\n`;
    mockExecFileResult(Object.assign(new Error('exit 53'), { code: 53 }), '', stderr);

    const res = await new GeminiCliModel({ repo: '/work/sbx' }).invoke('gemini-2.5-pro', 'do it');

    expect(res).toEqual(parseGeminiJsonOutput('', 53, 'gemini-2.5-pro', stderr));
    expect(res.exitCode).toBe(53);
    expect(res.envelope).toMatchObject({ isError: true, result: 'Reached max session turns' });
  });

  it('never rejects on a spawn failure (binary missing) — resolves a no-envelope response instead', async () => {
    mockExecFileResult(
      Object.assign(new Error('spawn gemini ENOENT'), { code: 'ENOENT' }),
      null,
      null,
    );

    const res = await new GeminiCliModel({ repo: '/work/sbx' }).invoke('gemini-2.5-pro', 'do it');

    expect(res.exitCode).toBe(1);
    expect(res.envelope).toBeNull();
    expect(res.sessionId).toBeNull();
    expect(res.stdout).toBe('');
  });

  it('ORPHAN SWEEP crash-path follow-up (board ap-mt2ukjg5-2): tracks the child pid on spawn, untracks it once settled', async () => {
    mockExecFileResult(null, '');
    const pidRegistry = { track: vi.fn(), untrack: vi.fn() };

    await new GeminiCliModel({ repo: '/work/sbx', pidRegistry }).invoke('gemini-2.5-pro', 'do it');

    expect(pidRegistry.track).toHaveBeenCalledWith(4321);
    expect(pidRegistry.untrack).toHaveBeenCalledWith(4321);
  });

  it('untracks the child pid on an error exit too', async () => {
    mockExecFileResult(Object.assign(new Error('exit 55'), { code: 55 }), '', '');
    const pidRegistry = { track: vi.fn(), untrack: vi.fn() };

    await new GeminiCliModel({ repo: '/work/sbx', pidRegistry }).invoke('gemini-2.5-pro', 'do it');

    expect(pidRegistry.untrack).toHaveBeenCalledWith(4321);
  });

  it('never touches the pid registry when none was configured', async () => {
    mockExecFileResult(null, '');

    await expect(
      new GeminiCliModel({ repo: '/work/sbx' }).invoke('gemini-2.5-pro', 'do it'),
    ).resolves.toBeDefined();
  });

  it('neither tracks nor untracks a child that never got a pid — there is nothing to hand the registry', async () => {
    execFileMock.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecFileCallback;
      queueMicrotask(() =>
        cb(Object.assign(new Error('spawn gemini ENOENT'), { code: 'ENOENT' }), '', ''),
      );
      return {}; // spawn failed before a pid existed
    });
    const pidRegistry = { track: vi.fn(), untrack: vi.fn() };

    const res = await new GeminiCliModel({ repo: '/work/sbx', pidRegistry }).invoke(
      'gemini-2.5-pro',
      'do it',
    );

    expect(res.exitCode).toBe(1);
    expect(pidRegistry.track).not.toHaveBeenCalled();
    expect(pidRegistry.untrack).not.toHaveBeenCalled();
  });

  it("ORPHAN SWEEP (board web-msu3sv1w-hfj87n): reaps the child's descendant tree once the invocation settles", async () => {
    mockExecFileResult(null, '');
    const reapDescendants = vi.fn();

    await new GeminiCliModel({ repo: '/work/sbx', reapDescendants }).invoke(
      'gemini-2.5-pro',
      'do it',
    );

    expect(reapDescendants).toHaveBeenCalledTimes(1);
    expect(reapDescendants).toHaveBeenCalledWith(4321);
  });

  it('ORPHAN SWEEP: reaps on a spawn failure too, handing over the pid it never got', async () => {
    execFileMock.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecFileCallback;
      queueMicrotask(() =>
        cb(Object.assign(new Error('spawn gemini ENOENT'), { code: 'ENOENT' }), '', ''),
      );
      return {};
    });
    const reapDescendants = vi.fn();

    await new GeminiCliModel({ repo: '/work/sbx', reapDescendants }).invoke(
      'gemini-2.5-pro',
      'do it',
    );

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
    ): void {
      execFileMock.mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1] as ExecFileCallback;
        queueMicrotask(() => {
          vi.setSystemTime(Date.now() + elapsedMs);
          cb(error, '', '');
        });
        return { pid: 4321, stdin: Object.assign(new EventEmitter(), { end: stdinEnd }) };
      });
    }

    it('signal-killed AT the cap → timedOut: true', async () => {
      vi.useFakeTimers();
      mockExecFileAfter(5000, Object.assign(new Error('killed'), { killed: true }));

      const res = await new GeminiCliModel({ repo: '/work/sbx', timeoutMs: 5000 }).invoke(
        'gemini-2.5-pro',
        'do it',
      );

      expect(res.exitCode).toBe(1);
      expect(res.envelope).toBeNull();
      expect(res.timedOut).toBe(true);
    });

    it('exited on its own past the cap (no signal) → the key stays off', async () => {
      vi.useFakeTimers();
      mockExecFileAfter(5000, Object.assign(new Error('exit 1'), { code: 1, killed: false }));

      const res = await new GeminiCliModel({ repo: '/work/sbx', timeoutMs: 5000 }).invoke(
        'gemini-2.5-pro',
        'do it',
      );

      expect(res.exitCode).toBe(1);
      expect('timedOut' in res).toBe(false);
    });

    it('signal-killed well UNDER the cap (an unrelated external kill) → the key stays off', async () => {
      // Real clock: the callback fires microseconds after spawn, nowhere near 90 minutes.
      mockExecFileResult(Object.assign(new Error('killed'), { killed: true }), '');

      const res = await new GeminiCliModel({ repo: '/work/sbx' }).invoke('gemini-2.5-pro', 'do it');

      expect(res.exitCode).toBe(1);
      expect('timedOut' in res).toBe(false);
    });
  });
});
