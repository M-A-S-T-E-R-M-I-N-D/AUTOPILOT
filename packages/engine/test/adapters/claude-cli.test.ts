// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { execFile, spawn } from 'node:child_process';
import {
  parseModelEnvelope,
  buildClaudeArgs,
  isResumeFailure,
  ClaudeCliModel,
  StreamingClaudeCliModel,
  CLI_STDIN_PROMPT_THRESHOLD,
  DEFAULT_CLI_TIMEOUT_MS,
  isCliTimeoutDeath,
  applyInvokeCaps,
  reapCliDescendants,
} from '../../src/adapters/claude-cli.js';
import { DEFAULT_ENGINE_CONFIG } from '../../src/config.js';

vi.mock('node:child_process', () => ({ execFile: vi.fn(), spawn: vi.fn() }));

// execFile is heavily overloaded (options shape picks the callback signature);
// fighting that overload set from a test double buys nothing, so the mock is
// driven through its untyped vi.fn() surface instead.
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

describe('parseModelEnvelope', () => {
  it('parses a full envelope including the billed model usage', () => {
    const json = JSON.stringify({
      result: 'did the work\nMETRICS:{"item":"AP-1"}',
      is_error: false,
      total_cost_usd: 6.5,
      num_turns: 12,
      duration_ms: 4200,
      stop_reason: 'end_turn',
      modelUsage: {
        opus: {
          inputTokens: 100,
          outputTokens: 200,
          cacheReadInputTokens: 5000,
          cacheCreationInputTokens: 40,
        },
      },
    });
    const env = parseModelEnvelope(json);
    expect(env).toMatchObject({
      isError: false,
      costUsd: 6.5,
      numTurns: 12,
      durationMs: 4200,
      stopReason: 'end_turn',
      modelUsed: 'opus',
      tokensIn: 100,
      tokensOut: 200,
      cacheRead: 5000,
      cacheCreate: 40,
    });
    expect(env?.result).toContain('METRICS');
  });

  it('captures a quota/error envelope', () => {
    const env = parseModelEnvelope(
      JSON.stringify({ is_error: true, api_error_status: 'usage limit reached', result: null }),
    );
    expect(env?.isError).toBe(true);
    expect(env?.apiErrorStatus).toBe('usage limit reached');
  });

  it('keeps a NUMERIC api_error_status (429), not just strings', () => {
    const env = parseModelEnvelope(
      JSON.stringify({
        is_error: true,
        api_error_status: 429,
        result: "You've reached your Fable 5 limit.",
      }),
    );
    expect(env?.isError).toBe(true);
    expect(env?.apiErrorStatus).toBe('429');
  });

  it('returns null for non-JSON or non-object output', () => {
    expect(parseModelEnvelope('not json at all')).toBeNull();
    expect(parseModelEnvelope('')).toBeNull();
    expect(parseModelEnvelope('{ broken')).toBeNull();
    expect(parseModelEnvelope('[1,2,3]')).toBeNull();
  });

  it('tolerates a missing/empty modelUsage', () => {
    const env = parseModelEnvelope(JSON.stringify({ result: 'ok', is_error: false }));
    expect(env?.modelUsed).toBeNull();
    expect(env?.tokensIn).toBeNull();
  });

  it('coerces a non-string result/stop_reason field to null instead of stringifying it', () => {
    const env = parseModelEnvelope(
      JSON.stringify({ result: 12345, stop_reason: 42, is_error: false }),
    );
    expect(env?.result).toBeNull();
    expect(env?.stopReason).toBeNull();
  });

  it('coerces a non-finite api_error_status/cost/turns/duration to null instead of a bogus value', () => {
    // Hand-built (not JSON.stringify, which turns Infinity into `null`): JSON
    // parses an over-large exponent to the IEEE-754 double Infinity.
    const json =
      '{"is_error":true,"api_error_status":1e999,"total_cost_usd":1e999,' +
      '"num_turns":1e999,"duration_ms":1e999}';
    const env = parseModelEnvelope(json);
    expect(env?.apiErrorStatus).toBeNull();
    expect(env?.costUsd).toBeNull();
    expect(env?.numTurns).toBeNull();
    expect(env?.durationMs).toBeNull();
  });

  it('trims surrounding whitespace before checking for a JSON object', () => {
    const json = JSON.stringify({ result: 'ok', is_error: false });
    expect(parseModelEnvelope(`  \n${json}\n  `)).not.toBeNull();
  });

  it('ignores a non-object modelUsage without crashing', () => {
    const env = parseModelEnvelope(JSON.stringify({ result: 'ok', modelUsage: 'bogus' }));
    expect(env?.modelUsed).toBeNull();
  });

  it('ignores a null modelUsage without crashing', () => {
    const env = parseModelEnvelope(JSON.stringify({ result: 'ok', modelUsage: null }));
    expect(env?.modelUsed).toBeNull();
  });

  it('ignores an empty modelUsage object without crashing', () => {
    const env = parseModelEnvelope(JSON.stringify({ result: 'ok', modelUsage: {} }));
    expect(env?.modelUsed).toBeNull();
    expect(env?.tokensIn).toBeNull();
  });

  it('leaves token fields null when the billed model entry itself is not an object', () => {
    const env = parseModelEnvelope(JSON.stringify({ result: 'ok', modelUsage: { opus: null } }));
    expect(env?.modelUsed).toBe('opus');
    expect(env?.tokensIn).toBeNull();
  });

  it('lifts session_id (docs/epics/0009-warm-sessions.md) for a future resumed firing', () => {
    const env = parseModelEnvelope(
      JSON.stringify({ result: 'ok', is_error: false, session_id: 'abc-123-session' }),
    );
    expect(env?.sessionId).toBe('abc-123-session');
  });

  it('coerces a non-string session_id to null instead of stringifying it', () => {
    const env = parseModelEnvelope(JSON.stringify({ result: 'ok', session_id: 42 }));
    expect(env?.sessionId).toBeNull();
  });

  it('leaves sessionId null when the envelope has no session_id at all', () => {
    const env = parseModelEnvelope(JSON.stringify({ result: 'ok', is_error: false }));
    expect(env?.sessionId).toBeNull();
  });
});

