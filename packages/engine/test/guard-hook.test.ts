// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureWorktree } from '../src/adapters/worktree.js';

/**
 * guard-hook.ts wires the real `dns.promises.lookup` for the WebFetch
 * DNS-rebinding check (THREAT-MODEL.md T6) — mocked here so the wiring is
 * provable without a real network dependency; `checkWebFetchDnsRebinding`
 * itself (guard.test.ts) already covers the pure decision logic against a
 * fake resolver.
 */
const lookupMock = vi.fn();
vi.mock('node:dns/promises', () => ({
  lookup: (hostname: string, opts?: unknown) => lookupMock(hostname, opts),
}));

/**
 * guard-hook.ts is the stdin/stdout process shim around the pure, fully-tested
 * evaluateHookInput (guard.ts) — excluded from the coverage threshold like the
 * other CLI entry shims (vitest.config.ts), but its own wiring (stdin buffering,
 * the fail-open empty-targetRoot path, exit-always-0) is real behavior worth
 * pinning directly, since it's what Claude Code actually invokes as the
 * PreToolUse hook.
 */

class FakeStdin extends EventEmitter {
  encoding: string | null = null;
  setEncoding(enc: string): void {
    this.encoding = enc;
  }
}

interface RunResult {
  readonly output: string;
  readonly exitCodes: readonly (number | undefined)[];
  readonly stdinEncoding: string | null;
}

/**
 * Import a fresh instance of guard-hook.ts with process.argv/stdin/stdout/exit
 * mocked, feed it stdin chunks + end, and capture what it wrote/exited with.
 * `targetRootArg` of `undefined` omits argv[2] entirely, so `process.argv[2]`
 * is itself `undefined` — the only way to exercise the `?? ''` fallback on
 * guard-hook.ts's first line rather than an explicit empty string.
 *
 * guard-hook.ts's stdin `'end'` handler is async (the WebFetch DNS-rebinding
 * check needs to await a real lookup), so `process.exit` can now be invoked
 * after an `await` — throwing there would only reject an unawaited promise,
 * not unwind synchronously the way the pre-async-handler version relied on.
 * The mock below just records instead; guard-hook.ts's own explicit `return`
 * after every `process.exit(0)` call keeps control flow correct without
 * that crutch. `vi.waitFor` polls until the (possibly still-pending) handler
 * has recorded its one exit code.
 */
async function runGuardHook(
  targetRootArg: string | undefined,
  chunks: readonly string[],
): Promise<RunResult> {
  vi.resetModules();

  const fakeStdin = new FakeStdin();
  const originalArgv = process.argv;
  const originalStdin = process.stdin;
  const originalExit = process.exit;
  const originalWrite = process.stdout.write.bind(process.stdout);

  let output = '';
  const exitCodes: (number | undefined)[] = [];

  process.argv =
    targetRootArg === undefined
      ? [originalArgv[0] ?? 'node', 'guard-hook.js']
      : [originalArgv[0] ?? 'node', 'guard-hook.js', targetRootArg];
  Object.defineProperty(process, 'stdin', { value: fakeStdin, configurable: true });
  process.stdout.write = ((chunk: string) => {
    output += chunk;
    return true;
  }) as typeof process.stdout.write;
  process.exit = ((code?: number) => {
    exitCodes.push(code);
  }) as never;

  try {
    await import('../src/guard-hook.js');
    for (const chunk of chunks) fakeStdin.emit('data', chunk);
    fakeStdin.emit('end');
    await vi.waitFor(() => {
      expect(exitCodes.length).toBeGreaterThan(0);
    });
  } finally {
    process.argv = originalArgv;
    Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true });
    process.exit = originalExit;
    process.stdout.write = originalWrite;
  }

  return { output, exitCodes, stdinEncoding: fakeStdin.encoding };
}

beforeEach(() => {
  lookupMock.mockReset();
});

afterEach(() => {
  vi.resetModules();
});

