// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the project page's Activity feed panel cluster
 * client (`web/features/activity.ts`) — the phase rail, its drill-down, the
 * files-in-flight map, and the panel assembler, extracted out of `shell.ts`'s
 * `fleetJs()` into one file under `web/features/` (epic 0002 "shell
 * decomposition", SHELL HUB RELIEF). Indirect DOM-render coverage already
 * exists for this panel through the real client bundle
 * (`test/web/phase-rail-tooltips.test.ts`, `test/web/flightmap-tooltips.test.ts`,
 * `test/web/act-label-tooltip.test.ts`); this adds the direct coverage its
 * siblings (`backlog.test.ts`, `release.test.ts`) already carry.
 */

import { describe, it, expect } from 'vitest';
import {
  phaseCounts,
  phaseTipText,
  phaseDetailRows,
  PHASE_DETAIL_CAP,
} from '../../../src/web/phase-rail.js';
import { activityFileNodes, DEFAULT_FILE_NODE_CAP } from '../../../src/shared/file-nodes.js';
import { fnodeTip } from '../../../src/web/flight-map.js';
import { activityLiveLabel } from '../../../src/web/activity-log.js';
import { activityJs } from '../../../src/web/features/activity.js';

describe('activityJs', () => {
  it('embeds every splice real compiled source/value via .toString()/JSON.stringify()', () => {
    const out = activityJs();
    expect(out).toContain(phaseCounts.toString());
    expect(out).toContain(phaseTipText.toString());
    expect(out).toContain(`var PHASE_DETAIL_CAP = ${PHASE_DETAIL_CAP};`);
    expect(out).toContain(phaseDetailRows.toString());
    expect(out).toContain(`var DEFAULT_FILE_NODE_CAP = ${DEFAULT_FILE_NODE_CAP};`);
    expect(out).toContain(activityFileNodes.toString());
    expect(out).toContain(fnodeTip.toString());
    expect(out).toContain(activityLiveLabel.toString());
  });

  it('declares phaseRail, phaseDetail, flightMap, and activitySection', () => {
    const out = activityJs();
    expect(out).toContain('function phaseRail(acts, pid) {');
    expect(out).toContain('function phaseDetail(acts, phase) {');
    expect(out).toContain('function flightMap(acts, pid) {');
    expect(out).toContain('function activitySection(c) {');
  });

  it('calls actRow, el, liveFiring, openPhases, OFFICE_TIPS, and basename as bare hoisted identifiers, never defines them', () => {
    // actRow is ALSO called by firingTimelineSection (the still-inline
    // Per-firing trace panel), so it stays behind in fleetJs() rather than
    // moving with this cluster — the same "shared helper stays put, the
    // moved cluster calls it as a bare hoisted identifier" shape the
    // issue-triage cut's own decisionItemHeadMeta relocation established.
    const out = activityJs();
    expect(out).toContain('ul.appendChild(actRow(rows[k]));');
    expect(out).toContain('ul.appendChild(actRow(acts[i]));');
    expect(out).toContain('var nodes = activityFileNodes(acts, basename, 8);');
    expect(out).toContain('var isLive = !!liveFiring(c);');
    expect(out).toContain('openPhases[pid] === phases[j]');
    expect(out).not.toContain('function actRow(');
    expect(out).not.toContain('function el(');
    expect(out).not.toContain('function liveFiring(');
    expect(out).not.toContain('var openPhases');
    expect(out).not.toContain('var OFFICE_TIPS');
    expect(out).not.toContain('function basename(');
  });

  it('keeps no module-level state of its own — openPhases is fleet-wide state read here, not declared here', () => {
    const out = activityJs();
    expect(out).not.toMatch(/^var \w+ = \{\};$/m);
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = activityJs();
    expect(out).toBe(out.trim());
  });
});
