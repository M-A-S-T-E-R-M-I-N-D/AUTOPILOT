// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The staged scene both README generators share (scripts/docs/demo-scene.mjs)
 * makes two promises in its header — the running frame's progress line reads
 * one of four, and every frame is a returning operator's view — and each is a
 * pin on the product's own code, not on the scene alone: the fly bar's lane
 * filter decides which staged firing counts, and the onboarding ladder's
 * snooze key decides what "returning" means. This holds the scene's payloads
 * to those promises through the same pure functions the served bundle
 * splices, with no browser and no fixture server — the stance
 * record-demo-frames.test.ts takes for its script.
 *
 * Regression (board web-mtnd3yeq-oyprf0): the staged firing's id used to be
 * `firing-live-0`, which carries no `firingIdOf` key, so
 * sessionFlightDataFor's lane filter dropped it and every still and frame
 * read "0 / 4 firing(s)" under a header promising one of four.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import {
  FLYING_PROJECT_ID,
  RETURNING_OPERATOR,
  runningFlight,
  shippedFiring,
} from '../../../../scripts/docs/demo-scene.mjs';
import {
  flightProgressOf,
  sessionFlightDataFor,
  type FlightProgressTranslator,
} from '../../src/web/flight-progress.js';
import { onboardingJs } from '../../src/web/features/onboarding.js';
import { fmtCost, fmtDuration } from '../../src/web/format.js';

const FIXTURE = new URL('../../src/e2e-server-populated.ts', import.meta.url);

/** The populated fixture's flying project id, read from its source — the
 *  card the staged log lands on, and the key the lane filter matches. */
function fixtureFlyingId(): string {
  const match = /id: '([^']+)',[^}]*?status: 'flying'/.exec(readFileSync(FIXTURE, 'utf8'));
  if (!match?.[1]) throw new Error('the populated fixture has no flying project');
  return match[1];
}

/** The bundle's English `tr()`: the real STRINGS.en template, `{name}` filled. */
const trEn: FlightProgressTranslator = (key, subs = {}) =>
  STRINGS.en[key].replace(/\{(\w+)\}/g, (_, name: string) => String(subs[name] ?? ''));

describe('the staged running frame', () => {
  /** The populated fixture's flying card, its log prepended the way open()'s
   *  stageProgress route does it. */
  const fixtureProjects = [{ id: fixtureFlyingId(), status: 'flying', flightLog: [shippedFiring] }];

  it('names the populated fixture’s flying project, so the staged log lands on the right card', () => {
    expect(FLYING_PROJECT_ID).toBe(fixtureFlyingId());
  });

  it('carries the base flight’s firingIdOf key, so the lane filter keeps the staged firing', () => {
    const { sessionFirings } = sessionFlightDataFor(
      fixtureProjects,
      runningFlight.startedAt,
      () => null,
    );
    expect(sessionFirings).toEqual([shippedFiring]);
  });

  it('reads one of four on the fly bar, as the scene header promises', () => {
    const { sessionFirings, historicalAvgDurationMs } = sessionFlightDataFor(
      fixtureProjects,
      runningFlight.startedAt,
      () => null,
    );
    const progress = flightProgressOf(
      runningFlight,
      sessionFirings,
      historicalAvgDurationMs,
      fmtCost,
      fmtDuration,
      trEn,
    );
    expect(progress?.pct).toBe(25);
    expect(progress?.progressBit).toBe('1 / 4 firing(s) · $2.14 so far');
  });
});

describe('the returning operator', () => {
  it('sets the snooze the onboarding ladder reads — which collapses the panel to its head, never hides it', () => {
    const js = onboardingJs();
    const [key, value] = Object.entries(RETURNING_OPERATOR)[0] ?? [];
    expect(js).toContain(`var OB_SNOOZE_KEY = '${key}';`);
    expect(js).toContain(`var OB_SNOOZE_FOREVER = '${value}';`);
    expect(js).toContain('var collapsed = obIsCollapsed() || obSnoozed();');
    expect(js).toContain('panel.hidden = false;');
  });
});
