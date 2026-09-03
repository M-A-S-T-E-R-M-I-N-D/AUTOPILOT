// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  auditPromptPosition,
  CRITICAL_RULE_MARKERS,
  CRITICAL_TAIL_FRACTION,
} from '../src/prompt-position-audit.js';
import { buildFiringPrompt } from '../src/prompt.js';

const SOUL = '# SOUL — demo\n\nStack: js\n\n## Operating rules\n- Gate every change.';

describe('auditPromptPosition', () => {
  it('passes a marker that starts in the last quarter of the text', () => {
    const prompt = `${'filler '.repeat(100)}## Hard rules (non-negotiable)\nend`;
    const result = auditPromptPosition(prompt, ['## Hard rules (non-negotiable)'])[0]!;
    expect(result.found).toBe(true);
    expect(result.positionFraction).toBeGreaterThanOrEqual(CRITICAL_TAIL_FRACTION);
    expect(result.passes).toBe(true);
  });

  it('fails a marker buried in the middle of the text', () => {
    const prompt = `${'head '.repeat(50)}## Hard rules (non-negotiable)\n${'tail '.repeat(50)}`;
    const result = auditPromptPosition(prompt, ['## Hard rules (non-negotiable)'])[0]!;
    expect(result.found).toBe(true);
    expect(result.positionFraction).toBeLessThan(CRITICAL_TAIL_FRACTION);
    expect(result.passes).toBe(false);
  });

  it('fails (never silently passes) a marker missing from the text entirely', () => {
    const result = auditPromptPosition('no critical section here', [
      '## Hard rules (non-negotiable)',
    ])[0]!;
    expect(result.found).toBe(false);
    expect(result.passes).toBe(false);
  });

  it('treats an empty prompt as not-found even when the marker is itself empty (the total===0 guard, not indexOf)', () => {
    // ''.indexOf('') === 0 — without the explicit total===0 short-circuit this
    // would misreport an empty marker as "found at position 0" on an empty
    // prompt. A non-empty marker can't distinguish the two code paths here
    // (both return -1), so this case is the only one that actually exercises
    // the guard rather than merely agreeing with indexOf's own behavior.
    const result = auditPromptPosition('', [''])[0]!;
    expect(result.found).toBe(false);
    expect(result.positionFraction).toBe(0);
    expect(result.passes).toBe(false);
  });

  it('passes exactly at the CRITICAL_TAIL_FRACTION boundary (>=, not just >)', () => {
    const marker = 'M';
    const prompt = `${'x'.repeat(75)}${marker}${'y'.repeat(24)}`; // idx 75 of 100 chars = 0.75
    const result = auditPromptPosition(prompt, [marker])[0]!;
    expect(result.positionFraction).toBe(0.75);
    expect(result.positionFraction).toBe(CRITICAL_TAIL_FRACTION);
    expect(result.passes).toBe(true);
  });

  it('defaults to auditing both of buildFiringPrompt’s own critical-rule markers', () => {
    const results = auditPromptPosition(`${'x'.repeat(1000)}${CRITICAL_RULE_MARKERS.join('\n')}`);
    expect(results.map((r) => r.marker)).toEqual([...CRITICAL_RULE_MARKERS]);
  });

  it('guards the real buildFiringPrompt output — Containment and Hard rules stay tail-positioned', () => {
    const board = Array.from({ length: 10 }, (_, i) => ({
      id: `web-task-${i}`,
      title: 'A realistically long board task title '.repeat(3),
      severity: 'high',
      dimension: 'ux',
    }));
    const prompt = buildFiringPrompt({
      soul: SOUL.repeat(20),
      firing: 741,
      retro: false,
      repoPath: '/repos/some/long/repo/path',
      board,
      maxTurns: 120,
      repoMap: `REPO-MAP\n${'hot/file.ts, '.repeat(40)}`,
      fleet: 'CLAIMED by fleet-3: some sibling status line '.repeat(10),
      lastFailure: 'some prior gate failure detail '.repeat(40),
    });

    for (const result of auditPromptPosition(prompt)) {
      expect(result.found, `expected "${result.marker}" to be present`).toBe(true);
      expect(
        result.passes,
        `"${result.marker}" landed at ${(result.positionFraction * 100).toFixed(1)}% — below the ${CRITICAL_TAIL_FRACTION * 100}% tail threshold`,
      ).toBe(true);
    }
  });

  it('still guards a minimal (near-empty) prompt — sections stay tail-positioned even without optional content', () => {
    const prompt = buildFiringPrompt({ soul: '# SOUL', firing: 1, retro: false });
    for (const result of auditPromptPosition(prompt)) {
      expect(result.passes).toBe(true);
    }
  });

  it('still guards a RETRO firing, whose appendix lands after Hard rules', () => {
    const prompt = buildFiringPrompt({ soul: SOUL, firing: 1, retro: true });
    for (const result of auditPromptPosition(prompt)) {
      expect(result.passes).toBe(true);
    }
  });
});
