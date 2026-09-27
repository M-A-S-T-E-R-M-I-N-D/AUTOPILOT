// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * EPIC 0025 (board web-mtywp7zq-55f3o9), the docs half of "Docs/screenshots
 * refresh is still open": the emoji census pins zero glyphs in the chrome, but
 * the living operator docs kept naming each swept surface by the emoji it
 * dropped — RUNBOOK §11 sent readers looking for a "🖥️ Flight console", a
 * "🛡️ N blocked" chip and a "🔧 auto-fixed" chip, §12 for a "🍀" button, and
 * MASTER-PROMPT's Fly-bar table listed a "🍀 Lucky" field. None of those
 * glyphs is painted any more (every one is a vendored Lucide stroke icon or,
 * for the lucky button, an icon-only clover SVG), so a doc that quotes one
 * describes a screen that no longer exists.
 *
 * Scope is the two LIVING docs that describe the current dashboard. Epics,
 * ADRs, debriefs and changelogs are dated records of what the screen looked
 * like then, and stay as written.
 *
 * 🔍 is deliberately not in the banned set: the flight log still prints
 * `🔍 closed-task drift proposed` (flight/post-flight-sweeps.ts) and RUNBOOK
 * quotes that terminal line verbatim — only its old use as the Detected
 * backlog heading is gone.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STRINGS } from '@autopilot/tokens';

const DOCS_DIR = fileURLToPath(new URL('../../../../docs/', import.meta.url));

const RUNBOOK = readFileSync(join(DOCS_DIR, 'RUNBOOK.md'), 'utf8');
const MASTER_PROMPT = readFileSync(join(DOCS_DIR, 'MASTER-PROMPT.md'), 'utf8');

/** Glyphs the dashboard dropped that no terminal output prints either — a
 *  living doc quoting one can only be describing retired chrome. */
const RETIRED_CHROME_GLYPHS = ['🖥', '🛡', '🔧', '🍀'];

describe('icon system docs refresh (epic 0025) — living docs name the current chrome', () => {
  it.each([
    ['docs/RUNBOOK.md', RUNBOOK],
    ['docs/MASTER-PROMPT.md', MASTER_PROMPT],
  ])('%s quotes no glyph the dashboard retired', (_doc, content) => {
    const quoted = RETIRED_CHROME_GLYPHS.filter((glyph) => content.includes(glyph));
    expect(quoted).toEqual([]);
  });

  it('RUNBOOK no longer heads the Detected backlog with the 🔍 it dropped', () => {
    expect(RUNBOOK).not.toMatch(/🔍️?\s*Detected backlog/);
  });

  it('RUNBOOK names each project-page surface by the label STRINGS paints', () => {
    const { en } = STRINGS;
    for (const label of [en.consoleTitle, en.backlogTitle, en.autoFixed]) {
      expect(RUNBOOK).toContain(`**${label}**`);
    }
    // flightGuardChip is a `{n} blocked` template; the doc writes its N.
    expect(en.flightGuardChip).toBe('{n} blocked');
    expect(RUNBOOK).toContain('**N blocked**');
  });

  it('the lucky button is described as the icon-only button it is, in both docs', () => {
    const luckyName = STRINGS.en.flyLuckyAria.split(' — ')[0];
    expect(luckyName).toBe("I'm feeling lucky");
    expect(RUNBOOK).toContain(`"${luckyName}"`);
    expect(MASTER_PROMPT).toMatch(/\| Lucky \(clover icon\)\s*\|/);
  });
});