describe('applyInvokeCaps — FINISH-LINE EXTENSION per-invocation overrides', () => {
  it('returns the config byte-identical when no caps are given', () => {
    expect(applyInvokeCaps(DEFAULT_ENGINE_CONFIG, undefined)).toBe(DEFAULT_ENGINE_CONFIG);
  });

  it('overrides only maxTurns when caps carries just that field', () => {
    const result = applyInvokeCaps(DEFAULT_ENGINE_CONFIG, { maxTurns: 5 });
    expect(result.maxTurns).toBe(5);
    expect(result.maxBudgetUsd).toBe(DEFAULT_ENGINE_CONFIG.maxBudgetUsd);
  });

  it('overrides only maxBudgetUsd when caps carries just that field', () => {
    const result = applyInvokeCaps(DEFAULT_ENGINE_CONFIG, { maxBudgetUsd: 2.5 });
    expect(result.maxTurns).toBe(DEFAULT_ENGINE_CONFIG.maxTurns);
    expect(result.maxBudgetUsd).toBe(2.5);
  });

  it('overrides both fields when caps carries both', () => {
    const result = applyInvokeCaps(DEFAULT_ENGINE_CONFIG, { maxTurns: 3, maxBudgetUsd: 1 });
    expect(result.maxTurns).toBe(3);
    expect(result.maxBudgetUsd).toBe(1);
  });

  it('leaves the config unchanged when caps is an empty object', () => {
    const result = applyInvokeCaps(DEFAULT_ENGINE_CONFIG, {});
    expect(result.maxTurns).toBe(DEFAULT_ENGINE_CONFIG.maxTurns);
    expect(result.maxBudgetUsd).toBe(DEFAULT_ENGINE_CONFIG.maxBudgetUsd);
  });
});

describe('buildClaudeArgs — the containment guard settings', () => {
  it('appends --settings when a settings path is given (prompt stays LAST)', () => {
    const args = buildClaudeArgs(
      'sonnet',
      'do the thing',
      DEFAULT_ENGINE_CONFIG,
      '/work/sbx',
      'stream-json',
      '/x/.autopilot/flight-guard.settings.json',
    );
    const i = args.indexOf('--settings');
    expect(i).toBeGreaterThan(-1);
    expect(args[i + 1]).toBe('/x/.autopilot/flight-guard.settings.json');
    expect(args[args.length - 1]).toBe('do the thing');
  });

  it('omits --settings when no path is given', () => {
    const args = buildClaudeArgs('sonnet', 'p', DEFAULT_ENGINE_CONFIG, '/work/sbx', 'json');
    expect(args).not.toContain('--settings');
  });

  it('omits --settings for an empty (but defined) settingsPath, same as undefined', () => {
    const args = buildClaudeArgs('sonnet', 'p', DEFAULT_ENGINE_CONFIG, '/work/sbx', 'json', '');
    expect(args).not.toContain('--settings');
  });
});

describe('buildClaudeArgs — --resume (docs/epics/0009-warm-sessions.md)', () => {
  it('appends --resume <id> when a resumeSessionId is given (prompt stays LAST)', () => {
    const args = buildClaudeArgs(
      'sonnet',
      'do the thing',
      DEFAULT_ENGINE_CONFIG,
      '/work/sbx',
      'json',
      undefined,
      undefined,
      'prior-session-id',
    );
    const i = args.indexOf('--resume');
    expect(i).toBeGreaterThan(-1);
    expect(args[i + 1]).toBe('prior-session-id');
    expect(args[args.length - 1]).toBe('do the thing');
  });

  it('omits --resume when no resumeSessionId is given', () => {
    const args = buildClaudeArgs('sonnet', 'p', DEFAULT_ENGINE_CONFIG, '/work/sbx', 'json');
    expect(args).not.toContain('--resume');
  });

  it('omits --resume for an empty (but defined) resumeSessionId, same as undefined', () => {
    const args = buildClaudeArgs(
      'sonnet',
      'p',
      DEFAULT_ENGINE_CONFIG,
      '/work/sbx',
      'json',
      undefined,
      undefined,
      '',
    );
    expect(args).not.toContain('--resume');
  });

  it('a RESUMED invocation still carries the containment guard --settings flag explicitly (sessions.md: resume does not restore it)', () => {
    const args = buildClaudeArgs(
      'sonnet',
      'do the thing',
      DEFAULT_ENGINE_CONFIG,
      '/work/sbx',
      'json',
      '/x/.autopilot/flight-guard.settings.json',
      undefined,
      'prior-session-id',
    );
    const settingsIdx = args.indexOf('--settings');
    const addDirIdx = args.indexOf('--add-dir');
    const fallbackIdx = args.indexOf('--fallback-model');
    expect(settingsIdx).toBeGreaterThan(-1);
    expect(args[settingsIdx + 1]).toBe('/x/.autopilot/flight-guard.settings.json');
    expect(addDirIdx).toBeGreaterThan(-1);
    expect(args[addDirIdx + 1]).toBe('/work/sbx');
    expect(fallbackIdx).toBeGreaterThan(-1);
    expect(args).toContain('--resume');
  });
});

describe('isResumeFailure — CLI-level resume fallback (docs/epics/0009-warm-sessions.md)', () => {
  it('is true for a resumed call that exits non-zero with no parseable envelope', () => {
    expect(isResumeFailure('prior-session-id', { envelope: null, exitCode: 1 })).toBe(true);
  });

  it('is false when no resumeSessionId was ever attempted (nothing to fall back FROM)', () => {
    expect(isResumeFailure(undefined, { envelope: null, exitCode: 1 })).toBe(false);
  });

  it('is false for an empty (but defined) resumeSessionId, same as undefined', () => {
    expect(isResumeFailure('', { envelope: null, exitCode: 1 })).toBe(false);
  });

  it('is false when the envelope parsed — a real quota/API failure still carries valid JSON', () => {
    const envelope = parseModelEnvelope(JSON.stringify({ is_error: true, api_error_status: 429 }));
    expect(isResumeFailure('prior-session-id', { envelope, exitCode: 0 })).toBe(false);
  });

  it('is false for a clean (exit-0) resumed call even with no envelope (nothing to recover from)', () => {
    expect(isResumeFailure('prior-session-id', { envelope: null, exitCode: 0 })).toBe(false);
  });
});

describe('buildClaudeArgs — full argv shape', () => {
  it('builds every static flag in order (a dropped flag silently breaks the CLI invocation)', () => {
    const args = buildClaudeArgs(
      'sonnet',
      'the prompt',
      DEFAULT_ENGINE_CONFIG,
      '/work/sbx',
      'json',
    );
    expect(args).toEqual([
      '--print',
      '--model',
      'sonnet',
      '--fallback-model',
      DEFAULT_ENGINE_CONFIG.fallbackModel,
      '--effort',
      DEFAULT_ENGINE_CONFIG.effort,
      '--allowedTools',
      DEFAULT_ENGINE_CONFIG.allowedTools.join(','),
      '--disallowedTools',
      DEFAULT_ENGINE_CONFIG.disallowedTools.join(','),
      '--add-dir',
      '/work/sbx',
      '--max-turns',
      String(DEFAULT_ENGINE_CONFIG.maxTurns),
      '--max-budget-usd',
      String(DEFAULT_ENGINE_CONFIG.maxBudgetUsd),
      '--output-format',
      'json',
      'the prompt',
    ]);
  });
});

