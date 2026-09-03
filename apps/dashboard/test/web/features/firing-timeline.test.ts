// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the project page's "Per-firing trace" panel
 * cluster client (`web/features/firing-timeline.ts`) — the expandable
 * per-firing row renderer plus its own Firing Replay viewer (trace
 * drill-down, diff view, step-through playback), extracted out of
 * `shell.ts`'s `fleetJs()` into one file under `web/features/` (epic 0002
 * "shell decomposition", SHELL HUB RELIEF). Indirect DOM-render coverage
 * already exists for this panel through the real client bundle
 * (`test/web/activity-feed.test.ts`, `test/web/diff-toggle-tooltip.test.ts`,
 * `test/web/firing-replay-diff.test.ts`, `test/web/firing-replay-nav.test.ts`,
 * `test/web/replay-nav-tooltips.test.ts`); this adds the direct coverage its
 * siblings (`landing.test.ts`, `pr-review.test.ts`) already carry.
 */

import { describe, it, expect } from 'vitest';
import { groupByFiring, firingLogEntry } from '../../../src/web/activity-log.js';
import { trajectorySignalOf, firingTimelineRowMeta } from '../../../src/web/flight-metrics.js';
import { diffLineClass, diffLinesForStep, diffToggleTip } from '../../../src/web/diff-view.js';
import { clampReplayStep, replayNav } from '../../../src/web/replay-nav.js';
import { firingTimelineJs } from '../../../src/web/features/firing-timeline.js';

describe('firingTimelineJs', () => {
  it('embeds every activity-log/flight-metrics/diff-view/replay-nav splice real compiled source via .toString()', () => {
    const out = firingTimelineJs();
    expect(out).toContain(groupByFiring.toString());
    expect(out).toContain(firingLogEntry.toString());
    expect(out).toContain(trajectorySignalOf.toString());
    expect(out).toContain(firingTimelineRowMeta.toString());
    expect(out).toContain(diffLineClass.toString());
    expect(out).toContain(diffLinesForStep.toString());
    expect(out).toContain(diffToggleTip.toString());
    expect(out).toContain(clampReplayStep.toString());
    expect(out).toContain(replayNav.toString());
  });

  it('declares firingTimelineSection', () => {
    const out = firingTimelineJs();
    expect(out).toContain('function firingTimelineSection(c) {');
  });

  it('keeps its own module-level state — drilled-open firing, trace/diff caches, and replay step — not shared with any other module', () => {
    const out = firingTimelineJs();
    expect(out).toContain('var openFirings = {};');
    expect(out).toContain('var firingActivityExtra = {};');
    expect(out).toContain('var firingActivityLoading = {};');
    expect(out).toContain('var openDiffs = {};');
    expect(out).toContain('var firingDiffExtra = {};');
    expect(out).toContain('var firingDiffLoading = {};');
    expect(out).toContain('var replaySteps = {};');
  });

  it('carries its own five click handlers and one keydown handler, event-delegated on document', () => {
    const out = firingTimelineJs();
    expect(out).toContain(
      "var b = e.target && e.target.closest && e.target.closest('[data-firing-toggle]');",
    );
    expect(out).toContain(
      "var b = e.target && e.target.closest && e.target.closest('[data-diff-toggle]');",
    );
    expect(out).toContain(
      "var b = e.target && e.target.closest && e.target.closest('[data-replay-start]');",
    );
    expect(out).toContain(
      "var b = e.target && e.target.closest && e.target.closest('[data-replay-exit]');",
    );
    expect(out).toContain(
      "var b = e.target && e.target.closest && e.target.closest('[data-replay-prev]');",
    );
    expect(out).toContain(
      "var b = e.target && e.target.closest && e.target.closest('[data-replay-next]');",
    );
    expect(out).toContain('if (!document.__replayArrowKeysBound) {');
    expect(out).toContain("'/api/firing-activity?project=' + encodeURIComponent(pid)");
    expect(out).toContain("'/api/firing-diff?project=' + encodeURIComponent(pid)");
  });

  it('reads fleet-wide mutable state and calls fleet-wide functions as bare hoisted identifiers, never defines them', () => {
    // lastFleetState/lastFleetSig/renderFleet/rerenderSoon stay inline in
    // fleetJs() — this cluster's click handlers read/call them the same
    // cross-module hoisted shape web/features/landing.ts's own
    // lastFleetState reference already relies on.
    const out = firingTimelineJs();
    expect(out).toContain(
      'if (lastFleetState) {\n    lastFleetSig = null;\n    renderFleet(lastFleetState);\n  }',
    );
    expect(out).toContain('rerenderSoon();');
    expect(out).not.toContain('var lastFleetState');
    expect(out).not.toContain('function renderFleet(');
    expect(out).not.toContain('function rerenderSoon(');
  });

  it('reuses the shared el/tipChip/taskMap/flightHeadlineOf/fmtAgo/guardDenialChipMeta/actRow/firingCallsign helpers rather than re-declaring them', () => {
    const out = firingTimelineJs();
    expect(out).toContain("el('div', 'firing-timeline')");
    expect(out).toContain('taskMap(c.tasks)');
    expect(out).toContain('firingTimelineRowMeta(g, f, traceTaskById, flightHeadlineOf, fmtAgo)');
    expect(out).toContain('guardDenialChipMeta(f.guardDenials)');
    expect(out).toContain('actRow(traceEntries[nav.index], true)');
    expect(out).toContain('firingCallsign(g.firingId)');
    expect(out).not.toContain('function el(');
    expect(out).not.toContain('function tipChip(');
    expect(out).not.toContain('function taskMap(');
    expect(out).not.toContain('function flightHeadlineOf(');
    expect(out).not.toContain('function fmtAgo(');
    expect(out).not.toContain('function guardDenialChipMeta(');
    expect(out).not.toContain('function actRow(');
    expect(out).not.toContain('function firingCallsign(');
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = firingTimelineJs();
    expect(out).toBe(out.trim());
  });
});
