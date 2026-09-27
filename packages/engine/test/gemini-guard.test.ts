// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  GEMINI_GUARD_HOOK_NAME,
  GEMINI_GUARDED_TOOLS,
  buildGeminiFlightSettings,
  geminiToClaudeHookPayloads,
  toGeminiDenyDecision,
} from '../src/gemini-guard.js';
import { buildDenyDecision, buildFlightSettings, evaluateHookInput } from '../src/guard.js';

const ROOT = '/work/sbx';

/** A Gemini `BeforeTool` hook payload (`BeforeToolInput`, gemini-cli `hooks/types.ts`). */
function beforeTool(toolName: string, toolInput: unknown): string {
  return JSON.stringify({
    session_id: 'sess-1',
    transcript_path: '/tmp/t.json',
    cwd: ROOT,
    hook_event_name: 'BeforeTool',
    timestamp: '2026-09-27T00:00:00Z',
    tool_name: toolName,
    tool_input: toolInput,
  });
}

function payloads(toolName: string, toolInput: unknown): unknown[] {
  const raw = geminiToClaudeHookPayloads(beforeTool(toolName, toolInput));
  return (raw ?? []).map((p) => JSON.parse(p) as unknown);
}

/** The guard's verdict on a Gemini call: the first deny among its translated payloads. */
function verdict(toolName: string, toolInput: unknown): string | null {
  const raw = geminiToClaudeHookPayloads(beforeTool(toolName, toolInput)) ?? [];
  for (const payload of raw) {
    const decision = evaluateHookInput(payload, ROOT);
    if (decision !== null) return decision;
  }
  return null;
}

describe('geminiToClaudeHookPayloads', () => {
  it('answers null for anything that is not a Gemini BeforeTool payload', () => {
    expect(
      geminiToClaudeHookPayloads(JSON.stringify({ tool_name: 'Bash', tool_input: {} })),
    ).toBeNull();
    expect(
      geminiToClaudeHookPayloads(
        JSON.stringify({ hook_event_name: 'AfterTool', tool_name: 'run_shell_command' }),
      ),
    ).toBeNull();
    expect(geminiToClaudeHookPayloads('not json')).toBeNull();
    expect(geminiToClaudeHookPayloads('[{"hook_event_name":"BeforeTool"}]')).toBeNull();
    expect(geminiToClaudeHookPayloads('null')).toBeNull();
  });

  it('reads the shell tool as a Bash call carrying the same command, run from its dir_path', () => {
    expect(payloads('run_shell_command', { command: 'pnpm test' })).toEqual([
      { tool_name: 'Bash', tool_input: { command: 'pnpm test' } },
    ]);
    expect(payloads('run_shell_command', { command: 'pnpm test', dir_path: 'apps' })).toEqual([
      { tool_name: 'Bash', tool_input: { command: 'cd "apps" && pnpm test' } },
    ]);
    expect(payloads('run_shell_command', { command: 'pnpm test', dir_path: '' })).toEqual([
      { tool_name: 'Bash', tool_input: { command: 'pnpm test' } },
    ]);
  });

  it('maps each file tool onto its Claude counterpart and its path fields', () => {
    expect(payloads('read_file', { file_path: 'a.ts' })).toEqual([
      { tool_name: 'Read', tool_input: { file_path: 'a.ts' } },
    ]);
    expect(payloads('write_file', { file_path: 'a.ts', content: 'x' })).toEqual([
      { tool_name: 'Write', tool_input: { file_path: 'a.ts' } },
    ]);
    expect(payloads('replace', { file_path: 'a.ts', old_string: 'x' })).toEqual([
      { tool_name: 'Edit', tool_input: { file_path: 'a.ts' } },
    ]);
    expect(payloads('glob', { pattern: '**/*.ts', dir_path: 'src' })).toEqual([
      { tool_name: 'Glob', tool_input: { pattern: '**/*.ts', path: 'src' } },
    ]);
    for (const grep of ['grep_search', 'search_file_content']) {
      expect(payloads(grep, { pattern: 'TODO', dir_path: 'src' })).toEqual([
        { tool_name: 'Grep', tool_input: { pattern: 'TODO', path: 'src' } },
      ]);
    }
    expect(payloads('list_directory', { dir_path: 'src' })).toEqual([
      { tool_name: 'Glob', tool_input: { path: 'src' } },
    ]);
  });

  it('reads every string include of read_many_files as its own Read, skipping the rest', () => {
    expect(payloads('read_many_files', { include: ['a.ts', 7, 'docs/**'] })).toEqual([
      { tool_name: 'Read', tool_input: { file_path: 'a.ts' } },
      { tool_name: 'Read', tool_input: { file_path: 'docs/**' } },
    ]);
    expect(payloads('read_many_files', { include: 'a.ts' })).toEqual([]);
  });

  it('reads every URL in a web_fetch prompt as its own WebFetch', () => {
    expect(
      payloads('web_fetch', {
        prompt: 'Compare https://a.example/x and http://b.example/y please',
      }),
    ).toEqual([
      { tool_name: 'WebFetch', tool_input: { url: 'https://a.example/x' } },
      { tool_name: 'WebFetch', tool_input: { url: 'http://b.example/y' } },
    ]);
    expect(payloads('web_fetch', { prompt: 42 })).toEqual([]);
  });

  it("judges exactly the tokens web_fetch's own parsePrompt would fetch", () => {
    expect(payloads('web_fetch', { prompt: 'get HTTP://127.0.0.1:7777/api now' })).toEqual([
      { tool_name: 'WebFetch', tool_input: { url: 'HTTP://127.0.0.1:7777/api' } },
    ]);
    expect(
      payloads('web_fetch', {
        prompt: 'fetch localhost:7777/admin ftp://a.example/f (https://a.example/x)',
      }),
    ).toEqual([]);
  });

  it('yields nothing for a tool the guard does not judge, and survives a missing tool_input', () => {
    expect(payloads('mcp_github_create_issue', { title: 'x' })).toEqual([]);
    expect(payloads('save_memory', { fact: 'x' })).toEqual([]);
    expect(
      geminiToClaudeHookPayloads(
        JSON.stringify({ hook_event_name: 'BeforeTool', tool_name: 'run_shell_command' }),
      ),
    ).toEqual([JSON.stringify({ tool_name: 'Bash', tool_input: {} })]);
  });

  it('gives every guarded tool at least one payload, so the matcher and the mapping agree', () => {
    const input = {
      command: 'ls',
      file_path: 'a.ts',
      dir_path: 'src',
      pattern: 'x',
      include: ['a.ts'],
      prompt: 'https://a.example',
    };
    for (const tool of GEMINI_GUARDED_TOOLS) {
      expect(payloads(tool, input).length, tool).toBeGreaterThan(0);
    }
  });
});

