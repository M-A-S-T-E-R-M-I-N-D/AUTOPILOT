// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { existsSync, statSync, openSync, readSync, closeSync } from 'node:fs';

/** Bound the read to the trailing 64KB — a long-running flight's log keeps growing. */
const TAIL_BYTES = 64 * 1024;
/** Bound the returned lines even if the tail window packs in more than this. */
const DEFAULT_MAX_LINES = 200;

/**
 * The tail of a flight's captured stdout+stderr log (`.autopilot/flight.log`).
 * Reads only the trailing `TAIL_BYTES` of the file — never the whole thing — so
 * an ever-growing log from a long flight can't turn one request into an unbounded
 * read. A missing file (no flight has run yet) yields an empty tail, not an error.
 */
export function tailFlightLog(
  path: string,
  maxLines: number = DEFAULT_MAX_LINES,
): readonly string[] {
  if (!existsSync(path)) return [];
  // `Array.prototype.slice(-maxLines)` misbehaves at the boundary: -0 === 0, so
  // `maxLines === 0` would slice(0) (the whole array), and a negative maxLines
  // flips to a positive slice index instead of meaning "no lines". Both need an
  // explicit early return — "bound the returned lines" (see docstring) is not
  // satisfiable by the plain slice below once maxLines stops being positive.
  if (maxLines <= 0) return [];
  const { size } = statSync(path);
  const start = Math.max(0, size - TAIL_BYTES);
  const length = size - start;
  // Stryker disable next-line ConditionalExpression,EqualityOperator: `start`
  // is always <= `size` (it's `max(0, size - TAIL_BYTES)`), so `length` can
  // never go negative with a real stat result, and the `length === 0` case
  // (empty file) produces the identical `[]` result via the read-and-parse
  // path below anyway — this guard only skips a wasted zero-byte read/parse,
  // it never changes observable output.
  if (length <= 0) return [];

  const buffer = Buffer.alloc(length);
  const fd = openSync(path, 'r');
  // Stryker disable BlockStatement,CallExpression: closing `fd` has no
  // effect on this function's return value, only on OS file-descriptor
  // cleanup — not observable from a single black-box call, and asserting it
  // (whether via the finally block's shape or via a dropped `closeSync`
  // call) would need a platform-specific fd-exhaustion iteration count
  // (Windows and Linux have very different default ulimits), which would
  // make the test itself flaky rather than the guard it's meant to protect.
  // (Not `next-line`: prettier joins `} finally {` onto one line, which is
  // the mutant's actual target line, so a next-line comment never lines up
  // with it.)
  try {
    readSync(fd, buffer, 0, length, start);
  } finally {
    closeSync(fd);
  }
  // Stryker restore BlockStatement,CallExpression

  const lines = buffer
    .toString('utf8')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  // A window that didn't start at byte 0 may begin mid-line — drop that partial line.
  const complete = start > 0 ? lines.slice(1) : lines;
  return complete.slice(-maxLines);
}
