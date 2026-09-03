// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { tailFlightLog } from '../../src/read/flightlog.js';

let dir: string | null = null;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

function logPath(content: string): string {
  dir = mkdtempSync(join(tmpdir(), 'ap-flightlog-'));
  const path = join(dir, 'flight.log');
  writeFileSync(path, content);
  return path;
}

describe('tailFlightLog', () => {
  it('returns an empty tail when the log file does not exist yet', () => {
    const missing = join(tmpdir(), 'ap-flightlog-does-not-exist', 'flight.log');
    expect(tailFlightLog(missing)).toEqual([]);
  });

  it('returns an empty tail when the log file exists but is empty', () => {
    const path = logPath('');
    expect(tailFlightLog(path)).toEqual([]);
  });

  it('returns each non-blank line of a small log in order', () => {
    const path = logPath('line one\nline two\n\nline three\n');
    expect(tailFlightLog(path)).toEqual(['line one', 'line two', 'line three']);
  });

  it('strips trailing carriage returns from CRLF-written lines', () => {
    const path = logPath('one\r\ntwo\r\n');
    expect(tailFlightLog(path)).toEqual(['one', 'two']);
  });

  it('caps the result to the requested max lines, keeping the most recent', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`);
    const path = logPath(lines.join('\n') + '\n');
    expect(tailFlightLog(path, 3)).toEqual(['line 7', 'line 8', 'line 9']);
  });

  it('returns no lines when maxLines is 0, not the whole tail', () => {
    // Array.prototype.slice(-0) is slice(0) (whole array) — -0 === 0 in JS, so a
    // naive `.slice(-maxLines)` silently ignores a caller's request for zero lines.
    const path = logPath('line one\nline two\nline three\n');
    expect(tailFlightLog(path, 0)).toEqual([]);
  });

  it('returns no lines when maxLines is negative', () => {
    // A naive `.slice(-maxLines)` turns a negative request into a POSITIVE slice
    // index (`.slice(3)`), returning a real chunk of the tail instead of nothing —
    // use enough lines that such a chunk would be non-empty and this would catch it.
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`);
    const path = logPath(lines.join('\n') + '\n');
    expect(tailFlightLog(path, -3)).toEqual([]);
  });

  it('bounds the read to the trailing window and drops the partial leading line', () => {
    // Each line is 8 bytes ("l000000\n"); force a read window that starts
    // mid-file by writing far more than the tail-byte cap. 20,000 lines * 8
    // bytes = 160,000 bytes; the trailing-64KB window starts at byte 94,464,
    // exactly line 11,808's first byte — so the read window itself is
    // line-aligned, and only the code's own (always-drop-the-first-line)
    // conservatism removes line 11,808, leaving lines 11,809..19,999 (8,191
    // lines). Asserting the exact count and first surviving line — not just
    // "the very first line of the whole file is absent" — is what actually
    // distinguishes this from a build that skips the drop entirely.
    const bigLines = Array.from({ length: 20_000 }, (_, i) => `l${String(i).padStart(6, '0')}`);
    const path = logPath(bigLines.join('\n') + '\n');
    const tail = tailFlightLog(path, 100_000);
    // The very first line was truncated mid-file and must not appear at all.
    expect(tail).not.toContain(bigLines[0]);
    // The very last line survives intact.
    expect(tail[tail.length - 1]).toBe(bigLines[bigLines.length - 1]);
    // The read window's own first (line-aligned) line was conservatively
    // dropped too, leaving exactly one fewer line than the window contains.
    expect(tail.length).toBe(8191);
    expect(tail[0]).toBe(bigLines[11809]);
  });
});
