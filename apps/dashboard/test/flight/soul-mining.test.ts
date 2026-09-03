// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  mineSoulAmendment,
  pruneSoulAmendment,
  mineNoopSoulAmendment,
  pruneNoopSoulAmendment,
  CHECKPOINT_STREAK_THRESHOLD,
  CHECKPOINT_SOUL_AMENDMENT_MARKER,
  NOOP_STREAK_THRESHOLD,
  NOOP_SOUL_AMENDMENT_MARKER,
  SOUL_MINING_GATE_LOOKBACK,
  type SoulMiningInput,
  type SoulPruneInput,
} from '../../src/flight/soul-mining.js';

const BASE_SOUL = '# SOUL — test-project\n\n## Gate\n- test: pnpm run test\n';

function inputWith(overrides: Partial<SoulMiningInput>): SoulMiningInput {
  return {
    soul: BASE_SOUL,
    soulProposed: null,
    recentGateResults: [],
    ...overrides,
  };
}

const STREAK = Array.from({ length: CHECKPOINT_STREAK_THRESHOLD }, () => 'checkpointed');

describe('mineSoulAmendment', () => {
  it('proposes an amendment when the newest firings are a full checkpoint streak', () => {
    const proposal = mineSoulAmendment(inputWith({ recentGateResults: STREAK }));
    expect(proposal).not.toBeNull();
    expect(proposal).toContain(BASE_SOUL.trimEnd());
    expect(proposal).toContain(CHECKPOINT_SOUL_AMENDMENT_MARKER);
    expect(proposal).toContain(`last ${CHECKPOINT_STREAK_THRESHOLD} firings`);
  });

  it('returns null when there are fewer firings than the streak threshold', () => {
    const short = STREAK.slice(0, CHECKPOINT_STREAK_THRESHOLD - 1);
    expect(mineSoulAmendment(inputWith({ recentGateResults: short }))).toBeNull();
  });

  it('returns null when a clean ship breaks the streak (not consecutive)', () => {
    const broken = ['checkpointed', 'passed', ...STREAK.slice(2)];
    expect(mineSoulAmendment(inputWith({ recentGateResults: broken }))).toBeNull();
  });

  it('only looks at the newest N results, ignoring older history beyond the streak', () => {
    const withOlderNoise = [...STREAK, 'passed', 'reverted', null];
    expect(mineSoulAmendment(inputWith({ recentGateResults: withOlderNoise }))).not.toBeNull();
  });

  it('returns null when a proposal is already pending (never overwrite an unreviewed one)', () => {
    const proposal = mineSoulAmendment(
      inputWith({ recentGateResults: STREAK, soulProposed: 'some other pending diff' }),
    );
    expect(proposal).toBeNull();
  });

  it('returns null when the SOUL already carries this learning (ratified or already live)', () => {
    const soulWithMarker = `${BASE_SOUL}\n\n${CHECKPOINT_SOUL_AMENDMENT_MARKER}\n- already noted.\n`;
    const proposal = mineSoulAmendment(
      inputWith({ recentGateResults: STREAK, soul: soulWithMarker }),
    );
    expect(proposal).toBeNull();
  });

  it('returns null for an ordinary mixed history with no streak', () => {
    const mixed = ['passed', 'passed', 'reverted', 'checkpointed'];
    expect(mineSoulAmendment(inputWith({ recentGateResults: mixed }))).toBeNull();
  });

  it('returns null for an empty history', () => {
    expect(mineSoulAmendment(inputWith({ recentGateResults: [] }))).toBeNull();
  });
});

const SOUL_WITH_NOTE =
  `${BASE_SOUL}\n\n${CHECKPOINT_SOUL_AMENDMENT_MARKER}\n` +
  `- The last ${CHECKPOINT_STREAK_THRESHOLD} firings each hit the turn cap mid-unit.\n`;

function pruneInputWith(overrides: Partial<SoulPruneInput>): SoulPruneInput {
  return {
    soul: SOUL_WITH_NOTE,
    soulProposed: null,
    recentGateResults: [],
    ...overrides,
  };
}

describe('pruneSoulAmendment', () => {
  it('proposes retracting the note once the streak it described breaks', () => {
    const broken = ['passed', 'checkpointed', 'checkpointed'];
    const retraction = pruneSoulAmendment(pruneInputWith({ recentGateResults: broken }));
    expect(retraction).not.toBeNull();
    expect(retraction).not.toContain(CHECKPOINT_SOUL_AMENDMENT_MARKER);
    expect(retraction).toContain(BASE_SOUL.trimEnd());
  });

  it('returns null when the SOUL never carried the note (nothing to prune)', () => {
    expect(
      pruneSoulAmendment(pruneInputWith({ soul: BASE_SOUL, recentGateResults: [] })),
    ).toBeNull();
  });

  it('returns null while the streak the note describes still holds', () => {
    expect(pruneSoulAmendment(pruneInputWith({ recentGateResults: STREAK }))).toBeNull();
  });

  it('returns null when a proposal is already pending (never overwrite an unreviewed one)', () => {
    const retraction = pruneSoulAmendment(
      pruneInputWith({ recentGateResults: [], soulProposed: 'some other pending diff' }),
    );
    expect(retraction).toBeNull();
  });

  it('preserves SOUL content that follows the pruned section', () => {
    const soulWithTrailer = `${SOUL_WITH_NOTE}\n## Later section\n- kept.\n`;
    const retraction = pruneSoulAmendment(
      pruneInputWith({ soul: soulWithTrailer, recentGateResults: [] }),
    );
    expect(retraction).not.toContain(CHECKPOINT_SOUL_AMENDMENT_MARKER);
    expect(retraction).toContain('## Later section');
    expect(retraction).toContain('- kept.');
  });
});

