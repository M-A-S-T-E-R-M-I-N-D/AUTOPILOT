// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * GitHub connection management (epic 0029 slice 2): log in, switch account,
 * log out — each opens a terminal running one fixed `gh auth …` command, the
 * way `login.ts` opens one running `claude`. AUTOPILOT never performs the
 * OAuth flow or touches the credential: `gh` prints its one-time code in
 * that terminal, the operator finishes there, and the Connect popover's
 * status line re-reads `gh auth status`. Epic 0006's law ("never runs `gh
 * auth login` for the operator") holds in spirit — nothing is done on the
 * operator's behalf; a terminal is opened for them. Pure, per-platform
 * command values, so every shape is testable without spawning anything.
 */

import { type LaunchCommand, type LoginSpawn, realLoginSpawn } from './login.js';

export type GhAuthKind = 'login' | 'switch' | 'logout';

export const GH_AUTH_KINDS: readonly GhAuthKind[] = ['login', 'switch', 'logout'];

/** Route-safe narrowing for `/api/connection/gh/<kind>`. */
export function isGhAuthKind(value: unknown): value is GhAuthKind {
  return typeof value === 'string' && (GH_AUTH_KINDS as readonly string[]).includes(value);
}

/** Fixed literals — never user input. `--web` keeps the device-code flow
 *  (the code shows in the terminal, the browser opens on Enter); https is
 *  the protocol AUTOPILOT's own GitHub sync uses. */
const GH_INVOCATION: Readonly<Record<GhAuthKind, string>> = {
  login: 'gh auth login --web --git-protocol https',
  switch: 'gh auth switch',
  logout: 'gh auth logout',
};

/** ASCII-only window titles (some code pages mangle non-ASCII in `start`). */
const WINDOW_TITLE: Readonly<Record<GhAuthKind, string>> = {
  login: 'AUTOPILOT GitHub login',
  switch: 'AUTOPILOT GitHub switch',
  logout: 'AUTOPILOT GitHub logout',
};

/**
 * The command that opens a terminal running the chosen `gh auth` verb, per
 * platform — argv-structured, mirroring `loginTerminalCommand`.
 */
export function ghTerminalCommand(platform: NodeJS.Platform, kind: GhAuthKind): LaunchCommand {
  const gh = GH_INVOCATION[kind];
  if (platform === 'win32') {
    return { bin: 'cmd', args: ['/c', 'start', WINDOW_TITLE[kind], 'cmd', '/k', gh] };
  }
  if (platform === 'darwin') {
    return {
      bin: 'osascript',
      args: ['-e', `tell application "Terminal" to do script "${gh}"`],
    };
  }
  return { bin: 'x-terminal-emulator', args: ['-e', gh] };
}

/** Launch the verb in a terminal. Returns the command that was launched (for guidance). */
export function launchGhAuth(
  kind: GhAuthKind,
  platform: NodeJS.Platform = process.platform,
  spawnImpl: LoginSpawn = realLoginSpawn,
): LaunchCommand {
  const command = ghTerminalCommand(platform, kind);
  spawnImpl(command.bin, command.args);
  return command;
}
