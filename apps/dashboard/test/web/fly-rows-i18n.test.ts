// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * i18n foundation (board web-msnsndki-dz3vn1): the fly bar's per-row status
 * sentence and its Pause/Stop/Cancel/Resume button tips were the two spliced
 * holdouts every prior fly-bar slice deferred ("the spliced
 * `flightRowStatusText()` per-row line stays English too — a separate
 * follow-up slice"). `web/flights.ts`'s `flightRowStatusText()`/
 * `flightActionAriaLabel()` stay as the tested English source the new keys
 * mirror, but — like `card-actions.ts`'s `githubSyncConfirmMessage`/
 * `githubPrConfirmMessage` before them — are no longer embedded in the
 * generated bundle: `flightRow()` reads `tr()` at build time instead, the
 * same pattern its Pause/Stop/Cancel/Resume button TEXT already uses. The
 * mirror contract below is what lets `flights.test.ts` keep guarding the
 * English wording while the bundle reads it from STRINGS.
 * client-tr-keys.test.ts resolves every key asserted here against STRINGS.
 */

import { describe, it, expect } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { flightRowStatusText, flightActionAriaLabel } from '../../src/web/flights.js';
import { flyJs } from '../../src/web/features/fly.js';

/** `tr()`'s map-form substitution, mirrored for expected-value building. */
function sub(tpl: string, subs: Record<string, string | number>): string {
  return Object.keys(subs).reduce((t, k) => t.split('{' + k + '}').join(String(subs[k])), tpl);
}

describe('the fly bar reads its per-row status sentence from STRINGS', () => {
  const out = flyJs();

  it('builds each state variant via tr() instead of the spliced English helper', () => {
    expect(out).toContain(
      "tr('flightRowFlyingTotal', { name: f.folder, total: f.totalBudgetUsd })",
    );
    expect(out).toContain(
      "tr('flightRowFlyingFirings', { name: f.folder, count: f.firings || 1 })",
    );
    expect(out).toContain("statusText += tr('flightRowWatchdogSuffix');");
    expect(out).toContain("tr('flightRowQueued', f.folder)");
    expect(out).toContain("tr('pausedUntilResumed', f.folder)");
    expect(out).not.toContain('flightRowStatusText');
  });

  it('mirrors flightRowStatusText() exactly, state by state', () => {
    expect(sub(STRINGS.en.flightRowFlyingTotal, { name: '/work/a', total: 25 })).toBe(
      flightRowStatusText({ folder: '/work/a', running: true, totalBudgetUsd: 25 }),
    );
    expect(sub(STRINGS.en.flightRowFlyingFirings, { name: '/work/a', count: 3 })).toBe(
      flightRowStatusText({ folder: '/work/a', running: true, firings: 3 }),
    );
    expect(
      sub(STRINGS.en.flightRowFlyingFirings, { name: '/work/a', count: 1 }) +
        STRINGS.en.flightRowWatchdogSuffix,
    ).toBe(
      flightRowStatusText({ folder: '/work/a', running: true, initiatedBy: 'fleet-watchdog' }),
    );
    expect(sub(STRINGS.en.flightRowQueued, { name: '/work/b' })).toBe(
      flightRowStatusText({ folder: '/work/b', queued: true }),
    );
    expect(sub(STRINGS.en.pausedUntilResumed, { name: '/work/c' })).toBe(
      flightRowStatusText({ folder: '/work/c', paused: true }),
    );
  });
});

describe('the fly bar reads its per-row action tips from STRINGS', () => {
  const out = flyJs();

  it('reads each Pause/Stop/Cancel/Resume tip via tr() instead of the spliced English helper', () => {
    expect(out).toContain("var pauseTip = tr('pauseFlightOn', f.folder);");
    expect(out).toContain("var stopTip = tr('stopFlightOn', f.folder);");
    expect(out).toContain("var cancelTip = tr('cancelQueuedFlightOn', f.folder);");
    expect(out).toContain("var resumeTip = tr('resumeFlightOn', f.folder);");
    expect(out).not.toContain('flightActionAriaLabel');
  });

  it('mirrors flightActionAriaLabel() exactly, action by action', () => {
    expect(sub(STRINGS.en.pauseFlightOn, { name: '/work/a' })).toBe(
      flightActionAriaLabel('pause', '/work/a'),
    );
    expect(sub(STRINGS.en.stopFlightOn, { name: '/work/a' })).toBe(
      flightActionAriaLabel('stop', '/work/a'),
    );
    expect(sub(STRINGS.en.cancelQueuedFlightOn, { name: '/work/b' })).toBe(
      flightActionAriaLabel('cancel', '/work/b'),
    );
    expect(sub(STRINGS.en.resumeFlightOn, { name: '/work/c' })).toBe(
      flightActionAriaLabel('resume', '/work/c'),
    );
  });
});
