// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LANDING_CODE_MODULES,
  LANDING_STAMP_FILE,
  fileHashOf,
  fileMtimeOf,
  landingCodeIsStale,
  readLandingStamp,
  sha256Of,
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

describe('landingCodeIsStale — with the build stamp (content beats mtimes)', () => {
  const times = {
    'src/gate-commands.ts': T0 + 5,
    'dist/gate-commands.js': T0 - 10,
  };

  it('a source newer than its build by mtime but IDENTICAL in content to the stamp is fresh — a checkout only bumped the mtime', () => {
    expect(landingCodeIsStale(ROOT, T0, fs(times), { 'gate-commands': 'h1' }, () => 'h1')).toEqual(
      [],
    );
  });

  it('a source whose content differs from the stamp is stale even when its mtime is OLDER than the build', () => {
    expect(
      landingCodeIsStale(
        ROOT,
        T0,
        fs({ 'src/gate-commands.ts': T0 - 20, 'dist/gate-commands.js': T0 - 10 }),
        { 'gate-commands': 'h1' },
        () => 'h2',
      ),
    ).toEqual(['gate-commands']);
  });

  it('a module the stamp does not name falls back to the mtime rule', () => {
    expect(landingCodeIsStale(ROOT, T0, fs(times), {}, () => 'h1')).toEqual(['gate-commands']);
    expect(landingCodeIsStale(ROOT, T0, fs(times), null, () => 'h1')).toEqual(['gate-commands']);
  });

  it('a build newer than this server is stale whatever the stamp says — a restart is due', () => {
    expect(
      landingCodeIsStale(
        ROOT,
        T0,
        fs({ 'src/gate-commands.ts': T0 - 20, 'dist/gate-commands.js': T0 + 5 }),
        { 'gate-commands': 'h1' },
        () => 'h1',
      ),
    ).toEqual(['gate-commands']);
  });

  it('an unreadable source hash is not evidence, even with a stamp and a newer mtime', () => {
    expect(landingCodeIsStale(ROOT, T0, fs(times), { 'gate-commands': 'h1' }, () => null)).toEqual(
      [],
    );
  });
});

describe('readLandingStamp and sha256Of — the stamp on disk', () => {
  it('reads the module → hash map the build wrote, keeping only string hashes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-stamp-'));
    try {
      const file = join(dir, LANDING_STAMP_FILE);
      mkdirSync(join(file, '..'), { recursive: true });
      writeFileSync(file, JSON.stringify({ 'landing/execute': 'abc', junk: 7 }));
      expect(readLandingStamp(dir)).toEqual({ 'landing/execute': 'abc' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is null for a missing, malformed or non-object stamp — never a throw', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-stamp-'));
    try {
      expect(readLandingStamp(dir)).toBeNull();
      const file = join(dir, LANDING_STAMP_FILE);
      mkdirSync(join(file, '..'), { recursive: true });
      writeFileSync(file, '{not json');
      expect(readLandingStamp(dir)).toBeNull();
      writeFileSync(file, '["a"]');
      expect(readLandingStamp(dir)).toBeNull();
      writeFileSync(file, '"x"');
      expect(readLandingStamp(dir)).toBeNull();
      // A literal `null` parses fine and is still not a stamp — judged, not
      // rescued by a catch around the whole body.
      writeFileSync(file, 'null');
      expect(readLandingStamp(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sha256Of is the plain hex digest the stamp script writes', () => {
    expect(sha256Of('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Of('a')).not.toBe(sha256Of('b'));
  });

  it("fileHashOf hashes a real file's bytes, and answers null (not a throw) for a missing path", () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-hash-'));
    try {
      const file = join(dir, 'a.ts');
      writeFileSync(file, 'export const a = 1;\n');
      expect(fileHashOf(file)).toBe(sha256Of('export const a = 1;\n'));
      expect(fileHashOf(file)).toMatch(/^[0-9a-f]{64}$/);
      expect(fileHashOf(join(dir, 'missing.ts'))).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
