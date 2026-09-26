// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for the pure helpers of scripts/ci/launcher-smoke.mjs, the gate
 * that runs every committed `.sh` launcher under `bash` with recording
 * pnpm/node stubs: isShLauncher() (which file names count), discoverShLaunchers()
 * (the scan), assertManifestCovers() (the manifest-drift check),
 * scenariosFor() (which runs each launcher gets), readRecord() (a stub's
 * recorded calls) and checkScenario() (the pass/fail verdict on one run).
 * The `bash` runs themselves stay unimported, same stance
 * npx-smoke-test.test.ts takes for its process glue. All six helpers are
 * mutation-tested (config/mutation/stryker.ci-launcher-smoke.config.mjs).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MANIFEST,
  assertManifestCovers,
  checkScenario,
  discoverShLaunchers,
  isShLauncher,
  readRecord,
  scenariosFor,
  type LauncherEntry,
  type ScenarioRun,
} from '../../../../scripts/ci/launcher-smoke.mjs';

const scratchDirs: string[] = [];

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'launcher-smoke-test-'));
  scratchDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('isShLauncher', () => {
  it('matches setup.sh and any *-dashboard.sh, whatever the case', () => {
    for (const name of ['SETUP.sh', 'setup.sh', 'START-DASHBOARD.sh', 'watch-dashboard.SH']) {
      expect(isShLauncher(name), name).toBe(true);
    }
  });

  it('rejects near misses: other extensions, suffixes after .sh, no hyphen', () => {
    for (const name of [
      'README.md',
      'setup.sh.bak',
      '-dashboard.sh.bak',
      'dashboard.sh',
      'START-DASHBOARD.cmd',
    ]) {
      expect(isShLauncher(name), name).toBe(false);
    }
  });
});

describe('discoverShLaunchers', () => {
  it('scans the root and scripts/launchers/, prefixing the subdir, sorted', () => {
    const root = scratch();
    mkdirSync(join(root, 'scripts/launchers'), { recursive: true });
    for (const name of ['SETUP.sh', 'z-dashboard.sh', 'README.md', 'START-DASHBOARD.cmd']) {
      writeFileSync(join(root, name), '');
    }
    for (const name of ['a-dashboard.sh', 'FLY-DASHBOARD.cmd']) {
      writeFileSync(join(root, 'scripts/launchers', name), '');
    }
    // Byte order: the subdir entry sorts between the two root entries, so an
    // unsorted scan (root first, then the subdir) reads differently.
    expect(discoverShLaunchers(root)).toEqual([
      'SETUP.sh',
      'scripts/launchers/a-dashboard.sh',
      'z-dashboard.sh',
    ]);
  });

  it('defaults to this repo, and the real manifest covers exactly what it finds', () => {
    expect(discoverShLaunchers()).toContain('SETUP.sh');
    expect(() => assertManifestCovers(discoverShLaunchers(), MANIFEST)).not.toThrow();
  });
});

function entry(overrides: Partial<LauncherEntry> = {}): LauncherEntry {
  return {
    file: 'GO-DASHBOARD.sh',
    buildsFirst: false,
    requiresDist: false,
    nodeInvocations: [['cli.js', 'go']],
    ...overrides,
  };
}

describe('assertManifestCovers', () => {
  it('passes when the manifest names exactly the discovered files, in any order', () => {
    const manifest = [entry({ file: 'B-DASHBOARD.sh' }), entry({ file: 'A-DASHBOARD.sh' })];
    expect(() =>
      assertManifestCovers(['A-DASHBOARD.sh', 'B-DASHBOARD.sh'], manifest),
    ).not.toThrow();
  });

  it('names both lists when a launcher on disk is missing from the manifest', () => {
    const manifest = [entry({ file: 'B-DASHBOARD.sh' }), entry({ file: 'A-DASHBOARD.sh' })];
    expect(() =>
      assertManifestCovers(['A-DASHBOARD.sh', 'B-DASHBOARD.sh', 'C-DASHBOARD.sh'], manifest),
    ).toThrow(
      "launcher-smoke's manifest is out of date — discovered [A-DASHBOARD.sh, B-DASHBOARD.sh, C-DASHBOARD.sh] but the manifest covers [A-DASHBOARD.sh, B-DASHBOARD.sh]. Add the new launcher to MANIFEST in scripts/ci/launcher-smoke.mjs.",
    );
  });

  it('fails when the manifest still names a launcher that is gone', () => {
    const manifest = [entry({ file: 'A-DASHBOARD.sh' }), entry({ file: 'B-DASHBOARD.sh' })];
    expect(() => assertManifestCovers(['A-DASHBOARD.sh'], manifest)).toThrow(/out of date/);
  });
});

