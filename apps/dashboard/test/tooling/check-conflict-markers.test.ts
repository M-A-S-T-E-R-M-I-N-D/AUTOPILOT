// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for the pure findConflictMarkers() rule engine of
 * scripts/ci/check-conflict-markers.mjs, the CI gate that fails a run if a
 * tracked file still carries an unresolved git conflict marker. `main()`
 * itself stays unimported — it shells out to `git ls-files` and reads the
 * whole tree, same stance apps/dashboard/test/tooling/secret-scan.test.ts
 * and validate-no-personal-paths.test.ts take for their sibling scripts.
 *
 * Every POSITIVE fixture below is built via runtime string concatenation
 * instead of a literal marker in source — otherwise this very file's raw
 * text would trip check-conflict-markers.mjs when `pnpm run verify` scans
 * the tree, same reason those sibling suites build their fixtures that way.
 *
 * Caught live: docs/BACKLOG-999-ARCHIVE.md landed a `<<<<<<< HEAD` /
 * `=======` / `>>>>>>> <branch>` block verbatim in
 * `d448f8b7 chore: recover fleet-5 after the 13:06 power loss` — a real
 * unresolved conflict that shipped because nothing in the repo scanned
 * committed file CONTENT for marker lines (`check-merge-integrity.mjs`
 * only compares tree content across merge parents, a different failure
 * class). The last test below asserts against that real file directly:
 * it fails until the file is fixed, and stays green after.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { findConflictMarkers } from '../../../../scripts/ci/check-conflict-markers.mjs';

const START = '<' + '<<<<<< HEAD';
const MID = '=' + '======';
const END = '>' + '>>>>>> autopilot/flight-worktree-fly-autopilot--fleet-5';

describe('findConflictMarkers', () => {
  it('returns no findings for clean text', () => {
    expect(findConflictMarkers('# A heading\n\nSome prose.\n')).toEqual([]);
  });

  it('detects a full unresolved conflict block (start + mid + end)', () => {
    const text = ['before', START, 'ours', MID, 'theirs', END, 'after'].join('\n');

    expect(findConflictMarkers(text)).toEqual([
      { line: 2, marker: START },
      { line: 4, marker: MID },
      { line: 6, marker: END },
    ]);
  });

  it('does NOT flag a lone run of seven equals signs with no start/end marker', () => {
    // A Markdown setext-style divider or similar innocent formatting must
    // not trip the guard on its own — only a real conflict block pairs a
    // `=======` line with a `<<<<<<<` or `>>>>>>>` line in the same file
    // (guard-precision doctrine: negative corpus per scanner).
    expect(findConflictMarkers(['title', MID, 'body'].join('\n'))).toEqual([]);
  });

  it('detects a start+end pair even with no mid line between them', () => {
    const text = [START, 'ours only', END].join('\n');

    expect(findConflictMarkers(text)).toEqual([
      { line: 1, marker: START },
      { line: 3, marker: END },
    ]);
  });

  it('ignores a marker-shaped line missing the trailing space (not a real marker)', () => {
    // Real markers always carry a ref name after the arrows; a bare
    // 7-character run with no space is not the shape git actually emits.
    expect(findConflictMarkers('<<<<<<<no-space-here\n')).toEqual([]);
  });

  it('the real archive file carries no unresolved conflict marker', () => {
    const path = fileURLToPath(
      new URL('../../../../docs/BACKLOG-999-ARCHIVE.md', import.meta.url),
    );
    expect(findConflictMarkers(readFileSync(path, 'utf8'))).toEqual([]);
  });
});
