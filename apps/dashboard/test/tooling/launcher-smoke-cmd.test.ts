// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for the pure helpers of scripts/ci/launcher-smoke-cmd.mjs, the
 * Windows gate that runs every committed `.cmd` launcher under `cmd.exe` with
 * a recording pnpm stub and a recorder real `node.exe` runs: isCmdLauncher()
 * (which file names count), discoverCmdLaunchers() (the scan),
 * assertManifestCovers() (the manifest-drift check), scenariosFor() (which
 * runs each launcher gets), readRecord() (a record file's calls) and
 * checkScenario() (the pass/fail verdict on one run). The `cmd.exe` runs
 * themselves stay unimported, same stance launcher-smoke.test.ts takes for
 * its `bash` runs, so this file runs on every platform. All six helpers are
 * mutation-tested (config/mutation/stryker.ci-launcher-smoke-cmd.config.mjs).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MANIFEST,
  assertManifestCovers,
  checkScenario,
  discoverCmdLaunchers,
  isCmdLauncher,
  readRecord,
  scenariosFor,
  type LauncherEntry,
  type ScenarioRun,
} from '../../../../scripts/ci/launcher-smoke-cmd.mjs';

const scratchDirs: string[] = [];

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'launcher-smoke-cmd-test-'));
  scratchDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('isCmdLauncher', () => {
  it('matches setup.cmd and any *-dashboard.cmd, whatever the case', () => {
    for (const name of ['SETUP.cmd', 'setup.cmd', 'START-DASHBOARD.cmd', 'watch-dashboard.CMD']) {
      expect(isCmdLauncher(name), name).toBe(true);
    }
  });

  it('rejects near misses: other extensions, suffixes after .cmd, no hyphen', () => {
    for (const name of [
      'README.md',
      'setup.cmd.bak',
      '-dashboard.cmd.bak',
      'dashboard.cmd',
      'START-DASHBOARD.sh',
      'SETUP.sh',
    ]) {
      expect(isCmdLauncher(name), name).toBe(false);
    }
  });
});

describe('discoverCmdLaunchers', () => {
  it('scans the root and scripts/launchers/, prefixing the subdir, sorted', () => {
    const root = scratch();
    mkdirSync(join(root, 'scripts/launchers'), { recursive: true });
    for (const name of ['SETUP.cmd', 'z-dashboard.cmd', 'README.md', 'START-DASHBOARD.sh']) {
      writeFileSync(join(root, name), '');
    }
    for (const name of ['a-dashboard.cmd', 'FLY-DASHBOARD.sh']) {
      writeFileSync(join(root, 'scripts/launchers', name), '');
    }
    // Byte order: the subdir entry sorts between the two root entries, so an
    // unsorted scan (root first, then the subdir) reads differently.
    expect(discoverCmdLaunchers(root)).toEqual([
      'SETUP.cmd',
      'scripts/launchers/a-dashboard.cmd',
      'z-dashboard.cmd',
    ]);
  });

  it('defaults to this repo, and the real manifest covers exactly what it finds', () => {
    expect(discoverCmdLaunchers()).toContain('SETUP.cmd');
    expect(() => assertManifestCovers(discoverCmdLaunchers(), MANIFEST)).not.toThrow();
  });
});

function entry(overrides: Partial<LauncherEntry> = {}): LauncherEntry {
  return {
    file: 'GO-DASHBOARD.cmd',
    buildsFirst: false,
    requiresDist: false,
    target: 'apps/dashboard/dist/control/cli.js',
    targetType: 'cjs',
    nodeInvocations: [['go']],
    ...overrides,
  };
}

