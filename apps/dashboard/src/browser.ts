// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { spawn } from 'node:child_process';

export interface BrowserCommand {
  readonly bin: string;
  readonly args: readonly string[];
}

/**
 * The OS command that opens `url` in the default browser. Pure — testable per
 * platform. `url` is our own constructed loopback URL, never user input.
 */
export function browserCommand(platform: NodeJS.Platform, url: string): BrowserCommand {
  if (platform === 'win32') {
    // `start` is a cmd builtin; the empty "" is its (required) window-title arg.
    return { bin: 'cmd', args: ['/c', 'start', '', url] };
  }
  if (platform === 'darwin') {
    return { bin: 'open', args: [url] };
  }
  return { bin: 'xdg-open', args: [url] };
}

/**
 * Best-effort: open the default browser at `url`. Fire-and-forget (detached +
 * unref, argv array — no shell) so it never blocks or crashes the caller; the URL
 * is always printed alongside, so a headless box simply shows the link instead.
 */
export function openBrowser(url: string, platform: NodeJS.Platform = process.platform): void {
  const { bin, args } = browserCommand(platform, url);
  try {
    const child = spawn(bin, [...args], { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {
      /* no browser available; the URL was printed regardless */
    });
    child.unref();
  } catch {
    /* best-effort only */
  }
}