describe('DEFAULT_CLI_TIMEOUT_MS', () => {
  it('is 30 minutes in milliseconds', () => {
    // Compared against a hardcoded literal, not `30 * 60 * 1000` re-derived here —
    // a self-referential comparison would still pass even if the constant's own
    // arithmetic were mutated (both sides would carry the same mutated value).
    expect(DEFAULT_CLI_TIMEOUT_MS).toBe(1_800_000);
  });
});

describe('isCliTimeoutDeath — THIRD CAP surfacing (board web-mt1w1ime-pohh9d)', () => {
  it('is true when signal-killed and elapsed reached the configured timeout', () => {
    expect(isCliTimeoutDeath(true, 1_800_000, 1_800_000)).toBe(true);
    expect(isCliTimeoutDeath(true, 2_000_000, 1_800_000)).toBe(true);
  });

  it('is false when not signal-killed at all (an ordinary error/success exit)', () => {
    expect(isCliTimeoutDeath(false, 5_000_000, 1_800_000)).toBe(false);
  });

  it('is false when signal-killed but well under the timeout (an unrelated external kill)', () => {
    expect(isCliTimeoutDeath(true, 300, 1_800_000)).toBe(false);
  });
});

describe('buildClaudeArgs — Windows cmdline ceiling (long-prompt-via-stdin)', () => {
  it('keeps the prompt in argv at/under the threshold', () => {
    const prompt = 'x'.repeat(CLI_STDIN_PROMPT_THRESHOLD);
    const args = buildClaudeArgs('sonnet', prompt, DEFAULT_ENGINE_CONFIG, '/work/sbx', 'json');
    expect(args[args.length - 1]).toBe(prompt);
  });

  it('omits an over-threshold prompt from argv entirely (it is piped via stdin instead)', () => {
    const prompt = 'x'.repeat(CLI_STDIN_PROMPT_THRESHOLD + 1);
    const args = buildClaudeArgs('sonnet', prompt, DEFAULT_ENGINE_CONFIG, '/work/sbx', 'json');
    expect(args).not.toContain(prompt);
    expect(args[args.length - 1]).toBe('json');
  });
});

describe('buildClaudeArgs — --include-partial-messages (ask streaming)', () => {
  it('appends the flag when requested, with the prompt still last', () => {
    const args = buildClaudeArgs(
      'haiku',
      'answer this',
      DEFAULT_ENGINE_CONFIG,
      '/work/sbx',
      'stream-json',
      undefined,
      true,
    );
    expect(args).toContain('--include-partial-messages');
    expect(args[args.length - 1]).toBe('answer this');
  });

  it('omits the flag by default and when explicitly false', () => {
    expect(
      buildClaudeArgs('haiku', 'p', DEFAULT_ENGINE_CONFIG, '/work/sbx', 'stream-json'),
    ).not.toContain('--include-partial-messages');
    expect(
      buildClaudeArgs(
        'haiku',
        'p',
        DEFAULT_ENGINE_CONFIG,
        '/work/sbx',
        'stream-json',
        undefined,
        false,
      ),
    ).not.toContain('--include-partial-messages');
  });
});

