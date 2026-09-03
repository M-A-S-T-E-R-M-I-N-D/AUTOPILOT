// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  INITIAL_RESILIENCE_STATE,
  detectQuotaFail,
  isFailure,
  selectModel,
  applyPrimaryOutcome,
  applyGlobalExhaustion,
  hibernateMinutes,
  type ResilienceConfig,
  type AttemptOutcome,
} from '../src/resilience.js';

const CONFIG: ResilienceConfig = {
  primaryModel: 'fable',
  fallbackModel: 'opus',
  promoteAfter: 3,
  reprobeCooldownSec: 45 * 60,
  hibernateBaseMin: 60,
  hibernateMaxMin: 360,
};

function outcome(partial: Partial<AttemptOutcome>): AttemptOutcome {
  return { parsed: true, isError: false, exitCode: 0, probeText: '', ...partial };
}

describe('detectQuotaFail', () => {
  it('is false for a clean, successful attempt', () => {
    expect(detectQuotaFail(outcome({ probeText: 'all good' }))).toBe(false);
  });

  it('detects a quota signal on a non-zero exit', () => {
    expect(detectQuotaFail(outcome({ exitCode: 1, probeText: 'usage limit reached' }))).toBe(true);
  });

  it('detects a rate-limit signal on an error envelope (dash and no-dash variants)', () => {
    expect(detectQuotaFail(outcome({ isError: true, probeText: 'rate-limit hit' }))).toBe(true);
    expect(detectQuotaFail(outcome({ isError: true, probeText: 'ratelimit hit' }))).toBe(true);
  });

  it('detects 429 / billing / quota keywords case-insensitively', () => {
    expect(detectQuotaFail(outcome({ exitCode: 2, probeText: 'HTTP 429' }))).toBe(true);
    expect(detectQuotaFail(outcome({ isError: true, probeText: 'BILLING problem' }))).toBe(true);
    expect(detectQuotaFail(outcome({ parsed: false, probeText: 'Quota exceeded' }))).toBe(true);
  });

  it("detects the real CLI per-model limit message ('reached your … limit / switch models')", () => {
    // The exact envelope the live flight hit on an exhausted Fable tier.
    expect(
      detectQuotaFail(
        outcome({
          isError: true,
          probeText: "You've reached your Fable 5 limit. Run /usage-credits or switch models. 429",
        }),
      ),
    ).toBe(true);
  });

  it('matches the optional-character joins in "usage credit" / "you\'ve" with the separator omitted', () => {
    // QUOTA_PATTERN uses `.?` (zero-or-one) at these two joins, not `.` (exactly
    // one) — these probes have the separator character omitted entirely, so
    // they only match under the zero-or-one form.
    expect(detectQuotaFail(outcome({ isError: true, probeText: 'usagecredit exhausted' }))).toBe(
      true,
    );
    expect(detectQuotaFail(outcome({ isError: true, probeText: 'youve reached the cap' }))).toBe(
      true,
    );
  });

  it('is false when it failed for a non-quota reason', () => {
    expect(detectQuotaFail(outcome({ isError: true, probeText: 'internal server error' }))).toBe(
      false,
    );
  });

  it('is false when the text has a quota keyword but the attempt did not fail', () => {
    expect(detectQuotaFail(outcome({ probeText: 'no quota problems here' }))).toBe(false);
  });
});

describe('isFailure', () => {
  it('is true when unparsed, errored, or non-zero exit; false otherwise', () => {
    expect(isFailure(outcome({}))).toBe(false);
    expect(isFailure(outcome({ parsed: false }))).toBe(true);
    expect(isFailure(outcome({ isError: true }))).toBe(true);
    expect(isFailure(outcome({ exitCode: 137 }))).toBe(true);
  });
});

describe('selectModel', () => {
  it('starts on the primary when the streak is below the promotion threshold', () => {
    const sel = selectModel({ ...INITIAL_RESILIENCE_STATE, consecQuota: 2 }, CONFIG, 1000);
    expect(sel).toMatchObject({
      modelToTry: 'fable',
      promoted: false,
      reprobe: false,
      startedOn: 'primary',
    });
  });

  it('starts on the fallback directly once exhausted and within the cooldown', () => {
    const sel = selectModel(
      { consecQuota: 3, reprobeAfterEpoch: 5000, consecGlobalExhaust: 0 },
      CONFIG,
      1000,
    );
    expect(sel).toMatchObject({
      modelToTry: 'opus',
      promoted: true,
      reprobe: false,
      startedOn: 'fallback',
    });
  });

  it('re-probes the primary once the cooldown has elapsed', () => {
    const sel = selectModel(
      { consecQuota: 4, reprobeAfterEpoch: 1000, consecGlobalExhaust: 0 },
      CONFIG,
      1000,
    );
    expect(sel).toMatchObject({
      modelToTry: 'fable',
      promoted: false,
      reprobe: true,
      startedOn: 'reprobe',
    });
  });
});

