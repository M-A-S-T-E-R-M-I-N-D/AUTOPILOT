// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { findPortOwnerPid } from '../../src/control/port-owner.js';

describe('findPortOwnerPid', () => {
  it('parses the LISTENING pid from a Windows netstat -ano listing', () => {
    const run = vi
      .fn()
      .mockReturnValue(
        [
          '  Proto  Local Address          Foreign Address        State           PID',
          '  TCP    0.0.0.0:4317           0.0.0.0:0              LISTENING       4242',
          '  TCP    0.0.0.0:9999           0.0.0.0:0              LISTENING       111',
        ].join('\r\n'),
      );
    expect(findPortOwnerPid(4317, 'win32', run)).toBe(4242);
    expect(run).toHaveBeenCalledWith('netstat', ['-ano']);
  });

  it('returns null when no line lists that port', () => {
    const run = vi.fn().mockReturnValue('  TCP    0.0.0.0:9999   0.0.0.0:0   LISTENING   111');
    expect(findPortOwnerPid(4317, 'win32', run)).toBeNull();
  });

  it('ignores non-LISTENING rows (e.g. ESTABLISHED) for the same port', () => {
    const run = vi.fn().mockReturnValue('  TCP    0.0.0.0:4317   1.2.3.4:80   ESTABLISHED   999');
    expect(findPortOwnerPid(4317, 'win32', run)).toBeNull();
  });

  it('parses a bare pid from posix lsof -ti output', () => {
    const run = vi.fn().mockReturnValue('4242\n');
    expect(findPortOwnerPid(4317, 'linux', run)).toBe(4242);
    expect(run).toHaveBeenCalledWith('lsof', ['-ti', 'tcp:4317']);
  });

  it('fails open to null when the probe throws (missing OS tool, or no listener found)', () => {
    const run = vi.fn().mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(findPortOwnerPid(4317, 'win32', run)).toBeNull();
    expect(findPortOwnerPid(4317, 'linux', run)).toBeNull();
  });
});
