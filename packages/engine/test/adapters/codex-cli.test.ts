// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFile, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  parseCodexExecOutput,
  CodexCliModel,
  codexActivityReader,
  codexGuardArgs,
  codexWebSearchesFromEvent,
  isCodexResumeFailure,
} from '../../src/adapters/codex-cli.js';
import { evaluateHookInput, guardHookCommand, GUARD_TIMEOUT_S } from '../../src/guard.js';
import { geminiToClaudeHookPayloads } from '../../src/gemini-guard.js';
import {
  capDeathNote,
  CLI_STDIN_PROMPT_THRESHOLD,
  DEATH_TAIL_CHARS,
  DEFAULT_CLI_IDLE_TIMEOUT_MS,
  DEFAULT_CLI_TIMEOUT_MS,
} from '../../src/adapters/claude-cli.js';
import {
  activitiesFromEvent,
  WEB_SEARCH_AUDIT_MAX_CHARS,
  type Activity,
  type WebSearchAudit,
} from '../../src/stream.js';
import { resolveNpmShim } from '../../src/adapters/npm-shim.js';

vi.mock('node:child_process', () => ({ execFile: vi.fn(), spawn: vi.fn() }));
// Without this the real resolver would walk this machine's PATH, and a codex
// installed here would change which Windows launch every test sees.
vi.mock('../../src/adapters/npm-shim.js', () => ({ resolveNpmShim: vi.fn() }));
const resolveNpmShimMock = vi.mocked(resolveNpmShim);

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

/** The guard command a flight hands the adapter, built as Claude's and Gemini's are. */
const GUARD_COMMAND = guardHookCommand('/work/sbx', '/opt/autopilot/engine/dist/guard-hook.js');

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

/** What `codex exec --json` prints once a web search returns: the
 *  `web_search` item (exec_events.rs `WebSearchItem`) with the query Codex
 *  reports for it and the Responses API action it ran. */
function webSearch(id: string, query: unknown, action?: Record<string, unknown>): unknown {
  return {
    type: 'item.completed',
    item: { id, type: 'web_search', query, ...(action === undefined ? {} : { action }) },
  };
}

function auditedQueries(event: unknown): readonly string[] {
  return codexWebSearchesFromEvent(event as Record<string, unknown>).map((s) => s.query);
}

describe('codexWebSearchesFromEvent — the web-search audit (THREAT-MODEL T6, StreamingClaudeCliModel parity)', () => {
  it('keeps the query of a completed search exactly as sent, whitespace intact', () => {
    const query = '  vitest   fake timers\n advanceTimersByTimeAsync  ';
    expect(
      codexWebSearchesFromEvent(
        webSearch('item_1', query, { type: 'search', query }) as Record<string, unknown>,
      ),
    ).toEqual([{ query, queryLength: query.length, allowedDomains: [], blockedDomains: [] }]);
  });

  it('audits every query a multi-query search ran, since the item query keeps only the first', () => {
    // core/src/web_search.rs `search_action_detail`: with no single query, the
    // item's query is the first of `queries` and " ..." for the rest.
    const event = webSearch('item_1', 'repo layout ...', {
      type: 'search',
      queries: ['repo layout', 'the secret it holds'],
    });
    expect(auditedQueries(event)).toEqual(['repo layout', 'the secret it holds']);
  });

  it('audits a query the action names both alone and in its list only once', () => {
    const event = webSearch('item_1', 'first', {
      type: 'search',
      query: 'first',
      queries: ['first', 'second'],
    });
    expect(auditedQueries(event)).toEqual(['first', 'second']);
  });

  it('audits the detail Codex reports for a page it opened or searched within, and for a CLI that sends no action', () => {
    expect(
      auditedQueries(
        webSearch('item_1', 'https://example.test/?q=secret', {
          type: 'open_page',
          url: 'https://example.test/?q=secret',
        }),
      ),
    ).toEqual(['https://example.test/?q=secret']);
    expect(
      auditedQueries(
        webSearch('item_2', "'token' in https://example.test", {
          type: 'find_in_page',
          url: 'https://example.test',
          pattern: 'token',
        }),
      ),
    ).toEqual(["'token' in https://example.test"]);
    // The SDK's own WebSearchItem (sdk/typescript/src/items.ts) has no action.
    expect(auditedQueries(webSearch('item_3', 'older cli query'))).toEqual(['older cli query']);
  });

  it('caps a runaway query at WEB_SEARCH_AUDIT_MAX_CHARS and keeps its true length beside it', () => {
    const query = 'x'.repeat(WEB_SEARCH_AUDIT_MAX_CHARS + 25);
    const [audit] = codexWebSearchesFromEvent(
      webSearch('item_1', query, { type: 'search', query }) as Record<string, unknown>,
    );
    expect(audit?.query).toBe('x'.repeat(WEB_SEARCH_AUDIT_MAX_CHARS));
    expect(audit?.queryLength).toBe(WEB_SEARCH_AUDIT_MAX_CHARS + 25);
  });

  it('reads nothing from a search still running, any other item or event, or one with no query', () => {
    const query = 'repo secrets';
    for (const event of [
      // ext/web-search/src/tool.rs starts the item with an empty query; a
      // started item is never audited, so a search is counted once.
      { type: 'item.started', item: { id: 'item_1', type: 'web_search', query: '' } },
      { type: 'item.started', item: { id: 'item_1', type: 'web_search', query } },
      { type: 'item.updated', item: { id: 'item_1', type: 'web_search', query } },
      { type: 'item.completed', item: { id: 'item_2', type: 'command_execution', command: query } },
      { type: 'item.completed', item: { id: 'item_3', type: 'agent_message', text: query } },
      { type: 'turn.completed', usage: {}, query },
      { type: 'item.completed' },
      webSearch('item_4', '', { type: 'other' }),
      webSearch('item_5', 42),
      webSearch('item_6', '', { type: 'search', query: '', queries: [42, ''] }),
    ]) {
      expect(auditedQueries(event)).toEqual([]);
    }
  });
});

