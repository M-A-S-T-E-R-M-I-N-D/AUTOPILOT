// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Launch the official Claude Code login for the user. The OAuth flow itself is
 * owned by the `claude` CLI (it opens the browser and, on success, stores the
 * subscription credentials the harness then uses). A web button can't perform
 * OAuth, but it can open a terminal running the CLI so the whole thing happens
 * from one click. The command is a pure, per-platform value so it's testable
 * without spawning anything.
 */

import { spawn } from 'node:child_process';

export type LoginKind = 'login' | 'setup-token';

export interface LaunchCommand {
  readonly bin: string;
  readonly args: readonly string[];
}

/** `claude` starts the browser login (stores creds); `setup-token` mints a token. */
function claudeInvocation(kind: LoginKind): string {
  return kind === 'setup-token' ? 'claude setup-token' : 'claude';
}

/**
 * The command that opens a terminal running the chosen Claude login, per platform.
 * argv-structured; the inner `claude …` is a fixed literal (never user input).
 */
export function loginTerminalCommand(platform: NodeJS.Platform, kind: LoginKind): LaunchCommand {
  const claude = claudeInvocation(kind);
  if (platform === 'win32') {
    // ASCII-only window title (some code pages mangle non-ASCII in `start`).
    return { bin: 'cmd', args: ['/c', 'start', 'AUTOPILOT Claude login', 'cmd', '/k', claude] };
  }
  if (platform === 'darwin') {
    return {
      bin: 'osascript',
      args: ['-e', `tell application "Terminal" to do script "${claude}"`],
    };
  }
  return { bin: 'x-terminal-emulator', args: ['-e', claude] };
}

export type LoginSpawn = (bin: string, args: readonly string[]) => void;

/** Real spawn: detached + unref, best-effort (a missing terminal must not crash us). */
export const realLoginSpawn: LoginSpawn = (bin, args) => {
  try {
    const child = spawn(bin, [...args], { detached: true, stdio: 'ignore', windowsHide: false });
    child.on('error', () => {
      /* no terminal available; the UI guidance covers the manual path */
    });
    child.unref();
  } catch {
    /* best-effort only */
  }
};

/** Launch the login in a terminal. Returns the command that was launched (for guidance). */
export function launchClaudeLogin(
  kind: LoginKind,
  platform: NodeJS.Platform = process.platform,
  spawnImpl: LoginSpawn = realLoginSpawn,
): LaunchCommand {
  const command = loginTerminalCommand(platform, kind);
  spawnImpl(command.bin, command.args);
  return command;
}
