// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { browserCommand, openBrowser } from '../src/browser.js';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

const spawnMock = vi.mocked(spawn);
const URL = 'http://127.0.0.1:4317';

describe('browserCommand', () => {
  it('uses cmd /c start with a title placeholder on Windows', () => {
    const cmd = browserCommand('win32', URL);
    expect(cmd.bin).toBe('cmd');
    // The empty "" is start's window-title arg; the url must be a SEPARATE argv
    // entry (never interpolated into a shell string).
    expect(cmd.args).toEqual(['/c', 'start', '', URL]);
  });

  it('uses open on macOS', () => {
    const cmd = browserCommand('darwin', URL);
    expect(cmd.bin).toBe('open');
    expect(cmd.args).toEqual([URL]);
  });

  it('uses xdg-open on Linux (and other platforms)', () => {
    expect(browserCommand('linux', URL)).toEqual({ bin: 'xdg-open', args: [URL] });
  });

  it('never places the url inside a shell string (argv-only, no injection surface)', () => {
    const hostile = 'http://127.0.0.1:4317/#$(rm -rf /)';
    for (const platform of ['win32', 'darwin', 'linux'] as const) {
      const cmd = browserCommand(platform, hostile);
      expect(cmd.args).toContain(hostile); // passed verbatim as one argv entry
      expect(cmd.bin).not.toContain(hostile);
    }
  });
});

describe('openBrowser', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  function fakeChild(): EventEmitter & { unref: ReturnType<typeof vi.fn> } {
    const child = new EventEmitter() as EventEmitter & { unref: ReturnType<typeof vi.fn> };
    child.unref = vi.fn();
    return child;
  }

  it('spawns the platform command detached, ignoring stdio, and unrefs it', () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    openBrowser(URL, 'darwin');

    expect(spawnMock).toHaveBeenCalledWith('open', [URL], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    expect(child.unref).toHaveBeenCalledTimes(1);
  });

  it('never throws when the spawned process emits an error (no browser installed)', () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    expect(() => openBrowser(URL, 'linux')).not.toThrow();
    expect(() => child.emit('error', new Error('spawn xdg-open ENOENT'))).not.toThrow();
  });

  it('never throws when spawn itself throws synchronously', () => {
    spawnMock.mockImplementation(() => {
      throw new Error('boom');
    });

    expect(() => openBrowser(URL, 'win32')).not.toThrow();
  });
});