function itemStarted(item: Record<string, unknown>): unknown {
  return { type: 'item.started', item };
}

function itemCompleted(item: Record<string, unknown>): unknown {
  return { type: 'item.completed', item };
}

/** A `command_execution` item (exec_events.rs `CommandExecutionItem`). */
function command(id: string, cmd: string): Record<string, unknown> {
  return { id, type: 'command_execution', command: cmd, aggregated_output: '', exit_code: null };
}

describe('codexActivityReader — the live activity timeline (StreamingClaudeCliModel parity)', () => {
  /** The steps one fresh reader finds in `events`, in wire order. */
  function steps(model: string | null, ...events: readonly unknown[]): Activity[] {
    const read = codexActivityReader(model);
    return events.flatMap((event) => [...read(event as Record<string, unknown>)]);
  }

  const NO_USAGE = { reasoning: null, model: 'gpt-5-codex', tokensIn: null, tokensOut: null };

  it("reads each tool call as a step as it starts, its target read as a Claude tool_use block's, under the requested model", () => {
    expect(
      steps(
        'gpt-5-codex',
        THREAD,
        TURN_STARTED,
        itemStarted(command('item_1', 'bash -lc "pnpm   run\n  test"')),
        itemStarted({
          id: 'item_2',
          type: 'file_change',
          changes: [
            { path: 'src/a.ts', kind: 'update' },
            { path: 'src/b.ts', kind: 'add' },
          ],
          status: 'in_progress',
        }),
        itemStarted({
          id: 'item_3',
          type: 'mcp_tool_call',
          server: 'docs',
          tool: 'search',
          arguments: { query: 'vitest timers' },
          result: null,
          error: null,
          status: 'in_progress',
        }),
        webSearch('item_4', 'vitest fake timers', { type: 'search', query: 'vitest fake timers' }),
      ),
    ).toEqual([
      {
        tool: 'command_execution',
        target: 'bash -lc "pnpm run test"',
        kind: 'command',
        ...NO_USAGE,
      },
      // One patch over two files is a step per file, as a Claude Edit is.
      { tool: 'file_change', target: 'src/a.ts', kind: 'file', ...NO_USAGE },
      { tool: 'file_change', target: 'src/b.ts', kind: 'file', ...NO_USAGE },
      { tool: 'docs.search', target: 'vitest timers', kind: 'search', ...NO_USAGE },
      { tool: 'web_search', target: 'vitest fake timers', kind: 'search', ...NO_USAGE },
    ]);
  });

  it('reports each call once: its completion after its start adds no step, a completion never started is one', () => {
    expect(
      steps(
        'gpt-5-codex',
        itemStarted(command('item_1', 'ls')),
        itemCompleted({ ...command('item_1', 'ls'), exit_code: 0, status: 'completed' }),
        itemCompleted({ ...command('item_2', 'pwd'), exit_code: 0, status: 'completed' }),
        // ext/web-search/src/tool.rs starts the item with an empty query, so a
        // search is a step only once it completes, with the query it ran.
        { type: 'item.started', item: { id: 'item_3', type: 'web_search', query: '' } },
        webSearch('item_3', 'repo layout'),
      ).map((a) => [a.tool, a.target]),
    ).toEqual([
      ['command_execution', 'ls'],
      ['command_execution', 'pwd'],
      ['web_search', 'repo layout'],
    ]);
  });

  it('gives each call the agent messages since the last call ended: shared by calls made together, never the reasoning summary', () => {
    const reasons = steps(
      'gpt-5-codex',
      itemCompleted({ id: 'item_0', type: 'reasoning', text: '**Planning the fix**' }),
      agentMessage('item_1', 'Checking the tests.'),
      agentMessage('item_2', 'Then the build.'),
      itemStarted(command('item_3', 'pnpm test')),
      itemStarted(command('item_4', 'pnpm build')),
      itemCompleted(command('item_3', 'pnpm test')),
      itemCompleted(command('item_4', 'pnpm build')),
      itemStarted(command('item_5', 'git status')),
      itemCompleted(command('item_5', 'git status')),
      agentMessage('item_6', '  \n '),
      itemStarted(command('item_7', 'git diff')),
    ).map((activity) => activity.reasoning);

    expect(reasons).toEqual([
      'Checking the tests. Then the build.',
      'Checking the tests. Then the build.',
      null,
      null,
    ]);
  });

  it("bounds a long stated reasoning exactly as a Claude message's is bounded", () => {
    const why = `${'because the gate failed on lint '.repeat(20)}\n\nso fixing it`;
    const [codex] = steps(
      'gpt-5-codex',
      agentMessage('item_1', why),
      itemStarted(command('item_2', 'pnpm lint')),
    );
    const [claude] = activitiesFromEvent({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: why },
          { type: 'tool_use', name: 'Bash', input: { command: 'pnpm lint' } },
        ],
      },
    });

    expect(codex?.reasoning).toBe(claude?.reasoning);
    expect(codex?.reasoning?.length).toBeLessThan(why.length);
  });

  it('names no model when none was requested, and keeps each reader to its own run', () => {
    const ls = itemStarted(command('item_1', 'ls'));
    expect(steps(null, ls).map((a) => a.model)).toEqual([null]);
    // A reader that saw another run's call and message still reports this one's.
    const other = codexActivityReader('gpt-5-codex');
    other(agentMessage('item_0', 'elsewhere') as Record<string, unknown>);
    other(ls as Record<string, unknown>);
    expect(steps('gpt-5-codex', ls)).toEqual([
      { tool: 'command_execution', target: 'ls', kind: 'command', ...NO_USAGE },
    ]);
  });

  it('reads a call it cannot name a target for as a bare step rather than dropping it', () => {
    expect(
      steps(
        'gpt-5-codex',
        itemStarted({ id: 'item_1', type: 'file_change', changes: [], status: 'in_progress' }),
        itemStarted({ id: 'item_2', type: 'file_change', changes: [{ kind: 'add' }, { path: 7 }] }),
        itemStarted({ id: 'item_3', type: 'mcp_tool_call', tool: 'search', arguments: null }),
        itemStarted({ id: 'item_4', type: 'mcp_tool_call', server: 'docs', tool: 42 }),
        itemStarted({ id: 'item_5', type: 'command_execution' }),
      ),
    ).toEqual([
      { tool: 'file_change', target: '', kind: 'other', ...NO_USAGE },
      { tool: 'file_change', target: '', kind: 'other', ...NO_USAGE },
      { tool: 'mcp_tool_call', target: '', kind: 'other', ...NO_USAGE },
      { tool: 'mcp_tool_call', target: '', kind: 'other', ...NO_USAGE },
      { tool: 'command_execution', target: '', kind: 'other', ...NO_USAGE },
    ]);
  });

  it('reads nothing from an item that is no tool call, an update, a turn event, or a malformed line', () => {
    expect(
      steps(
        'gpt-5-codex',
        THREAD,
        TURN_STARTED,
        agentMessage('item_1', 'done'),
        itemCompleted({ id: 'item_2', type: 'reasoning', text: 'thinking' }),
        itemStarted({ id: 'item_3', type: 'todo_list', items: [] }),
        { type: 'item.updated', item: command('item_4', 'ls') },
        itemCompleted({ id: 'item_5', type: 'error', message: 'model rerouted' }),
        { type: 'item.started' },
        { type: 'item.started', item: { id: 'item_6', type: 42, command: 'ls' } },
        { type: 'error', message: 'stream retry' },
        completed({ output_tokens: 1 }),
      ),
    ).toEqual([]);
  });
});

