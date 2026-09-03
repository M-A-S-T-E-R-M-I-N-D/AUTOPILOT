// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Locks the canonical `flight/intent-claims.ts` entry point (board
 * web-mswo4x1u-kl2qsw): the enforcement API must stay importable from the
 * named module, not only from `fleet-digest.ts` where the implementations
 * live. Deep behavioral coverage (real temp worktrees, separator/case
 * normalization) stays in `fleet-digest.test.ts`; these cases prove the
 * facade path works end-to-end.
 */

import { describe, it, expect } from 'vitest';
import {
  INTENT_FILE_NAME,
  likelyPrimaryPathFromTitle,
  parseIntentPrimaryFile,
  detectIntentCollisions,
} from '../../src/flight/intent-claims.js';

describe('intent-claims entry point', () => {
  it('exposes the intent file name the declare/render halves share', () => {
    expect(INTENT_FILE_NAME).toBe('.autopilot-intent');
  });

  it('parses a declared claim and detects a shipped-file collision through the facade', () => {
    const primaryFile = parseIntentPrimaryFile('src/parser.ts — fix quoting');
    expect(primaryFile).toBe('src/parser.ts');
    const claim = { branch: 'fleet-2', intent: 'src/parser.ts — fix quoting', primaryFile };
    expect(detectIntentCollisions(['README.md', 'src/parser.ts'], [claim])).toEqual([
      { file: 'src/parser.ts', claim },
    ]);
  });

  it('reports no collision when shipped files avoid every claimed primary file', () => {
    const claim = {
      branch: 'fleet-2',
      intent: 'src/parser.ts — fix quoting',
      primaryFile: 'src/parser.ts',
    };
    expect(detectIntentCollisions(['docs/README.md'], [claim])).toEqual([]);
  });
});

describe('likelyPrimaryPathFromTitle', () => {
  it('extracts the path token a board task title already names', () => {
    expect(likelyPrimaryPathFromTitle('tasks_reorder in packages/mcp/src/control.ts')).toBe(
      'packages/mcp/src/control.ts',
    );
  });

  it('returns null when the title carries no path-shaped token', () => {
    expect(likelyPrimaryPathFromTitle('GITHUB 1/5 - connect panel: detect gh CLI presence')).toBe(
      null,
    );
  });

  it('returns null for a slash-joined list of files rather than one bogus compound path', () => {
    // A VERDICT title enumerating several touched files ("a.ts/b.ts/c.ts") reads
    // to the naive path regex as one hierarchical path — every non-final
    // segment here also carries its own extension, the signal a real path
    // (whose intermediate segments are directories) never has.
    expect(
      likelyPrimaryPathFromTitle(
        'VERDICT close web-msnt26wf-wnv3w7: risk chip already shipped ' +
          '(flight-metrics.ts/task-queue.ts/shell.ts, 125 passing tests)',
      ),
    ).toBe(null);
  });
});
