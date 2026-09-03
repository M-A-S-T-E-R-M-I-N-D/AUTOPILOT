// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  GateRunner,
  buildInvocation,
  type GateCommandSpec,
  type GateExec,
} from '../../src/adapters/gate.js';

/** A scripted exec: return a fixed exit code per command index, recording calls. */
function scriptedExec(codes: readonly number[]): { exec: GateExec; calls: GateCommandSpec[] } {
  const calls: GateCommandSpec[] = [];
  const exec: GateExec = (cmd) => {
    const code = codes[calls.length] ?? 0;
    calls.push(cmd);
    return Promise.resolve({ code });
  };
  return { exec, calls };
}

const CMDS: GateCommandSpec[] = [
  { bin: 'tsc', args: ['-b'], label: 'typecheck' },
  { bin: 'vitest', args: ['run'], label: 'test' },
];

describe('GateRunner', () => {
  it('passes when every command exits zero', async () => {
    const { exec } = scriptedExec([0, 0]);
    const result = await new GateRunner({ cwd: '/repo', commands: CMDS, exec }).run();
    expect(result.ok).toBe(true);
    expect(result.details).toContain('2 gate command(s) passed');
  });

  it('fails fast on the first non-zero exit (later commands are not run)', async () => {
    const { exec, calls } = scriptedExec([1, 0]);
    const result = await new GateRunner({ cwd: '/repo', commands: CMDS, exec }).run();
    expect(result.ok).toBe(false);
    expect(result.details).toContain('typecheck failed (exit 1)');
    expect(calls).toHaveLength(1); // never reached the test command
  });

  it('records per-command results (label + pass/fail + duration) — gate transparency', async () => {
    const { exec } = scriptedExec([0, 0]);
    const result = await new GateRunner({ cwd: '/repo', commands: CMDS, exec }).run();
    expect(result.checks).toHaveLength(2);
    expect(result.checks?.[0]).toMatchObject({ label: 'typecheck', pass: true });
    expect(result.checks?.[1]).toMatchObject({ label: 'test', pass: true });
    for (const c of result.checks ?? []) {
      // Upper bound matters as much as the lower one: durationMs is
      // `Date.now() - startedAt`, both epoch timestamps in the trillions —
      // an accidental `+` would still be `>= 0` but wildly outside any
      // plausible instant-resolving-fake-exec duration.
      expect(c.durationMs).toBeGreaterThanOrEqual(0);
      expect(c.durationMs).toBeLessThan(1000);
    }
  });

  it('checks shows only the commands that actually ran when failing fast', async () => {
    const { exec } = scriptedExec([1, 0]);
    const result = await new GateRunner({ cwd: '/repo', commands: CMDS, exec }).run();
    expect(result.checks).toEqual([
      { label: 'typecheck', pass: false, durationMs: expect.any(Number) },
    ]);
  });

  it('falls back to the bin name as the label when none is given', async () => {
    const { exec } = scriptedExec([0]);
    const result = await new GateRunner({
      cwd: '/repo',
      commands: [{ bin: 'tsc', args: ['-b'] }],
      exec,
    }).run();
    expect(result.checks).toEqual([{ label: 'tsc', pass: true, durationMs: expect.any(Number) }]);
  });

  it('threads cwd + timeout into the runner', async () => {
    let seen: { cwd?: string; timeout?: number } = {};
    const exec: GateExec = (_cmd, cwd, timeoutMs) => {
      seen = { cwd, timeout: timeoutMs };
      return Promise.resolve({ code: 0 });
    };
    await new GateRunner({ cwd: '/work', commands: [CMDS[0]!], timeoutMs: 1234, exec }).run();
    expect(seen).toEqual({ cwd: '/work', timeout: 1234 });
  });

  it('treats an empty command list as a vacuous pass', async () => {
    const result = await new GateRunner({ cwd: '/repo', commands: [] }).run();
    expect(result.ok).toBe(true);
    expect(result.details).toContain('no gate commands');
    expect(result.checks).toEqual([]);
  });

  it('runs real commands via the default execFile — a passing command', async () => {
    const result = await new GateRunner({
      cwd: process.cwd(),
      commands: [{ bin: process.execPath, args: ['--version'], label: 'node' }],
    }).run();
    expect(result.ok).toBe(true);
  });

  it('runs real commands via the default execFile — a missing binary fails', async () => {
    const result = await new GateRunner({
      cwd: process.cwd(),
      commands: [{ bin: 'autopilot-no-such-binary-xyz', args: [], label: 'ghost' }],
    }).run();
    expect(result.ok).toBe(false);
    expect(result.details).toContain('ghost failed');
    if (process.platform === 'win32') {
      // A bare name is routed through the cmd.exe/PATHEXT shim
      // (buildInvocation), which itself spawns fine and reports a REAL
      // numeric exit code for "not recognized" — a genuine failure, not a
      // crash.
      expect(result.crashed).toBeUndefined();
    } else {
      // No shim on POSIX — the bare name is spawned directly and hits a
      // genuine ENOENT, which IS a crash.
      expect(result.crashed).toBe(true);
    }
  });

  it('a genuine spawn failure (ENOENT) is a CRASH, not a real failure', async () => {
    // A bare name on Windows is routed through cmd.exe (shim resolution), which
    // itself spawns fine and reports a REAL exit code for "not recognized" — not
    // a crash. A pathed/.exe binary bypasses the shim and is spawned directly, so
    // a nonexistent one hits a genuine ENOENT on every platform (buildInvocation).
    const result = await new GateRunner({
      cwd: process.cwd(),
      commands: [{ bin: './autopilot-no-such-binary-xyz.exe', args: [], label: 'ghost' }],
    }).run();
    expect(result.ok).toBe(false);
    expect(result.crashed).toBe(true);
  });

  it('a genuine non-zero exit is NOT a crash', async () => {
    const { exec } = scriptedExec([1]);
    const result = await new GateRunner({ cwd: '/repo', commands: [CMDS[0]!], exec }).run();
    expect(result.ok).toBe(false);
    expect(result.crashed).toBeUndefined();
  });
});

