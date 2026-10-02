// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { codexPatchPaths, codexPatchToClaudeHookPayloads } from '../src/codex-guard.js';
import { evaluateHookInput } from '../src/guard.js';

const ROOT = '/work/sbx';

/** A Codex `PreToolUse` hook payload (`pre-tool-use.command.input.schema.json`). */
function preToolUse(toolName: string, toolInput: unknown, cwd: unknown = ROOT): string {
  return JSON.stringify({
    session_id: 'thread-1',
    turn_id: 'turn-1',
    transcript_path: null,
    cwd,
    hook_event_name: 'PreToolUse',
    model: 'gpt-5-codex',
    permission_mode: 'bypassPermissions',
    tool_name: toolName,
    tool_use_id: 'call-1',
    tool_input: toolInput,
  });
}

function patch(...lines: string[]): string {
  return ['*** Begin Patch', ...lines, '*** End Patch'].join('\n');
}

function payloads(patchText: string, cwd?: unknown): unknown[] {
  const raw = codexPatchToClaudeHookPayloads(
    preToolUse('apply_patch', { command: patchText }, cwd),
    ROOT,
  );
  return (raw ?? []).map((p) => JSON.parse(p) as unknown);
}

/** The guard's verdict on an `apply_patch` call: the first deny among its translated payloads. */
function verdict(patchText: string, cwd?: unknown): string | null {
  const raw =
    codexPatchToClaudeHookPayloads(preToolUse('apply_patch', { command: patchText }, cwd), ROOT) ??
    [];
  for (const payload of raw) {
    const decision = evaluateHookInput(payload, ROOT);
    if (decision !== null) return decision;
  }
  return null;
}

