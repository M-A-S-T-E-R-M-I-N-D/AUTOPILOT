// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GateRunner,
  buildInvocation,
  lastLines,
  classifyExecFailure,
  environmentCrashReason,
  GATE_OUTPUT_TAIL_LINES,
  type GateCommandSpec,
  type GateExec,
} from '../../src/adapters/gate.js';

describe('a red gate says why (the output tail, 2026-09-13)', () => {
  it('lastLines keeps the last n non-empty lines', () => {
    expect(lastLines('a\n\nb\r\nc\n', 2)).toBe('b\nc');
    expect(lastLines('', 5)).toBe('');
    // Whitespace-only lines are dropped too, not merely empty ones. A tail is
    // forty lines of budget for naming the failing test; blank indentation
    // crowding it out is how a red gate goes back to saying nothing.
    expect(lastLines('a\n   \n\t\nb', 2)).toBe('a\nb');
    expect(GATE_OUTPUT_TAIL_LINES).toBe(40);
  });

  it("threads a failing command's tail into the verdict details and its check record, never on a pass", async () => {
    const exec: GateExec = (cmd) =>
      Promise.resolve(
        cmd.label === 'test'
          ? {
              code: 1,
              outputTail: 'FAIL apps/x.test.ts > paints\nAssertionError: expected 3 to be 4',
            }
          : { code: 0, outputTail: 'noise that a pass must not carry' },
      );
    const result = await new GateRunner({
      cwd: '/repo',
      commands: [
        { bin: 'tsc', args: [], label: 'typecheck' },
        { bin: 'vitest', args: [], label: 'test' },
      ],
      exec,
    }).run();
    expect(result.ok).toBe(false);
    expect(result.details).toBe(
      'test failed (exit 1)\nFAIL apps/x.test.ts > paints\nAssertionError: expected 3 to be 4',
    );
    expect(result.checks?.[0]).toEqual({
      label: 'typecheck',
      pass: true,
      durationMs: expect.any(Number),
    });
    expect(result.checks?.[1]).toMatchObject({ label: 'test', pass: false });
    expect(result.checks?.[1]?.outputTail).toContain('AssertionError');
  });

  it('the real runner captures stdout and stderr of a command that exits non-zero', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gate-tail-'));
    const script = join(dir, 'noisy.mjs');
    writeFileSync(
      script,
      "process.stdout.write('out line one\\nout line two\\n'); process.stderr.write('err line\\n'); process.exit(3);\n",
    );
    const result = await new GateRunner({
      cwd: dir,
      commands: [{ bin: process.execPath, args: [script], label: 'noisy' }],
    }).run();
    expect(result.ok).toBe(false);
    expect(result.details).toContain('noisy failed (exit 3)');
    expect(result.details).toContain('out line two');
    expect(result.details).toContain('err line');
  });
});

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

  describe('semaphore (cross-lane gate slot, mercy 2)', () => {
    it('acquires the semaphore before running commands and releases it once done', async () => {
      const order: string[] = [];
      const { exec } = scriptedExec([0]);
      const semaphore = {
        acquire: async () => {
          order.push('acquire');
          return () => order.push('release');
        },
      };
      const result = await new GateRunner({
        cwd: '/repo',
        commands: [CMDS[0]!],
        exec: async (cmd, cwd, timeoutMs) => {
          order.push('exec');
          return exec(cmd, cwd, timeoutMs);
        },
        semaphore,
      }).run();
      expect(result.ok).toBe(true);
      expect(order).toEqual(['acquire', 'exec', 'release']);
    });

    it('releases the semaphore even when the gate fails', async () => {
      const order: string[] = [];
      const semaphore = {
        acquire: async () => {
          order.push('acquire');
          return () => order.push('release');
        },
      };
      const { exec } = scriptedExec([1]);
      const result = await new GateRunner({
        cwd: '/repo',
        commands: [CMDS[0]!],
        exec,
        semaphore,
      }).run();
      expect(result.ok).toBe(false);
      expect(order).toEqual(['acquire', 'release']);
    });

    it('never touches the semaphore for a vacuous (empty command list) gate', async () => {
      let acquired = false;
      const semaphore = {
        acquire: async () => {
          acquired = true;
          return () => {};
        },
      };
      await new GateRunner({ cwd: '/repo', commands: [], semaphore }).run();
      expect(acquired).toBe(false);
    });

    it('runs exactly as before when no semaphore is given', async () => {
      const { exec } = scriptedExec([0]);
      const result = await new GateRunner({ cwd: '/repo', commands: [CMDS[0]!], exec }).run();
      expect(result.ok).toBe(true);
    });
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

  it('folds a crash reason into details (verdict-quality: distinguishable from a real failure)', async () => {
    const exec: GateExec = () => Promise.resolve({ code: 1, crashed: true, crashReason: 'ENOENT' });
    const result = await new GateRunner({ cwd: '/repo', commands: [CMDS[0]!], exec }).run();
    expect(result.ok).toBe(false);
    expect(result.crashed).toBe(true);
    expect(result.details).toContain('typecheck failed');
    expect(result.details).toContain('ENOENT');
  });

  it('still reports "failed" for a crash with no identified reason (test double omitting crashReason)', async () => {
    const exec: GateExec = () => Promise.resolve({ code: 1, crashed: true });
    const result = await new GateRunner({ cwd: '/repo', commands: [CMDS[0]!], exec }).run();
    expect(result.ok).toBe(false);
    expect(result.details).toContain('typecheck failed');
  });

  it('reports a real non-zero exit as the tool own verdict, not a crash', async () => {
    // execFile rejects on ANY non-zero exit, so the handler has to tell "the
    // tool ran and said no" from "the tool never ran". A numeric error.code is
    // the first; anything else is the second. Producing no output at all also
    // exercises the no-tail shape of that result.
    const result = await new GateRunner({
      cwd: process.cwd(),
      commands: [{ bin: process.execPath, args: ['-e', 'process.exit(3)'], label: 'typecheck' }],
    }).run();
    expect(result.ok).toBe(false);
    expect(result.crashed).toBeUndefined();
    expect(result.details).toContain('typecheck failed (exit 3)');
  });

  it('names a crash with no known reason plainly, adding nothing after "crashed"', async () => {
    // The reason is folded in only when there is one. Emitting something in
    // its place puts invented text where the operator reads the cause.
    const exec: GateExec = () => Promise.resolve({ code: 1, crashed: true });
    const result = await new GateRunner({ cwd: '/repo', commands: [CMDS[0]!], exec }).run();
    expect(result.details).toContain(
      'typecheck failed (crashed) — gate could not verify the commit',
    );
  });

  it('a real execFile timeout is classified as crashReason "timeout", not ENOENT/unknown', async () => {
    // execFile's own `timeout` option kills the child and reports `killed: true`
    // with no numeric exit code — realExec must read that as a TIMEOUT, not a
    // generic crash, so telemetry can tell "the tool never finished in time"
    // apart from "the binary doesn't exist" (verdict-quality, board web-mtq6zn6x-3khfkb).
    const result = await new GateRunner({
      cwd: process.cwd(),
      // A short-lived process that outlives a near-zero timeout.
      commands: [
        { bin: process.execPath, args: ['-e', 'setTimeout(()=>{}, 5000)'], label: 'slow' },
      ],
      timeoutMs: 50,
    }).run();
    expect(result.ok).toBe(false);
    expect(result.crashed).toBe(true);
    expect(result.details).toContain('timeout');
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

// classifyExecFailure decides whether a red gate is a verdict on the COMMIT or
// a verdict on the MACHINE — "the tool ran and said no" versus "the tool never
// ran". Driven directly rather than through a real spawn, because the arms are
// platform-dependent to reach: on Windows the gate goes through a cmd.exe shim,
// so a missing binary comes back as shell exit code 1 and the string-code arm
// cannot be produced locally at all. Testing it here makes every arm provable
// on whatever machine happens to run the suite.
// 2026-09-24: two convergence gates went red on `pnpm run test` with only
// vitest's worker-start errors in the output — two lanes' full suites on
// one disk. That is a verdict on the machine, never on the commit.
const WORKER_TIMEOUT_TAIL =
  'Error: [vitest-pool]: Failed to start forks worker for test files x.test.ts.\n' +
  'Caused by: Error: [vitest-pool-runner]: Timeout waiting for worker to respond\n';

describe('environmentCrashReason', () => {
  it('names worker-start timeouts as the machine, in every form vitest prints them', () => {
    expect(environmentCrashReason(WORKER_TIMEOUT_TAIL)).toBe(
      'test workers never started — the machine was too loaded to judge',
    );
    expect(environmentCrashReason('Failed to start threads worker for x')).not.toBeNull();
    expect(environmentCrashReason('Timeout waiting for worker to respond')).not.toBeNull();
  });

  it('keeps the red when any test visibly failed beside the timeouts', () => {
    for (const real of [' FAIL  a.test.ts > x', 'AssertionError: expected 1', '  × a > b']) {
      expect(environmentCrashReason(WORKER_TIMEOUT_TAIL + real)).toBeNull();
    }
  });

  it('is null for ordinary output', () => {
    expect(environmentCrashReason('')).toBeNull();
    expect(environmentCrashReason('Tests  3 passed')).toBeNull();
  });

  // 2026-09-25: a `git.test.ts` beforeEach hook timed out under six-lane disk
  // contention and reverted a docs-only commit — the same machine-fault shape
  // as the worker-start case above, but the FAIL/× signatures can't gate it
  // since the timed-out file legitimately prints its own FAIL line.
  const HOOK_TIMEOUT_TAIL =
    "FAIL  |node| packages/engine/test/adapters/git.test.ts > GitVcs > returns ''\n" +
    '      for showPatch on an invalid ref rather than throwing\n' +
    'Error: Hook timed out in 120000ms.\n';

  it('names a single isolated hook timeout as the machine, despite its own FAIL line', () => {
    expect(environmentCrashReason(HOOK_TIMEOUT_TAIL)).toBe(
      'an isolated test hook timed out — the machine was too loaded to judge',
    );
  });

  it('keeps the red when a real AssertionError sits alongside the hook timeout', () => {
    expect(
      environmentCrashReason(HOOK_TIMEOUT_TAIL + 'AssertionError: expected 1 to be 2'),
    ).toBeNull();
  });

  it('keeps the red when more than one hook timed out — not the narrow isolated case', () => {
    expect(environmentCrashReason(HOOK_TIMEOUT_TAIL + HOOK_TIMEOUT_TAIL)).toBeNull();
  });
});

describe('classifyExecFailure', () => {
  it('reads a non-zero exit with only worker-start errors as a crash of the machine', () => {
    expect(classifyExecFailure({ code: 1 }, WORKER_TIMEOUT_TAIL)).toEqual({
      code: 1,
      crashed: true,
      crashReason: 'test workers never started — the machine was too loaded to judge',
      outputTail: WORKER_TIMEOUT_TAIL,
    });
  });

  it('reads a NUMERIC code as the tool own verdict, never a crash', () => {
    expect(classifyExecFailure({ code: 3 }, '')).toEqual({ code: 3 });
    expect(classifyExecFailure({ code: 3 }, 'boom')).toEqual({ code: 3, outputTail: 'boom' });
  });

  it('keeps exit code 0 numeric rather than falling through to the crash arm', () => {
    // 0 is falsy, so a truthiness test here would call a clean exit a crash.
    expect(classifyExecFailure({ code: 0 }, '')).toEqual({ code: 0 });
  });

  it('reads a STRING code as the crash reason it names', () => {
    expect(classifyExecFailure({ code: 'ENOENT' }, '')).toEqual({
      code: 1,
      crashed: true,
      crashReason: 'ENOENT',
    });
  });

  it('prefers "timeout" over the raw code when execFile killed the child itself', () => {
    // A timeout is the one crash cause the command chose for itself; blaming
    // ETIMEDOUT-the-environment instead loses that distinction.
    expect(classifyExecFailure({ code: 'ETIMEDOUT', killed: true }, '')).toEqual({
      code: 1,
      crashed: true,
      crashReason: 'timeout',
    });
    // killed must be exactly true — a truthy-ish value is not the signal.
    expect(classifyExecFailure({ code: 'ENOENT', killed: 'yes' }, '')).toMatchObject({
      crashReason: 'ENOENT',
    });
  });

  it('falls back to "unknown" only when the code is neither number nor string', () => {
    expect(classifyExecFailure({}, '')).toMatchObject({ crashed: true, crashReason: 'unknown' });
    expect(classifyExecFailure({ code: undefined }, '')).toMatchObject({
      crashReason: 'unknown',
    });
  });

  it('carries the output tail on a crash when there is one, and omits the key when there is not', () => {
    expect(classifyExecFailure({ code: 'ENOENT' }, 'last line')).toEqual({
      code: 1,
      crashed: true,
      crashReason: 'ENOENT',
      outputTail: 'last line',
    });
    expect('outputTail' in classifyExecFailure({ code: 'ENOENT' }, '')).toBe(false);
    expect('outputTail' in classifyExecFailure({ code: 7 }, '')).toBe(false);
  });
});

describe('GateRunner reports how long it queued for a slot (2026-09-25)', () => {
  const ok: GateExec = async () => ({ code: 0 });
  const cmd: GateCommandSpec = { bin: 'tsc', args: [], label: 'typecheck' };

  it('reports the wait when a semaphore is wired, on green and on red', async () => {
    const slowSlot = {
      acquire: () => new Promise<() => void>((resolve) => setTimeout(() => resolve(() => {}), 30)),
    };
    const green = await new GateRunner({
      cwd: '.',
      commands: [cmd],
      exec: ok,
      semaphore: slowSlot,
    }).run();
    expect(green.ok).toBe(true);
    expect(green.queuedMs).toBeGreaterThanOrEqual(25);
    const red = await new GateRunner({
      cwd: '.',
      commands: [cmd],
      exec: async () => ({ code: 2 }),
      semaphore: slowSlot,
    }).run();
    expect(red.ok).toBe(false);
    expect(red.queuedMs).toBeGreaterThanOrEqual(25);
  });

  it('reports no wait at all when it ran unslotted', async () => {
    const result = await new GateRunner({ cwd: '.', commands: [cmd], exec: ok }).run();
    expect(result).not.toHaveProperty('queuedMs');
  });
});
