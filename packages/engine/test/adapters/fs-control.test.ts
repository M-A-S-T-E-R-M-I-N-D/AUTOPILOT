// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsControl, type FsControlOptions } from '../../src/adapters/fs-control.js';
import { INITIAL_RESILIENCE_STATE } from '../../src/resilience.js';

describe('FsControl', () => {
  let dir: string;
  let opts: FsControlOptions;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autopilot-fsctl-'));
    writeFileSync(join(dir, 'PROMPT.txt'), 'be a great autopilot');
    opts = {
      stopFile: join(dir, 'STOP.txt'),
      stateFile: join(dir, 'state.json'),
      promptFile: join(dir, 'PROMPT.txt'),
      retroAppendix: (firing) => `\n\nRETRO firing ${firing}`,
      sleepChunkMs: 5,
      delay: () => Promise.resolve(),
    };
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reports STOP only when the sentinel exists', async () => {
    const fs = new FsControl(opts);
    expect(await fs.stopRequested()).toBe(false);
    writeFileSync(opts.stopFile, '');
    expect(await fs.stopRequested()).toBe(true);
  });

  it('round-trips resilience state and defaults to INITIAL when absent/corrupt', async () => {
    const fs = new FsControl(opts);
    expect(await fs.loadState()).toEqual(INITIAL_RESILIENCE_STATE);
    await fs.saveState({ consecQuota: 2, reprobeAfterEpoch: 500, consecGlobalExhaust: 1 });
    expect(await fs.loadState()).toEqual({
      consecQuota: 2,
      reprobeAfterEpoch: 500,
      consecGlobalExhaust: 1,
    });
    writeFileSync(opts.stateFile, 'not json');
    expect(await fs.loadState()).toEqual(INITIAL_RESILIENCE_STATE);
  });

  it('coerces non-numeric state fields to 0 instead of propagating them', async () => {
    const fs = new FsControl(opts);
    writeFileSync(
      opts.stateFile,
      '{"consecQuota":"oops","reprobeAfterEpoch":null,"consecGlobalExhaust":true}',
    );
    expect(await fs.loadState()).toEqual({
      consecQuota: 0,
      reprobeAfterEpoch: 0,
      consecGlobalExhaust: 0,
    });
  });

  it('builds a versioned prompt and appends the retro appendix only on retros', async () => {
    const fs = new FsControl(opts);
    const normal = await fs.buildPrompt(4, false);
    expect(normal.text).toBe('be a great autopilot');
    expect(normal.version).toMatch(/^[0-9a-f]{8}$/);
    const retro = await fs.buildPrompt(10, true);
    expect(retro.text).toContain('RETRO firing 10');
    expect(retro.version).toBe(normal.version); // version tracks the base prompt only
  });

  it('sleep is STOP-aware: wakes immediately when the sentinel appears', async () => {
    writeFileSync(opts.stopFile, '');
    let delays = 0;
    const fs = new FsControl({
      ...opts,
      delay: () => {
        delays++;
        return Promise.resolve();
      },
    });
    await fs.sleep(60); // would be many chunks, but STOP is present
    expect(delays).toBe(0); // returned before delaying at all
  });

  it('sleep(0) is a no-op and logs write to the log file', async () => {
    const logFile = join(dir, 'run.log');
    const fs = new FsControl({ ...opts, logFile });
    await fs.sleep(0);
    fs.log('hello');
    expect(existsSync(logFile)).toBe(true);
    expect(readFileSync(logFile, 'utf8')).toContain('hello');
  });

  it('sleep awaits every chunk in turn when the STOP sentinel never appears', async () => {
    let delays = 0;
    const fs = new FsControl({
      ...opts,
      sleepChunkMs: 5,
      delay: () => {
        delays++;
        return Promise.resolve();
      },
    });
    await fs.sleep((2 * 5) / 60_000); // 2 chunks of 5ms each
    expect(delays).toBe(2);
  });

  it('sleep falls back to a real timer-based delay when none is injected', async () => {
    const { delay: _unusedDelay, ...withoutDelay } = opts;
    const fs = new FsControl({ ...withoutDelay, sleepChunkMs: 5 });
    await expect(fs.sleep(5 / 60_000)).resolves.toBeUndefined(); // 1 real 5ms chunk
  });

  it('the default delay genuinely waits for its timer instead of resolving immediately', async () => {
    vi.useFakeTimers();
    try {
      const { delay: _unusedDelay, ...withoutDelay } = opts;
      const fs = new FsControl({ ...withoutDelay, sleepChunkMs: 1000 });
      let resolved = false;
      const pending = fs.sleep(1000 / 60_000).then(() => {
        resolved = true;
      });
      await vi.advanceTimersByTimeAsync(0); // flush microtasks without firing the timer
      expect(resolved).toBe(false); // still waiting on the real setTimeout
      await vi.advanceTimersByTimeAsync(1000);
      await pending;
      expect(resolved).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sleep falls back to the default 60s chunk size when none is configured', async () => {
    writeFileSync(opts.stopFile, '');
    const { sleepChunkMs: _unusedChunkMs, ...withoutChunkMs } = opts;
    const fs = new FsControl(withoutChunkMs);
    await fs.sleep(1); // STOP is present, so the 60s chunk is never actually awaited
  });

  it('log is a silent no-op when no logFile is configured', () => {
    const fs = new FsControl(opts); // beforeEach's opts never sets logFile
    expect(() => fs.log('should be dropped, not thrown')).not.toThrow();
  });
});