describe('ClaudeCliModel', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    // ORPHAN SWEEP: the exec callback now calls reapCliDescendants, whose
    // win32 branch spawns a taskkill — under this suite's child_process mock
    // a bare vi.fn() spawn returns undefined and the `.on('error', …)` chain
    // inside the reaper THROWS mid-microtask, so invoke()'s promise never
    // resolves and every test hangs to its timeout. An on-able stub keeps
    // the reaper inert without touching production code.
    spawnMock.mockReset();
    spawnMock.mockReturnValue({ on: vi.fn() } as never);
  });

  function mockExecFileResult(
    error: (Error & { code?: unknown }) | null,
    stdout: string | null,
  ): void {
    execFileMock.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecFileCallback;
      // Deferred, like every real execFile callback (Node never invokes it
      // synchronously) — the source reads `child.pid` from the OUTER
      // `const child = execFile(...)` assignment inside this very callback
      // (ORPHAN SWEEP reap), which does not exist yet if the mock calls back
      // before execFile() has returned.
      queueMicrotask(() => cb(error, stdout, ''));
      return { pid: 1234 };
    });
  }

  it('resolves stdout, exit code 0, and the parsed envelope on a clean run', async () => {
    const stdout = JSON.stringify({
      result: 'done\nMETRICS:{"item":"x"}',
      is_error: false,
      total_cost_usd: 1,
    });
    mockExecFileResult(null, stdout);

    const model = new ClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const res = await model.invoke('sonnet', 'do it');

    expect(res).toEqual({ stdout, exitCode: 0, envelope: parseModelEnvelope(stdout) });
    expect(res.envelope?.costUsd).toBe(1);
  });

  it('spawns the default "claude" binary with json output and the prompt last', async () => {
    mockExecFileResult(null, '');

    const model = new ClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    await model.invoke('sonnet', 'do it');

    expect(execFileMock.mock.calls).toHaveLength(1);
    const [binary, args, options] = execFileMock.mock.calls[0] as [
      string,
      string[],
      Record<string, unknown>,
    ];
    expect(binary).toBe('claude');
    expect(args).toContain('--output-format');
    expect(args[args.indexOf('--output-format') + 1]).toBe('json');
    expect(args[args.length - 1]).toBe('do it');
    expect(options).toMatchObject({
      cwd: '/work/sbx',
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      timeout: DEFAULT_CLI_TIMEOUT_MS,
    });
  });

  it('passes a caller-supplied timeoutMs through to execFile (a hung child must eventually be killed)', async () => {
    mockExecFileResult(null, '');

    const model = new ClaudeCliModel({
      repo: '/work/sbx',
      config: DEFAULT_ENGINE_CONFIG,
      timeoutMs: 5000,
    });
    await model.invoke('sonnet', 'do it');

    const [, , options] = execFileMock.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(options['timeout']).toBe(5000);
  });

  it('uses a custom binary when one is given', async () => {
    mockExecFileResult(null, '');

    const model = new ClaudeCliModel({
      repo: '/work/sbx',
      config: DEFAULT_ENGINE_CONFIG,
      binary: '/opt/claude',
    });
    await model.invoke('sonnet', 'p');

    const call = execFileMock.mock.calls[0];
    expect(call?.[0]).toBe('/opt/claude');
  });

  it('maps a numeric err.code straight through as the exit code', async () => {
    mockExecFileResult(Object.assign(new Error('boom'), { code: 17 }), 'partial output');

    const model = new ClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const res = await model.invoke('sonnet', 'p');

    expect(res.exitCode).toBe(17);
    expect(res.stdout).toBe('partial output');
  });

  it('falls back to exit code 1 when the error carries no numeric code (e.g. ENOENT)', async () => {
    mockExecFileResult(Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }), '');

    const model = new ClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const res = await model.invoke('sonnet', 'p');

    expect(res.exitCode).toBe(1);
  });

  it('treats a null stdout as an empty string with no envelope', async () => {
    mockExecFileResult(null, null);

    const model = new ClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const res = await model.invoke('sonnet', 'p');

    expect(res.stdout).toBe('');
    expect(res.envelope).toBeNull();
  });

  it('pipes an over-threshold prompt via stdin instead of argv (Windows cmdline ceiling)', async () => {
    const stdinEnd = vi.fn();
    execFileMock.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecFileCallback;
      queueMicrotask(() => cb(null, '', ''));
      return { stdin: { end: stdinEnd } };
    });

    const longPrompt = 'y'.repeat(CLI_STDIN_PROMPT_THRESHOLD + 1);
    const model = new ClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    await model.invoke('sonnet', longPrompt);

    const [, args] = execFileMock.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(args).not.toContain(longPrompt);
    expect(stdinEnd).toHaveBeenCalledWith(longPrompt);
  });

  it('leaves stdin untouched for a short prompt (unchanged, well-tested argv path)', async () => {
    const stdinEnd = vi.fn();
    execFileMock.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecFileCallback;
      queueMicrotask(() => cb(null, '', ''));
      return { stdin: { end: stdinEnd } };
    });

    const model = new ClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    await model.invoke('sonnet', 'short prompt');

    expect(stdinEnd).not.toHaveBeenCalled();
  });

  it('leaves stdin untouched for a prompt exactly AT the threshold (off-by-one boundary)', async () => {
    const stdinEnd = vi.fn();
    execFileMock.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecFileCallback;
      queueMicrotask(() => cb(null, '', ''));
      return { stdin: { end: stdinEnd } };
    });

    const prompt = 'x'.repeat(CLI_STDIN_PROMPT_THRESHOLD);
    const model = new ClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    await model.invoke('sonnet', prompt);

    expect(stdinEnd).not.toHaveBeenCalled();
  });

  it('does not crash when execFile returns a child with no stdin stream at all', async () => {
    execFileMock.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecFileCallback;
      // Deferred (not called synchronously): the invoke()'s `child.stdin?.end`
      // line must run BEFORE this resolves, or a real `child.stdin.end` crash
      // would land on an already-settled promise and go unobserved.
      queueMicrotask(() => cb(null, '', ''));
      return {}; // mirrors a real ChildProcess whose stdio was overridden
    });

    const longPrompt = 'y'.repeat(CLI_STDIN_PROMPT_THRESHOLD + 1);
    const model = new ClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });

    await expect(model.invoke('sonnet', longPrompt)).resolves.toBeDefined();
  });

  it('derives execFile env from the real process.env (a `?? process.env` bug would spread an empty env)', async () => {
    mockExecFileResult(null, '');

    const model = new ClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    await model.invoke('sonnet', 'p');

    const [, , options] = execFileMock.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(Object.keys(options['env'] as object).length).toBeGreaterThan(0);
  });

  it('forwards resumeSessionId to --resume (docs/epics/0009-warm-sessions.md)', async () => {
    mockExecFileResult(null, '');

    const model = new ClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    await model.invoke('sonnet', 'p', 'prior-session-id');

    const [, args] = execFileMock.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(args[args.indexOf('--resume') + 1]).toBe('prior-session-id');
  });

  it('omits --resume when invoked without a resumeSessionId', async () => {
    mockExecFileResult(null, '');

    const model = new ClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    await model.invoke('sonnet', 'p');

    const [, args] = execFileMock.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(args).not.toContain('--resume');
  });

  it('retries cold when a resumed invocation fails at the CLI level (docs/epics/0009-warm-sessions.md)', async () => {
    let call = 0;
    execFileMock.mockImplementation((...args: unknown[]) => {
      call += 1;
      const cb = args[args.length - 1] as ExecFileCallback;
      if (call === 1) {
        queueMicrotask(() =>
          cb(
            Object.assign(new Error('No conversation found'), { code: 1 }),
            'Error: No conversation found with session ID: prior-session-id',
            '',
          ),
        );
      } else {
        queueMicrotask(() => cb(null, JSON.stringify({ result: 'done', is_error: false }), ''));
      }
      return { pid: 4242 };
    });

    const model = new ClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const res = await model.invoke('sonnet', 'p', 'prior-session-id');

    expect(execFileMock.mock.calls).toHaveLength(2);
    const [, firstArgs] = execFileMock.mock.calls[0] as [string, string[]];
    expect(firstArgs).toContain('--resume');
    const [, secondArgs] = execFileMock.mock.calls[1] as [string, string[]];
    expect(secondArgs).not.toContain('--resume');
    expect(res.envelope?.result).toBe('done');
  });

  it('does not retry a non-resumed failure (nothing to fall back FROM)', async () => {
    mockExecFileResult(Object.assign(new Error('boom'), { code: 1 }), 'boom');

    const model = new ClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    await model.invoke('sonnet', 'p');

    expect(execFileMock.mock.calls).toHaveLength(1);
  });

  it('does not retry a resumed call that fails with a real (parseable) quota error — the envelope is preserved', async () => {
    const stdout = JSON.stringify({ is_error: true, api_error_status: 429 });
    mockExecFileResult(null, stdout);

    const model = new ClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const res = await model.invoke('sonnet', 'p', 'prior-session-id');

    expect(execFileMock.mock.calls).toHaveLength(1);
    expect(res.envelope?.isError).toBe(true);
  });

  describe('resumed — the measurable-win telemetry signal (docs/epics/0009-warm-sessions.md)', () => {
    it('leaves resumed unset for an ordinary cold spawn (no resumeSessionId given)', async () => {
      mockExecFileResult(null, JSON.stringify({ result: 'ok', is_error: false }));

      const model = new ClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
      const res = await model.invoke('sonnet', 'p');

      expect(res.resumed).toBeUndefined();
    });

    it('marks resumed:true when a requested resume succeeds at the CLI level', async () => {
      mockExecFileResult(null, JSON.stringify({ result: 'ok', is_error: false }));

      const model = new ClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
      const res = await model.invoke('sonnet', 'p', 'prior-session-id');

      expect(res.resumed).toBe(true);
    });

    it('marks resumed:false when the CLI-level resume fails and the driver falls back cold', async () => {
      let call = 0;
      execFileMock.mockImplementation((...args: unknown[]) => {
        call += 1;
        const cb = args[args.length - 1] as ExecFileCallback;
        if (call === 1) {
          queueMicrotask(() =>
            cb(Object.assign(new Error('No conversation found'), { code: 1 }), 'Error', ''),
          );
        } else {
          queueMicrotask(() => cb(null, JSON.stringify({ result: 'done', is_error: false }), ''));
        }
        return { pid: 4242 };
      });

      const model = new ClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
      const res = await model.invoke('sonnet', 'p', 'prior-session-id');

      expect(res.resumed).toBe(false);
    });
  });

  it("ORPHAN SWEEP (board web-msu3sv1w-hfj87n): reaps the child's descendant tree once the invocation settles", async () => {
    const reapDescendants = vi.fn();
    execFileMock.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecFileCallback;
      queueMicrotask(() => cb(null, '', ''));
      return { pid: 4242 };
    });

    const model = new ClaudeCliModel({
      repo: '/work/sbx',
      config: DEFAULT_ENGINE_CONFIG,
      reapDescendants,
    });
    await model.invoke('sonnet', 'p');

    expect(reapDescendants).toHaveBeenCalledWith(4242);
  });

  it('ORPHAN SWEEP: spawns the CLI child detached so a POSIX reap targets its OWN process group', async () => {
    mockExecFileResult(null, '');

    const model = new ClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    await model.invoke('sonnet', 'p');

    const [, , options] = execFileMock.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(options['detached']).toBe(true);
  });

  it('ORPHAN SWEEP crash-path follow-up (board ap-mt2ukjg5-2): tracks the child pid on spawn, untracks it once settled', async () => {
    execFileMock.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecFileCallback;
      queueMicrotask(() => cb(null, '', ''));
      return { pid: 4242 };
    });
    const pidRegistry = { track: vi.fn(), untrack: vi.fn() };

    const model = new ClaudeCliModel({
      repo: '/work/sbx',
      config: DEFAULT_ENGINE_CONFIG,
      pidRegistry,
    });
    await model.invoke('sonnet', 'p');

    expect(pidRegistry.track).toHaveBeenCalledWith(4242);
    expect(pidRegistry.untrack).toHaveBeenCalledWith(4242);
  });

  it('never touches the pid registry when none was configured', async () => {
    mockExecFileResult(null, '');

    const model = new ClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    await expect(model.invoke('sonnet', 'p')).resolves.toBeDefined();
  });
});

