// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFile, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  parseGeminiStreamJsonOutput,
  isGeminiResumeFailure,
  GeminiCliModel,
} from '../../src/adapters/gemini-cli.js';
import {
  capDeathNote,
  CLI_STDIN_PROMPT_THRESHOLD,
  DEATH_TAIL_CHARS,
  DEFAULT_CLI_IDLE_TIMEOUT_MS,
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

/** What `StreamJsonFormatter.emitEvent` writes: one compact object per line. */
function jsonl(...events: readonly Record<string, unknown>[]): string {
  return events
    .map((event) => `${JSON.stringify({ timestamp: '2026-10-01T00:00:00.000Z', ...event })}\n`)
    .join('');
}

const INIT = { type: 'init', session_id: SESSION, model: 'gemini-2.5-pro' };

interface ModelTokens {
  readonly input: number;
  readonly prompt: number;
  readonly candidates: number;
  readonly cached: number;
}

/** What `convertToStreamStats` builds from `SessionMetrics`: per-model entries
 *  and their totals (stream-json-formatter.ts). */
function streamStats(models: Record<string, ModelTokens>): Record<string, unknown> {
  const perModel = Object.fromEntries(
    Object.entries(models).map(([name, t]) => [
      name,
      {
        total_tokens: t.prompt + t.candidates,
        input_tokens: t.prompt,
        output_tokens: t.candidates,
        cached: t.cached,
        input: t.input,
      },
    ]),
  );
  const sum = (pick: (t: ModelTokens) => number): number =>
    Object.values(models).reduce((total, t) => total + pick(t), 0);
  return {
    total_tokens: sum((t) => t.prompt + t.candidates),
    input_tokens: sum((t) => t.prompt),
    output_tokens: sum((t) => t.candidates),
    cached: sum((t) => t.cached),
    input: sum((t) => t.input),
    duration_ms: 48_210,
    tool_calls: 1,
    models: perModel,
  };
}

const PRO_TOKENS: ModelTokens = { input: 1_200, prompt: 31_200, candidates: 410, cached: 30_000 };

describe('parseGeminiStreamJsonOutput', () => {
  it("maps a finished run into a passing envelope whose result is the final turn's text", () => {
    const stdout = jsonl(
      INIT,
      { type: 'message', role: 'user', content: 'Add the missing test.' },
      { type: 'message', role: 'assistant', content: 'Running the ', delta: true },
      { type: 'message', role: 'assistant', content: 'suite first.', delta: true },
      { type: 'tool_use', tool_name: 'run_shell_command', tool_id: 't1', parameters: {} },
      { type: 'tool_result', tool_id: 't1', status: 'success', output: 'ok' },
      {
        type: 'message',
        role: 'assistant',
        content: 'Added it; the gate is green.\n',
        delta: true,
      },
      { type: 'message', role: 'assistant', content: 'METRICS:{"outcome":"shipped"}', delta: true },
      {
        type: 'result',
        status: 'success',
        stats: streamStats({ 'gemini-2.5-pro': PRO_TOKENS }),
      },
    );

    const response = parseGeminiStreamJsonOutput(stdout, 0, 'gemini-2.5-pro');

    expect(response.exitCode).toBe(0);
    expect(response.stdout).toBe(stdout);
    expect(response.sessionId).toBe(SESSION);
    expect(response.envelope).toEqual({
      // JSON mode's `response` restarts every turn (nonInteractiveCli.ts), so
      // the text before the tool call is not part of it.
      result: 'Added it; the gate is green.\nMETRICS:{"outcome":"shipped"}',
      isError: false,
      apiErrorStatus: null,
      costUsd: null,
      numTurns: null,
      durationMs: 48_210,
      stopReason: null,
      modelUsed: 'gemini-2.5-pro',
      tokensIn: 1_200, // the CLI's own uncached share: prompt − cached
      tokensOut: 410,
      cacheRead: 30_000,
      cacheCreate: null,
      sessionId: SESSION,
    });
  });

  it('reads an empty result, not a null one, when the final turn streamed no text', () => {
    const response = parseGeminiStreamJsonOutput(
      jsonl(
        INIT,
        { type: 'message', role: 'assistant', content: 'Committing.', delta: true },
        { type: 'tool_use', tool_name: 'run_shell_command', tool_id: 't1', parameters: {} },
        { type: 'tool_result', tool_id: 't1', status: 'success' },
        { type: 'result', status: 'success', stats: streamStats({}) },
      ),
      0,
      'gemini-2.5-pro',
    );
    expect(response.envelope).toMatchObject({ result: '', isError: false });
  });

  it('never invents a cost, even when the run reported token usage', () => {
    const response = parseGeminiStreamJsonOutput(
      jsonl(INIT, {
        type: 'result',
        status: 'success',
        stats: streamStats({
          'gemini-2.5-pro': {
            input: 1_000_000,
            prompt: 1_000_000,
            candidates: 1_000_000,
            cached: 0,
          },
        }),
      }),
      0,
      'gemini-2.5-pro',
    );
    expect(response.envelope?.costUsd).toBeNull();
    expect(response.envelope?.tokensIn).toBe(1_000_000);
  });

  it("reads the CLI's own token totals over every model and names the requested model when there are several", () => {
    const response = parseGeminiStreamJsonOutput(
      jsonl(INIT, {
        type: 'result',
        status: 'success',
        stats: streamStats({
          'gemini-2.5-flash-lite': { input: 90, prompt: 90, candidates: 5, cached: 0 },
          'gemini-2.5-pro': { input: 700, prompt: 3_700, candidates: 200, cached: 3_000 },
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

  it('reads a fatal error from its stdout result event and keeps the exit code', () => {
    const response = parseGeminiStreamJsonOutput(
      jsonl(
        INIT,
        { type: 'message', role: 'assistant', content: 'Still working', delta: true },
        { type: 'error', severity: 'error', message: 'Maximum session turns exceeded' },
        {
          type: 'result',
          status: 'error',
          error: { type: 'FatalTurnLimitedError', message: 'Reached max session turns' },
          stats: streamStats({ 'gemini-2.5-pro': PRO_TOKENS }),
        },
      ),
      53,
      'gemini-2.5-pro',
    );
    expect(response.exitCode).toBe(53);
    expect(response.sessionId).toBe(SESSION);
    expect(response.envelope).toMatchObject({
      isError: true,
      result: 'Reached max session turns',
      apiErrorStatus: null,
      tokensIn: 1_200,
    });
  });

  it("falls back to the last error event's message for a failed result that carries none (the invalid-stream case)", () => {
    const response = parseGeminiStreamJsonOutput(
      jsonl(
        INIT,
        { type: 'error', severity: 'warning', message: 'Loop detected, stopping execution' },
        { type: 'message', role: 'assistant', content: 'partial', delta: true },
        { type: 'error', severity: 'error', message: 'Model stream ended with an invalid chunk' },
        { type: 'result', status: 'error', stats: streamStats({}) },
      ),
      1,
      'gemini-2.5-pro',
    );
    expect(response.envelope).toMatchObject({
      isError: true,
      result: 'Model stream ended with an invalid chunk',
    });
  });

  it('never lets a warning event fail a run or become its result', () => {
    const response = parseGeminiStreamJsonOutput(
      jsonl(
        INIT,
        { type: 'error', severity: 'warning', message: 'Agent execution blocked' },
        { type: 'message', role: 'assistant', content: 'done', delta: true },
        { type: 'result', status: 'success', stats: streamStats({}) },
      ),
      0,
      'gemini-2.5-pro',
    );
    expect(response.envelope).toMatchObject({ isError: false, result: 'done' });

    const failed = parseGeminiStreamJsonOutput(
      jsonl(
        INIT,
        { type: 'error', severity: 'warning', message: 'Loop detected, stopping execution' },
        { type: 'result', status: 'error' },
      ),
      1,
      'gemini-2.5-pro',
    );
    expect(failed.envelope).toMatchObject({ isError: true, result: null });
  });

  it('returns no envelope for a run killed before its result, but keeps the session so it stays resumable', () => {
    const stdout = jsonl(
      INIT,
      { type: 'message', role: 'assistant', content: 'Working on it', delta: true },
      { type: 'tool_use', tool_name: 'run_shell_command', tool_id: 't1', parameters: {} },
    );
    const response = parseGeminiStreamJsonOutput(`${stdout}{"type":"tool_res`, 1, 'gemini-2.5-pro');
    expect(response.envelope).toBeNull();
    expect(response.sessionId).toBe(SESSION);
  });

  it('returns no envelope and no session for empty, non-JSON, or untyped JSON output', () => {
    for (const stdout of ['', 'Loaded cached credentials.\n', '{"session_id":"x"}\n', '[1,2]\n']) {
      const response = parseGeminiStreamJsonOutput(stdout, 1, 'gemini-2.5-pro');
      expect(response.envelope).toBeNull();
      expect(response.sessionId).toBeNull();
    }
  });

  it('skips log lines between events and reads CRLF endings', () => {
    const response = parseGeminiStreamJsonOutput(
      [
        'Loaded cached credentials.',
        JSON.stringify(INIT),
        '[DEBUG] tool registry ready',
        JSON.stringify({ type: 'message', role: 'assistant', content: 'done', delta: true }),
        JSON.stringify({ type: 'result', status: 'success', stats: streamStats({}) }),
      ].join('\r\n'),
      0,
      'gemini-2.5-pro',
    );
    expect(response.sessionId).toBe(SESSION);
    expect(response.envelope).toMatchObject({ isError: false, result: 'done' });
  });

  it('ignores malformed fields rather than trusting them', () => {
    const response = parseGeminiStreamJsonOutput(
      jsonl(
        { type: 'init', session_id: 42 },
        { type: 'message', role: 'assistant', content: ['not', 'text'], delta: true },
        { type: 'message', role: 'assistant', content: 'kept', delta: true },
        { type: 'result', status: 'success', stats: 'not-an-object' },
      ),
      0,
      'gemini-2.5-pro',
    );
    expect(response.sessionId).toBeNull();
    expect(response.envelope).toMatchObject({
      result: 'kept',
      isError: false,
      tokensIn: null,
      durationMs: null,
    });

    const emptySession = parseGeminiStreamJsonOutput(
      jsonl({ type: 'init', session_id: '' }, { type: 'result', status: 'success' }),
      0,
      'gemini-2.5-pro',
    );
    expect(emptySession.sessionId).toBeNull();

    const stringError = parseGeminiStreamJsonOutput(
      jsonl(
        INIT,
        { type: 'error', severity: 'error', message: 'API error' },
        { type: 'result', status: 'error', error: 'not-an-object' },
      ),
      1,
      'gemini-2.5-pro',
    );
    expect(stringError.envelope).toMatchObject({ isError: true, result: 'API error' });

    // No status the CLI writes for a finished run: never read as a pass.
    const noStatus = parseGeminiStreamJsonOutput(
      jsonl(INIT, { type: 'result' }),
      0,
      'gemini-2.5-pro',
    );
    expect(noStatus.envelope?.isError).toBe(true);
  });

  it('reports no model when none was requested and stats name none', () => {
    const response = parseGeminiStreamJsonOutput(
      jsonl(INIT, { type: 'result', status: 'success' }),
      0,
      '',
    );
    expect(response.envelope?.modelUsed).toBeNull();
  });
});

describe('isGeminiResumeFailure', () => {
  // gemini.tsx `resolveSessionId` exits FATAL_INPUT_ERROR (42) on an unknown
  // --resume id, before the run starts, so no output object is ever written.
  const failed = { envelope: null, exitCode: 42 };

  it('fires for a resume the CLI rejected at startup: exit 42 with no output object', () => {
    expect(isGeminiResumeFailure(SESSION, failed)).toBe(true);
  });

  it('never fires without a resume or on a clean exit', () => {
    expect(isGeminiResumeFailure(undefined, failed)).toBe(false);
    expect(isGeminiResumeFailure('', failed)).toBe(false);
    expect(isGeminiResumeFailure(SESSION, { ...failed, exitCode: 0 })).toBe(false);
  });

  it('never fires for another fatal exit: a cold retry would fail the same way', () => {
    // 55 untrusted workspace, 41 auth, 52 config, 1 a crash or a cap kill.
    for (const exitCode of [55, 41, 52, 1]) {
      expect(isGeminiResumeFailure(SESSION, { ...failed, exitCode })).toBe(false);
    }
  });

  it('never fires once the CLI wrote a result: the run got past the resume', () => {
    const envelope = parseGeminiStreamJsonOutput(
      jsonl(INIT, { type: 'result', status: 'error', error: { message: 'bad input' } }),
      42,
      'gemini-2.5-pro',
    ).envelope;
    expect(isGeminiResumeFailure(SESSION, { envelope, exitCode: 42 })).toBe(false);
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

  it('resolves the parsed envelope from a clean stream-json run', async () => {
    const stdout = jsonl(
      INIT,
      { type: 'message', role: 'assistant', content: 'done', delta: true },
      { type: 'result', status: 'success', stats: streamStats({ 'gemini-2.5-pro': PRO_TOKENS }) },
    );
    mockExecFileResult(null, stdout);

    const res = await new GeminiCliModel({ repo: '/work/sbx' }).invoke('gemini-2.5-pro', 'do it');

    expect(res).toEqual({
      ...parseGeminiStreamJsonOutput(stdout, 0, 'gemini-2.5-pro'),
      observed: { elapsedMs: expect.any(Number) },
    });
    expect(res.sessionId).toBe(SESSION);
    expect(res.envelope).toMatchObject({ isError: false, result: 'done', tokensIn: 1_200 });
  });

  it('spawns the default "gemini" binary headless with stream-json output, the model, yolo approval, and the prompt last', async () => {
    mockExecFileResult(null, '');

    await new GeminiCliModel({ repo: '/work/sbx', platform: 'linux' }).invoke(
      'gemini-2.5-pro',
      'do it',
    );

    expect(execFileMock.mock.calls).toHaveLength(1);
    const [binary, args, options] = execFileMock.mock.calls[0] as [
      string,
      string[],
      Record<string, unknown>,
    ];
    expect(binary).toBe('gemini');
    expect(args[args.indexOf('--model') + 1]).toBe('gemini-2.5-pro');
    // stream-json prints each event as it happens, so the idle cap has stdout
    // to watch; json writes its one object only when the run ends.
    expect(args[args.indexOf('--output-format') + 1]).toBe('stream-json');
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

    await new GeminiCliModel({ repo: '/work/sbx', platform: 'linux' }).invoke(
      'gemini-2.5-pro',
      'do it',
    );

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

  it('pipes a prompt that starts with "-", which yargs would refuse as the --prompt value', async () => {
    // `--prompt` is `nargs: 1` (gemini-cli config.ts), and yargs-parser's
    // eatNargs never consumes an arg matching /^-[^0-9]/: the run would fail
    // "Not enough arguments following: prompt" and parse the prompt as flags.
    mockExecFileResult(null, '');

    await new GeminiCliModel({ repo: '/work/sbx' }).invoke('gemini-2.5-pro', '- fix the build');

    expect(spawnedArgs()).not.toContain('--prompt');
    expect(spawnedArgs()).not.toContain('- fix the build');
    expect(stdinEnd).toHaveBeenCalledWith('- fix the build');
  });

  it('pipes a frontmatter prompt ("---" first) on stdin, next to a resume', async () => {
    mockExecFileResult(null, '');
    const frontmatter = '---\ntask: fix\n---\nFix the build.';

    await new GeminiCliModel({ repo: '/work/sbx' }).invoke('gemini-2.5-pro', frontmatter, SESSION);

    expect(spawnedArgs().slice(-2)).toEqual(['--resume', SESSION]);
    expect(spawnedArgs()).not.toContain('--prompt');
    expect(stdinEnd).toHaveBeenCalledWith(frontmatter);
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

    await new GeminiCliModel({ repo: '/work/sbx', platform: 'linux' }).invoke(
      'gemini-2.5-pro',
      atLimit,
    );

    expect(spawnedArgs().slice(-2)).toEqual(['--prompt', atLimit]);
  });

  it('passes "--resume <id>" when a session id is given, and omits it for an empty one', async () => {
    mockExecFileResult(null, '');
    const model = new GeminiCliModel({ repo: '/work/sbx', platform: 'linux' });

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

  describe('on Windows, where npm installs gemini as a gemini.cmd shim', () => {
    it('spawns a bare "gemini" through cmd.exe /c: execFile cannot launch a .cmd shim itself (ENOENT), and cmd.exe finds it by PATHEXT', async () => {
      mockExecFileResult(null, '');

      await new GeminiCliModel({ repo: '/work/sbx', platform: 'win32' }).invoke(
        'gemini-2.5-pro',
        'do it',
      );

      const [binary, args] = execFileMock.mock.calls[0] as [string, string[]];
      expect(binary).toBe('cmd.exe');
      expect(args.slice(0, 2)).toEqual(['/c', 'gemini']);
      expect(args[args.indexOf('--model') + 1]).toBe('gemini-2.5-pro');
      expect(args[args.indexOf('--output-format') + 1]).toBe('stream-json');
    });

    it("puts even a short prompt on stdin, never --prompt, so no prompt text ever reaches cmd.exe's own parser", async () => {
      mockExecFileResult(null, '');
      const hostile = 'fix "the" build & echo %PATH% | more';

      await new GeminiCliModel({ repo: '/work/sbx', platform: 'win32' }).invoke(
        'gemini-2.5-pro',
        hostile,
        SESSION,
      );

      const [, args] = execFileMock.mock.calls[0] as [string, string[]];
      expect(args).not.toContain('--prompt');
      expect(args.some((a) => a.includes('echo'))).toBe(false);
      expect(args.slice(-2)).toEqual(['--resume', SESSION]);
      expect(stdinEnd).toHaveBeenCalledWith(hostile);
    });

    it('does not detach cmd.exe, the shape the gate already runs its cmd.exe shims in: a detached cmd.exe has no console to hand the node shim', async () => {
      mockExecFileResult(null, '');

      await new GeminiCliModel({ repo: '/work/sbx', platform: 'win32' }).invoke(
        'gemini-2.5-pro',
        'do it',
      );

      const [, , options] = execFileMock.mock.calls[0] as [
        string,
        string[],
        Record<string, unknown>,
      ];
      expect(options).toMatchObject({ detached: false, windowsHide: true });
    });

    it('refuses, without spawning, a model name cmd.exe would run as syntax: Node quotes no argument free of whitespace, so "&" would start a second command', async () => {
      mockExecFileResult(null, '');

      const res = await new GeminiCliModel({ repo: '/work/sbx', platform: 'win32' }).invoke(
        'gemini&calc',
        'do it',
      );

      expect(execFileMock.mock.calls).toHaveLength(0);
      expect(res.envelope).toBeNull();
      expect(res.exitCode).not.toBe(0);
      expect(res.stdout).not.toContain('calc');
      // Nothing ran, so there is no clock to report.
      expect('observed' in res).toBe(false);
    });

    it('never hands cmd.exe a resume id carrying its syntax: that run is refused, and the cold retry goes without it', async () => {
      mockExecFileResult(
        null,
        jsonl(
          INIT,
          { type: 'message', role: 'assistant', content: 'done', delta: true },
          { type: 'result', status: 'success' },
        ),
      );

      const res = await new GeminiCliModel({ repo: '/work/sbx', platform: 'win32' }).invoke(
        'gemini-2.5-pro',
        'continue',
        'latest|calc',
      );

      expect(execFileMock.mock.calls).toHaveLength(1);
      const [, args] = execFileMock.mock.calls[0] as [string, string[]];
      expect(args.some((a) => a.includes('calc'))).toBe(false);
      expect(args).not.toContain('--resume');
      expect(res.resumed).toBe(false);
      expect(res.envelope?.result).toBe('done');
    });

    it('keeps the arguments real runs pass on the cmd.exe route: "auto_edit" approval, --skip-trust, and model names with dots, colons, and slashes', async () => {
      mockExecFileResult(null, '');

      await new GeminiCliModel({
        repo: '/work/sbx',
        platform: 'win32',
        approvalMode: 'auto_edit',
        trustWorkspace: true,
      }).invoke('models/gemini-2.5-flash:latest', 'do it', SESSION);

      expect(execFileMock.mock.calls).toHaveLength(1);
      const [, args] = execFileMock.mock.calls[0] as [string, string[]];
      expect(args[args.indexOf('--model') + 1]).toBe('models/gemini-2.5-flash:latest');
      expect(args[args.indexOf('--approval-mode') + 1]).toBe('auto_edit');
      expect(args).toContain('--skip-trust');
      expect(args[args.indexOf('--resume') + 1]).toBe(SESSION);
    });

    it('spawns an explicit .exe or path binary directly, detached, with a short prompt still on --prompt', async () => {
      mockExecFileResult(null, '');

      await new GeminiCliModel({
        repo: '/work/sbx',
        platform: 'win32',
        binary: 'gemini.exe',
      }).invoke('gemini-2.5-pro', 'do it');

      const [binary, args, options] = execFileMock.mock.calls[0] as [
        string,
        string[],
        Record<string, unknown>,
      ];
      expect(binary).toBe('gemini.exe');
      expect(args[0]).toBe('--model');
      expect(args.slice(-2)).toEqual(['--prompt', 'do it']);
      expect(options).toMatchObject({ detached: true });
      expect(stdinEnd).toHaveBeenCalledWith();
    });
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

  it('reads a fatal error off its stdout result event, never the feedback text on stderr, and keeps the numeric exit code', async () => {
    // stream-json writes a fatal error as a `result` on stdout (errors.ts);
    // only JSON mode moved its error object to stderr.
    const stdout = jsonl(INIT, {
      type: 'result',
      status: 'error',
      error: { type: 'FatalTurnLimitedError', message: 'Reached max session turns' },
    });
    mockExecFileResult(
      Object.assign(new Error('exit 53'), { code: 53 }),
      stdout,
      'Reached max session turns\n',
    );

    const res = await new GeminiCliModel({ repo: '/work/sbx' }).invoke('gemini-2.5-pro', 'do it');

    expect(res).toEqual({
      ...parseGeminiStreamJsonOutput(stdout, 53, 'gemini-2.5-pro'),
      observed: { elapsedMs: expect.any(Number) },
    });
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

  describe("death reason — with no envelope, stdout is the CLI's stderr tail, which firing.ts records as deathTail (StreamingClaudeCliModel parity)", () => {
    it('reports why a run failed before it wrote a single event: a failed login or an untrusted folder exits with its reason on stderr only', async () => {
      mockExecFileResult(
        Object.assign(new Error('exit 41'), { code: 41 }),
        '',
        'Error authenticating: no credentials found\n\n',
      );

      const res = await new GeminiCliModel({ repo: '/work/sbx' }).invoke('gemini-2.5-pro', 'do it');

      expect(res.exitCode).toBe(41);
      expect(res.envelope).toBeNull();
      expect(res.stdout).toBe('Error authenticating: no credentials found');
    });

    it('reports the stderr of a run that died mid-stream, not the events it printed first, and keeps its session resumable', async () => {
      mockExecFileResult(
        Object.assign(new Error('exit 1'), { code: 1 }),
        jsonl(INIT, { type: 'message', role: 'assistant', content: 'working', delta: true }),
        'FATAL ERROR: Reached heap limit\n',
      );

      const res = await new GeminiCliModel({ repo: '/work/sbx' }).invoke('gemini-2.5-pro', 'do it');

      expect(res.stdout).toBe('FATAL ERROR: Reached heap limit');
      expect(res.sessionId).toBe(SESSION);
    });

    it('keeps only the last DEATH_TAIL_CHARS of a long stderr: the error line, never a dump', async () => {
      const stderr = `${'warning: a noisy log line\n'.repeat(200)}Error: the real reason\n`;
      mockExecFileResult(Object.assign(new Error('exit 1'), { code: 1 }), '', stderr);

      const res = await new GeminiCliModel({ repo: '/work/sbx' }).invoke('gemini-2.5-pro', 'do it');

      expect(res.stdout).toHaveLength(DEATH_TAIL_CHARS);
      expect(res.stdout.endsWith('Error: the real reason')).toBe(true);
    });

    it("leaves a finished run's stdout as the wire printed it: only a run with no envelope needs a reason", async () => {
      const stdout = jsonl(
        INIT,
        { type: 'message', role: 'assistant', content: 'done', delta: true },
        { type: 'result', status: 'success', stats: streamStats({ 'gemini-2.5-pro': PRO_TOKENS }) },
      );
      mockExecFileResult(null, stdout, 'warning: a noisy log line\n');

      const res = await new GeminiCliModel({ repo: '/work/sbx' }).invoke('gemini-2.5-pro', 'do it');

      expect(res.envelope?.result).toBe('done');
      expect(res.stdout).toBe(stdout);
    });
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

  describe('resume fallback and resumed telemetry (epic 0009 parity with ClaudeCliModel)', () => {
    const COLD_SESSION = '9e8d7c6b-5a49-4382-b1c0-ffffffffffff';
    const DONE = (sessionId: string): string =>
      jsonl(
        { ...INIT, session_id: sessionId },
        { type: 'message', role: 'assistant', content: 'done', delta: true },
        { type: 'result', status: 'success' },
      );
    // What `SessionError.invalidSessionIdentifier` says (sessionUtils.ts): text,
    // never an output object, even though it carries braces.
    const REJECTED =
      `Error resuming session: Invalid session identifier "${SESSION}".\n` +
      '  Use --list-sessions to see available sessions, then use --resume {number}, --resume {uuid}, or --resume latest.\n';

    /** One execFile outcome per spawn, in order; the last repeats. */
    function mockExecFileRuns(
      ...runs: readonly (readonly [(Error & { code?: unknown }) | null, string, string?])[]
    ): void {
      let calls = 0;
      execFileMock.mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1] as ExecFileCallback;
        const run = runs[Math.min(calls, runs.length - 1)];
        calls += 1;
        queueMicrotask(() => cb(run?.[0] ?? null, run?.[1] ?? '', run?.[2] ?? ''));
        return { pid: 4321, stdin: Object.assign(new EventEmitter(), { end: stdinEnd }) };
      });
    }

    const exitWith = (code: number): Error & { code: number } =>
      Object.assign(new Error(`exit ${code}`), { code });

    it('retries once, cold, when the CLI rejects the session id at startup', async () => {
      mockExecFileRuns([exitWith(42), '', REJECTED], [null, DONE(COLD_SESSION)]);

      const res = await new GeminiCliModel({ repo: '/work/sbx', platform: 'linux' }).invoke(
        'gemini-2.5-pro',
        'continue',
        SESSION,
      );

      expect(execFileMock.mock.calls).toHaveLength(2);
      const [, retryArgs] = execFileMock.mock.calls[1] as [string, string[]];
      expect(retryArgs).not.toContain('--resume');
      expect(retryArgs.slice(-2)).toEqual(['--prompt', 'continue']);
      expect(res.resumed).toBe(false);
      expect(res.sessionId).toBe(COLD_SESSION);
      expect(res.envelope?.result).toBe('done');
    });

    it('reports resumed: true when the output names the session it was asked to resume', async () => {
      mockExecFileRuns([null, DONE(SESSION)]);

      const res = await new GeminiCliModel({ repo: '/work/sbx' }).invoke(
        'gemini-2.5-pro',
        'continue',
        SESSION,
      );

      expect(execFileMock.mock.calls).toHaveLength(1);
      expect(res.resumed).toBe(true);
    });

    it('reports resumed: false when the output names another session: `--resume latest` with none saved starts a fresh one', async () => {
      mockExecFileRuns([null, DONE(COLD_SESSION)]);

      const res = await new GeminiCliModel({ repo: '/work/sbx' }).invoke(
        'gemini-2.5-pro',
        'continue',
        'latest',
      );

      expect(execFileMock.mock.calls).toHaveLength(1);
      expect(res.resumed).toBe(false);
    });

    it('never retries a resumed run that failed later: the session its init names proves the resume took', async () => {
      const stdout = jsonl(INIT, {
        type: 'result',
        status: 'error',
        error: { type: 'FatalTurnLimitedError', message: 'Reached max session turns' },
      });
      mockExecFileRuns([exitWith(53), stdout]);

      const res = await new GeminiCliModel({ repo: '/work/sbx' }).invoke(
        'gemini-2.5-pro',
        'continue',
        SESSION,
      );

      expect(execFileMock.mock.calls).toHaveLength(1);
      expect(res.envelope).toMatchObject({ isError: true, result: 'Reached max session turns' });
      expect(res.resumed).toBe(true);
    });

    it('never retries an untrusted-workspace exit, and claims no resume either way', async () => {
      mockExecFileRuns([exitWith(55), '']);

      const res = await new GeminiCliModel({ repo: '/work/sbx' }).invoke(
        'gemini-2.5-pro',
        'continue',
        SESSION,
      );

      expect(execFileMock.mock.calls).toHaveLength(1);
      expect(res.exitCode).toBe(55);
      expect('resumed' in res).toBe(false);
    });

    it('leaves resumed off for a cold spawn, and never retries a cold spawn that failed', async () => {
      mockExecFileRuns([exitWith(42), '', 'Error: bad input\n']);

      const res = await new GeminiCliModel({ repo: '/work/sbx' }).invoke('gemini-2.5-pro', 'do it');

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
      stderr = '',
    ): void {
      execFileMock.mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1] as ExecFileCallback;
        queueMicrotask(() => {
          vi.setSystemTime(Date.now() + elapsedMs);
          cb(error, stdout, stderr);
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
      // Killed before its `result`, the run lost the CLI's own `duration_ms`;
      // the driver's clock still says how long it held the lane.
      expect(res.observed).toEqual({ elapsedMs: 5000 });
    });

    it('says the wall-clock cap killed it when the CLI left no stderr, never handing on the events it printed', async () => {
      vi.useFakeTimers();
      mockExecFileAfter(120_000, Object.assign(new Error('killed'), { killed: true }), jsonl(INIT));

      const res = await new GeminiCliModel({ repo: '/work/sbx', timeoutMs: 120_000 }).invoke(
        'gemini-2.5-pro',
        'do it',
      );

      expect(res.stdout).toBe(capDeathNote('wall-clock', 120_000, 120_000));
    });

    it("keeps the CLI's own stderr over the cap note when the killed run left some", async () => {
      vi.useFakeTimers();
      mockExecFileAfter(
        120_000,
        Object.assign(new Error('killed'), { killed: true }),
        jsonl(INIT),
        'Error: model request still pending\n',
      );

      const res = await new GeminiCliModel({ repo: '/work/sbx', timeoutMs: 120_000 }).invoke(
        'gemini-2.5-pro',
        'do it',
      );

      expect(res.stdout).toBe('Error: model request still pending');
    });

    it("reports its own clock as observed.elapsedMs next to the CLI's duration_ms, and no turn count the wire never carries", async () => {
      vi.useFakeTimers();
      mockExecFileAfter(
        50_000,
        null,
        jsonl(
          INIT,
          { type: 'message', role: 'assistant', content: 'done', delta: true },
          {
            type: 'result',
            status: 'success',
            stats: streamStats({ 'gemini-2.5-pro': PRO_TOKENS }),
          },
        ),
      );

      const res = await new GeminiCliModel({ repo: '/work/sbx' }).invoke('gemini-2.5-pro', 'do it');

      expect(res.envelope?.durationMs).toBe(48_210);
      expect(res.observed).toEqual({ elapsedMs: 50_000 });
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

  describe('idle cap — a silent child is killed long before the wall clock (CodexCliModel parity)', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    /** A child that stays alive until killed: `kill()` settles execFile's
     *  callback the way a real kill does (err.killed, no result), and
     *  `stdout` is the stream the adapter watches for signs of life. */
    function mockLiveChild(stdoutSoFar: string): {
      readonly kill: ReturnType<typeof vi.fn>;
      readonly stdout: EventEmitter & { destroy: ReturnType<typeof vi.fn> };
      readonly stderrDestroy: ReturnType<typeof vi.fn>;
      readonly exitCleanly: (out: string) => void;
    } {
      const stdout = Object.assign(new EventEmitter(), { destroy: vi.fn() });
      const stderrDestroy = vi.fn();
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
          stderr: { destroy: stderrDestroy },
          kill,
          stdin: Object.assign(new EventEmitter(), { end: stdinEnd }),
        };
      });
      return { kill, stdout, stderrDestroy, exitCleanly: (out) => settle(null, out, '') };
    }

    const TOOL_USE = {
      type: 'tool_use',
      tool_name: 'run_shell_command',
      tool_id: 't1',
      parameters: {},
    };

    it('kills a child silent for DEFAULT_CLI_IDLE_TIMEOUT_MS and reports it timedOut, keeping the init session resumable', async () => {
      vi.useFakeTimers();
      const child = mockLiveChild(jsonl(INIT, TOOL_USE));

      const pending = new GeminiCliModel({ repo: '/work/sbx' }).invoke('gemini-2.5-pro', 'do it');
      await vi.advanceTimersByTimeAsync(DEFAULT_CLI_IDLE_TIMEOUT_MS - 1);
      expect(child.kill).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      // Asserted before awaiting: without the cap the promise never settles.
      expect(child.kill).toHaveBeenCalledTimes(1);
      const res = await pending;

      expect(DEFAULT_CLI_IDLE_TIMEOUT_MS).toBeLessThan(DEFAULT_CLI_TIMEOUT_MS);
      expect(res.timedOut).toBe(true);
      expect(res.envelope).toBeNull();
      expect(res.sessionId).toBe(SESSION);
    });

    it('says the idle cap killed it when the CLI left no stderr', async () => {
      vi.useFakeTimers();
      const child = mockLiveChild(jsonl(INIT, TOOL_USE));

      const pending = new GeminiCliModel({ repo: '/work/sbx', idleTimeoutMs: 60_000 }).invoke(
        'gemini-2.5-pro',
        'do it',
      );
      await vi.advanceTimersByTimeAsync(60_000);
      expect(child.kill).toHaveBeenCalledTimes(1);
      const res = await pending;

      expect(res.stdout).toBe(capDeathNote('idle', 60_000, 60_000));
    });

    it("closes its end of the pipes before the kill, as execFile's own timeout does: behind cmd.exe the node shim outlives the kill and holds them open", async () => {
      vi.useFakeTimers();
      const child = mockLiveChild('');

      const pending = new GeminiCliModel({
        repo: '/work/sbx',
        platform: 'win32',
        idleTimeoutMs: 1000,
      }).invoke('gemini-2.5-pro', 'do it');
      await vi.advanceTimersByTimeAsync(1000);
      await pending;

      const killedAt = child.kill.mock.invocationCallOrder[0] ?? 0;
      expect(child.stdout.destroy.mock.invocationCallOrder[0]).toBeLessThan(killedAt);
      expect(child.stderrDestroy.mock.invocationCallOrder[0]).toBeLessThan(killedAt);
    });

    it('re-arms on every stdout chunk: a child that keeps streaming events is never idle-killed', async () => {
      vi.useFakeTimers();
      const child = mockLiveChild('');
      const done = jsonl(
        INIT,
        { type: 'message', role: 'assistant', content: 'done', delta: true },
        { type: 'result', status: 'success' },
      );

      const pending = new GeminiCliModel({ repo: '/work/sbx', idleTimeoutMs: 1000 }).invoke(
        'gemini-2.5-pro',
        'do it',
      );
      for (let i = 0; i < 5; i += 1) {
        await vi.advanceTimersByTimeAsync(900);
        child.stdout.emit('data', '{"type":"message","role":"assistant","delta":true}\n');
      }
      child.exitCleanly(done);
      const res = await pending;

      expect(child.kill).not.toHaveBeenCalled();
      expect('timedOut' in res).toBe(false);
      expect(res.envelope).toMatchObject({ isError: false, result: 'done' });
    });

    it('disarms once the child settles: a finished run leaves no timer behind to kill a dead pid', async () => {
      vi.useFakeTimers();
      const child = mockLiveChild('');

      const pending = new GeminiCliModel({ repo: '/work/sbx', idleTimeoutMs: 1000 }).invoke(
        'gemini-2.5-pro',
        'do it',
      );
      child.exitCleanly('');
      await pending;
      await vi.advanceTimersByTimeAsync(5000);

      expect(child.kill).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("never retries a resume the idle cap killed: its exit is not the CLI's unknown-session 42, and a hung CLI would only hang again", async () => {
      vi.useFakeTimers();
      const child = mockLiveChild('');

      const pending = new GeminiCliModel({ repo: '/work/sbx', idleTimeoutMs: 1000 }).invoke(
        'gemini-2.5-pro',
        'continue',
        SESSION,
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