describe('the guard judging a Gemini call', () => {
  it('denies a shell command that escapes the worktree or rewrites history', () => {
    expect(verdict('run_shell_command', { command: 'cat /etc/passwd' })).toContain('CONTAINMENT');
    expect(
      verdict('run_shell_command', { command: 'git push --force origin main' }),
    ).not.toBeNull();
  });

  it('lets an in-bounds shell command through with no decision', () => {
    expect(verdict('run_shell_command', { command: 'pnpm test' })).toBeNull();
    expect(verdict('run_shell_command', { command: 'pnpm test', dir_path: 'apps' })).toBeNull();
  });

  it('denies a relative command run from a dir_path outside the worktree', () => {
    expect(verdict('run_shell_command', { command: 'rm -rf *', dir_path: '/etc' })).toContain(
      'CONTAINMENT',
    );
  });

  it('denies an upper-case-scheme loopback URL the tool would still fetch', () => {
    expect(verdict('web_fetch', { prompt: 'get HTTP://127.0.0.1:7777/api' })).toContain(
      'SSRF GUARD',
    );
  });

  it('denies a file tool aimed outside the worktree and allows one inside it', () => {
    expect(verdict('write_file', { file_path: '/etc/hosts', content: 'x' })).toContain(
      '/etc/hosts',
    );
    expect(verdict('read_file', { file_path: `${ROOT}/src/a.ts` })).toBeNull();
  });

  it('applies read hygiene to generated and vendored paths', () => {
    expect(verdict('read_file', { file_path: 'node_modules/x/index.js' })).toContain(
      'READ HYGIENE',
    );
    expect(verdict('read_many_files', { include: ['src/a.ts', 'dist/**'] })).toContain(
      'READ HYGIENE',
    );
  });

  it('denies a web_fetch whose prompt names a loopback target', () => {
    expect(
      verdict('web_fetch', {
        prompt: 'summarize https://example.com and http://127.0.0.1:7777/api',
      }),
    ).toContain('SSRF GUARD');
  });
});

describe('toGeminiDenyDecision', () => {
  it("carries a Claude deny's reason into Gemini's decision shape", () => {
    expect(JSON.parse(toGeminiDenyDecision(buildDenyDecision('outside the repo')))).toEqual({
      decision: 'deny',
      reason: 'outside the repo',
    });
  });

  it('keeps the text itself as the reason when it is not a Claude decision', () => {
    expect(JSON.parse(toGeminiDenyDecision('plain words'))).toEqual({
      decision: 'deny',
      reason: 'plain words',
    });
    expect(JSON.parse(toGeminiDenyDecision('{"hookSpecificOutput":{}}'))).toEqual({
      decision: 'deny',
      reason: '{"hookSpecificOutput":{}}',
    });
  });
});

describe('buildGeminiFlightSettings', () => {
  // Drive paths built at runtime, as guard.test.ts's `p` does, so none sits in the source.
  const drive = (letter: string, rest: string): string => `${letter}:${rest}`;
  const winRoot = drive('C', '\\target\\wt');
  const winScript = drive('C', '\\target\\dist\\guard-hook.js');
  const settings = buildGeminiFlightSettings(winRoot, winScript);
  const entry = settings.hooks.BeforeTool[0];

  it("runs the same guard command Claude's settings do, with the timeout in milliseconds", () => {
    const claudeHook = buildFlightSettings(winRoot, winScript).hooks.PreToolUse[0]?.hooks[0];
    expect(settings.hooksConfig).toEqual({ enabled: true });
    expect(settings.hooks.BeforeTool).toHaveLength(1);
    expect(entry?.hooks).toEqual([
      {
        type: 'command',
        name: GEMINI_GUARD_HOOK_NAME,
        command: claudeHook?.command,
        timeout: (claudeHook?.timeout ?? 0) * 1000,
      },
    ]);
    expect(entry?.hooks[0]?.command).toBe(
      `node "${drive('C', '/target/dist/guard-hook.js')}" "${drive('C', '/target/wt')}"`,
    );
  });

  it('matches exactly the guarded tool names, never a name that merely contains one', () => {
    const matcher = new RegExp(entry?.matcher ?? '');
    for (const tool of GEMINI_GUARDED_TOOLS) expect(matcher.test(tool), tool).toBe(true);
    expect(matcher.test('mcp_run_shell_command_proxy')).toBe(false);
    expect(matcher.test('glob2')).toBe(false);
    expect(matcher.test('save_memory')).toBe(false);
  });
});