describe('codexGuardArgs — the containment guard as a session-layer PreToolUse hook (GeminiCliModel parity)', () => {
  it('is one -c override naming a command hook on Bash and apply_patch, timed in seconds as Claude times it, plus the flag that runs it without persisted hook trust', () => {
    expect(codexGuardArgs(GUARD_COMMAND)).toEqual([
      '-c',
      'hooks.PreToolUse=[{matcher="Bash|apply_patch",hooks=[{type="command",' +
        'command="node \\"/opt/autopilot/engine/dist/guard-hook.js\\" \\"/work/sbx\\"",' +
        `timeout=${GUARD_TIMEOUT_S}}]}]`,
      '--dangerously-bypass-hook-trust',
    ]);
  });

  it('writes the command as a TOML basic string: quotes, backslashes and control characters escaped, DEL too', () => {
    const [, override] = codexGuardArgs('node "dist\\x\u007f\ty"');

    expect(override).toContain('command="node \\"dist\\\\x\\u007f\\ty\\"",');
  });

  it('hands guard-hook.js a payload it judges as it stands: Codex names every shell call Bash, with the command in tool_input.command', () => {
    const payload = (command: string): string =>
      JSON.stringify({
        session_id: '0199a213-81c0-7800-8aa1-bbab2a035a53',
        turn_id: 'turn-1',
        cwd: '/work/sbx',
        hook_event_name: 'PreToolUse',
        model: 'gpt-5-codex',
        tool_name: 'Bash',
        tool_input: { command },
        tool_use_id: 'call_1',
      });

    // Not a Gemini BeforeTool call, so guard-hook.ts judges it as Claude's.
    expect(geminiToClaudeHookPayloads(payload('git push --force origin main'))).toBeNull();
    expect(
      JSON.parse(evaluateHookInput(payload('git push --force origin main'), '/work/sbx') ?? '{}'),
    ).toMatchObject({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' },
    });
    expect(evaluateHookInput(payload('pnpm run test'), '/work/sbx')).toBeNull();
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
    resolveNpmShimMock.mockReset();
    resolveNpmShimMock.mockReturnValue(null);
    stdinEnd = vi.fn();
  });

  function mockExecFileResult(
    error: (Error & { code?: unknown }) | null,
    stdout: string | null,
    stderr = '',
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

  it('closes stdin empty for an argv prompt: with a prompt given, `codex exec` still reads a piped stdin to EOF to append it, so an open pipe would hang the run to the cap', async () => {
    mockExecFileResult(null, '');

    await new CodexCliModel({ repo: '/work/sbx', platform: 'linux' }).invoke(
      'gpt-5-codex',
      'do it',
    );

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

    await new CodexCliModel({ repo: '/work/sbx', platform: 'linux' }).invoke(
      'gpt-5-codex',
      atLimit,
    );

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

    expect(res).toEqual({
      ...parseCodexExecOutput(stdout, 0, 'gpt-5-codex'),
      observed: { elapsedMs: expect.any(Number) },
    });
  });

  it('spawns the default "codex" binary with --json, the model, a workspace-write sandbox, and the prompt last', async () => {
    mockExecFileResult(null, '');

    const model = new CodexCliModel({ repo: '/work/sbx', platform: 'linux' });
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
      detached: true,
    });
  });

  it('inserts "resume <id>" before the prompt when a session id is given', async () => {
    mockExecFileResult(null, '');

    const model = new CodexCliModel({ repo: '/work/sbx', platform: 'linux' });
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

  it('hands the child the containment guard as its PreToolUse hook, ahead of resume and the prompt', async () => {
    mockExecFileResult(null, '');

    await new CodexCliModel({
      repo: '/work/sbx',
      platform: 'linux',
      guardHookCommand: GUARD_COMMAND,
    }).invoke('gpt-5-codex', 'continue', THREAD.thread_id);

    const args = spawnedArgs();
    const at = args.indexOf('-c');
    expect(at).toBeGreaterThan(args.indexOf('exec'));
    expect(args.slice(at, at + 3)).toEqual(codexGuardArgs(GUARD_COMMAND));
    expect(args.slice(-3)).toEqual(['resume', THREAD.thread_id, 'continue']);
  });

  it('runs no hook and bypasses no hook trust without a guard, or with an empty one', async () => {
    mockExecFileResult(null, '');

    await new CodexCliModel({ repo: '/work/sbx', platform: 'linux' }).invoke('gpt-5-codex', 'do');
    await new CodexCliModel({ repo: '/work/sbx', platform: 'linux', guardHookCommand: '' }).invoke(
      'gpt-5-codex',
      'do',
    );

    expect(execFileMock.mock.calls).toHaveLength(2);
    for (const call of execFileMock.mock.calls) {
      const args = (call as [string, string[]])[1];
      expect(args).not.toContain('-c');
      expect(args).not.toContain('--dangerously-bypass-hook-trust');
    }
  });

  describe('on Windows, where npm installs codex as a codex.cmd shim', () => {
    // Under this repo's placeholder home (validate-no-personal-paths.mjs).
    const NPM = 'C:\\Users\\operator\\AppData\\Roaming\\npm';
    const NODE_LAUNCH = {
      bin: 'C:\\Users\\operator\\nodejs\\node.exe',
      args: [`${NPM}\\node_modules\\@openai\\codex\\bin\\codex.js`],
    };

    it("launches the shim's node entry directly, no cmd.exe: node, the entry, then codex's own args", async () => {
      mockExecFileResult(null, '');
      resolveNpmShimMock.mockReturnValue(NODE_LAUNCH);
      const env = { PATH: NPM };

      await new CodexCliModel({ repo: '/work/sbx', platform: 'win32', env }).invoke(
        'gpt-5-codex',
        'do it',
      );

      expect(resolveNpmShimMock).toHaveBeenCalledWith('codex', env);
      const [binary, args] = execFileMock.mock.calls[0] as [string, string[]];
      expect(binary).toBe(NODE_LAUNCH.bin);
      expect(args.slice(0, 3)).toEqual([NODE_LAUNCH.args[0], 'exec', '--json']);
      expect(args[args.indexOf('--model') + 1]).toBe('gpt-5-codex');
    });

    it('keeps a short prompt on argv there, cmd.exe syntax and all, since no shell parses it', async () => {
      mockExecFileResult(null, '');
      resolveNpmShimMock.mockReturnValue(NODE_LAUNCH);
      const hostile = 'fix "the" build & echo %PATH% | more';

      await new CodexCliModel({ repo: '/work/sbx', platform: 'win32' }).invoke(
        'gpt-5-codex',
        hostile,
      );

      const [, args] = execFileMock.mock.calls[0] as [string, string[]];
      expect(args[args.length - 1]).toBe(hostile);
      expect(stdinEnd).toHaveBeenCalledWith();
    });

    it('passes a model name and resume id the cmd.exe route would refuse', async () => {
      mockExecFileResult(null, '');
      resolveNpmShimMock.mockReturnValue(NODE_LAUNCH);

      await new CodexCliModel({ repo: '/work/sbx', platform: 'win32' }).invoke(
        'gpt-5 (high)',
        'continue',
        'nightly run',
      );

      expect(execFileMock.mock.calls).toHaveLength(1);
      const [, args] = execFileMock.mock.calls[0] as [string, string[]];
      expect(args[args.indexOf('--model') + 1]).toBe('gpt-5 (high)');
      expect(args.slice(-3)).toEqual(['resume', 'nightly run', 'continue']);
    });

    it('passes the guard hook as given there, its quotes and braces intact, since no shell parses argv', async () => {
      mockExecFileResult(null, '');
      resolveNpmShimMock.mockReturnValue(NODE_LAUNCH);

      await new CodexCliModel({
        repo: '/work/sbx',
        platform: 'win32',
        guardHookCommand: GUARD_COMMAND,
      }).invoke('gpt-5-codex', 'do it');

      const [binary, args] = execFileMock.mock.calls[0] as [string, string[]];
      expect(binary).toBe(NODE_LAUNCH.bin);
      const at = args.indexOf('-c');
      expect(args.slice(at, at + 3)).toEqual(codexGuardArgs(GUARD_COMMAND));
    });

    it('runs node attached, as the cmd.exe route does: a detached node has no console, so Windows would open one for the native codex the entry spawns', async () => {
      mockExecFileResult(null, '');
      resolveNpmShimMock.mockReturnValue(NODE_LAUNCH);

      await new CodexCliModel({ repo: '/work/sbx', platform: 'win32' }).invoke(
        'gpt-5-codex',
        'do it',
      );

      const [, , options] = execFileMock.mock.calls[0] as [
        string,
        string[],
        Record<string, unknown>,
      ];
      expect(options).toMatchObject({ detached: false, windowsHide: true });
    });

    it('never looks for a shim off Windows', async () => {
      mockExecFileResult(null, '');

      await new CodexCliModel({ repo: '/work/sbx', platform: 'linux' }).invoke(
        'gpt-5-codex',
        'do it',
      );

      expect(resolveNpmShimMock).not.toHaveBeenCalled();
    });

    it("falls back to cmd.exe /c for a shim it cannot read as npm's: execFile cannot launch a .cmd itself (ENOENT), and cmd.exe finds it by PATHEXT", async () => {
      mockExecFileResult(null, '');

      await new CodexCliModel({ repo: '/work/sbx', platform: 'win32' }).invoke(
        'gpt-5-codex',
        'do it',
      );

      const [binary, args] = execFileMock.mock.calls[0] as [string, string[]];
      expect(binary).toBe('cmd.exe');
      expect(args.slice(0, 4)).toEqual(['/c', 'codex', 'exec', '--json']);
      expect(args[args.indexOf('--model') + 1]).toBe('gpt-5-codex');
    });

    it('puts the prompt on stdin behind "-" even when short, so no prompt text ever reaches cmd.exe\'s own parser', async () => {
      mockExecFileResult(null, '');
      const hostile = 'fix "the" build & echo %PATH% | more';

      await new CodexCliModel({ repo: '/work/sbx', platform: 'win32' }).invoke(
        'gpt-5-codex',
        hostile,
        THREAD.thread_id,
      );

      const [, args] = execFileMock.mock.calls[0] as [string, string[]];
      expect(args.some((a) => a.includes('echo'))).toBe(false);
      expect(args.slice(-3)).toEqual(['resume', THREAD.thread_id, '-']);
      expect(stdinEnd).toHaveBeenCalledWith(hostile);
    });

    it('does not detach cmd.exe, the shape the gate already runs its cmd.exe shims in: a detached cmd.exe has no console to hand the node shim', async () => {
      mockExecFileResult(null, '');

      await new CodexCliModel({ repo: '/work/sbx', platform: 'win32' }).invoke(
        'gpt-5-codex',
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

      const res = await new CodexCliModel({ repo: '/work/sbx', platform: 'win32' }).invoke(
        'gpt-5&calc',
        'do it',
      );

      expect(execFileMock.mock.calls).toHaveLength(0);
      expect(res.exitCode).toBe(1);
      expect(res.envelope).toBeNull();
      expect(res.stdout).not.toContain('calc');
      // Nothing ran, so there is no clock to report.
      expect('observed' in res).toBe(false);
    });

    it('never hands cmd.exe a resume id carrying its syntax: that run is refused, and the cold retry goes without it', async () => {
      mockExecFileResult(null, jsonl(THREAD, completed({ input_tokens: 4, output_tokens: 2 })));

      const res = await new CodexCliModel({ repo: '/work/sbx', platform: 'win32' }).invoke(
        'gpt-5-codex',
        'continue',
        'nightly|calc',
      );

      expect(execFileMock.mock.calls).toHaveLength(1);
      const [, args] = execFileMock.mock.calls[0] as [string, string[]];
      expect(args.some((a) => a.includes('calc'))).toBe(false);
      expect(args).not.toContain('resume');
      expect(res.resumed).toBe(false);
    });

    it('refuses a guarded run the cmd.exe route would have to carry, rather than fly it without its guard', async () => {
      mockExecFileResult(null, '');

      const res = await new CodexCliModel({
        repo: '/work/sbx',
        platform: 'win32',
        guardHookCommand: GUARD_COMMAND,
      }).invoke('gpt-5-codex', 'do it', THREAD.thread_id);

      // The cold retry a refusal earns is refused too: nothing ever spawns.
      expect(execFileMock.mock.calls).toHaveLength(0);
      expect(res.exitCode).toBe(1);
      expect(res.envelope).toBeNull();
      expect(res.stdout).toContain('guard hook');
    });

    it('keeps model names with the characters real ones use (dots, colons, slashes) on the cmd.exe route', async () => {
      mockExecFileResult(null, '');

      await new CodexCliModel({ repo: '/work/sbx', platform: 'win32' }).invoke(
        'openai/gpt-5.1-codex:latest',
        'do it',
      );

      const [, args] = execFileMock.mock.calls[0] as [string, string[]];
      expect(args[args.indexOf('--model') + 1]).toBe('openai/gpt-5.1-codex:latest');
    });

    it('spawns an explicit .exe or path binary directly, detached, with a short prompt still on argv', async () => {
      mockExecFileResult(null, '');

      await new CodexCliModel({
        repo: '/work/sbx',
        platform: 'win32',
        binary: 'codex.exe',
      }).invoke('gpt-5-codex', 'do it');

      const [binary, args, options] = execFileMock.mock.calls[0] as [
        string,
        string[],
        Record<string, unknown>,
      ];
      expect(binary).toBe('codex.exe');
      expect(args[0]).toBe('exec');
      expect(args[args.length - 1]).toBe('do it');
      expect(options).toMatchObject({ detached: true });
      expect(stdinEnd).toHaveBeenCalledWith();
    });
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

  describe("death reason — with no envelope, stdout is the CLI's stderr tail, which firing.ts records as deathTail (StreamingClaudeCliModel parity)", () => {
    it('reports why a run died before its turn ended, not the events it printed first', async () => {
      mockExecFileResult(
        Object.assign(new Error('exit 1'), { code: 1 }),
        jsonl(THREAD, TURN_STARTED),
        'Error: unexpected status 401 Unauthorized\n\n',
      );

      const res = await new CodexCliModel({ repo: '/work/sbx' }).invoke('gpt-5-codex', 'do it');

      expect(res.envelope).toBeNull();
      expect(res.stdout).toBe('Error: unexpected status 401 Unauthorized');
      // The thread the wire named still rides out, so the attempt stays resumable.
      expect(res.sessionId).toBe(THREAD.thread_id);
    });

    it('keeps only the last DEATH_TAIL_CHARS of a long stderr: the error line, never a dump', async () => {
      const stderr = `${'warning: a noisy log line\n'.repeat(200)}Error: the real reason\n`;
      mockExecFileResult(Object.assign(new Error('exit 1'), { code: 1 }), '', stderr);

      const res = await new CodexCliModel({ repo: '/work/sbx' }).invoke('gpt-5-codex', 'do it');

      expect(res.stdout).toHaveLength(DEATH_TAIL_CHARS);
      expect(res.stdout.endsWith('Error: the real reason')).toBe(true);
    });

    it("leaves a finished run's stdout as the wire printed it: only a run with no envelope needs a reason", async () => {
      const stdout = jsonl(
        THREAD,
        TURN_STARTED,
        agentMessage('m1', 'done'),
        completed({ input_tokens: 3, output_tokens: 1 }),
      );
      mockExecFileResult(null, stdout, 'warning: a noisy log line\n');

      const res = await new CodexCliModel({ repo: '/work/sbx' }).invoke('gpt-5-codex', 'do it');

      expect(res.envelope?.result).toBe('done');
      expect(res.stdout).toBe(stdout);
    });
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

      const res = await new CodexCliModel({ repo: '/work/sbx', platform: 'linux' }).invoke(
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
      stderr = '',
    ): void {
      execFileMock.mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1] as ExecFileCallback;
        queueMicrotask(() => {
          vi.setSystemTime(Date.now() + elapsedMs);
          cb(error, stdout, stderr);
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
      // The run left no envelope, but the driver's own clock still says how long it held the lane.
      expect(res.observed).toEqual({ elapsedMs: 5000 });
    });

    it('says the wall-clock cap killed it when the CLI left no stderr, never handing on the events it printed', async () => {
      vi.useFakeTimers();
      mockExecFileAfter(
        120_000,
        Object.assign(new Error('killed'), { killed: true }),
        jsonl(THREAD, TURN_STARTED),
      );

      const res = await new CodexCliModel({ repo: '/work/sbx', timeoutMs: 120_000 }).invoke(
        'gpt-5-codex',
        'do it',
      );

      expect(res.stdout).toBe(capDeathNote('wall-clock', 120_000, 120_000));
    });

    it("keeps the CLI's own stderr over the cap note when the killed run left some", async () => {
      vi.useFakeTimers();
      mockExecFileAfter(
        120_000,
        Object.assign(new Error('killed'), { killed: true }),
        jsonl(THREAD, TURN_STARTED),
        'Error: model request still pending\n',
      );

      const res = await new CodexCliModel({ repo: '/work/sbx', timeoutMs: 120_000 }).invoke(
        'gpt-5-codex',
        'do it',
      );

      expect(res.stdout).toBe('Error: model request still pending');
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

    it('reports its own clock as observed.elapsedMs and no turn count, since no event carries a duration or marks a model turn', async () => {
      // Without the driver's clock, every firing flown on Codex recorded
      // `durationMs: null`, a complete run included. Turns stay absent: the
      // wire has items and one turn per exec, never a count of model requests.
      vi.useFakeTimers();
      mockExecFileAfter(
        7000,
        null,
        jsonl(
          THREAD,
          TURN_STARTED,
          agentMessage('m1', 'done'),
          completed({ input_tokens: 10, output_tokens: 2 }),
        ),
      );

      const res = await new CodexCliModel({ repo: '/work/sbx' }).invoke('gpt-5-codex', 'do it');

      expect(res.envelope?.result).toBe('done');
      expect(res.envelope?.durationMs).toBeNull();
      expect(res.observed).toEqual({ elapsedMs: 7000 });
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
      const stdout = Object.assign(new EventEmitter(), { destroy: vi.fn() });
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
          stderr: { destroy: vi.fn() },
          kill,
          stdin: Object.assign(new EventEmitter(), { end: stdinEnd }),
        };
      });
      return { kill, stdout, exitCleanly: (out) => settle(null, out, '') };
    }

    it("closes its end of the pipes before the kill, as execFile's own timeout does: behind cmd.exe the node shim outlives the kill and holds them open, so a bare kill never settles", async () => {
      vi.useFakeTimers();
      // execFile settles on 'close': the killed process has exited AND every
      // pipe is closed. The grandchild keeps the pipes open, so only our side
      // closing them lets the call settle.
      let settle: ExecFileCallback = () => undefined;
      let exited = false;
      let closed = false;
      const open = { stdout: true, stderr: true };
      const closeIfDone = (): void => {
        if (closed || !exited || open.stdout || open.stderr) return;
        closed = true;
        settle(Object.assign(new Error('killed'), { killed: true, code: 1 }), jsonl(THREAD), '');
      };
      const pipe = (name: 'stdout' | 'stderr'): EventEmitter =>
        Object.assign(new EventEmitter(), {
          destroy: vi.fn(() => {
            open[name] = false;
            queueMicrotask(closeIfDone);
          }),
        });
      execFileMock.mockImplementation((...args: unknown[]) => {
        settle = args[args.length - 1] as ExecFileCallback;
        return {
          pid: 4321,
          stdout: pipe('stdout'),
          stderr: pipe('stderr'),
          kill: vi.fn(() => {
            exited = true;
            queueMicrotask(closeIfDone);
            return true;
          }),
          stdin: Object.assign(new EventEmitter(), { end: stdinEnd }),
        };
      });
      let settled = false;

      const pending = new CodexCliModel({
        repo: '/work/sbx',
        platform: 'win32',
        idleTimeoutMs: 1000,
      })
        .invoke('gpt-5-codex', 'do it')
        .then((res) => {
          settled = true;
          return res;
        });
      await vi.advanceTimersByTimeAsync(1000);

      // Asserted before awaiting: with the pipes left open the promise never settles.
      expect(settled).toBe(true);
      const res = await pending;
      expect(res.timedOut).toBe(true);
      expect(res.sessionId).toBe(THREAD.thread_id);
    });

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

    it('says the idle cap killed it when the CLI left no stderr', async () => {
      vi.useFakeTimers();
      const child = mockLiveChild(jsonl(THREAD, TURN_STARTED));

      const pending = new CodexCliModel({ repo: '/work/sbx', idleTimeoutMs: 60_000 }).invoke(
        'gpt-5-codex',
        'do it',
      );
      await vi.advanceTimersByTimeAsync(60_000);
      expect(child.kill).toHaveBeenCalledTimes(1);
      const res = await pending;

      expect(res.stdout).toBe(capDeathNote('idle', 60_000, 60_000));
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

  /** A child whose stdout the test streams by hand; `exit` settles
   *  execFile's callback with what the whole run printed. */
  function mockStreamingChild(): {
    readonly stdout: EventEmitter;
    readonly exit: (error: (Error & { code?: unknown }) | null, printed: string) => void;
  } {
    const stdout = new EventEmitter();
    let settle: ExecFileCallback = () => undefined;
    execFileMock.mockImplementation((...args: unknown[]) => {
      settle = args[args.length - 1] as ExecFileCallback;
      return { pid: 4321, stdout, stdin: Object.assign(new EventEmitter(), { end: stdinEnd }) };
    });
    return { stdout, exit: (error, printed) => settle(error, printed, '') };
  }

  describe('onWebSearch — each completed web_search is audited as its line arrives (THREAT-MODEL T6, GeminiCliModel parity)', () => {
    const COMMAND = {
      type: 'item.completed',
      item: { id: 'item_9', type: 'command_execution', command: 'ls', status: 'completed' },
    };

    it('reports each search the moment its item.completed line lands, in wire order, and never again at settle', async () => {
      const child = mockStreamingChild();
      const searches: WebSearchAudit[] = [];
      const pending = new CodexCliModel({
        repo: '/work/sbx',
        platform: 'linux',
        onWebSearch: (search) => searches.push(search),
      }).invoke('gpt-5-codex', 'do it');

      const first = jsonl(
        THREAD,
        { type: 'item.started', item: { id: 'item_1', type: 'web_search', query: '' } },
        webSearch('item_1', 'first query', { type: 'search', query: 'first query' }),
      );
      child.stdout.emit('data', first);
      // Asserted before the run ends: the query has already left by now.
      expect(searches.map((s) => s.query)).toEqual(['first query']);
      // A line torn across two chunks is read once it is whole.
      const second = jsonl(
        webSearch('item_2', 'second query', { type: 'search', query: 'second query' }),
        COMMAND,
      );
      child.stdout.emit('data', second.slice(0, 30));
      expect(searches).toHaveLength(1);
      child.stdout.emit('data', second.slice(30));
      expect(searches.map((s) => s.query)).toEqual(['first query', 'second query']);

      const last = jsonl(agentMessage('item_10', 'done'), completed({ output_tokens: 1 }));
      child.stdout.emit('data', last);
      child.exit(null, first + second + last);
      const res = await pending;

      expect(searches.map((s) => s.query)).toEqual(['first query', 'second query']);
      expect(res.envelope).toMatchObject({ isError: false, result: 'done' });
    });

    it('audits a last line that came with no newline once the run settles, even a run that died', async () => {
      const child = mockStreamingChild();
      const searches: WebSearchAudit[] = [];
      const pending = new CodexCliModel({
        repo: '/work/sbx',
        platform: 'linux',
        onWebSearch: (search) => searches.push(search),
      }).invoke('gpt-5-codex', 'do it');

      const printed = jsonl(THREAD) + JSON.stringify(webSearch('item_1', 'unterminated query'));
      child.stdout.emit('data', printed);
      expect(searches).toEqual([]);
      child.exit(Object.assign(new Error('killed'), { killed: true, code: 1 }), printed);
      await pending;

      expect(searches.map((s) => s.query)).toEqual(['unterminated query']);
    });

    it('settles the run even when the audit sink throws on that last line', async () => {
      const child = mockStreamingChild();
      const pending = new CodexCliModel({
        repo: '/work/sbx',
        platform: 'linux',
        onWebSearch: () => {
          throw new Error('events table is locked');
        },
      }).invoke('gpt-5-codex', 'do it');

      const printed = JSON.stringify(webSearch('item_1', 'unterminated query'));
      child.stdout.emit('data', printed);
      expect(() => child.exit(Object.assign(new Error('exit 1'), { code: 1 }), printed)).toThrow(
        'events table is locked',
      );

      await expect(pending).resolves.toMatchObject({ exitCode: 1, envelope: null });
    });
  });

  describe('onActivity — each tool call reaches the activity timeline as its line arrives (StreamingClaudeCliModel parity)', () => {
    it('reports each call the moment its line lands, with its reasoning, and never again at settle', async () => {
      const child = mockStreamingChild();
      const activities: Activity[] = [];
      const pending = new CodexCliModel({
        repo: '/work/sbx',
        platform: 'linux',
        onActivity: (activity) => activities.push(activity),
      }).invoke('gpt-5-codex', 'do it');

      const first = jsonl(
        THREAD,
        agentMessage('item_1', 'Checking the tests.'),
        itemStarted(command('item_2', 'pnpm test')),
      );
      child.stdout.emit('data', first);
      // Asserted before the run ends: the step is on the timeline already.
      expect(activities).toEqual([
        {
          tool: 'command_execution',
          target: 'pnpm test',
          kind: 'command',
          reasoning: 'Checking the tests.',
          model: 'gpt-5-codex',
          tokensIn: null,
          tokensOut: null,
        },
      ]);
      // A line torn across two chunks is read once it is whole.
      const second = jsonl(
        itemCompleted({ ...command('item_2', 'pnpm test'), exit_code: 0, status: 'completed' }),
        itemStarted({
          id: 'item_3',
          type: 'file_change',
          changes: [{ path: 'a.ts', kind: 'update' }],
        }),
      );
      child.stdout.emit('data', second.slice(0, second.length - 20));
      expect(activities).toHaveLength(1);
      child.stdout.emit('data', second.slice(second.length - 20));
      expect(activities.map((a) => [a.target, a.reasoning])).toEqual([
        ['pnpm test', 'Checking the tests.'],
        ['a.ts', null],
      ]);

      const last = jsonl(agentMessage('item_4', 'done'), completed({ output_tokens: 1 }));
      child.stdout.emit('data', last);
      child.exit(null, first + second + last);
      const res = await pending;

      expect(activities).toHaveLength(2);
      expect(res.envelope).toMatchObject({ isError: false, result: 'done' });
    });

    it('feeds the timeline and the web-search audit from the same lines when both are given', async () => {
      const child = mockStreamingChild();
      const activities: Activity[] = [];
      const searches: WebSearchAudit[] = [];
      const pending = new CodexCliModel({
        repo: '/work/sbx',
        platform: 'linux',
        onActivity: (activity) => activities.push(activity),
        onWebSearch: (search) => searches.push(search),
      }).invoke('gpt-5-codex', 'do it');

      const printed = jsonl(
        THREAD,
        webSearch('item_1', 'vitest fake timers', { type: 'search', query: 'vitest fake timers' }),
      );
      child.stdout.emit('data', printed);
      child.exit(null, printed);
      await pending;

      expect(activities.map((a) => [a.tool, a.kind, a.target])).toEqual([
        ['web_search', 'search', 'vitest fake timers'],
      ]);
      expect(searches.map((s) => s.query)).toEqual(['vitest fake timers']);
    });

    it('reads a last line that came with no newline once the run settles, even a run that died', async () => {
      const child = mockStreamingChild();
      const activities: Activity[] = [];
      const pending = new CodexCliModel({
        repo: '/work/sbx',
        platform: 'linux',
        onActivity: (activity) => activities.push(activity),
      }).invoke('gpt-5-codex', 'do it');

      const printed = jsonl(THREAD) + JSON.stringify(itemStarted(command('item_1', 'pnpm build')));
      child.stdout.emit('data', printed);
      expect(activities).toEqual([]);
      child.exit(Object.assign(new Error('killed'), { killed: true, code: 1 }), printed);
      await pending;

      expect(activities.map((a) => [a.tool, a.target, a.model])).toEqual([
        ['command_execution', 'pnpm build', 'gpt-5-codex'],
      ]);
    });
  });
});
