// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * GITHUB CONNECTION MANAGEMENT (epic 0029 slice 2): the three verbs are fixed
 * `gh auth …` literals opened in a terminal per platform — the Claude login's
 * own pattern — never a shell built from input, never the credential itself.
 */

import { describe, it, expect } from 'vitest';
import {
  GH_AUTH_KINDS,
  ghTerminalCommand,
  isGhAuthKind,
  launchGhAuth,
} from '../../src/connection/gh-login.js';

describe('isGhAuthKind', () => {
  it('accepts exactly login, switch and logout', () => {
    expect(GH_AUTH_KINDS).toEqual(['login', 'switch', 'logout']);
    for (const kind of GH_AUTH_KINDS) expect(isGhAuthKind(kind)).toBe(true);
    for (const bad of ['revoke', '', 'LOGIN', 'login/x', 42, null, undefined])
      expect(isGhAuthKind(bad)).toBe(false);
  });
});

describe('ghTerminalCommand', () => {
  it('opens a cmd terminal running the device-flow login on Windows', () => {
    expect(ghTerminalCommand('win32', 'login')).toEqual({
      bin: 'cmd',
      args: [
        '/c',
        'start',
        'AUTOPILOT GitHub login',
        'cmd',
        '/k',
        'gh auth login --web --git-protocol https',
      ],
    });
  });

  it('switches and logs out through their own fixed verbs and titles', () => {
    expect(ghTerminalCommand('win32', 'switch').args).toEqual([
      '/c',
      'start',
      'AUTOPILOT GitHub switch',
      'cmd',
      '/k',
      'gh auth switch',
    ]);
    expect(ghTerminalCommand('win32', 'logout').args).toEqual([
      '/c',
      'start',
      'AUTOPILOT GitHub logout',
      'cmd',
      '/k',
      'gh auth logout',
    ]);
  });

  it('uses Terminal via osascript on macOS', () => {
    expect(ghTerminalCommand('darwin', 'login')).toEqual({
      bin: 'osascript',
      args: [
        '-e',
        'tell application "Terminal" to do script "gh auth login --web --git-protocol https"',
      ],
    });
  });

  it('uses x-terminal-emulator on Linux', () => {
    expect(ghTerminalCommand('linux', 'logout')).toEqual({
      bin: 'x-terminal-emulator',
      args: ['-e', 'gh auth logout'],
    });
  });

  it('never carries anything but the fixed literal — no token, no user text', () => {
    for (const kind of GH_AUTH_KINDS) {
      for (const platform of ['win32', 'darwin', 'linux'] as const) {
        const joined = ghTerminalCommand(platform, kind).args.join(' ');
        expect(joined).toMatch(/gh auth (login --web --git-protocol https|switch|logout)/);
        expect(joined).not.toMatch(/--with-token|GH_TOKEN|GITHUB_TOKEN/);
      }
    }
  });
});

describe('launchGhAuth', () => {
  it('spawns the platform command once and returns it', () => {
    const calls: { bin: string; args: readonly string[] }[] = [];
    const cmd = launchGhAuth('switch', 'linux', (bin, args) => calls.push({ bin, args }));
    expect(cmd).toEqual({ bin: 'x-terminal-emulator', args: ['-e', 'gh auth switch'] });
    expect(calls).toEqual([{ bin: 'x-terminal-emulator', args: ['-e', 'gh auth switch'] }]);
  });
});