const HAPPY = { simulateBuildFailure: false, includeDist: true };
const BUILD_FAILS = { simulateBuildFailure: true, includeDist: true };
const NO_DIST = { simulateBuildFailure: false, includeDist: false };

describe('scenariosFor', () => {
  it('gives a launcher that neither builds nor needs dist just the happy path', () => {
    expect(scenariosFor(entry())).toEqual([HAPPY]);
  });

  it('adds the build-failure run for a builder', () => {
    expect(scenariosFor(entry({ buildsFirst: true }))).toEqual([HAPPY, BUILD_FAILS]);
  });

  it('adds the not-built-yet run for a dist-requiring launcher', () => {
    expect(scenariosFor(entry({ requiresDist: true }))).toEqual([HAPPY, NO_DIST]);
  });

  it('gives a builder that also requires dist only the build-failure run', () => {
    expect(scenariosFor(entry({ buildsFirst: true, requiresDist: true }))).toEqual([
      HAPPY,
      BUILD_FAILS,
    ]);
  });
});

describe('readRecord', () => {
  it('reads one call per line, dropping blank lines and surrounding whitespace', () => {
    const file = join(scratch(), 'pnpm.calls');
    writeFileSync(file, '  run build\n\ndashboard:watch  \n');
    expect(readRecord(file)).toEqual(['run build', 'dashboard:watch']);
  });

  it('reads a stub that never ran (no file) as no calls', () => {
    expect(readRecord(join(scratch(), 'node.calls'))).toEqual([]);
  });
});

function run(overrides: Partial<ScenarioRun> = {}): ScenarioRun {
  return { exitCode: 0, output: '', nodeCalls: [], pnpmCalls: [], ...overrides };
}

describe('checkScenario — a failed build', () => {
  const builder = entry({ buildsFirst: true });
  const failed = run({ exitCode: 1, output: '  BUILD FAILED -- see the errors above.' });

  it('passes on exit 1, no node call and the BUILD FAILED notice', () => {
    expect(() =>
      checkScenario(builder, BUILD_FAILS, { ...failed, pnpmCalls: ['run build'] }),
    ).not.toThrow();
  });

  it('fails when the launcher still exits 0', () => {
    expect(() => checkScenario(builder, BUILD_FAILS, { ...failed, exitCode: 0 })).toThrow(
      'GO-DASHBOARD.sh: expected exit 1 on a failed build, got 0',
    );
  });

  it('fails when node ran anyway', () => {
    const nodeCalls = ['cli.js go', 'cli.js again'];
    expect(() => checkScenario(builder, BUILD_FAILS, { ...failed, nodeCalls })).toThrow(
      'GO-DASHBOARD.sh: a failed `pnpm run build` must short-circuit before ever invoking node, saw: cli.js go | cli.js again',
    );
  });

  it('fails without the notice', () => {
    expect(() => checkScenario(builder, BUILD_FAILS, { ...failed, output: 'build broke' })).toThrow(
      'GO-DASHBOARD.sh: a failed build must print a "BUILD FAILED" notice, got: build broke',
    );
  });
});

describe('checkScenario — dist not built yet', () => {
  const needsDist = entry({ requiresDist: true });

  it('passes on a clean exit with no node call', () => {
    expect(() => checkScenario(needsDist, NO_DIST, run({ output: 'not built yet' }))).not.toThrow();
  });

  it('fails on a non-zero exit', () => {
    expect(() => checkScenario(needsDist, NO_DIST, run({ exitCode: 1 }))).toThrow(
      'GO-DASHBOARD.sh: missing dist/cli.js must exit 0 gracefully (nothing to do yet), got 1',
    );
  });

  it('fails when node ran anyway', () => {
    expect(() => checkScenario(needsDist, NO_DIST, run({ nodeCalls: ['a', 'b'] }))).toThrow(
      'GO-DASHBOARD.sh: missing dist/cli.js must never invoke node, saw: a | b',
    );
  });

  it('holds a launcher that does not need dist to its happy-path expectations', () => {
    expect(() => checkScenario(entry(), NO_DIST, run({ nodeCalls: ['cli.js go'] }))).not.toThrow();
  });
});

