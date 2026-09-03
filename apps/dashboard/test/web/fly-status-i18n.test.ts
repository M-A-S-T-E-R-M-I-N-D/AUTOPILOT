// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The fly bar's #fly-status line (board web-msnsndki-dz3vn1): every message
 * the CLIENT itself generates — the launch flow ('Launching…'/'Launched.'/
 * 'Could not launch.'/'Launch failed…'/'Enter a folder path.'), the global
 * and per-flight Stop/Pause flows, and the single-flight running/paused
 * status sentence — was still an English literal after the go-label and
 * browse-modal slices. All of it is written at event time (setMsg/paint),
 * not swept by translateDom(), so `tr()` at build time is the right fix,
 * same as the browse modal's. Messages the SERVER sends back (res.message)
 * stay as-is — translating those is a server-side slice, not this one.
 * Same generated-text assertion style as fly-browse-i18n.test.ts;
 * client-tr-keys.test.ts resolves every key asserted here against STRINGS.
 */

import { describe, it, expect } from 'vitest';
import { flyJs } from '../../src/web/features/fly.js';

describe('the fly bar status line reads its client-generated messages from STRINGS', () => {
  const out = flyJs();

  it('translates the launch-flow messages', () => {
    expect(out).toContain("setMsg(tr('enterFolderPath'), 'err')");
    expect(out).toContain("setMsg(tr('launching'), '')");
    expect(out).toContain("started ? tr('launched') : tr('couldNotLaunch')");
    expect(out).toContain("setMsg(tr('launchFailed'), 'err')");
    expect(out).not.toContain("'Launching…'");
    expect(out).not.toContain("'Enter a folder path.'");
  });

  it('translates the global Stop/Pause flow messages and their poll fallbacks', () => {
    expect(out).toContain("setMsg(tr('stopping'), '')");
    expect(out).toContain("setMsg(tr('stopFailed'), 'err')");
    expect(out).toContain("setMsg(tr('pausing'), '')");
    expect(out).toContain("setMsg(tr('pauseFailed'), 'err')");
    expect(out).not.toContain("'Stopping…'");
    expect(out).not.toContain("'Pausing…'");
  });

  it('templates the per-flight stop/pause fallbacks so the folder lands where the locale puts it', () => {
    expect(out).toContain("tr(action === 'stop' ? 'stoppingName' : 'pausingName', folder)");
    expect(out).toContain("tr(action === 'stop' ? 'stopFailedName' : 'pauseFailedName', folder)");
    expect(out).not.toContain("' failed for ' + folder");
  });

  it('translates the 🍀 lucky-roll messages, templating the server-supplied reason', () => {
    expect(out).toContain("setMsg(tr('luckyNoAnswer'), 'err')");
    expect(out).toContain("setMsg(tr('luckyDashboardDown'), 'err')");
    expect(out).toContain(
      "setMsg(tr('luckyNotNow', { reason: data.plan.refusal || tr('luckyNoPlan') }), 'err')",
    );
    expect(out).toContain("setMsg(tr('luckyPressFlyIt', { reason: rolled }), '')");
    expect(out).toContain(": tr('luckyPlanReady');");
    expect(out).not.toContain("'Lucky roll failed");
    expect(out).not.toContain("'🍀 Not now: '");
    expect(out).not.toContain("' — press Fly it to launch.'");
  });

  it('translates the multi-lane fleet-launch refusal, result, and unreachable messages', () => {
    expect(out).toContain("setMsg(tr('lanesFixedFiringCount'), 'err')");
    expect(out).toContain("(res.ok ? tr('fleetLaunched') : tr('fleetLaunchFailed'))");
    expect(out).toContain("setMsg(tr('fleetLaunchDashboardDown'), 'err')");
    expect(out).not.toContain("'Lanes launch with a fixed firing count");
    expect(out).not.toContain("'Fleet launched.'");
    expect(out).not.toContain("'Fleet launch failed");
  });

  it('templates the single-flight running/paused status sentence', () => {
    expect(out).toContain("tr('flyingUpToTotal', { name: statusName, total: s.totalBudgetUsd })");
    expect(out).toContain("tr('flyingFirings', { name: statusName, count: s.firings || 1 })");
    expect(out).toContain("tr('pausedUntilResumed', statusName)");
    expect(out).not.toContain("'Flying ' + (s.folder || 'a folder')");
  });

  it('templates the total-progress label and hands tr() to the spliced progress math', () => {
    // The label is the progress bar's visible text AND its aria-label, so
    // both read the same {elapsed}/{progress}/{pct}/{eta} template.
    expect(out).toContain(
      "tr('flightProgressLabel', { elapsed: fmtElapsed(s.startedAt), progress: progress.progressBit, pct: progress.pct, eta: progress.etaBit })",
    );
    // flightProgressOf stays spliced (fly.test.ts pins its .toString()), so
    // its spend/ETA clauses reach STRINGS through an injected tr — the same
    // injection route fmtCost/fmtDuration already take.
    expect(out).toContain(
      'flightProgressOf(s, sessionData.sessionFirings, sessionData.historicalAvgDurationMs, fmtCost, fmtDuration, tr)',
    );
    // Spliced source is compiler output, so its quote style is not ours to pin.
    expect(out).toMatch(/tr\(["']flightProgressSpentOfTotal["']/);
    expect(out).toMatch(/tr\(["']flightProgressFiringsSoFar["']/);
    expect(out).toMatch(/tr\(["']flightProgressEta["']/);
    expect(out).toMatch(/tr\(["']flightProgressFinishingUp["']\)/);
    expect(out).not.toContain("' elapsed · '");
    expect(out).not.toMatch(/["'] · finishing up["']/);
    expect(out).not.toMatch(/["'] firing\(s\) · ["']/);
  });
});
