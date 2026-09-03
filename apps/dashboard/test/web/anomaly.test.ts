// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure anomaly/guard-denial chip
 * label/tip/aria-label math (`web/anomaly.ts`) — extracted under epic 0002
 * "shell decomposition", slice 2. `anomaly-chip.test.ts` and
 * `flight-guard-chip.test.ts`/`firing-timeline-chips.test.ts` already
 * regression-test this logic indirectly through the rendered DOM in
 * `clientJs()`, but only ever assert `data-tip` is truthy and contains a
 * substring of the evidence — never the exact label/aria-label text, and
 * never a kind absent from the label map, a genuine test gap the same shape
 * as the twenty-second through twenty-fourth cuts closed elsewhere. These
 * tests exercise the real functions directly.
 */

import { describe, it, expect } from 'vitest';
import { anomalyChipMeta, guardDenialChipMeta } from '../../src/web/anomaly.js';

const LABELS = {
  'cost-spike': '⚠ cost spike',
  'death-cluster': '⚠ death cluster',
  'gate-fail-streak': '⚠ gate fail streak',
};

describe('anomalyChipMeta', () => {
  it('builds the label/tip/aria-label triple for a known anomaly kind', () => {
    const meta = anomalyChipMeta(
      {
        kind: 'cost-spike',
        evidence: 'Firing cost $5.00 vs ~$1.00 average of the last 5 firings.',
      },
      LABELS,
    );
    expect(meta).toEqual({
      label: '⚠ cost spike',
      tip: 'Firing cost $5.00 vs ~$1.00 average of the last 5 firings.',
      // D1 ATTRIBUTE PAYLOAD (epic 0015, web-mtd1wmqc-v7h6cq): aria-label
      // names the rule concisely — the evidence sentence is the tip's alone,
      // never duplicated into a second attribute. The visible label stays
      // inside the accessible name (WCAG 2.5.3 Label in Name).
      ariaLabel: 'anomaly: ⚠ cost spike',
    });
  });

  it('falls back to the raw kind when the label map carries no entry for it', () => {
    const meta = anomalyChipMeta({ kind: 'new-rule', evidence: 'Something odd happened.' }, LABELS);
    expect(meta.label).toBe('new-rule');
    expect(meta.ariaLabel).toBe('anomaly: new-rule');
    expect(meta.ariaLabel).not.toContain('Something odd happened.');
  });

  it('keeps the tip as the raw evidence string, unmodified', () => {
    const meta = anomalyChipMeta(
      { kind: 'gate-fail-streak', evidence: '3 consecutive firings reverted by the gate.' },
      LABELS,
    );
    expect(meta.tip).toBe('3 consecutive firings reverted by the gate.');
  });
});

describe('guardDenialChipMeta', () => {
  it('builds the label/tip/aria-label triple for a single denial', () => {
    expect(guardDenialChipMeta(1)).toEqual({
      label: '🛡️ 1 blocked',
      tip: 'The containment/read-hygiene guard denied 1 tool call(s) during this firing — it tried to step outside its boundary and was stopped.',
      ariaLabel: 'guard blocked 1 tool call(s) this firing (containment / read-hygiene)',
    });
  });

  it('builds the label/tip/aria-label triple for multiple denials', () => {
    const meta = guardDenialChipMeta(4);
    expect(meta.label).toBe('🛡️ 4 blocked');
    expect(meta.tip).toContain('denied 4 tool call(s)');
    expect(meta.ariaLabel).toBe(
      'guard blocked 4 tool call(s) this firing (containment / read-hygiene)',
    );
  });
});