describe('assertManifestCovers', () => {
  it('passes when the manifest names exactly the discovered files, in any order', () => {
    const manifest = [entry({ file: 'B-DASHBOARD.cmd' }), entry({ file: 'A-DASHBOARD.cmd' })];
    expect(() =>
      assertManifestCovers(['A-DASHBOARD.cmd', 'B-DASHBOARD.cmd'], manifest),
    ).not.toThrow();
  });

  it('names both lists when a launcher on disk is missing from the manifest', () => {
    const manifest = [entry({ file: 'B-DASHBOARD.cmd' }), entry({ file: 'A-DASHBOARD.cmd' })];
    expect(() =>
      assertManifestCovers(['A-DASHBOARD.cmd', 'B-DASHBOARD.cmd', 'C-DASHBOARD.cmd'], manifest),
    ).toThrow(
      "launcher-smoke-cmd's manifest is out of date — discovered [A-DASHBOARD.cmd, B-DASHBOARD.cmd, C-DASHBOARD.cmd] but the manifest covers [A-DASHBOARD.cmd, B-DASHBOARD.cmd]. Add the new launcher to MANIFEST in scripts/ci/launcher-smoke-cmd.mjs.",
    );
  });

  it('fails when the manifest still names a launcher that is gone', () => {
    const manifest = [entry({ file: 'A-DASHBOARD.cmd' }), entry({ file: 'B-DASHBOARD.cmd' })];
    expect(() => assertManifestCovers(['A-DASHBOARD.cmd'], manifest)).toThrow(/out of date/);
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
  it('reads one call per LF-terminated line, keeping empty calls and trailing spaces', () => {
    const file = join(scratch(), 'node.calls');
    // SETUP.cmd's no-arg call records an empty line; WATCH-DASHBOARD.cmd's
    // `"%~1"` records `watch ` with a real trailing space.
    writeFileSync(file, 'watch \n\nstatus\n');
    expect(readRecord(file)).toEqual(['watch ', '', 'status']);
  });

  it('strips only the CR a batch `echo` leaves at the end of a line', () => {
    const file = join(scratch(), 'pnpm.calls');
    writeFileSync(file, 'run build \r\na\rb\r\n');
    expect(readRecord(file)).toEqual(['run build ', 'a\rb']);
  });

  it('reads an empty file, or a stub that never ran (no file), as no calls', () => {
    const dir = scratch();
    writeFileSync(join(dir, 'empty.calls'), '');
    expect(readRecord(join(dir, 'empty.calls'))).toEqual([]);
    expect(readRecord(join(dir, 'node.calls'))).toEqual([]);
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
      checkScenario(builder, BUILD_FAILS, { ...failed, pnpmCalls: ['run build '] }),
    ).not.toThrow();
  });

  it('fails when the launcher still exits 0', () => {
    expect(() => checkScenario(builder, BUILD_FAILS, { ...failed, exitCode: 0 })).toThrow(
      'GO-DASHBOARD.cmd: expected exit 1 on a failed build, got 0',
    );
  });

  it('fails when node ran anyway', () => {
    const nodeCalls = ['go', 'again'];
    expect(() => checkScenario(builder, BUILD_FAILS, { ...failed, nodeCalls })).toThrow(
      'GO-DASHBOARD.cmd: a failed `pnpm run build` must short-circuit before ever invoking node, saw: go | again',
    );
  });

  it('fails without the notice', () => {
    expect(() => checkScenario(builder, BUILD_FAILS, { ...failed, output: 'build broke' })).toThrow(
      'GO-DASHBOARD.cmd: a failed build must print a "BUILD FAILED" notice, got: build broke',
    );
  });
});

describe('checkScenario — dist not built yet', () => {
  const needsDist = entry({ requiresDist: true });

  it('passes on a clean exit with no node call', () => {
    expect(() => checkScenario(needsDist, NO_DIST, run({ output: 'not built yet' }))).not.toThrow();
  });

  it('fails on a non-zero exit, naming the missing target', () => {
    expect(() => checkScenario(needsDist, NO_DIST, run({ exitCode: 1 }))).toThrow(
      'GO-DASHBOARD.cmd: missing apps/dashboard/dist/control/cli.js must exit 0 gracefully (nothing to do yet), got 1',
    );
  });

  it('fails when node ran anyway', () => {
    expect(() => checkScenario(needsDist, NO_DIST, run({ nodeCalls: ['a', 'b'] }))).toThrow(
      'GO-DASHBOARD.cmd: missing apps/dashboard/dist/control/cli.js must never invoke node, saw: a | b',
    );
  });

  it('holds a launcher that does not need dist to its happy-path expectations', () => {
    expect(() => checkScenario(entry(), NO_DIST, run({ nodeCalls: ['go'] }))).not.toThrow();
  });
});

describe('checkScenario — the happy path', () => {
  it('passes a plain launcher that ran node once and never pnpm', () => {
    expect(() => checkScenario(entry(), HAPPY, run({ nodeCalls: ['go'] }))).not.toThrow();
  });

  it('passes a dist-requiring launcher once dist is there', () => {
    const needsDist = entry({ requiresDist: true });
    expect(() => checkScenario(needsDist, HAPPY, run({ nodeCalls: ['go'] }))).not.toThrow();
  });

  it('joins an invocation with spaces, so a forwarded empty argument keeps its space', () => {
    const watch = entry({ nodeInvocations: [['watch', '']] });
    expect(() => checkScenario(watch, HAPPY, run({ nodeCalls: ['watch '] }))).not.toThrow();
    expect(() => checkScenario(watch, HAPPY, run({ nodeCalls: ['watch'] }))).toThrow(
      'GO-DASHBOARD.cmd: node invocation #1 expected "watch ", got "watch"',
    );
  });

  it('fails on a non-zero exit, quoting the output', () => {
    const failed = run({ exitCode: 2, output: 'boom', nodeCalls: ['go'] });
    expect(() => checkScenario(entry(), HAPPY, failed)).toThrow(
      'GO-DASHBOARD.cmd: expected a clean exit 0, got 2. Output: boom',
    );
  });

  const twoCalls = entry({ nodeInvocations: [['status'], ['doctor']] });

  it('fails on an extra node invocation', () => {
    const nodeCalls = ['status', 'doctor', 'extra'];
    expect(() => checkScenario(twoCalls, HAPPY, run({ nodeCalls }))).toThrow(
      'GO-DASHBOARD.cmd: expected 2 node invocation(s), saw 3: status | doctor | extra',
    );
  });

  it('names the first node invocation that differs, counting from 1', () => {
    const nodeCalls = ['status', 'status'];
    expect(() => checkScenario(twoCalls, HAPPY, run({ nodeCalls }))).toThrow(
      'GO-DASHBOARD.cmd: node invocation #2 expected "doctor", got "status"',
    );
  });

  const builder = entry({ buildsFirst: true });

  it('passes a builder whose pnpm calls include the build, trailing echo space and all', () => {
    const pnpmCalls = ['install --frozen-lockfile ', 'run build '];
    expect(() =>
      checkScenario(builder, HAPPY, run({ nodeCalls: ['go'], pnpmCalls })),
    ).not.toThrow();
  });

  it('fails a builder that never ran the build', () => {
    const pnpmCalls = ['install --frozen-lockfile ', 'run start '];
    expect(() => checkScenario(builder, HAPPY, run({ nodeCalls: ['go'], pnpmCalls }))).toThrow(
      'GO-DASHBOARD.cmd: expected `pnpm run build` before launching, saw: install --frozen-lockfile  | run start ',
    );
  });

  it('fails a non-builder that invoked pnpm at all', () => {
    const pnpmCalls = ['install', 'run build'];
    expect(() => checkScenario(entry(), HAPPY, run({ nodeCalls: ['go'], pnpmCalls }))).toThrow(
      'GO-DASHBOARD.cmd: does not build, but pnpm was invoked: install | run build',
    );
  });
});