describe('applyPrimaryOutcome', () => {
  it('leaves state unchanged when the primary was not attempted (promoted start)', () => {
    const state = { consecQuota: 5, reprobeAfterEpoch: 9000, consecGlobalExhaust: 1 };
    expect(
      applyPrimaryOutcome(state, CONFIG, 1000, {
        attemptedPrimary: false,
        quotaHit: true,
        primaryFailed: true,
      }),
    ).toBe(state);
  });

  it('extends the streak and sets the cooldown on a quota hit', () => {
    const next = applyPrimaryOutcome(INITIAL_RESILIENCE_STATE, CONFIG, 1000, {
      attemptedPrimary: true,
      quotaHit: true,
      primaryFailed: true,
    });
    expect(next.consecQuota).toBe(1);
    expect(next.reprobeAfterEpoch).toBe(1000 + 45 * 60);
  });

  it('clears the streak and cooldown on a clean primary run', () => {
    const next = applyPrimaryOutcome(
      { consecQuota: 4, reprobeAfterEpoch: 9000, consecGlobalExhaust: 0 },
      CONFIG,
      1000,
      {
        attemptedPrimary: true,
        quotaHit: false,
        primaryFailed: false,
      },
    );
    expect(next.consecQuota).toBe(0);
    expect(next.reprobeAfterEpoch).toBe(0);
  });

  it('leaves the streak unchanged on a non-quota primary failure', () => {
    const state = { consecQuota: 2, reprobeAfterEpoch: 8000, consecGlobalExhaust: 0 };
    const next = applyPrimaryOutcome(state, CONFIG, 1000, {
      attemptedPrimary: true,
      quotaHit: false,
      primaryFailed: true,
    });
    expect(next).toEqual(state);
  });
});

describe('applyGlobalExhaustion', () => {
  it('increments on exhaustion and resets on a clear final attempt', () => {
    expect(
      applyGlobalExhaustion({ ...INITIAL_RESILIENCE_STATE, consecGlobalExhaust: 2 }, true)
        .consecGlobalExhaust,
    ).toBe(3);
    expect(
      applyGlobalExhaustion({ ...INITIAL_RESILIENCE_STATE, consecGlobalExhaust: 2 }, false)
        .consecGlobalExhaust,
    ).toBe(0);
  });
});

describe('hibernateMinutes', () => {
  it('escalates 60 -> 120 -> 240 and caps at the max', () => {
    const at = (streak: number) =>
      hibernateMinutes({ ...INITIAL_RESILIENCE_STATE, consecGlobalExhaust: streak }, CONFIG);
    expect(at(1)).toBe(60);
    expect(at(2)).toBe(120);
    expect(at(3)).toBe(240);
    expect(at(4)).toBe(360); // 480 capped to 360
    expect(at(10)).toBe(360);
  });
});

describe('resilience sequence (integration of the pure state machine)', () => {
  it('promotes after three quota hits, then re-probes after the cooldown, then clears on a clean run', () => {
    let state = INITIAL_RESILIENCE_STATE;
    const cooldown = CONFIG.reprobeCooldownSec;

    // Three consecutive primary quota hits at t=0, each attempted on the primary.
    for (let i = 0; i < 3; i++) {
      const sel = selectModel(state, CONFIG, 0);
      expect(sel.startedOn).toBe('primary'); // not yet promoted during these hits
      state = applyPrimaryOutcome(state, CONFIG, 0, {
        attemptedPrimary: true,
        quotaHit: true,
        primaryFailed: true,
      });
    }
    expect(state.consecQuota).toBe(3);

    // Now exhausted: within the cooldown we start on the fallback directly.
    expect(selectModel(state, CONFIG, 10).startedOn).toBe('fallback');

    // After the cooldown elapses we re-probe the primary.
    expect(selectModel(state, CONFIG, cooldown + 1).startedOn).toBe('reprobe');

    // A clean re-probe clears the streak back to primary-first.
    state = applyPrimaryOutcome(state, CONFIG, cooldown + 1, {
      attemptedPrimary: true,
      quotaHit: false,
      primaryFailed: false,
    });
    expect(state.consecQuota).toBe(0);
    expect(selectModel(state, CONFIG, cooldown + 2).startedOn).toBe('primary');
  });
});