describe('reapCliDescendants (ORPHAN SWEEP, board web-msu3sv1w-hfj87n)', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing when the child never actually got a pid', () => {
    reapCliDescendants(undefined, 'win32');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('on win32, spawns a whole-tree taskkill against the pid — even one whose parent already exited', () => {
    const fakeTaskkill = { on: vi.fn() };
    spawnMock.mockReturnValue(fakeTaskkill as unknown as ReturnType<typeof spawn>);

    reapCliDescendants(4242, 'win32');

    const [bin, argv, options] = spawnMock.mock.calls[0] as [string, string[], object];
    expect(bin).toBe('taskkill');
    expect(argv).toEqual(['/pid', '4242', '/t', '/f']);
    expect(options).toMatchObject({ stdio: 'ignore' });
    expect(fakeTaskkill.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('a taskkill spawn error is swallowed, never left to crash the caller', () => {
    const fakeTaskkill = { on: vi.fn() };
    spawnMock.mockReturnValue(fakeTaskkill as unknown as ReturnType<typeof spawn>);

    reapCliDescendants(4242, 'win32');

    const errorCall = fakeTaskkill.on.mock.calls.find(([event]) => event === 'error') as
      [string, () => void] | undefined;
    expect(errorCall).toBeDefined();
    expect(() => errorCall?.[1]()).not.toThrow();
  });

  it('on POSIX, SIGKILLs the whole detached process group (negative pid)', () => {
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    reapCliDescendants(4242, 'linux');

    expect(killSpy).toHaveBeenCalledOnce();
    expect(killSpy).toHaveBeenCalledWith(-4242, 'SIGKILL');
  });

  it('swallows an already-exited process.kill error instead of throwing', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH');
    });

    expect(() => reapCliDescendants(4242, 'darwin')).not.toThrow();
  });
});