describe('codexPatchPaths — the files a Codex patch names, read as its own parser reads them', () => {
  it('reads every Add, Delete and Update header, and an Update hunk’s Move to', () => {
    expect(
      codexPatchPaths(
        patch(
          '*** Add File: src/new.ts',
          '+export const x = 1;',
          '*** Delete File: src/gone.ts',
          '*** Update File: src/old.ts',
          '*** Move to: src/moved.ts',
          '@@',
          '-a',
          '+b',
        ),
      ),
    ).toEqual([
      { tool: 'Write', path: 'src/new.ts' },
      { tool: 'Edit', path: 'src/gone.ts' },
      { tool: 'Edit', path: 'src/old.ts' },
      { tool: 'Write', path: 'src/moved.ts' },
    ]);
  });

  it('reads nothing before *** Begin Patch, so a heredoc wrapper adds no path', () => {
    expect(
      codexPatchPaths(
        ["<<'EOF'", '*** Begin Patch', '*** Add File: a.txt', '+x', '*** End Patch', 'EOF'].join(
          '\n',
        ),
      ),
    ).toEqual([{ tool: 'Write', path: 'a.txt' }]);
    expect(codexPatchPaths('*** Add File: /etc/passwd\n+x')).toEqual([]);
    expect(codexPatchPaths('')).toEqual([]);
  });

  it('takes a header from the whole trimmed line outside an Update hunk, CRLF included', () => {
    expect(
      codexPatchPaths(
        ['*** Begin Patch\r', '   *** Add File: a.txt  \r', '+x\r', '*** End Patch\r'].join('\n'),
      ),
    ).toEqual([{ tool: 'Write', path: 'a.txt' }]);
  });

  it('trims what Rust’s str::trim trims, NEL included, so a NEL-led header is still read', () => {
    expect(codexPatchPaths(patch('\u0085*** Add File: /etc/cron.d/x', '+x'))).toEqual([
      { tool: 'Write', path: '/etc/cron.d/x' },
    ]);
  });

  it('reads a line of a long blank run that does not end it in linear time', () => {
    const stall = `${' '.repeat(200_000)}x`;
    const started = performance.now();
    expect(codexPatchPaths(patch(stall, '*** Add File: a.txt', '+x'))).toEqual([
      { tool: 'Write', path: 'a.txt' },
    ]);
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it('reads an indented header inside an Update hunk as context, as Codex does', () => {
    expect(
      codexPatchPaths(
        patch('*** Update File: a.md', '@@', ' *** Add File: /etc/passwd', '-old', '+new'),
      ),
    ).toEqual([{ tool: 'Edit', path: 'a.md' }]);
  });

  it('reads an unindented header that ends an Update hunk, and added lines never', () => {
    expect(
      codexPatchPaths(
        patch(
          '*** Update File: a.md',
          '@@',
          '+*** Add File: /etc/passwd',
          '*** Update File: b.md',
          '@@',
          '-x',
          '+y',
        ),
      ),
    ).toEqual([
      { tool: 'Edit', path: 'a.md' },
      { tool: 'Edit', path: 'b.md' },
    ]);
  });

  it('reads a second patch after *** End Patch too, though Codex would refuse it', () => {
    expect(
      codexPatchPaths(
        `${patch('*** Add File: a.txt', '+x')}\n${patch('*** Add File: /etc/x', '+y')}`,
      ),
    ).toEqual([
      { tool: 'Write', path: 'a.txt' },
      { tool: 'Write', path: '/etc/x' },
    ]);
  });
});

describe('codexPatchToClaudeHookPayloads', () => {
  it('answers null for anything that is not a Codex apply_patch PreToolUse payload', () => {
    expect(
      codexPatchToClaudeHookPayloads(preToolUse('Bash', { command: 'pnpm test' }), ROOT),
    ).toBeNull();
    expect(
      codexPatchToClaudeHookPayloads(
        JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'apply_patch' }),
        ROOT,
      ),
    ).toBeNull();
    expect(
      codexPatchToClaudeHookPayloads(
        JSON.stringify({ hook_event_name: 'BeforeTool', tool_name: 'apply_patch' }),
        ROOT,
      ),
    ).toBeNull();
    expect(codexPatchToClaudeHookPayloads('not json', ROOT)).toBeNull();
    expect(codexPatchToClaudeHookPayloads('null', ROOT)).toBeNull();
    expect(codexPatchToClaudeHookPayloads('[]', ROOT)).toBeNull();
  });

  it('answers no payloads for an apply_patch with no patch text to read', () => {
    for (const toolInput of [{}, { command: 42 }, null, 'patch']) {
      expect(codexPatchToClaudeHookPayloads(preToolUse('apply_patch', toolInput), ROOT)).toEqual(
        [],
      );
    }
  });

  it('turns each file into a Claude Write or Edit of its path, resolved against the turn cwd', () => {
    expect(
      payloads(
        patch('*** Add File: src/new.ts', '+x', '*** Update File: ./src/old.ts', '@@', '-a', '+b'),
      ),
    ).toEqual([
      { tool_name: 'Write', tool_input: { file_path: '/work/sbx/src/new.ts' } },
      { tool_name: 'Edit', tool_input: { file_path: '/work/sbx/src/old.ts' } },
    ]);
    expect(payloads(patch('*** Delete File: x.ts'), '/work/sbx/apps')).toEqual([
      { tool_name: 'Edit', tool_input: { file_path: '/work/sbx/apps/x.ts' } },
    ]);
  });

  it('resolves against the target root when the payload carries no absolute cwd', () => {
    for (const cwd of [undefined, '', 'relative/dir', 7]) {
      expect(payloads(patch('*** Delete File: x.ts'), cwd)).toEqual([
        { tool_name: 'Edit', tool_input: { file_path: '/work/sbx/x.ts' } },
      ]);
    }
  });

  it('resolves a Windows cwd with Windows path rules, wherever the hook runs', () => {
    const winRoot = 'C:\\Users\\operator\\sbx';
    const raw = codexPatchToClaudeHookPayloads(
      preToolUse(
        'apply_patch',
        { command: patch('*** Add File: src\\a.ts', '+x', '*** Add File: ..\\b.ts', '+y') },
        winRoot,
      ),
      winRoot,
    );
    const translated = (raw ?? []).map((p) => JSON.parse(p) as unknown);
    expect(translated).toEqual([
      { tool_name: 'Write', tool_input: { file_path: 'C:\\Users\\operator\\sbx\\src\\a.ts' } },
      { tool_name: 'Write', tool_input: { file_path: 'C:\\Users\\operator\\b.ts' } },
    ]);
    expect(evaluateHookInput(raw?.[0] ?? '', winRoot)).toBeNull();
    expect(evaluateHookInput(raw?.[1] ?? '', winRoot)).toContain('CONTAINMENT');
  });
});

describe('the guard’s verdict on a Codex apply_patch', () => {
  it('allows a patch that stays inside the target', () => {
    expect(
      verdict(
        patch(
          '*** Add File: src/new.ts',
          '+x',
          '*** Update File: src/old.ts',
          '*** Move to: lib/old.ts',
          '@@',
          '-a',
          '+b',
        ),
      ),
    ).toBeNull();
  });

  it('denies a patch that adds, edits, deletes or moves a file outside the target', () => {
    for (const lines of [
      ['*** Add File: /etc/cron.d/x', '+x'],
      ['*** Update File: ../fleet-4/src/a.ts', '@@', '-a', '+b'],
      ['*** Delete File: ../../.bashrc'],
      ['*** Update File: src/a.ts', '*** Move to: ../a.ts', '@@', '-a', '+b'],
      ['*** Add File: src/../../escape.ts', '+x'],
    ]) {
      const decision = verdict(patch(...lines));
      expect(decision, lines.join(' / ')).not.toBeNull();
      expect(decision).toContain('CONTAINMENT');
      expect(decision).toContain('permissionDecision');
    }
  });

  it('names the first escaping file in its deny', () => {
    const decision = verdict(
      patch(
        '*** Add File: ok.ts',
        '+x',
        '*** Add File: /etc/a',
        '+y',
        '*** Add File: /etc/b',
        '+z',
      ),
    );
    expect(decision).toContain('/etc/a');
    expect(decision).not.toContain('/etc/b');
  });
});
