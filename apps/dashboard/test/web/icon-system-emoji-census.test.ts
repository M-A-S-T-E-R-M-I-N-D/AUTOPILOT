// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * EPIC 0025 slice 4 (board web-mtywp7zq-55f3o9), law 5: "a census test lists
 * every emoji-bearing render site; the count goes to zero across the slices
 * and the test pins zero." Slices 1-3 swept every baked-in emoji (🎯, 🔥, 📥,
 * 📋, ✦, ⚑, …) to a vendored Lucide stroke icon (`web/icons.ts`); this test is
 * the closing guard so a future change cannot reintroduce one silently.
 *
 * Census-must-diff-the-disk law (chunks.test.ts, gh-exec-census.test.ts):
 * every `.ts` file under `src/web/` is read from disk, never a hand-kept
 * list. Comments are stripped first — the sweep's own doc comments describe
 * the glyphs they removed, and pinning those would fail the test for
 * documenting its own fix, not for a real offense.
 *
 * Three plain typographic marks are the design's deliberate exception, not
 * an oversight: ✓/✗ (locale-driven result lines — see `connect-panel.ts`,
 * `pool-client-panel.ts`, `issue-triage-panel.ts`) and ⚠ (a leading glyph on
 * text lines that predates the icon sweep in a few render sites). None of
 * the three renders as a multi-color pictograph the way an emoji does.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// vitest's root is the repo root, and under jsdom import.meta.url is an
// http: URL (not file:), so resolve from cwd instead (handler-status-lines-i18n.test.ts).
const WEB_DIR = join(process.cwd(), 'apps/dashboard/src/web');

/** Marks the design keeps on purpose — see the module doc above. */
const ALLOWED_GLYPHS = new Set(['✓', '✗', '⚠']);

/** Pictographs, misc-symbols/dingbats, misc-symbols-and-arrows, and flag
 *  regional indicators. A compound sequence (e.g. the people-holding-hands
 *  the epic names) always includes at least one base character in these
 *  ranges, so the joiners gluing it together need no separate match — and
 *  ESLint's no-misleading-character-class rightly rejects mixing them into
 *  the same class as ordinary ranges. */
const EMOJI_PATTERN =
  /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu;

function tsFilesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .map((f) => String(f))
    .filter((f) => f.endsWith('.ts') && statSync(join(dir, f)).isFile());
}

/** Drops block comments entirely, then any line that is only a `//` comment
 *  — the same heuristic chunks.test.ts uses for its own core-text scan. */
function stripComments(source: string): string {
  const noBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return noBlockComments
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

describe('icon system emoji census (epic 0025 slice 4) — zero raw emoji in web/ chrome', () => {
  const files = tsFilesUnder(WEB_DIR);

  it('finds the web directory and reads more than a handful of modules', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('bakes no emoji glyph into any web/ source file outside comments', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const code = stripComments(readFileSync(join(WEB_DIR, file), 'utf8'));
      for (const match of code.matchAll(EMOJI_PATTERN)) {
        const glyph = match[0];
        if (ALLOWED_GLYPHS.has(glyph)) continue;
        offenders.push(`${file}: ${glyph} (U+${glyph.codePointAt(0)!.toString(16)})`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
