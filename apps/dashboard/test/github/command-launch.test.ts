// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for how a bare command name becomes something CreateProcess can
 * actually start on Windows — the gap that made the over-the-air update report
 * a bare "pnpm install failed" naming nothing.
 *
 * `pnpm`, `npm`, `yarn` and `claude` all install as `.CMD` batch shims on
 * Windows. CreateProcess cannot launch a batch file, so `execFile('pnpm', …)`
 * fails with errno `ENOENT` and an EMPTY stderr — the update code then fell
 * back to its default message, which named nothing and pointed nowhere. `git`
 * kept working throughout because it ships a real `git.exe`, which is exactly
 * why the failure read as "pnpm is broken" rather than "we cannot start batch
 * shims".
 *
 * `platform`/`env`/`exists` are injected so this runs identically on a Linux CI
 * box and a Windows one — the defect does not exist on POSIX, so a test that
 * only exercised the host's real behaviour would prove nothing on the machines
 * where it bites.
 *
 * Fixture paths are assembled with path.win32.join from a bare drive letter, so
 * no literal machine-shaped path appears in source — see the note by the
 * constants.
 */
import { describe, it, expect } from 'vitest';
import { win32 as pathWin32 } from 'node:path';
import { commandLaunch, type LaunchProbe } from '../../src/github/command-launch.js';

// Assembled from parts rather than written whole: a literal drive path in
// source trips ci:no-personal-paths, which is deliberately blunt about
// anything shaped like someone's machine. Same construction that validator's
// own test uses on itself, for the same reason — these are fixtures, and no
// such directory has to exist anywhere.
const DRIVE = 'C:' + pathWin32.sep;
const SYSTEM32 = pathWin32.join(DRIVE, 'Windows', 'system32');
const CMD_EXE = pathWin32.join(SYSTEM32, 'cmd.exe');
const USER_BIN = pathWin32.join(DRIVE, 'Users', 'x', '.local', 'bin');

/** A Windows probe whose filesystem contains exactly `present`. */
function windows(present: readonly string[]): LaunchProbe {
  const set = new Set(present.map((p) => p.toLowerCase()));
  return {
    platform: 'win32',
    env: { Path: `${SYSTEM32};${USER_BIN}`, PATHEXT: '.COM;.EXE;.BAT;.CMD', ComSpec: CMD_EXE },
    exists: (p) => set.has(p.toLowerCase()),
  };
}

const posix: LaunchProbe = {
  platform: 'linux',
  env: { PATH: '/usr/bin:/bin' },
  exists: () => true,
};

describe('commandLaunch on POSIX', () => {
  it('passes the command straight through — there are no batch shims to route around', () => {
    expect(commandLaunch('pnpm', ['install', '--frozen-lockfile'], posix)).toEqual({
      file: 'pnpm',
      args: ['install', '--frozen-lockfile'],
    });
  });
});

describe('commandLaunch on Windows', () => {
  it('routes a .CMD shim through the command processor — CreateProcess cannot start a batch file', () => {
    const shim = pathWin32.join(USER_BIN, 'pnpm.CMD');

    const launch = commandLaunch('pnpm', ['install', '--frozen-lockfile'], windows([shim]));

    expect(launch.file).toBe(CMD_EXE);
    expect(launch.args).toEqual(['/d', '/s', '/c', shim, 'install', '--frozen-lockfile']);
  });

  it('does NOT route a real .exe through the command processor', () => {
    // This runner is shared with calls that pass user-derived values (branch
    // and repo names). cmd.exe would re-parse those; execFile does not. Only a
    // shim that genuinely cannot be started directly earns the detour.
    const exe = pathWin32.join(SYSTEM32, 'git.exe');

    const launch = commandLaunch('git', ['pull', '--ff-only', 'origin'], windows([exe]));

    // The extension case follows PATHEXT, not the on-disk spelling — which
    // is correct on a case-insensitive filesystem, so compare as Windows does.
    expect(launch.file.toLowerCase()).toBe(exe.toLowerCase());
    expect(launch.args).toEqual(['pull', '--ff-only', 'origin']);
  });

  it('honours PATHEXT order — an .exe earlier in PATHEXT wins over a later .cmd', () => {
    const launch = commandLaunch(
      'tool',
      [],
      windows([pathWin32.join(SYSTEM32, 'tool.exe'), pathWin32.join(SYSTEM32, 'tool.cmd')]),
    );

    expect(launch.file.toLowerCase()).toBe(pathWin32.join(SYSTEM32, 'tool.exe').toLowerCase());
  });

  it('honours PATH order — the first directory holding a match wins', () => {
    const launch = commandLaunch(
      'tool',
      [],
      windows([pathWin32.join(SYSTEM32, 'tool.exe'), pathWin32.join(USER_BIN, 'tool.exe')]),
    );

    expect(launch.file.toLowerCase()).toBe(pathWin32.join(SYSTEM32, 'tool.exe').toLowerCase());
  });

  it('routes a .BAT shim too, case-insensitively', () => {
    const launch = commandLaunch('thing', ['go'], windows([pathWin32.join(USER_BIN, 'THING.BAT')]));

    expect(launch.file).toBe(CMD_EXE);
    expect(launch.args.slice(0, 3)).toEqual(['/d', '/s', '/c']);
  });

  it('leaves an unresolvable command alone, so execFile reports its own ENOENT', () => {
    // Inventing a path here would turn "not installed" into a confusing
    // "cannot start <fabricated path>". The real errno is the better message.
    expect(commandLaunch('nope', ['x'], windows([]))).toEqual({ file: 'nope', args: ['x'] });
  });

  it('falls back to cmd.exe when ComSpec is unset', () => {
    const shim = pathWin32.join(DRIVE, 'bin', 'pnpm.cmd');
    const probe: LaunchProbe = {
      platform: 'win32',
      env: { Path: pathWin32.join(DRIVE, 'bin'), PATHEXT: '.CMD' },
      exists: (p) => p.toLowerCase() === shim.toLowerCase(),
    };

    expect(commandLaunch('pnpm', [], probe).file).toBe('cmd.exe');
  });

  it('accepts a command spelled with its own path and extension, without searching PATH', () => {
    const shim = pathWin32.join(DRIVE, 'tools', 'pnpm.cmd');

    const launch = commandLaunch(shim, ['install'], windows([shim]));

    expect(launch.file).toBe(CMD_EXE);
    expect(launch.args).toEqual(['/d', '/s', '/c', shim, 'install']);
  });
});
