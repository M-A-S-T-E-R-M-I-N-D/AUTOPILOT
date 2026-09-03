// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the first-run guided tour client
 * (`web/features/tour.ts`) — a whole assembler function extracted out of
 * `shell.ts`'s `fleetJs()` into its own file under `web/features/` (epic
 * 0002 "shell decomposition", SHELL HUB RELIEF).
 */

import { describe, it, expect } from 'vitest';
import { TOUR_STEPS, TOUR_STEP_KEYS, tourStepMeta } from '../../../src/web/tour.js';
import { tourJs } from '../../../src/web/features/tour.js';

describe('tourJs', () => {
  it('embeds the real tour steps as a JSON array', () => {
    expect(tourJs()).toContain(`var TOUR_STEPS = ${JSON.stringify(TOUR_STEPS)};`);
  });

  it('embeds tourStepMeta real compiled source via .toString()', () => {
    expect(tourJs()).toContain(tourStepMeta.toString());
  });

  it('embeds the real per-step STRINGS key pairs as a JSON array', () => {
    expect(tourJs()).toContain(`var TOUR_STEP_KEYS = ${JSON.stringify(TOUR_STEP_KEYS)};`);
  });

  it('renders step title/body and Skip/Back/Next chrome via tr(key), not English literals (board web-msnsndki-dz3vn1)', () => {
    const out = tourJs();
    expect(out).toContain("var h = el('h2', '', tr(keys.titleKey));");
    expect(out).toContain("dialog.appendChild(el('p', '', tr(keys.bodyKey)));");
    expect(out).toContain("skip.textContent = tr(meta.isLast ? 'tourClose' : 'tourSkip');");
    expect(out).toContain(
      "skip.setAttribute('data-tip', tr(meta.isLast ? 'tourSkipTipLast' : 'tourSkipTipMid'));",
    );
    expect(out).toContain("back.textContent = tr('tourBack');");
    expect(out).toContain("back.setAttribute('data-tip', tr('tourBackTip'));");
    expect(out).toContain("next.textContent = tr('tourNext');");
    expect(out).toContain("next.setAttribute('data-tip', tr('tourNextTip'));");
    expect(out).not.toContain("back.textContent = 'Back';");
    expect(out).not.toContain("next.textContent = 'Next';");
  });

  it('delegates masthead #tour-btn clicks to openTour', () => {
    const out = tourJs();
    expect(out).toContain("e.target.closest('#tour-btn')");
    expect(out).toContain('if (b) openTour();');
  });

  it('marks the tour seen in localStorage on close', () => {
    expect(tourJs()).toContain("localStorage.setItem(TOUR_SEEN_KEY, '1');");
  });

  it('auto-opens only when the seen flag is missing', () => {
    const out = tourJs();
    expect(out).toContain('function maybeAutoOpenTour() {');
    expect(out).toContain('if (!seen) openTour();');
  });

  it('traps Tab focus and closes on Escape', () => {
    const out = tourJs();
    expect(out).toContain("if (e.key === 'Escape') { e.preventDefault(); closeTour(); return; }");
    expect(out).toContain("if (e.key !== 'Tab') return;");
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = tourJs();
    expect(out).toBe(out.trim());
  });
});
