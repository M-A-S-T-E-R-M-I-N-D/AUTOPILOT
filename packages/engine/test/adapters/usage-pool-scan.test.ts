// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanUsagePoolListPriceUsd, RealUsagePool } from '../../src/adapters/usage-pool-scan.js';

// Fixture directories only — never real ~/.claude data (docs/epics/0013's
// "graceful absence" / read-only-against-~/.claude constraints).
function jsonlLine(o: Record<string, unknown>): string {
  return JSON.stringify(o);
}

describe('scanUsagePoolListPriceUsd', () => {
  let scratch: string;
  const now = Date.parse('2026-08-21T00:00:00.000Z');

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'autopilot-usage-pool-'));
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it('returns totalUsd: null when no directory is readable (pool entirely inaccessible)', () => {
    const result = scanUsagePoolListPriceUsd([join(scratch, 'does-not-exist')], now);
    expect(result).toEqual({ totalUsd: null, dirsScanned: 0, filesScanned: 0 });
  });

  it('returns 0 for a readable but empty directory (real answer, not absence)', () => {
    const emptyDir = join(scratch, 'empty-project');
    mkdirSync(emptyDir);
    const result = scanUsagePoolListPriceUsd([emptyDir], now);
    expect(result).toEqual({ totalUsd: 0, dirsScanned: 1, filesScanned: 0 });
  });

  it('sums cost across nested session jsonl files within the trailing window', () => {
    const projectDir = join(scratch, 'projects', 'my-project');
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, 'session-1.jsonl'),
      [
        jsonlLine({
          message: { id: 'msg_1' },
          requestId: 'req_1',
          timestamp: '2026-08-15T00:00:00.000Z', // within trailing 30d of `now`
          costUSD: 1.25,
        }),
        jsonlLine({
          message: { id: 'msg_2' },
          requestId: 'req_2',
          timestamp: '2026-01-01T00:00:00.000Z', // well outside the window
          costUSD: 99,
        }),
      ].join('\n'),
    );
    writeFileSync(
      join(projectDir, 'session-2.jsonl'),
      jsonlLine({
        message: { id: 'msg_3' },
        requestId: 'req_3',
        timestamp: '2026-08-20T00:00:00.000Z',
        costUSD: 2.75,
      }),
    );

    const result = scanUsagePoolListPriceUsd([join(scratch, 'projects')], now);
    expect(result).toEqual({ totalUsd: 4, dirsScanned: 1, filesScanned: 2 });
  });

  it('ignores non-jsonl files and combines multiple pool directories', () => {
    const dirA = join(scratch, 'a');
    const dirB = join(scratch, 'b');
    mkdirSync(dirA);
    mkdirSync(dirB);
    writeFileSync(join(dirA, 'notes.txt'), 'not a transcript');
    writeFileSync(
      join(dirA, 'session.jsonl'),
      jsonlLine({
        message: { id: 'x' },
        requestId: 'y',
        timestamp: '2026-08-18T00:00:00.000Z',
        costUSD: 1,
      }),
    );
    writeFileSync(
      join(dirB, 'session.jsonl'),
      jsonlLine({
        message: { id: 'p' },
        requestId: 'q',
        timestamp: '2026-08-19T00:00:00.000Z',
        costUSD: 3,
      }),
    );

    const result = scanUsagePoolListPriceUsd([dirA, dirB], now);
    expect(result).toEqual({ totalUsd: 4, dirsScanned: 2, filesScanned: 2 });
  });

  it('deduplicates a message repeated across two directories (resumed-session overlap)', () => {
    const dirA = join(scratch, 'a');
    const dirB = join(scratch, 'b');
    mkdirSync(dirA);
    mkdirSync(dirB);
    // Same logical request appears in both — an intermediate snapshot in A,
    // the final one (higher cost) in B — must be counted once, as the final.
    writeFileSync(
      join(dirA, 'session.jsonl'),
      jsonlLine({
        message: { id: 'shared' },
        requestId: 'req',
        timestamp: '2026-08-18T00:00:00.000Z',
        costUSD: 0.5,
      }),
    );
    writeFileSync(
      join(dirB, 'session.jsonl'),
      jsonlLine({
        message: { id: 'shared' },
        requestId: 'req',
        timestamp: '2026-08-18T00:05:00.000Z',
        costUSD: 3,
      }),
    );

    const result = scanUsagePoolListPriceUsd([dirA, dirB], now);
    expect(result.totalUsd).toBe(3);
  });

  it('skips an unreadable nested subdirectory without failing the whole scan', () => {
    // A directory that IS readable (dirsScanned counts it) but contains a
    // malformed transcript file alongside a valid one — the malformed one is
    // simply dropped by parseTranscriptJsonl, not treated as a scan failure.
    const dir = join(scratch, 'mixed');
    mkdirSync(dir);
    writeFileSync(join(dir, 'broken.jsonl'), '{not valid json\nstill broken');
    writeFileSync(
      join(dir, 'ok.jsonl'),
      jsonlLine({
        message: { id: 'ok' },
        requestId: 'ok',
        timestamp: '2026-08-18T00:00:00.000Z',
        costUSD: 7,
      }),
    );

    const result = scanUsagePoolListPriceUsd([dir], now);
    expect(result).toEqual({ totalUsd: 7, dirsScanned: 1, filesScanned: 2 });
  });

  it('respects a custom windowDays', () => {
    const dir = join(scratch, 'p');
    mkdirSync(dir);
    writeFileSync(
      join(dir, 'session.jsonl'),
      jsonlLine({
        message: { id: 'm' },
        requestId: 'r',
        timestamp: '2026-08-15T00:00:00.000Z',
        costUSD: 5,
      }),
    );
    // 5 days back from `now` (2026-08-21) excludes 2026-08-15.
    const result = scanUsagePoolListPriceUsd([dir], now, 5);
    expect(result.totalUsd).toBe(0);
  });
});

describe('RealUsagePool', () => {
  let scratch: string;
  const now = Date.parse('2026-08-21T00:00:00.000Z');

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'autopilot-usage-pool-'));
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it('resolves the pool-wide totalUsd, delegating to scanUsagePoolListPriceUsd', async () => {
    const dir = join(scratch, 'p');
    mkdirSync(dir);
    writeFileSync(
      join(dir, 'session.jsonl'),
      jsonlLine({
        message: { id: 'm' },
        requestId: 'r',
        timestamp: '2026-08-18T00:00:00.000Z',
        costUSD: 3.5,
      }),
    );

    const pool = new RealUsagePool();
    await expect(pool.scanListPriceUsd([dir], now)).resolves.toBe(3.5);
  });

  it('resolves null when no directory in the pool is readable', async () => {
    const pool = new RealUsagePool();
    await expect(pool.scanListPriceUsd([join(scratch, 'does-not-exist')], now)).resolves.toBeNull();
  });
});
