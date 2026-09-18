// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LANDING_CODE_MODULES,
  fileMtimeOf,
  landingCodeIsStale,
  staleCodeNote,
} from '../../src/landing/freshness.js';

const ROOT = 'dash';
const T0 = 1_000_000;

/** A fake filesystem: path → mtime, `null` for a missing file. */
function fs(times: Record<string, number | null>) {
  return (path: string): number | null => {
    const key = path.replace(/\\/g, '/').replace(/^dash\//, '');
    return key in times ? times[key]! : null;
  };
}

describe('landingCodeIsStale', () => {
  it('names nothing when every build is newer than its source and older than this server', () => {
    const times: Record<string, number> = {};
    for (const m of LANDING_CODE_MODULES) {
      times[`src/${m}.ts`] = T0;
      times[`dist/${m}.js`] = T0 + 10;
    }
    expect(landingCodeIsStale(ROOT, T0 + 100, fs(times))).toEqual([]);
  });

  it('names a module whose source was edited (or checked out) after its last build', () => {
    expect(
      landingCodeIsStale(
        ROOT,
        T0 + 100,
        fs({ 'src/landing/execute.ts': T0 + 50, 'dist/landing/execute.js': T0 + 10 }),
      ),
    ).toEqual(['landing/execute']);
  });

  it('names a module rebuilt AFTER this server started — the build is fresh, the process is not', () => {
    expect(
      landingCodeIsStale(
        ROOT,
        T0 + 20,
        fs({ 'src/control/ci-status.ts': T0, 'dist/control/ci-status.js': T0 + 30 }),
      ),
    ).toEqual(['control/ci-status']);
  });

  it('never reports a module whose source or build it cannot read', () => {
    expect(
      landingCodeIsStale(
        ROOT,
        T0,
        fs({ 'src/gate-commands.ts': T0 + 5, 'dist/gate-commands.js': null }),
      ),
    ).toEqual([]);
  });
});

describe('landingCodeIsStale — the boundaries', () => {
  it('a build stamped the SAME millisecond as its source, or as this server, is fresh — only strictly newer counts', () => {
    expect(
      landingCodeIsStale(
        ROOT,
        T0,
        fs({
          'src/landing/execute.ts': T0 - 10,
          'dist/landing/execute.js': T0 - 10,
          'src/control/ci-status.ts': T0 - 10,
          'dist/control/ci-status.js': T0,
          'src/gate-commands.ts': T0 - 20,
          'dist/gate-commands.js': T0 - 10,
        }),
      ),
    ).toEqual([]);
  });

  it('an unreadable SOURCE is never reported, even when its build is newer than this server', () => {
    expect(
      landingCodeIsStale(
        ROOT,
        T0,
        fs({ 'src/gate-commands.ts': null, 'dist/gate-commands.js': T0 + 5 }),
      ),
    ).toEqual([]);
  });
});

describe('staleCodeNote', () => {
  it('is empty for a fresh server, so the landing text is unchanged', () => {
    expect(staleCodeNote([])).toBe('');
  });

  it('names the modules and says what to do', () => {
    const note = staleCodeNote(['landing/execute', 'gate-commands']);
    expect(note).toContain('landing/execute, gate-commands');
    expect(note).toContain('rebuild and restart');
  });
});

describe('fileMtimeOf — the real reader behind the default', () => {
  it('reads a real file mtime in epoch-ms, and answers null (not a throw) for a missing path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-freshness-'));
    try {
      const file = join(dir, 'a.txt');
      writeFileSync(file, 'x');
      utimesSync(file, new Date(T0), new Date(T0));
      expect(fileMtimeOf(file)).toBe(T0);
      expect(fileMtimeOf(join(dir, 'missing.txt'))).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is what landingCodeIsStale reads when no reader is injected — a real src newer than its real dist is named', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-freshness-real-'));
    try {
      for (const module of LANDING_CODE_MODULES) {
        const src = join(dir, 'src', `${module}.ts`);
        const dist = join(dir, 'dist', `${module}.js`);
        mkdirSync(join(src, '..'), { recursive: true });
        mkdirSync(join(dist, '..'), { recursive: true });
        writeFileSync(src, '');
        writeFileSync(dist, '');
        // Every build older than this server, every source older than its
        // build — except gate-commands, edited after its build.
        const edited = module === 'gate-commands' ? T0 + 5 : T0 - 5;
        utimesSync(src, new Date(edited), new Date(edited));
        utimesSync(dist, new Date(T0), new Date(T0));
      }
      expect(landingCodeIsStale(dir, T0 + 100)).toEqual(['gate-commands']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
