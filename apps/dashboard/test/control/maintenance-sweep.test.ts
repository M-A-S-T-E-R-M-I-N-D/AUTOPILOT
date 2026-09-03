// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The unifying triage surface (epic 0010 slice 3, board web-mstdokr6-qgxqz8):
 * dependabot backlog + doc-freshness + release plan + CI runs, one read.
 * Every section is injectable/pure or repo-path-scoped so the suite never
 * shells out to a real `gh` process or depends on this repo's own git state.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  dependabotPrBacklog,
  docFreshnessSweep,
  releaseSweep,
  maintenanceSweepReport,
} from '../../src/control/maintenance-sweep.js';

describe('dependabotPrBacklog', () => {
  it('reports no open PRs as ok', () => {
    const backlog = dependabotPrBacklog(() => '[]');
    expect(backlog).toEqual({ ok: true, detail: 'no open dependabot PRs' });
  });

  it('flags an open backlog as needing a look, listing up to 3 PR numbers', () => {
    const backlog = dependabotPrBacklog(() =>
      JSON.stringify([{ number: 1 }, { number: 2 }, { number: 3 }, { number: 4 }]),
    );
    expect(backlog.ok).toBe(false);
    expect(backlog.detail).toBe('4 open PR(s) waiting for a look: #1, #2, #3 (+1 more)');
  });

  it('degrades to an unknown line when gh is unavailable — never throws', () => {
    const backlog = dependabotPrBacklog(() => {
      throw new Error('spawn gh ENOENT');
    });
    expect(backlog.ok).toBe(true);
    expect(backlog.detail).toContain('gh unavailable');
  });

  it('degrades gracefully on malformed JSON output', () => {
    const backlog = dependabotPrBacklog(() => 'not json');
    expect(backlog.ok).toBe(true);
    expect(backlog.detail).toContain('could not parse');
  });

  it('runs the exact read-only gh pr list command, never a mutating one', () => {
    const calls: string[][] = [];
    dependabotPrBacklog((args) => {
      calls.push([...args]);
      return '[]';
    });
    expect(calls).toEqual([
      ['pr', 'list', '--author', 'app/dependabot', '--state', 'open', '--json', 'number'],
    ]);
  });
});

describe('docFreshnessSweep', () => {
  it('degrades to a skipped-but-ok line when git is unavailable — never throws', () => {
    const sweep = docFreshnessSweep('does/not/exist/at/all');
    expect(sweep.ok).toBe(true);
    expect(sweep.findings).toEqual([]);
  });
});

describe('releaseSweep', () => {
  it('reports unknown when package.json is missing — never throws', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-maint-sweep-'));
    try {
      const sweep = await releaseSweep(dir);
      expect(sweep.ok).toBe(true);
      expect(sweep.detail).toContain('could not compute');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports unknown when package.json has no version field', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-maint-sweep-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x' }));
      const sweep = await releaseSweep(dir);
      expect(sweep).toEqual({ ok: true, detail: 'package.json has no version — unknown' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports "no tag yet" when a real repo has a versioned package.json but no tags', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-maint-sweep-'));
    try {
      execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
      const sweep = await releaseSweep(dir);
      expect(sweep).toEqual({ ok: true, detail: 'no release tag yet — nothing to diff against' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('maintenanceSweepReport', () => {
  it('gathers all four sections together, each independently', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-maint-sweep-'));
    try {
      const report = await maintenanceSweepReport(dir, () => {
        throw new Error('spawn gh ENOENT');
      });
      expect(report.dependabot.detail).toContain('gh unavailable');
      expect(report.docFreshness.ok).toBe(true);
      expect(report.release.detail).toContain('could not compute');
      // ciRuns defaults to this REAL repo's .github/workflows listing (same
      // as ciRunReport's own default) — every entry still degrades
      // gracefully since `run` throws for every workflow.
      expect(report.ciRuns.length).toBeGreaterThan(0);
      for (const c of report.ciRuns) {
        expect(c.ok).toBe(true);
        expect(c.detail).toContain('gh unavailable');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
