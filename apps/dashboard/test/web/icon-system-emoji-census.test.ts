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
 * `pool-client-panel.ts`, `issue-triage-panel.ts`) and ⚠ (now only inside
 * `landingExecuteConfirmMessage`'s native `window.confirm()` text, where no
 * SVG can render — every painted ⚠ line leads with the triangle-alert icon).
 * None of the three renders as a multi-color pictograph the way an emoji does.
 *
 * The web/ scan cannot see a glyph baked into a locale VALUE: STRINGS lives
 * in `packages/tokens`, and `tr()` paints it into the same chrome (the lucky
 * roll's 🍀 snackbar sentence and refusal line did exactly that after the
 * lucky button itself became an SVG). The second census walks every locale's
 * values too. It began as a shrink-only list of the keys still carrying one;
 * the report menu's Copy element HTML (🧩) and Copy smart context (🧠)
 * labels were the last, swept to the vendored code-xml and braces icons, so
 * it now pins zero — law 5's "the test pins zero", for STRINGS as for web/.
 *
 * Miscellaneous Technical (U+2300–U+23FF) sat outside every range here, so
 * the web/ census read zero while the triage panels' "⏭ skip" badge and the
 * shell's "⏱ try Nt" budget hint still painted emoji: Unicode's emoji-data.txt
 * lists ⌚⌛ ⌨ ⏏ ⏩–⏳ ⏸–⏺ as Emoji=Yes (⏭/⏱ text-default, like ⚠). ⌘
 * (U+2318) is not emoji and stays a key name. The block has its own census:
 * a shrink-only list of the sites still carrying one, and zero in STRINGS.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { STRINGS } from '@autopilot/tokens';

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

/** The Emoji=Yes code points of Miscellaneous Technical, verbatim from
 *  https://www.unicode.org/Public/UCD/latest/ucd/emoji/emoji-data.txt —
 *  a list, not the block, so ⌘ and the other key names stay out. */
const TECHNICAL_EMOJI_PATTERN =
  /[\u{231A}\u{231B}\u{2328}\u{23CF}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}]/gu;

/** The web/ sites still painting a Miscellaneous Technical emoji — shrink-only:
 *  a slice that sweeps one deletes its line, and the list ends at zero like
 *  the census above. The triage badges need a vendored skip icon; the shell's
 *  budget hint needs one for its stopwatch. */
const TECHNICAL_EMOJI_SITES = [
  'discussions-triage-panel.ts: ⏭ (U+23ed)',
  'issue-triage-panel.ts: ⏭ (U+23ed)',
  'shell.ts: ⏱ (U+23f1)',
  'shell.ts: ⏱ (U+23f1)',
];

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

/** Every glyph `pattern` finds in `files` outside comments, as
 *  `file: glyph (U+hex)`, sorted so the list reads the same on every disk. */
function webOffenders(files: readonly string[], pattern: RegExp): string[] {
  const offenders: string[] = [];
  for (const file of files) {
    const code = stripComments(readFileSync(join(WEB_DIR, file), 'utf8'));
    for (const match of code.matchAll(pattern)) {
      const glyph = match[0];
      if (ALLOWED_GLYPHS.has(glyph)) continue;
      offenders.push(`${file}: ${glyph} (U+${glyph.codePointAt(0)!.toString(16)})`);
    }
  }
  return offenders.sort();
}

describe('icon system emoji census (epic 0025 slice 4) — zero raw emoji in web/ chrome', () => {
  const files = tsFilesUnder(WEB_DIR);

  it('finds the web directory and reads more than a handful of modules', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('bakes no emoji glyph into any web/ source file outside comments', () => {
    const offenders = webOffenders(files, EMOJI_PATTERN);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('pins the Miscellaneous Technical emoji still in web/ chrome to a shrink-only list', () => {
    const offenders = webOffenders(files, TECHNICAL_EMOJI_PATTERN);
    expect(offenders, offenders.join('\n')).toEqual(TECHNICAL_EMOJI_SITES);
  });

  it('matches ⏭/⏱ but leaves the ⌘ key name alone', () => {
    expect('⏭ skip · ⏱ try · ⌘ K'.match(TECHNICAL_EMOJI_PATTERN)).toEqual(['⏭', '⏱']);
  });
});

function emojiBearingStringKeys(pattern: RegExp = EMOJI_PATTERN): string[] {
  return Object.entries(STRINGS)
    .flatMap(([locale, table]) =>
      Object.entries(table)
        .filter(([, value]) =>
          [...value.matchAll(pattern)].some((match) => !ALLOWED_GLYPHS.has(match[0])),
        )
        .map(([key]) => `${locale}.${key}`),
    )
    .sort();
}

/** Geometric Shapes (U+25A0–U+25FF) sit outside EMOJI_PATTERN, yet the SOUL
 *  cards used ◇/◐/◆ exactly as the epic's ✦/⚑ were used — a glyph standing in
 *  for an icon — until they took the vendored dna icon (2026-09-27). The
 *  replay toggle's "▶ Step through" was the last; it leads with the vendored
 *  play icon now, so this census pins zero like the emoji one above. */
const GEOMETRIC_GLYPH = /[■-◿]/u;

function geometricGlyphStringKeys(): string[] {
  return Object.entries(STRINGS)
    .flatMap(([locale, table]) =>
      Object.entries(table)
        .filter(([, value]) => GEOMETRIC_GLYPH.test(value))
        .map(([key]) => `${locale}.${key}`),
    )
    .sort();
}

describe('icon system emoji census (epic 0025 law 5) — STRINGS values', () => {
  it('reads every locale table, not just the default one', () => {
    expect(Object.keys(STRINGS)).toEqual(expect.arrayContaining(['en', 'he']));
  });

  it('bakes no emoji glyph into any locale value', () => {
    expect(emojiBearingStringKeys()).toEqual([]);
  });

  it('bakes no Miscellaneous Technical emoji into any locale value', () => {
    expect(emojiBearingStringKeys(TECHNICAL_EMOJI_PATTERN)).toEqual([]);
  });

  it('leads with no Geometric Shapes glyph-icon in any locale value', () => {
    expect(geometricGlyphStringKeys()).toEqual([]);
  });

  it('the lucky roll speaks without its old baked-in clover in either locale', () => {
    for (const table of Object.values(STRINGS)) {
      for (const key of ['luckyRolled', 'luckyNotNow', 'luckyPressFlyIt'] as const) {
        expect(table[key]).not.toContain('🍀');
        expect(table[key]).toBe(table[key].trim());
      }
    }
  });
});
