// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the project page's post-flight LANDING card
 * cluster client (`web/features/landing.ts`) — commit-run rendering, the
 * flight debrief digest, the body/section renderers, and the panel's own
 * EXECUTE click handler, extracted out of `shell.ts`'s `fleetJs()` into one
 * file under `web/features/` (epic 0002 "shell decomposition", SHELL HUB
 * RELIEF). Indirect DOM-render coverage already exists for this panel
 * through the real client bundle (`test/web/landing-panel.test.ts`); this
 * adds the direct coverage its siblings (`metrics.test.ts`,
 * `issue-triage.test.ts`) already carry.
 */

import { describe, it, expect } from 'vitest';
import {
  landingExecuteResult,
  landingDiffstatItems,
  landingCommitFilesMeta,
  landingOverlapItems,
  landingWorktreeDivergence,
  landingExecuteConfirmMessage,
  landingExecuteTip,
  landingCommitRuns,
  landingGroupHeadMeta,
} from '../../../src/web/landing-panel.js';
import {
  flightDebriefOf,
  flightDebriefChipItems,
  flightDebriefNotableItems,
} from '../../../src/web/flight-debrief.js';
import { landingJs } from '../../../src/web/features/landing.js';

describe('landingJs', () => {
  it('embeds every landing-panel splice real compiled source via .toString()', () => {
    const out = landingJs();
    expect(out).toContain(landingDiffstatItems.toString());
    expect(out).toContain(landingCommitFilesMeta.toString());
    expect(out).toContain(landingOverlapItems.toString());
    expect(out).toContain(landingWorktreeDivergence.toString());
    expect(out).toContain(landingCommitRuns.toString());
    expect(out).toContain(landingGroupHeadMeta.toString());
    expect(out).toContain(landingExecuteResult.toString());
    expect(out).toContain(landingExecuteConfirmMessage.toString());
    expect(out).toContain(landingExecuteTip.toString());
  });

  it('embeds flightDebriefOf/flightDebriefChipItems/flightDebriefNotableItems real compiled source via .toString()', () => {
    const out = landingJs();
    expect(out).toContain(flightDebriefOf.toString());
    expect(out).toContain(flightDebriefChipItems.toString());
    expect(out).toContain(flightDebriefNotableItems.toString());
  });

  it('declares landingCommitRow, landingCommitGroupNode, flightDebriefSection, renderLandingBody, and landingSection', () => {
    const out = landingJs();
    expect(out).toContain('function landingCommitRow(commit) {');
    expect(out).toContain('function landingCommitGroupNode(row, groupId) {');
    expect(out).toContain('function flightDebriefSection(flightLog, tasks) {');
    expect(out).toContain('function renderLandingBody(body, landing, pid, flightLog, tasks) {');
    expect(out).toContain('function landingSection(pid, flightLog, tasks) {');
  });

  it('keeps its own pid-keyed restart-presumed map for the rebuild+restart affordance', () => {
    const out = landingJs();
    expect(out).toContain('var landingRestarting = {};');
    expect(out).toContain('var LANDING_RESTART_GRACE_MS = 20000;');
  });

  it('fetches the LANDING preview on demand rather than folding into the polled /api/state', () => {
    expect(landingJs()).toContain("fetch('/api/landing?project=' + encodeURIComponent(pid))");
  });

  it('carries its own EXECUTE click handler, confirm-guarded', () => {
    const out = landingJs();
    expect(out).toContain(
      "var b = e.target && e.target.closest && e.target.closest('[data-land-execute]');",
    );
    expect(out).toContain(
      'if (!window.confirm(landingExecuteConfirmMessage(overlapBranches))) return;',
    );
    expect(out).toContain("fetch('/api/landing/execute', {");
  });

  it('reads fleet-wide mutable state and calls fleet-wide functions as bare hoisted identifiers, never defines them', () => {
    // lastFleetState/lastFleetSig/renderFleet/refresh stay inline in
    // fleetJs() — this cluster's click handler reads/calls them the same
    // cross-module hoisted shape web/features/fly.ts's own lastFleetState
    // reference already relies on.
    const out = landingJs();
    expect(out).toContain(
      'if (lastFleetState) { lastFleetSig = null; renderFleet(lastFleetState); }',
    );
    // `refresh()` moved from the click handler into the job poller (durable
    // landing jobs, 2026-08-30): a land's outcome now arrives from
    // GET /api/landing/job, so the branch-state refresh fires where the
    // outcome is actually learned — still a bare hoisted call into fleetJs().
    expect(out).toContain('landingJobRefreshed[pid] = done.startedAt;');
    expect(out).toContain('refresh();');
    expect(out).not.toContain('var lastFleetState');
    expect(out).not.toContain('function renderFleet(');
    expect(out).not.toContain('function refresh(');
  });

  it('reuses the shared flightVerdictOf/taskMap/flightHeadlineOf/fmtCost/fmtDuration/el/tipChip helpers rather than re-declaring them', () => {
    const out = landingJs();
    expect(out).toContain('flightDebriefOf(flightLog || [], flightVerdictOf);');
    expect(out).not.toContain('function flightVerdictOf(');
    expect(out).not.toContain('function taskMap(');
    expect(out).not.toContain('function flightHeadlineOf(');
    expect(out).not.toContain('function fmtCost(');
    expect(out).not.toContain('function fmtDuration(');
    expect(out).not.toContain('function el(');
    expect(out).not.toContain('function tipChip(');
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = landingJs();
    expect(out).toBe(out.trim());
  });
});