describe('StreamingClaudeCliModel', () => {
  interface FakeStream extends EventEmitter {
    setEncoding(encoding: string): void;
  }
  interface FakeChild extends EventEmitter {
    stdout: FakeStream;
    stderr: FakeStream;
  }

  function fakeStream(): FakeStream {
    const s = new EventEmitter() as FakeStream;
    s.setEncoding = vi.fn();
    return s;
  }

  function fakeChild(): FakeChild {
    const c = new EventEmitter() as FakeChild;
    c.stdout = fakeStream();
    c.stderr = fakeStream();
    return c;
  }

  beforeEach(() => {
    spawnMock.mockReset();
  });

  it('parses NDJSON split across chunks, forwards activities and text deltas, and resolves on the result event', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const activities: string[] = [];
    const texts: string[] = [];
    const model = new StreamingClaudeCliModel({
      repo: '/work/sbx',
      config: DEFAULT_ENGINE_CONFIG,
      onActivity: (a) => activities.push(a.tool),
      onText: (t) => texts.push(t),
    });
    const promise = model.invoke('sonnet', 'do it');

    const toolEvent =
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] },
      }) + '\n';
    const textEvent =
      JSON.stringify({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } },
      }) + '\n';
    // Feed the two lines split across chunk boundaries to exercise the buffer.
    child.stdout.emit('data', toolEvent.slice(0, 5));
    child.stdout.emit('data', toolEvent.slice(5) + textEvent);

    const resultEvent = { type: 'result', result: 'done', is_error: false, total_cost_usd: 2 };
    child.stdout.emit('data', JSON.stringify(resultEvent) + '\n');
    child.emit('close', 0);

    const res = await promise;
    expect(activities).toEqual(['Bash']);
    expect(texts).toEqual(['hi']);
    expect(res.exitCode).toBe(0);
    expect(res.envelope?.costUsd).toBe(2);
    expect(res.guardDenials).toBe(0);
  });

  it('sums guard denials seen on the stream into the resolved response', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);
    const model = new StreamingClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const promise = model.invoke('sonnet', 'do it');

    const denialEvent = {
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            is_error: true,
            content: 'CONTAINMENT: this flight is confined to /repo — blocked.',
          },
        ],
      },
    };
    child.stdout.emit('data', JSON.stringify(denialEvent) + '\n');
    child.stdout.emit('data', JSON.stringify(denialEvent) + '\n');
    child.stdout.emit(
      'data',
      JSON.stringify({ type: 'result', result: 'done', is_error: false }) + '\n',
    );
    child.emit('close', 0);

    const res = await promise;
    expect(res.guardDenials).toBe(2);
  });

  it('collects structured guard-denial details (kind + target) alongside the count', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);
    const model = new StreamingClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const promise = model.invoke('sonnet', 'do it');

    const denialEvent = {
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            is_error: true,
            content:
              'CONTAINMENT: this flight is confined to /repo — outside the target repo. Work only inside the target repository.',
          },
        ],
      },
    };
    child.stdout.emit('data', JSON.stringify(denialEvent) + '\n');
    child.stdout.emit(
      'data',
      JSON.stringify({ type: 'result', result: 'done', is_error: false }) + '\n',
    );
    child.emit('close', 0);

    const res = await promise;
    expect(res.guardDenialDetails).toEqual([
      { kind: 'containment', target: 'outside the target repo.' },
    ]);
    expect(res.guardDenials).toBe(res.guardDenialDetails?.length);
  });

  it('requests --include-partial-messages only when onText is provided', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const model = new StreamingClaudeCliModel({
      repo: '/work/sbx',
      config: DEFAULT_ENGINE_CONFIG,
      onText: () => {},
    });
    void model.invoke('sonnet', 'p');
    child.emit('close', 0);
    await Promise.resolve();

    const call = spawnMock.mock.calls[0];
    const args = call?.[1] as string[] | undefined;
    expect(args).toContain('--include-partial-messages');
    expect(args).toContain('--verbose');
  });

  it('flushes a trailing line with no terminating newline on close', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const model = new StreamingClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const promise = model.invoke('sonnet', 'p');

    const resultEvent = { type: 'result', result: 'done', is_error: false };
    child.stdout.emit('data', JSON.stringify(resultEvent)); // no trailing \n
    child.emit('close', 0);

    const res = await promise;
    expect(res.envelope?.result).toBe('done');
  });

  it('resolves with exit code 1 and no envelope when the child emits "error" (e.g. binary not found)', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const model = new StreamingClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const promise = model.invoke('sonnet', 'p');

    child.stderr.emit('data', 'spawn claude ENOENT');
    child.emit('error', new Error('spawn claude ENOENT'));

    const res = await promise;
    expect(res.exitCode).toBe(1);
    expect(res.envelope).toBeNull();
    expect(res.stdout).toBe('spawn claude ENOENT');
  });

  it('resolves exit code 0 as a fallback when close carries no code and no signal', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const model = new StreamingClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const promise = model.invoke('sonnet', 'p');
    child.emit('close', null);

    const res = await promise;
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe('');
    expect(res.envelope).toBeNull();
  });

  it('resolves exit code 1 (not a false success) when a timeout kills the child by signal', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const model = new StreamingClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const promise = model.invoke('sonnet', 'p');
    // Node's spawn `timeout` option kills the child, delivering close(code=null, signal='SIGTERM').
    child.emit('close', null, 'SIGTERM');

    const res = await promise;
    expect(res.exitCode).toBe(1);
    expect(res.envelope).toBeNull();
  });

  it('DEATH-COST: persists the last streamed usage snapshot when a timeout kills the child before the result event (docs/EVALUATION-2026-08.md §3.6)', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const model = new StreamingClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const promise = model.invoke('sonnet', 'p');

    const turn1 =
      JSON.stringify({
        type: 'assistant',
        message: { model: 'claude-sonnet-5', usage: { input_tokens: 100, output_tokens: 20 } },
      }) + '\n';
    const turn2 =
      JSON.stringify({
        type: 'assistant',
        message: { model: 'claude-sonnet-5', usage: { input_tokens: 400, output_tokens: 80 } },
      }) + '\n';
    child.stdout.emit('data', turn1 + turn2);
    // Killed mid-firing (turn budget/timeout) — no `result` event ever arrives.
    child.emit('close', null, 'SIGTERM');

    const res = await promise;
    expect(res.exitCode).toBe(1);
    expect(res.envelope).toBeNull();
    // The real spend must not vanish: the last-seen usage snapshot rides along
    // instead of the firing recording a fabricated $0 / 0-turn row.
    expect(res.partialUsage).toEqual({
      modelUsed: 'claude-sonnet-5',
      tokensIn: 400,
      tokensOut: 80,
      turnsObserved: 2,
    });
  });

  it('DEATH-COST: partialUsage is null when nothing was ever streamed before the abnormal exit', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const model = new StreamingClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const promise = model.invoke('sonnet', 'p');
    child.emit('close', null, 'SIGTERM');

    const res = await promise;
    expect(res.partialUsage).toBeNull();
  });

  it('passes the default execution timeout through to spawn (a hung child must eventually be killed)', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const model = new StreamingClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const promise = model.invoke('sonnet', 'p');
    child.emit('close', 0);
    await promise;

    const options = spawnMock.mock.calls[0]?.[2] as Record<string, unknown> | undefined;
    expect(options?.['timeout']).toBe(DEFAULT_CLI_TIMEOUT_MS);
  });

  it('passes a caller-supplied timeoutMs through to spawn', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const model = new StreamingClaudeCliModel({
      repo: '/work/sbx',
      config: DEFAULT_ENGINE_CONFIG,
      timeoutMs: 5000,
    });
    const promise = model.invoke('sonnet', 'p');
    child.emit('close', 0);
    await promise;

    const options = spawnMock.mock.calls[0]?.[2] as Record<string, unknown> | undefined;
    expect(options?.['timeout']).toBe(5000);
  });

  it('pipes an over-threshold prompt via stdin instead of argv (Windows cmdline ceiling)', async () => {
    const child = fakeChild() as FakeChild & { stdin: { end: ReturnType<typeof vi.fn> } };
    child.stdin = { end: vi.fn() };
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const longPrompt = 'z'.repeat(CLI_STDIN_PROMPT_THRESHOLD + 1);
    const model = new StreamingClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const promise = model.invoke('sonnet', longPrompt);
    child.emit('close', 0);
    await promise;

    const args = spawnMock.mock.calls[0]?.[1] as string[] | undefined;
    expect(args).not.toContain(longPrompt);
    expect(child.stdin.end).toHaveBeenCalledWith(longPrompt);
  });

  it('leaves stdin untouched for a prompt exactly AT the threshold (off-by-one boundary)', async () => {
    const child = fakeChild() as FakeChild & { stdin: { end: ReturnType<typeof vi.fn> } };
    child.stdin = { end: vi.fn() };
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const prompt = 'x'.repeat(CLI_STDIN_PROMPT_THRESHOLD);
    const model = new StreamingClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const promise = model.invoke('sonnet', prompt);
    child.emit('close', 0);
    await promise;

    expect(child.stdin.end).not.toHaveBeenCalled();
  });

  it('does not crash when spawn returns a child with no stdin stream at all, for an over-threshold prompt', async () => {
    const child = fakeChild(); // no `.stdin` set
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const longPrompt = 'z'.repeat(CLI_STDIN_PROMPT_THRESHOLD + 1);
    const model = new StreamingClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const promise = model.invoke('sonnet', longPrompt);
    child.emit('close', 0);

    await expect(promise).resolves.toBeDefined();
  });

  it('derives spawn env from the real process.env (a `?? process.env` bug would spread an empty env)', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const model = new StreamingClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const promise = model.invoke('sonnet', 'p');
    child.emit('close', 0);
    await promise;

    const options = spawnMock.mock.calls[0]?.[2] as Record<string, unknown> | undefined;
    expect(Object.keys(options?.['env'] as object).length).toBeGreaterThan(0);
  });

  it('uses a custom binary when one is given, and "claude" by default', async () => {
    const defaultChild = fakeChild();
    spawnMock.mockReturnValue(defaultChild as unknown as ReturnType<typeof spawn>);
    const defaultModel = new StreamingClaudeCliModel({
      repo: '/work/sbx',
      config: DEFAULT_ENGINE_CONFIG,
    });
    const p1 = defaultModel.invoke('sonnet', 'p');
    defaultChild.emit('close', 0);
    await p1;
    expect(spawnMock.mock.calls[0]?.[0]).toBe('claude');

    spawnMock.mockReset();
    const customChild = fakeChild();
    spawnMock.mockReturnValue(customChild as unknown as ReturnType<typeof spawn>);
    const customModel = new StreamingClaudeCliModel({
      repo: '/work/sbx',
      config: DEFAULT_ENGINE_CONFIG,
      binary: '/opt/claude',
    });
    const p2 = customModel.invoke('sonnet', 'p');
    customChild.emit('close', 0);
    await p2;
    expect(spawnMock.mock.calls[0]?.[0]).toBe('/opt/claude');
  });

  it('sets windowsHide true, and utf8 encoding on both stdout and stderr', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const model = new StreamingClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const promise = model.invoke('sonnet', 'p');
    child.emit('close', 0);
    await promise;

    const options = spawnMock.mock.calls[0]?.[2] as Record<string, unknown> | undefined;
    expect(options?.['windowsHide']).toBe(true);
    expect(child.stdout.setEncoding).toHaveBeenCalledWith('utf8');
    expect(child.stderr.setEncoding).toHaveBeenCalledWith('utf8');
  });

  it('omits --include-partial-messages when invoked without onText', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const model = new StreamingClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const promise = model.invoke('sonnet', 'p');
    child.emit('close', 0);
    await promise;

    const args = spawnMock.mock.calls[0]?.[1] as string[] | undefined;
    expect(args).not.toContain('--include-partial-messages');
  });

  it('ignores an unparseable stream line instead of crashing', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const activities: string[] = [];
    const model = new StreamingClaudeCliModel({
      repo: '/work/sbx',
      config: DEFAULT_ENGINE_CONFIG,
      onActivity: (a) => activities.push(a.tool),
    });
    const promise = model.invoke('sonnet', 'p');

    expect(() => child.stdout.emit('data', 'not json at all\n')).not.toThrow();
    child.emit('close', 0);
    await promise;

    expect(activities).toEqual([]);
  });

  it('does not crash on a tool_use event when no onActivity callback is given', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const model = new StreamingClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const promise = model.invoke('sonnet', 'p');

    const toolEvent =
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] },
      }) + '\n';
    expect(() => child.stdout.emit('data', toolEvent)).not.toThrow();
    child.emit('close', 0);
    await promise;
  });

  it('does not crash on a text delta event when no onText callback is given', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const model = new StreamingClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const promise = model.invoke('sonnet', 'p');

    const textEvent =
      JSON.stringify({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } },
      }) + '\n';
    expect(() => child.stdout.emit('data', textEvent)).not.toThrow();
    child.emit('close', 0);
    await promise;
  });

  it('only treats the terminal "result" event as the resolved envelope, not every event', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const model = new StreamingClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const promise = model.invoke('sonnet', 'p');

    const toolEvent =
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] },
      }) + '\n';
    child.stdout.emit('data', toolEvent);
    child.emit('close', 0);

    const res = await promise;
    expect(res.stdout).toBe('');
    expect(res.envelope).toBeNull();
  });

  it('processes every line in a chunk even when a stray blank line leads it (nl===0 boundary)', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const activities: string[] = [];
    const model = new StreamingClaudeCliModel({
      repo: '/work/sbx',
      config: DEFAULT_ENGINE_CONFIG,
      onActivity: (a) => activities.push(a.tool),
    });
    const promise = model.invoke('sonnet', 'p');

    const toolEvent = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] },
    });
    const resultEvent = { type: 'result', result: 'done', is_error: false, total_cost_usd: 3 };
    // A leading blank line (indexOf('\n') === 0 on the FIRST pass through the
    // buffer-draining loop) must not stall parsing of the real lines that
    // follow it in the same chunk.
    child.stdout.emit('data', `\n${toolEvent}\n${JSON.stringify(resultEvent)}\n`);
    child.emit('close', 0);

    const res = await promise;
    expect(activities).toEqual(['Bash']);
    expect(res.envelope?.costUsd).toBe(3);
  });

  it('ignores stderr entirely when the child carries no stderr stream', async () => {
    const child = fakeChild() as Omit<FakeChild, 'stderr'> & { stderr: FakeStream | undefined };
    child.stderr = undefined;
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const model = new StreamingClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const promise = model.invoke('sonnet', 'p');
    child.emit('close', 0);

    await expect(promise).resolves.toBeDefined();
  });

  it('forwards resumeSessionId to --resume (docs/epics/0009-warm-sessions.md)', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const model = new StreamingClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const promise = model.invoke('sonnet', 'p', 'prior-session-id');
    child.emit('close', 0);
    await promise;

    const args = spawnMock.mock.calls[0]?.[1] as string[] | undefined;
    expect(args?.[(args?.indexOf('--resume') ?? -1) + 1]).toBe('prior-session-id');
  });

  it('omits --resume when invoked without a resumeSessionId', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const model = new StreamingClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const promise = model.invoke('sonnet', 'p');
    child.emit('close', 0);
    await promise;

    const args = spawnMock.mock.calls[0]?.[1] as string[] | undefined;
    expect(args).not.toContain('--resume');
  });

  it('retries cold when a resumed invocation fails at the CLI level (docs/epics/0009-warm-sessions.md)', async () => {
    const failChild = fakeChild();
    const okChild = fakeChild();
    spawnMock.mockReturnValueOnce(failChild as unknown as ReturnType<typeof spawn>);
    spawnMock.mockReturnValueOnce(okChild as unknown as ReturnType<typeof spawn>);

    const model = new StreamingClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const promise = model.invoke('sonnet', 'p', 'prior-session-id');

    failChild.emit('close', 1);
    // Let the `await execOnce(...)` in invoke() settle and reach the retry's
    // (synchronous) spawn() call before touching the second child.
    await Promise.resolve();
    await Promise.resolve();

    const resultEvent = { type: 'result', result: 'done', is_error: false };
    okChild.stdout.emit('data', JSON.stringify(resultEvent) + '\n');
    okChild.emit('close', 0);

    const res = await promise;

    expect(spawnMock.mock.calls).toHaveLength(2);
    const firstArgs = spawnMock.mock.calls[0]?.[1] as string[];
    expect(firstArgs).toContain('--resume');
    const secondArgs = spawnMock.mock.calls[1]?.[1] as string[];
    expect(secondArgs).not.toContain('--resume');
    expect(res.envelope?.result).toBe('done');
  });

  it('does not retry a non-resumed failure (nothing to fall back FROM)', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const model = new StreamingClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const promise = model.invoke('sonnet', 'p');
    child.emit('close', 1);
    await promise;

    expect(spawnMock.mock.calls).toHaveLength(1);
  });

  it('does not retry a resumed call that fails with a real (parseable) quota error — the envelope is preserved', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const model = new StreamingClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const promise = model.invoke('sonnet', 'p', 'prior-session-id');
    const resultEvent = { type: 'result', result: '', is_error: true, api_error_status: 429 };
    child.stdout.emit('data', JSON.stringify(resultEvent) + '\n');
    child.emit('close', 1);
    const res = await promise;

    expect(spawnMock.mock.calls).toHaveLength(1);
    expect(res.envelope?.isError).toBe(true);
  });

  describe('resumed — the measurable-win telemetry signal (docs/epics/0009-warm-sessions.md)', () => {
    it('leaves resumed unset for an ordinary cold spawn (no resumeSessionId given)', async () => {
      const child = fakeChild();
      spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

      const model = new StreamingClaudeCliModel({
        repo: '/work/sbx',
        config: DEFAULT_ENGINE_CONFIG,
      });
      const promise = model.invoke('sonnet', 'p');
      child.stdout.emit(
        'data',
        JSON.stringify({ type: 'result', result: 'ok', is_error: false }) + '\n',
      );
      child.emit('close', 0);

      const res = await promise;
      expect(res.resumed).toBeUndefined();
    });

    it('marks resumed:true when a requested resume succeeds at the CLI level', async () => {
      const child = fakeChild();
      spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

      const model = new StreamingClaudeCliModel({
        repo: '/work/sbx',
        config: DEFAULT_ENGINE_CONFIG,
      });
      const promise = model.invoke('sonnet', 'p', 'prior-session-id');
      child.stdout.emit(
        'data',
        JSON.stringify({ type: 'result', result: 'ok', is_error: false }) + '\n',
      );
      child.emit('close', 0);

      const res = await promise;
      expect(res.resumed).toBe(true);
    });

    it('marks resumed:false when the CLI-level resume fails and the driver falls back cold', async () => {
      const failChild = fakeChild();
      const okChild = fakeChild();
      spawnMock.mockReturnValueOnce(failChild as unknown as ReturnType<typeof spawn>);
      spawnMock.mockReturnValueOnce(okChild as unknown as ReturnType<typeof spawn>);

      const model = new StreamingClaudeCliModel({
        repo: '/work/sbx',
        config: DEFAULT_ENGINE_CONFIG,
      });
      const promise = model.invoke('sonnet', 'p', 'prior-session-id');

      failChild.emit('close', 1);
      await Promise.resolve();
      await Promise.resolve();

      okChild.stdout.emit(
        'data',
        JSON.stringify({ type: 'result', result: 'done', is_error: false }) + '\n',
      );
      okChild.emit('close', 0);

      const res = await promise;
      expect(res.resumed).toBe(false);
    });
  });

  it("ORPHAN SWEEP (board web-msu3sv1w-hfj87n): reaps the child's descendant tree on close", async () => {
    const reapDescendants = vi.fn();
    const child = fakeChild() as FakeChild & { pid: number };
    child.pid = 4242;
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const model = new StreamingClaudeCliModel({
      repo: '/work/sbx',
      config: DEFAULT_ENGINE_CONFIG,
      reapDescendants,
    });
    const promise = model.invoke('sonnet', 'p');
    child.emit('close', 0);
    await promise;

    expect(reapDescendants).toHaveBeenCalledWith(4242);
  });

  it('ORPHAN SWEEP crash-path follow-up (board ap-mt2ukjg5-2): tracks the child pid on spawn, untracks it on close', async () => {
    const child = fakeChild() as FakeChild & { pid: number };
    child.pid = 4242;
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);
    const pidRegistry = { track: vi.fn(), untrack: vi.fn() };

    const model = new StreamingClaudeCliModel({
      repo: '/work/sbx',
      config: DEFAULT_ENGINE_CONFIG,
      pidRegistry,
    });
    const promise = model.invoke('sonnet', 'p');
    expect(pidRegistry.track).toHaveBeenCalledWith(4242);
    child.emit('close', 0);
    await promise;

    expect(pidRegistry.untrack).toHaveBeenCalledWith(4242);
  });

  it('ORPHAN SWEEP crash-path follow-up: untracks the child pid on an error exit too', async () => {
    const child = fakeChild() as FakeChild & { pid: number };
    child.pid = 4242;
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);
    const pidRegistry = { track: vi.fn(), untrack: vi.fn() };

    const model = new StreamingClaudeCliModel({
      repo: '/work/sbx',
      config: DEFAULT_ENGINE_CONFIG,
      pidRegistry,
    });
    const promise = model.invoke('sonnet', 'p');
    child.emit('error', new Error('spawn claude ENOENT'));
    await promise;

    expect(pidRegistry.untrack).toHaveBeenCalledWith(4242);
  });

  it("ORPHAN SWEEP: reaps the child's descendant tree on an 'error' exit too (e.g. binary not found)", async () => {
    const reapDescendants = vi.fn();
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const model = new StreamingClaudeCliModel({
      repo: '/work/sbx',
      config: DEFAULT_ENGINE_CONFIG,
      reapDescendants,
    });
    const promise = model.invoke('sonnet', 'p');
    child.emit('error', new Error('spawn claude ENOENT'));
    await promise;

    expect(reapDescendants).toHaveBeenCalledWith(undefined);
  });

  it('ORPHAN SWEEP: spawns the CLI child detached so a POSIX reap targets its OWN process group', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const model = new StreamingClaudeCliModel({ repo: '/work/sbx', config: DEFAULT_ENGINE_CONFIG });
    const promise = model.invoke('sonnet', 'p');
    child.emit('close', 0);
    await promise;

    const options = spawnMock.mock.calls[0]?.[2] as Record<string, unknown> | undefined;
    expect(options?.['detached']).toBe(true);
  });
});