describe('GateRunner (parallel-safe batches)', () => {
  it('runs consecutive `parallel: true` commands concurrently, not one at a time', async () => {
    // Each command waits for the OTHER to have started before resolving —
    // this only succeeds if both are in flight at once (sequential execution
    // would deadlock/timeout waiting for a start that never comes).
    let started = 0;
    const exec: GateExec = async () => {
      started++;
      await new Promise((r) => setTimeout(r, 5));
      return { code: started >= 2 ? 0 : 1 };
    };
    const commands: GateCommandSpec[] = [
      { bin: 'a', args: [], label: 'typecheck', parallel: true },
      { bin: 'b', args: [], label: 'lint', parallel: true },
    ];
    const result = await new GateRunner({ cwd: '/repo', commands, exec }).run();
    expect(result.ok).toBe(true);
    expect(started).toBe(2);
  });

  it('fails the batch when any parallel command fails, reporting batch order (not completion order)', async () => {
    const exec: GateExec = (cmd) => Promise.resolve({ code: cmd.label === 'lint' ? 1 : 0 });
    const commands: GateCommandSpec[] = [
      { bin: 'a', args: [], label: 'typecheck', parallel: true },
      { bin: 'b', args: [], label: 'lint', parallel: true },
      { bin: 'c', args: [], label: 'format', parallel: true },
    ];
    const result = await new GateRunner({ cwd: '/repo', commands, exec }).run();
    expect(result.ok).toBe(false);
    expect(result.details).toContain('lint failed (exit 1)');
    // The whole batch ran (started together) — all three show up in checks.
    expect(result.checks).toHaveLength(3);
    expect(result.checks).toEqual([
      { label: 'typecheck', pass: true, durationMs: expect.any(Number) },
      { label: 'lint', pass: false, durationMs: expect.any(Number) },
      { label: 'format', pass: true, durationMs: expect.any(Number) },
    ]);
  });

  it('never starts commands after a failed batch', async () => {
    const calls: string[] = [];
    const exec: GateExec = (cmd) => {
      calls.push(cmd.label ?? cmd.bin);
      return Promise.resolve({ code: cmd.label === 'lint' ? 1 : 0 });
    };
    const commands: GateCommandSpec[] = [
      { bin: 'a', args: [], label: 'typecheck', parallel: true },
      { bin: 'b', args: [], label: 'lint', parallel: true },
      { bin: 'c', args: [], label: 'test' },
      { bin: 'd', args: [], label: 'build' },
    ];
    await new GateRunner({ cwd: '/repo', commands, exec }).run();
    expect(calls).toEqual(['typecheck', 'lint']);
  });

  it('runs a sequential command strictly after the preceding parallel batch passes', async () => {
    const order: string[] = [];
    const exec: GateExec = async (cmd) => {
      order.push(`start:${cmd.label}`);
      await new Promise((r) => setTimeout(r, cmd.label === 'lint' ? 5 : 0));
      order.push(`end:${cmd.label}`);
      return { code: 0 };
    };
    const commands: GateCommandSpec[] = [
      { bin: 'a', args: [], label: 'typecheck', parallel: true },
      { bin: 'b', args: [], label: 'lint', parallel: true },
      { bin: 'c', args: [], label: 'test' },
    ];
    const result = await new GateRunner({ cwd: '/repo', commands, exec }).run();
    expect(result.ok).toBe(true);
    // test only starts once BOTH typecheck and lint have ended.
    expect(order.indexOf('start:test')).toBeGreaterThan(order.indexOf('end:lint'));
    expect(order.indexOf('start:test')).toBeGreaterThan(order.indexOf('end:typecheck'));
  });

  it('does not merge a leading non-parallel command into the parallel batch that follows it', async () => {
    const order: string[] = [];
    const exec: GateExec = async (cmd) => {
      order.push(`start:${cmd.label}`);
      await new Promise((r) => setTimeout(r, cmd.label === 'first' ? 5 : 0));
      order.push(`end:${cmd.label}`);
      return { code: 0 };
    };
    const commands: GateCommandSpec[] = [
      { bin: 'a', args: [], label: 'first' },
      { bin: 'b', args: [], label: 'second', parallel: true },
      { bin: 'c', args: [], label: 'third', parallel: true },
    ];
    const result = await new GateRunner({ cwd: '/repo', commands, exec }).run();
    expect(result.ok).toBe(true);
    // second/third only start once the leading sequential command has ended —
    // if it were merged into their batch, all three would start together.
    expect(order.indexOf('start:second')).toBeGreaterThan(order.indexOf('end:first'));
    expect(order.indexOf('start:third')).toBeGreaterThan(order.indexOf('end:first'));
  });

  it('a lone non-parallel command still runs exactly as before (no batching)', async () => {
    const { exec, calls } = scriptedExec([0]);
    const commands: GateCommandSpec[] = [{ bin: 'tsc', args: ['-b'], label: 'typecheck' }];
    const result = await new GateRunner({ cwd: '/repo', commands, exec }).run();
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
  });
});