describe('checkScenario — the happy path', () => {
  it('passes a plain launcher that ran node once and never pnpm', () => {
    expect(() => checkScenario(entry(), HAPPY, run({ nodeCalls: ['cli.js go'] }))).not.toThrow();
  });

  it('passes a dist-requiring launcher once dist is there', () => {
    const needsDist = entry({ requiresDist: true });
    expect(() => checkScenario(needsDist, HAPPY, run({ nodeCalls: ['cli.js go'] }))).not.toThrow();
  });

  it('fails on a non-zero exit, quoting the output', () => {
    const failed = run({ exitCode: 2, output: 'boom', nodeCalls: ['cli.js go'] });
    expect(() => checkScenario(entry(), HAPPY, failed)).toThrow(
      'GO-DASHBOARD.sh: expected a clean exit 0, got 2. Output: boom',
    );
  });

  const twoCalls = entry({
    nodeInvocations: [
      ['cli.js', 'status'],
      ['cli.js', 'doctor'],
    ],
  });

  it('fails on an extra node invocation', () => {
    const nodeCalls = ['cli.js status', 'cli.js doctor', 'cli.js extra'];
    expect(() => checkScenario(twoCalls, HAPPY, run({ nodeCalls }))).toThrow(
      'GO-DASHBOARD.sh: expected 2 node invocation(s), saw 3: cli.js status | cli.js doctor | cli.js extra',
    );
  });

  it('names the first node invocation that differs, counting from 1', () => {
    const nodeCalls = ['cli.js status', 'cli.js status'];
    expect(() => checkScenario(twoCalls, HAPPY, run({ nodeCalls }))).toThrow(
      'GO-DASHBOARD.sh: node invocation #2 expected "cli.js doctor", got "cli.js status"',
    );
  });

  const pinned = entry({
    buildsFirst: true,
    nodeInvocations: [],
    pnpmInvocations: ['run build', 'dashboard:watch'],
  });

  it('passes a pinned pnpm argv that matches exactly', () => {
    const pnpmCalls = ['run build', 'dashboard:watch'];
    expect(() => checkScenario(pinned, HAPPY, run({ pnpmCalls }))).not.toThrow();
  });

  it('fails a pinned pnpm argv carrying a stray token', () => {
    const pnpmCalls = ['run build', 'dashboard:watch --'];
    expect(() => checkScenario(pinned, HAPPY, run({ pnpmCalls }))).toThrow(
      'GO-DASHBOARD.sh: pnpm invocations expected [run build | dashboard:watch], saw [run build | dashboard:watch --]',
    );
  });

  const builder = entry({ buildsFirst: true });

  it('passes a builder whose pnpm calls include the build among others', () => {
    const pnpmCalls = ['install --frozen-lockfile', 'run build'];
    expect(() =>
      checkScenario(builder, HAPPY, run({ nodeCalls: ['cli.js go'], pnpmCalls })),
    ).not.toThrow();
  });

  it('fails a builder that never ran the build', () => {
    const pnpmCalls = ['install --frozen-lockfile', 'dashboard:start'];
    expect(() =>
      checkScenario(builder, HAPPY, run({ nodeCalls: ['cli.js go'], pnpmCalls })),
    ).toThrow(
      'GO-DASHBOARD.sh: expected `pnpm run build` before launching, saw: install --frozen-lockfile | dashboard:start',
    );
  });

  it('fails a non-builder that invoked pnpm at all', () => {
    const pnpmCalls = ['install', 'run build'];
    expect(() =>
      checkScenario(entry(), HAPPY, run({ nodeCalls: ['cli.js go'], pnpmCalls })),
    ).toThrow('GO-DASHBOARD.sh: does not build, but pnpm was invoked: install | run build');
  });
});
