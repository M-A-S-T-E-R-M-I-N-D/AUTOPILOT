// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for scripts/ci/check-bundle-size.mjs, the landing gate's budget
 * check on the dashboard's served client chunks: formatKb() (the unit every
 * line prints in), measure() (one chunk against its raw and gzip budgets)
 * and checkBundleSize() (all four chunks, the report and the exit code).
 * `main()` itself stays unimported — it needs the real dist output and exits
 * the process. The budgets' VALUES are pinned by the mirror census in
 * test/server/client-bundle-size-budget.test.ts; this file pins the logic
 * that applies them. All three helpers are mutation-tested
 * (config/mutation/stryker.ci-check-bundle-size.config.mjs).
 */
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import {
  CHUNK_GZIP_BUDGET,
  CHUNK_RAW_BUDGET,
  CORE_GZIP_BUDGET,
  CORE_RAW_BUDGET,
  WHATS_NEW_GZIP_BUDGET,
  WHATS_NEW_RAW_BUDGET,
  BENCHMARK_GZIP_BUDGET,
  BENCHMARK_RAW_BUDGET,
  checkBundleSize,
  formatKb,
  measure,
  type ClientBundle,
} from '../../../../scripts/ci/check-bundle-size.mjs';

/** The test's own KB oracle, independent of the formatKb under test. */
function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)}KB`;
}

function gzipBytes(js: string): number {
  return gzipSync(js).length;
}

/** Deterministic base64 noise: gzip saves only ~25% on it, so a chunk can
 *  sit over its gzip budget while staying under its raw one. */
function incompressible(length: number): string {
  let out = '';
  for (let i = 0; out.length < length; i++) {
    out += createHash('sha256').update(String(i)).digest('base64');
  }
  return out.slice(0, length);
}

function bundle(chunks: {
  core?: string;
  project?: string;
  panels?: string;
  whatsNew?: string;
  benchmark?: string;
}): ClientBundle {
  return {
    minifiedCoreJs: () => chunks.core ?? 'x',
    minifiedProjectJs: () => chunks.project ?? 'x',
    minifiedPanelsJs: () => chunks.panels ?? 'x',
    minifiedWhatsNewJs: () => chunks.whatsNew ?? 'x',
    minifiedBenchmarkJs: () => chunks.benchmark ?? 'x',
  };
}

let log: MockInstance<(...args: unknown[]) => void>;
let error: MockInstance<(...args: unknown[]) => void>;

beforeEach(() => {
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('formatKb', () => {
  it('divides by 1024 and keeps one decimal', () => {
    expect(formatKb(1536)).toBe('1.5KB');
    expect(formatKb(264192)).toBe('258.0KB');
  });

  it('rounds to the nearest tenth and prints zero as 0.0KB', () => {
    expect(formatKb(1075)).toBe('1.0KB');
    expect(formatKb(1178)).toBe('1.2KB');
    expect(formatKb(0)).toBe('0.0KB');
  });
});

describe('measure', () => {
  it('passes a chunk exactly at both budgets and returns its raw size', () => {
    const js = 'a'.repeat(2048);
    const errors: string[] = [];
    expect(measure('/demo.js', js, 2048, gzipBytes(js), errors)).toBe(2048);
    expect(errors).toEqual([]);
  });

  it('flags a raw size one byte over its budget, gzip untouched', () => {
    const js = 'a'.repeat(2049);
    const errors: string[] = [];
    measure('/demo.js', js, 2048, gzipBytes(js), errors);
    expect(errors).toEqual(['/demo.js raw 2.0KB exceeds budget 2.0KB']);
  });

  it('flags a gzip size one byte over its budget, raw untouched', () => {
    const js = incompressible(4096);
    const gz = gzipBytes(js);
    const errors: string[] = [];
    measure('/demo.js', js, 4096, gz - 1, errors);
    expect(errors).toEqual([`/demo.js gzip ${kb(gz)} exceeds budget ${kb(gz - 1)}`]);
  });

  it('flags both, raw first, and appends to the errors it was handed', () => {
    const js = incompressible(3072);
    const gz = gzipBytes(js);
    const errors = ['an earlier chunk'];
    measure('/demo.js', js, 1024, 512, errors);
    expect(errors).toEqual([
      'an earlier chunk',
      '/demo.js raw 3.0KB exceeds budget 1.0KB',
      `/demo.js gzip ${kb(gz)} exceeds budget 0.5KB`,
    ]);
  });

  it('counts UTF-8 bytes, not UTF-16 code units', () => {
    // 700 euro signs: 700 code units, 2100 bytes — over a 2048 budget only
    // when measured in bytes, the way the server sends them.
    const js = '€'.repeat(700);
    const errors: string[] = [];
    expect(measure('/demo.js', js, 2048, 1024 * 1024, errors)).toBe(2100);
    expect(errors).toEqual(['/demo.js raw 2.1KB exceeds budget 2.0KB']);
  });

  it('logs one size line per chunk, over budget or not', () => {
    const js = 'a'.repeat(1536);
    measure('/demo.js', js, 1024, 2048, []);
    expect(log.mock.calls).toEqual([
      [`/demo.js: 1.5KB raw (budget 1.0KB), ${kb(gzipBytes(js))} gzip (budget 2.0KB)`],
    ]);
    expect(error).not.toHaveBeenCalled();
  });
});

describe('checkBundleSize', () => {
  it('returns 0 and prints the five size lines, the total and OK when every chunk fits', () => {
    const chunks = {
      core: 'a'.repeat(1024),
      project: 'b'.repeat(2048),
      panels: 'c'.repeat(3072),
      whatsNew: 'd'.repeat(512),
      benchmark: 'e'.repeat(256),
    };
    expect(checkBundleSize(bundle(chunks))).toBe(0);
    const line = (name: string, js: string, raw: number, gzip: number) =>
      `${name}: ${kb(js.length)} raw (budget ${kb(raw)}), ${kb(gzipBytes(js))} gzip (budget ${kb(gzip)})`;
    expect(log.mock.calls).toEqual([
      [line('/app.js (core)', chunks.core, CORE_RAW_BUDGET, CORE_GZIP_BUDGET)],
      [line('/project.js', chunks.project, CHUNK_RAW_BUDGET, CHUNK_GZIP_BUDGET)],
      [line('/panels.js', chunks.panels, CHUNK_RAW_BUDGET, CHUNK_GZIP_BUDGET)],
      [line('/whats-new.js', chunks.whatsNew, WHATS_NEW_RAW_BUDGET, WHATS_NEW_GZIP_BUDGET)],
      [line('/benchmark.js', chunks.benchmark, BENCHMARK_RAW_BUDGET, BENCHMARK_GZIP_BUDGET)],
      // 1024 + 2048 + 3072 + 512 + 256 = 6912 bytes — every other +/- mix differs.
      ['combined: 6.8KB raw across the five chunks'],
      ['check-bundle-size OK'],
    ]);
    expect(error).not.toHaveBeenCalled();
  });

  it('passes every chunk sitting exactly at its own raw budget', () => {
    const result = checkBundleSize(
      bundle({
        core: 'a'.repeat(CORE_RAW_BUDGET),
        project: 'a'.repeat(CHUNK_RAW_BUDGET),
        panels: 'a'.repeat(CHUNK_RAW_BUDGET),
        whatsNew: 'a'.repeat(WHATS_NEW_RAW_BUDGET),
        benchmark: 'a'.repeat(BENCHMARK_RAW_BUDGET),
      }),
    );
    expect(result).toBe(0);
    expect(error).not.toHaveBeenCalled();
  });

  it.each([
    ['core', '/app.js (core)', CORE_RAW_BUDGET],
    ['project', '/project.js', CHUNK_RAW_BUDGET],
    ['panels', '/panels.js', CHUNK_RAW_BUDGET],
    ['whatsNew', '/whats-new.js', WHATS_NEW_RAW_BUDGET],
    ['benchmark', '/benchmark.js', BENCHMARK_RAW_BUDGET],
  ] as const)(
    'fails with exit 1 when %s is one byte over its raw budget',
    (chunk, name, rawBudget) => {
      expect(checkBundleSize(bundle({ [chunk]: 'a'.repeat(rawBudget + 1) }))).toBe(1);
      expect(error.mock.calls).toEqual([
        ['check-bundle-size FAILED:'],
        [`  - ${name} raw ${kb(rawBudget + 1)} exceeds budget ${kb(rawBudget)}`],
      ]);
      expect(log).not.toHaveBeenCalledWith('check-bundle-size OK');
    },
  );

  it.each([
    ['core', '/app.js (core)', CORE_GZIP_BUDGET],
    ['project', '/project.js', CHUNK_GZIP_BUDGET],
    ['panels', '/panels.js', CHUNK_GZIP_BUDGET],
    ['whatsNew', '/whats-new.js', WHATS_NEW_GZIP_BUDGET],
    ['benchmark', '/benchmark.js', BENCHMARK_GZIP_BUDGET],
  ] as const)(
    'fails with exit 1 when %s is over its gzip budget but under its raw one',
    (chunk, name, gzipBudget) => {
      const js = incompressible(Math.ceil(gzipBudget * 1.5));
      expect(checkBundleSize(bundle({ [chunk]: js }))).toBe(1);
      expect(error.mock.calls).toEqual([
        ['check-bundle-size FAILED:'],
        [`  - ${name} gzip ${kb(gzipBytes(js))} exceeds budget ${kb(gzipBudget)}`],
      ]);
    },
  );

  it('lists every exceeded budget across chunks, in chunk order', () => {
    const core = incompressible(CORE_RAW_BUDGET + 1);
    const whatsNew = 'a'.repeat(WHATS_NEW_RAW_BUDGET + 1);
    expect(checkBundleSize(bundle({ core, whatsNew }))).toBe(1);
    expect(error.mock.calls).toEqual([
      ['check-bundle-size FAILED:'],
      [`  - /app.js (core) raw ${kb(CORE_RAW_BUDGET + 1)} exceeds budget ${kb(CORE_RAW_BUDGET)}`],
      [`  - /app.js (core) gzip ${kb(gzipBytes(core))} exceeds budget ${kb(CORE_GZIP_BUDGET)}`],
      [
        `  - /whats-new.js raw ${kb(WHATS_NEW_RAW_BUDGET + 1)} exceeds budget ${kb(WHATS_NEW_RAW_BUDGET)}`,
      ],
    ]);
  });
});
