// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The fly bar's `data-tip` hover texts (board web-msnsndki-dz3vn1): every
 * prior slice deliberately left tooltips English ("the `data-tip` hover
 * texts stay English, same as every other `data-tip` in this table") — this
 * slice ends that policy for the fly bar, the app's primary action surface.
 * Two shapes, matching how each element lives:
 * - PERSISTENT controls (Fly it/Pause/Stop, the firings/budget/mode/total
 *   inputs, the flight-row status span, the total-progress bar) get a
 *   `setTip()` that writes `tr(key)` now AND tags `data-i18n-tip` so
 *   `translateDom()`'s new sweep retranslates them on a locale switch —
 *   the same two-part contract `setGoLabel()` uses for #fly-go's label.
 * - The browse modal's per-paint buttons (rebuilt fresh on every open, no
 *   persistent node for a sweep to revisit) call `tr()` at build time, the
 *   same reasoning as the modal's aria-labels and static text before them;
 *   the drive/entry/use tips interpolate via `tr()`'s map form so the
 *   drive letter, folder name, and path land where each locale's grammar
 *   puts them, not where English word order does.
 * The per-row Pause/Stop/Cancel/Resume button tips come from the spliced
 * `flightActionAriaLabel()` helper (`web/flights.ts`, own tests) and stay a
 * separate follow-up slice, same as `flightRowStatusText()`'s row line.
 * client-tr-keys.test.ts resolves every key asserted here against STRINGS.
 */

import { describe, it, expect } from 'vitest';
import { flyJs } from '../../src/web/features/fly.js';

describe('the fly bar reads its data-tip hover texts from STRINGS', () => {
  const out = flyJs();

  it('defines setTip writing both the translated tip and the data-i18n-tip resweep tag, guarded against no-op mutations', () => {
    expect(out).toContain('function setTip(target, key) {');
    expect(out).toContain('target.dataset.i18nTip = key;');
    expect(out).toContain('var text = tr(key);');
    expect(out).toContain(
      "if (target.getAttribute('data-tip') !== text) target.setAttribute('data-tip', text);",
    );
  });

  it('tags the launch controls and the four form inputs with their STRINGS keys', () => {
    expect(out).toContain("setTip(goEl, 'flyGoTip');");
    expect(out).toContain("setTip(pauseEl, 'flyPauseTip');");
    expect(out).toContain("setTip(stopEl, 'flyStopTip');");
    expect(out).toContain("setTip(firingsEl, 'flyFiringsTip');");
    expect(out).toContain("setTip(budgetEl, 'flyBudgetTip');");
    expect(out).toContain("setTip(modeEl, 'flyModeTip');");
    expect(out).toContain("setTip(totalEl, 'flyTotalTip');");
    expect(out).not.toContain("'Launches an autonomous flight over this folder");
  });

  it('tags the flight-row status span with the variant key its state selects', () => {
    expect(out).toContain(
      "f.running ? 'flightRunningTip' : (f.queued ? 'flightQueuedTip' : 'flightPausedTip')",
    );
    expect(out).toContain('setTip(statusSpan, statusTipKey);');
    expect(out).not.toContain("'This flight is running now");
  });

  it('tags the total-progress bar', () => {
    expect(out).toContain("setTip(progressBarEl, 'flyProgressTip');");
    expect(out).not.toContain('"Progress for the whole flight');
  });

  it('tags the 🍀 lucky calibrator button — a persistent control, so setTip not a literal', () => {
    expect(out).toContain("setTip(luckyEl, 'flyLuckyTip');");
    expect(out).not.toContain("'Probes this machine (CPU, RAM, cores)");
  });

  it('translates the browse-modal button tips at build time, templating the interpolated ones', () => {
    expect(out).toContain(
      "driveBtn.setAttribute('data-tip', tr('browseDriveTip', { drive: data.drives[d] }));",
    );
    expect(out).toContain("up.setAttribute('data-tip', tr('browseUpTip'));");
    expect(out).toContain(
      "entryBtn.setAttribute('data-tip', tr('browseEntryTip', { name: entry.name }));",
    );
    expect(out).toContain("use.setAttribute('data-tip', tr('browseUseTip', { path: data.path }));");
    expect(out).not.toContain("'Switch to drive ' + data.drives[d]");
    expect(out).not.toContain("'Open ' + entry.name");
    expect(out).not.toContain("'Sets ' + data.path");
  });

  it('shares one browseCloseTip key between the Cancel and error-dialog Close buttons', () => {
    expect(out).toContain("cancel.setAttribute('data-tip', tr('browseCloseTip'));");
    expect(out).toContain("close.setAttribute('data-tip', tr('browseCloseTip'));");
    expect(out).not.toContain("'Closes this dialog without changing the fly folder.'");
  });
});