describe('guard-hook stdin/stdout shim', () => {
  it('prints the deny JSON and exits 0 for an escaping Bash command', async () => {
    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'cat /etc/passwd' },
    });
    const { output, exitCodes, stdinEncoding } = await runGuardHook('/work/sbx', [payload]);
    expect(output).toContain('"permissionDecision":"deny"');
    expect(output).toContain('/work/sbx');
    expect(exitCodes).toEqual([0]);
    expect(stdinEncoding).toBe('utf8');
  });

  it('prints nothing and exits 0 for an in-bounds command (no decision)', async () => {
    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'pnpm test' },
    });
    const { output, exitCodes } = await runGuardHook('/work/sbx', [payload]);
    expect(output).toBe('');
    expect(exitCodes).toEqual([0]);
  });

  it('buffers multiple stdin chunks before deciding', async () => {
    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'cat /etc/passwd' },
    });
    const half = Math.floor(payload.length / 2);
    const { output, exitCodes } = await runGuardHook('/work/sbx', [
      payload.slice(0, half),
      payload.slice(half),
    ]);
    expect(output).toContain('"permissionDecision":"deny"');
    expect(exitCodes).toEqual([0]);
  });

  it('fails open (no decision, exit 0) when the target root is misconfigured', async () => {
    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'cat /etc/passwd' },
    });
    const { output, exitCodes } = await runGuardHook('', [payload]);
    expect(output).toBe('');
    expect(exitCodes).toEqual([0]);
  });

  it("fails open when argv carries no target root at all (the ?? '' fallback)", async () => {
    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'cat /etc/passwd' },
    });
    const { output, exitCodes } = await runGuardHook(undefined, [payload]);
    expect(output).toBe('');
    expect(exitCodes).toEqual([0]);
  });

  it('fails open unconditionally on a misconfigured root — never falls through to evaluate a command that would otherwise be denied on its own merits', async () => {
    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'git push --force' },
    });
    const { output, exitCodes } = await runGuardHook('', [payload]);
    expect(output).toBe('');
    expect(exitCodes).toEqual([0]);
  });

  it('DENIES a Read outside the target (the tool-containment gap, closed)', async () => {
    const payload = JSON.stringify({
      tool_name: 'Read',
      tool_input: { file_path: '/etc/passwd' },
    });
    const { output, exitCodes } = await runGuardHook('/work/sbx', [payload]);
    expect(output).toContain('CONTAINMENT');
    expect(exitCodes).toEqual([0]);
  });

  it('DENIES an Edit outside the target (the same escape hole the Read fix left open)', async () => {
    const payload = JSON.stringify({
      tool_name: 'Edit',
      tool_input: { file_path: '/etc/passwd' },
    });
    const { output, exitCodes } = await runGuardHook('/work/sbx', [payload]);
    expect(output).toContain('CONTAINMENT');
    expect(exitCodes).toEqual([0]);
  });

  it('prints nothing for tools outside the guarded set', async () => {
    const payload = JSON.stringify({
      tool_name: 'WebFetch',
      tool_input: { file_path: '/etc/passwd' },
    });
    const { output, exitCodes } = await runGuardHook('/work/sbx', [payload]);
    expect(output).toBe('');
    expect(exitCodes).toEqual([0]);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('DENIES a WebFetch whose hostname resolves via DNS to a private address, even though the literal URL names none (rebinding, THREAT-MODEL.md T6)', async () => {
    lookupMock.mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }]);
    const payload = JSON.stringify({
      tool_name: 'WebFetch',
      tool_input: { url: 'https://attacker-controlled.example/', prompt: 'x' },
    });
    const { output, exitCodes } = await runGuardHook('/work/sbx', [payload]);
    expect(output).toContain('"permissionDecision":"deny"');
    expect(output).toContain('10.0.0.5');
    expect(exitCodes).toEqual([0]);
  });

  it('ALLOWS a WebFetch whose hostname resolves only to public addresses', async () => {
    lookupMock.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);
    const payload = JSON.stringify({
      tool_name: 'WebFetch',
      tool_input: { url: 'https://example.com/', prompt: 'x' },
    });
    const { output, exitCodes } = await runGuardHook('/work/sbx', [payload]);
    expect(output).toBe('');
    expect(exitCodes).toEqual([0]);
  });

  it('never calls DNS for a WebFetch already denied by the literal-URL check', async () => {
    const payload = JSON.stringify({
      tool_name: 'WebFetch',
      tool_input: { url: 'http://127.0.0.1/', prompt: 'x' },
    });
    const { output, exitCodes } = await runGuardHook('/work/sbx', [payload]);
    expect(output).toContain('SSRF GUARD');
    expect(exitCodes).toEqual([0]);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('ALLOWS (fails open) when DNS resolution itself errors', async () => {
    lookupMock.mockRejectedValueOnce(new Error('ENOTFOUND'));
    const payload = JSON.stringify({
      tool_name: 'WebFetch',
      tool_input: { url: 'https://nonexistent.example/', prompt: 'x' },
    });
    const { output, exitCodes } = await runGuardHook('/work/sbx', [payload]);
    expect(output).toBe('');
    expect(exitCodes).toEqual([0]);
  });

  it('prints nothing for malformed JSON on stdin', async () => {
    const { output, exitCodes } = await runGuardHook('/work/sbx', ['not json at all']);
    expect(output).toBe('');
    expect(exitCodes).toEqual([0]);
  });

  it('prints nothing for a git commit when there is no real repo to scan (fails open)', async () => {
    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "feat: x"' },
    });
    const { output, exitCodes } = await runGuardHook('/work/sbx', [payload]);
    expect(output).toBe('');
    expect(exitCodes).toEqual([0]);
  });
});

