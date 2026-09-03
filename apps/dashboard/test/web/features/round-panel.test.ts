// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the project page's CURRENT ROUND panel client
 * (`web/features/round-panel.ts`) — a whole assembler function extracted out
 * of `shell.ts`'s `fleetJs()` into its own file under `web/features/` (epic
 * 0002 "shell decomposition", SHELL HUB RELIEF).
 */

import { describe, it, expect } from 'vitest';
import { roundSinceLabel, roundStatItems } from '../../../src/web/stat-tiles.js';
import { roundPanelJs } from '../../../src/web/features/round-panel.js';

describe('roundPanelJs', () => {
  it('embeds roundSinceLabel/roundStatItems real compiled source via .toString()', () => {
    const out = roundPanelJs();
    expect(out).toContain(roundSinceLabel.toString());
    expect(out).toContain(roundStatItems.toString());
  });

  it('declares roundSection and renderRoundBody', () => {
    const out = roundPanelJs();
    expect(out).toContain('function roundSection(pid) {');
    expect(out).toContain('function renderRoundBody(body, round) {');
  });

  it('fetches on demand rather than folding into the polled /api/state', () => {
    expect(roundPanelJs()).toContain("fetch('/api/round?project=' + encodeURIComponent(pid))");
  });

  it('degrades to an honest unavailable message on fetch failure', () => {
    expect(roundPanelJs()).toContain('body.replaceChildren(unavailable);');
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = roundPanelJs();
    expect(out).toBe(out.trim());
  });

  it('tags its own literal text data-i18n and sweeps freshly built DOM (board web-msnsndki-dz3vn1)', () => {
    const out = roundPanelJs();
    expect(out).toContain("title.setAttribute('data-i18n', 'roundTitle');");
    expect(out).toContain("loading.setAttribute('data-i18n', 'roundLoading');");
    expect(out).toContain("unavailable.setAttribute('data-i18n', 'roundUnavailable');");
    expect(out).toContain("noTags.setAttribute('data-i18n', 'roundNoTags');");
    expect(out).toContain("sinceChip.setAttribute('data-i18n-tip', 'roundSinceTagTip');");
    expect(out).toContain("tr('roundSinceTagTip')");
    expect(out.match(/translateDom\(document\.documentElement\.lang \|\| 'en'\);/g)?.length).toBe(
      4,
    );
  });
});