// Second learning kind (epic 0014 slice 2): noop-streak mine/prune pair,
// same fixed-template/streak mechanics as the checkpoint kind.
const NOOP_STREAK = Array.from({ length: NOOP_STREAK_THRESHOLD }, () => 'no-commit');

describe('mineNoopSoulAmendment', () => {
  it('proposes an amendment when the newest firings are a full no-commit streak', () => {
    const proposal = mineNoopSoulAmendment(inputWith({ recentGateResults: NOOP_STREAK }));
    expect(proposal).not.toBeNull();
    expect(proposal).toContain(BASE_SOUL.trimEnd());
    expect(proposal).toContain(NOOP_SOUL_AMENDMENT_MARKER);
    expect(proposal).toContain(`last ${NOOP_STREAK_THRESHOLD} firings`);
  });

  it('returns null when a shipped firing breaks the streak (not consecutive)', () => {
    const broken = ['no-commit', 'passed', ...NOOP_STREAK.slice(2)];
    expect(mineNoopSoulAmendment(inputWith({ recentGateResults: broken }))).toBeNull();
  });

  it('returns null on a checkpoint streak (each kind only matches its own gate_result)', () => {
    expect(mineNoopSoulAmendment(inputWith({ recentGateResults: STREAK }))).toBeNull();
  });

  it('returns null when a proposal is already pending (never overwrite an unreviewed one)', () => {
    const proposal = mineNoopSoulAmendment(
      inputWith({ recentGateResults: NOOP_STREAK, soulProposed: 'some other pending diff' }),
    );
    expect(proposal).toBeNull();
  });

  it('returns null when the SOUL already carries this learning', () => {
    const soulWithMarker = `${BASE_SOUL}\n\n${NOOP_SOUL_AMENDMENT_MARKER}\n- already noted.\n`;
    expect(
      mineNoopSoulAmendment(inputWith({ recentGateResults: NOOP_STREAK, soul: soulWithMarker })),
    ).toBeNull();
  });

  it('appends alongside an existing checkpoint note without disturbing it (kinds coexist)', () => {
    const proposal = mineNoopSoulAmendment(
      inputWith({ soul: SOUL_WITH_NOTE, recentGateResults: NOOP_STREAK }),
    );
    expect(proposal).toContain(CHECKPOINT_SOUL_AMENDMENT_MARKER);
    expect(proposal).toContain(NOOP_SOUL_AMENDMENT_MARKER);
  });
});

const SOUL_WITH_NOOP_NOTE =
  `${BASE_SOUL}\n\n${NOOP_SOUL_AMENDMENT_MARKER}\n` +
  `- The last ${NOOP_STREAK_THRESHOLD} firings each ended with no commit.\n`;

describe('pruneNoopSoulAmendment', () => {
  it('proposes retracting the note once the noop streak it described breaks', () => {
    const broken = ['passed', 'no-commit', 'no-commit'];
    const retraction = pruneNoopSoulAmendment(
      pruneInputWith({ soul: SOUL_WITH_NOOP_NOTE, recentGateResults: broken }),
    );
    expect(retraction).not.toBeNull();
    expect(retraction).not.toContain(NOOP_SOUL_AMENDMENT_MARKER);
    expect(retraction).toContain(BASE_SOUL.trimEnd());
  });

  it('returns null while the noop streak the note describes still holds', () => {
    expect(
      pruneNoopSoulAmendment(
        pruneInputWith({ soul: SOUL_WITH_NOOP_NOTE, recentGateResults: NOOP_STREAK }),
      ),
    ).toBeNull();
  });

  it('returns null when the SOUL never carried the note (nothing to prune)', () => {
    expect(
      pruneNoopSoulAmendment(pruneInputWith({ soul: BASE_SOUL, recentGateResults: [] })),
    ).toBeNull();
  });

  it('leaves the checkpoint note intact when pruning only the noop note', () => {
    const soulWithBoth =
      `${SOUL_WITH_NOTE}\n${NOOP_SOUL_AMENDMENT_MARKER}\n` + `- noop note to retract.\n`;
    const retraction = pruneNoopSoulAmendment(
      pruneInputWith({ soul: soulWithBoth, recentGateResults: STREAK }),
    );
    expect(retraction).not.toContain(NOOP_SOUL_AMENDMENT_MARKER);
    expect(retraction).toContain(CHECKPOINT_SOUL_AMENDMENT_MARKER);
  });
});

describe('SOUL_MINING_GATE_LOOKBACK', () => {
  it("covers every kind's full streak window", () => {
    expect(SOUL_MINING_GATE_LOOKBACK).toBe(
      Math.max(CHECKPOINT_STREAK_THRESHOLD, NOOP_STREAK_THRESHOLD),
    );
  });
});