function gitSync(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function initRepo(dir: string): void {
  gitSync(dir, ['init', '-q']);
  gitSync(dir, ['config', 'user.email', 'test@autopilot.dev']);
  gitSync(dir, ['config', 'user.name', 'Test']);
  gitSync(dir, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(dir, 'a.txt'), 'one');
  gitSync(dir, ['add', '-A']);
  gitSync(dir, ['commit', '-q', '-m', 'feat: AP-1 first']);
}

/**
 * End-to-end proof the pre-commit sibling scan (SLICE-RELAY DUP 2/3) is
 * actually wired into the PreToolUse hook a flight runs — real git worktrees,
 * not a mocked adapter, same spirit as fleet-digest.test.ts's real-worktree
 * coverage of the render half of this same intent-claims mechanism.
 */
describe('guard-hook pre-commit sibling scan (real git worktrees)', () => {
  let scratch: string;
  let target: string;

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'autopilot-guard-hook-scan-'));
    target = join(scratch, 'target-repo');
    mkdirSync(target);
    initRepo(target);
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it('DENIES a commit that stages a file a sibling claims right now', async () => {
    const branch = 'autopilot/flight-worktree-p--fleet-2';
    const siblingPath = join(scratch, '.autopilot-worktrees', 'p--fleet-2');
    mkdirSync(join(scratch, '.autopilot-worktrees'), { recursive: true });
    await ensureWorktree(target, siblingPath, branch);
    writeFileSync(join(siblingPath, '.autopilot-intent'), 'parser.ts — fix quoting\n');

    writeFileSync(join(target, 'parser.ts'), 'export {};');
    gitSync(target, ['add', 'parser.ts']);

    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "feat: touch parser"' },
    });
    const { output, exitCodes } = await runGuardHook(target, [payload]);
    expect(output).toContain('"permissionDecision":"deny"');
    expect(output).toContain('PRE-COMMIT SIBLING SCAN');
    expect(output).toContain('parser.ts');
    expect(exitCodes).toEqual([0]);
  });

  it('ALLOWS a commit whose staged files avoid every sibling claim', async () => {
    const branch = 'autopilot/flight-worktree-p--fleet-2';
    const siblingPath = join(scratch, '.autopilot-worktrees', 'p--fleet-2');
    mkdirSync(join(scratch, '.autopilot-worktrees'), { recursive: true });
    await ensureWorktree(target, siblingPath, branch);
    writeFileSync(join(siblingPath, '.autopilot-intent'), 'parser.ts — fix quoting\n');

    writeFileSync(join(target, 'unrelated.ts'), 'export {};');
    gitSync(target, ['add', 'unrelated.ts']);

    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "feat: touch unrelated"' },
    });
    const { output, exitCodes } = await runGuardHook(target, [payload]);
    expect(output).toBe('');
    expect(exitCodes).toEqual([0]);
  });

  it('never scans for a non-commit command, even with a colliding staged file (no false positives)', async () => {
    const branch = 'autopilot/flight-worktree-p--fleet-2';
    const siblingPath = join(scratch, '.autopilot-worktrees', 'p--fleet-2');
    mkdirSync(join(scratch, '.autopilot-worktrees'), { recursive: true });
    await ensureWorktree(target, siblingPath, branch);
    writeFileSync(join(siblingPath, '.autopilot-intent'), 'parser.ts — fix quoting\n');

    writeFileSync(join(target, 'parser.ts'), 'export {};');
    gitSync(target, ['add', 'parser.ts']);

    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git status' } });
    const { output, exitCodes } = await runGuardHook(target, [payload]);
    expect(output).toBe('');
    expect(exitCodes).toEqual([0]);
  });

  it('ALLOWS a commit finalizing an in-progress merge even when it touches a file a sibling claims right now — a stale lane catching up is not "originating" conflicting work (ap-mtjwbrok-0)', async () => {
    const branch = 'autopilot/flight-worktree-p--fleet-2';
    const siblingPath = join(scratch, '.autopilot-worktrees', 'p--fleet-2');
    mkdirSync(join(scratch, '.autopilot-worktrees'), { recursive: true });
    await ensureWorktree(target, siblingPath, branch);
    writeFileSync(join(siblingPath, '.autopilot-intent'), 'parser.ts — fix quoting\n');

    const base = gitSync(target, ['rev-parse', '--abbrev-ref', 'HEAD']);
    gitSync(target, ['checkout', '-b', 'catch-up']);
    writeFileSync(join(target, 'parser.ts'), 'export {};');
    gitSync(target, ['add', 'parser.ts']);
    gitSync(target, ['commit', '-q', '-m', 'feat: add parser on the catch-up branch']);
    gitSync(target, ['checkout', base]);
    gitSync(target, ['merge', '--no-commit', '--no-ff', 'catch-up']);

    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "chore: finish merge"' },
    });
    const { output, exitCodes } = await runGuardHook(target, [payload]);
    expect(output).toBe('');
    expect(exitCodes).toEqual([0]);
  });
});