describe('buildInvocation (cross-platform argv)', () => {
  it('routes a bare command through cmd.exe /c on Windows (resolves .cmd shims)', () => {
    expect(buildInvocation('pnpm', ['test'], 'win32')).toEqual({
      bin: 'cmd.exe',
      args: ['/c', 'pnpm', 'test'],
    });
  });

  it('spawns .exe / pathed binaries directly on Windows', () => {
    // A path separator (or an .exe/.com extension) means "spawn directly, no shim".
    expect(buildInvocation('tools\\node.exe', ['--version'], 'win32')).toEqual({
      bin: 'tools\\node.exe',
      args: ['--version'],
    });
    expect(buildInvocation('node.exe', ['-v'], 'win32')).toEqual({ bin: 'node.exe', args: ['-v'] });
  });

  describe('live progress (onProgress)', () => {
    it('announces each command starting and ending, with 1-based position and the gate total', async () => {
      // The gate runs for minutes (the test leg alone is ~140s in this repo);
      // without this a caller can only await the verdict, which is exactly how
      // the LANDING button came to look like it was doing nothing at all.
      const { exec } = scriptedExec([0, 0]);
      const events: string[] = [];
      await new GateRunner({
        cwd: '/repo',
        commands: CMDS,
        exec,
        onProgress: (e) =>
          events.push(
            `${e.kind}:${e.label}:${e.index}/${e.total}${e.pass === undefined ? '' : ':' + String(e.pass)}`,
          ),
      }).run();

      expect(events).toEqual([
        'start:typecheck:1/2',
        'end:typecheck:1/2:true',
        'start:test:2/2',
        'end:test:2/2:true',
      ]);
    });

    it('reports a failing command as it ends, and never announces the ones fail-fast skipped', async () => {
      const { exec } = scriptedExec([1, 0]);
      const events: { label: string; pass: boolean | undefined }[] = [];
      await new GateRunner({
        cwd: '/repo',
        commands: CMDS,
        exec,
        onProgress: (e) => {
          if (e.kind === 'end') events.push({ label: e.label, pass: e.pass });
        },
      }).run();

      expect(events).toEqual([{ label: 'typecheck', pass: false }]);
    });

    it("carries each command's real duration, so a UI can show which step is the slow one", async () => {
      const { exec } = scriptedExec([0, 0]);
      const durations: (number | undefined)[] = [];
      await new GateRunner({
        cwd: '/repo',
        commands: CMDS,
        exec,
        onProgress: (e) => {
          if (e.kind === 'end') durations.push(e.durationMs);
        },
      }).run();

      expect(durations).toHaveLength(2);
      for (const d of durations) expect(typeof d).toBe('number');
    });

    it('swallows a throwing observer — progress reporting can never change a gate verdict', async () => {
      const { exec } = scriptedExec([0, 0]);
      const result = await new GateRunner({
        cwd: '/repo',
        commands: CMDS,
        exec,
        onProgress: () => {
          throw new Error('observer exploded');
        },
      }).run();

      expect(result.ok).toBe(true);
      expect(result.checks).toHaveLength(2);
    });

    it('numbers parallel commands by their own batch positions, not by completion order', async () => {
      const parallelCmds: GateCommandSpec[] = [
        { bin: 'a', args: [], label: 'alpha', parallel: true },
        { bin: 'b', args: [], label: 'beta', parallel: true },
      ];
      const { exec } = scriptedExec([0, 0]);
      const starts: string[] = [];
      await new GateRunner({
        cwd: '/repo',
        commands: parallelCmds,
        exec,
        onProgress: (e) => {
          if (e.kind === 'start') starts.push(`${e.label}:${e.index}`);
        },
      }).run();

      expect(starts).toEqual(['alpha:1', 'beta:2']);
    });
  });

  it('spawns directly on POSIX (no shim needed)', () => {
    expect(buildInvocation('pnpm', ['test'], 'linux')).toEqual({ bin: 'pnpm', args: ['test'] });
    expect(buildInvocation('/usr/bin/tsc', ['-b'], 'darwin')).toEqual({
      bin: '/usr/bin/tsc',
      args: ['-b'],
    });
  });

  it('treats a backslash-pathed name with no exe/com extension as non-bare — no shim', () => {
    // No `/`, but a `\` — bareName must key off EITHER separator, not just one
    // (a `||` in place of the `&&` would still call this bare and wrongly shim it).
    expect(buildInvocation('tools\\mybin', ['--version'], 'win32')).toEqual({
      bin: 'tools\\mybin',
      args: ['--version'],
    });
  });

  it("only skips the shim for a TRAILING .exe/.com — a mid-string match doesn't count", () => {
    // Bare name (no separator), and it contains ".exe" — but not at the end,
    // so the anchored `$` in the extension regex must still classify it as
    // needing the cmd.exe shim (a dropped anchor would match ".exe" anywhere
    // and wrongly skip the shim).
    expect(buildInvocation('setup.exe.old', [], 'win32')).toEqual({
      bin: 'cmd.exe',
      args: ['/c', 'setup.exe.old'],
    });
  });
});
