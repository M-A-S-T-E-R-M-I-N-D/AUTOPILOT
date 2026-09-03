// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { detectAnomalies } from '../../src/read/anomalies.js';
import type { FlightEntry } from '../../src/read/fleet.js';

function flight(over: Partial<FlightEntry> = {}): FlightEntry {
  return {
    id: 'f1',
    item: null,
    kind: null,
    sha: null,
    shipped: true,
    gateResult: 'passed',
    cost: 0.1,
    tokensIn: 0,
    tokensOut: 0,
    turns: 1,
    commitSubject: null,
    completion: null,
    failedCheck: null,
    died: null,
    at: 1,
    ...over,
  };
}

describe('detectAnomalies', () => {
  it('is empty for a healthy flight log', () => {
    const log = Array.from({ length: 6 }, () => flight());
    expect(detectAnomalies(log)).toEqual([]);
  });

  it('is empty for an empty flight log', () => {
    expect(detectAnomalies([])).toEqual([]);
  });

  describe('cost-spike', () => {
    it('fires when the latest firing costs far more than the recent baseline', () => {
      const log = [flight({ cost: 5 }), ...Array.from({ length: 5 }, () => flight({ cost: 1 }))];
      const anomalies = detectAnomalies(log);
      expect(anomalies).toContainEqual({
        kind: 'cost-spike',
        evidence: 'Firing cost $5.00 vs ~$1.00 average of the last 5 firings.',
      });
    });

    it('does not fire without enough baseline history yet', () => {
      const log = [flight({ cost: 100 }), ...Array.from({ length: 4 }, () => flight({ cost: 1 }))];
      expect(detectAnomalies(log).some((a) => a.kind === 'cost-spike')).toBe(false);
    });

    it('does not fire below the minimum-dollar floor even at a high ratio', () => {
      const log = [
        flight({ cost: 0.5 }),
        ...Array.from({ length: 5 }, () => flight({ cost: 0.1 })),
      ];
      expect(detectAnomalies(log).some((a) => a.kind === 'cost-spike')).toBe(false);
    });

    it('does not fire when the recent baseline average is zero', () => {
      const log = [flight({ cost: 5 }), ...Array.from({ length: 5 }, () => flight({ cost: 0 }))];
      expect(detectAnomalies(log).some((a) => a.kind === 'cost-spike')).toBe(false);
    });

    it('does not fire when the latest cost stays below the threshold multiple of a real baseline', () => {
      const log = [flight({ cost: 1 }), ...Array.from({ length: 5 }, () => flight({ cost: 1 }))];
      expect(detectAnomalies(log).some((a) => a.kind === 'cost-spike')).toBe(false);
    });

    it('fires exactly at the threshold multiple of the baseline', () => {
      const log = [flight({ cost: 3 }), ...Array.from({ length: 5 }, () => flight({ cost: 1 }))];
      expect(detectAnomalies(log)).toContainEqual({
        kind: 'cost-spike',
        evidence: 'Firing cost $3.00 vs ~$1.00 average of the last 5 firings.',
      });
    });

    it('fires at exactly the dollar floor when it still clears the baseline multiple', () => {
      const log = [flight({ cost: 1 }), ...Array.from({ length: 5 }, () => flight({ cost: 0.1 }))];
      expect(detectAnomalies(log)).toContainEqual({
        kind: 'cost-spike',
        evidence: 'Firing cost $1.00 vs ~$0.10 average of the last 5 firings.',
      });
    });
  });

  describe('death-cluster', () => {
    it('fires when 2 of the last 3 firings died', () => {
      const log = [
        flight({ shipped: false, died: 'turn-cap' }),
        flight({ shipped: false, died: 'error' }),
        flight(),
      ];
      expect(detectAnomalies(log)).toContainEqual({
        kind: 'death-cluster',
        evidence: '2 of the last 3 firings died (turn-cap/error) without shipping.',
      });
    });

    it('does not fire when only 1 of the last 3 died', () => {
      const log = [flight({ shipped: false, died: 'turn-cap' }), flight(), flight()];
      expect(detectAnomalies(log).some((a) => a.kind === 'death-cluster')).toBe(false);
    });

    it('does not fire with fewer than 3 firings on record', () => {
      const log = [
        flight({ shipped: false, died: 'turn-cap' }),
        flight({ shipped: false, died: 'error' }),
      ];
      expect(detectAnomalies(log).some((a) => a.kind === 'death-cluster')).toBe(false);
    });

    it('only counts deaths within the recent window, not the whole log', () => {
      const log = [
        flight(),
        flight(),
        flight(),
        flight({ shipped: false, died: 'turn-cap' }),
        flight({ shipped: false, died: 'error' }),
      ];
      expect(detectAnomalies(log).some((a) => a.kind === 'death-cluster')).toBe(false);
    });
  });

  describe('gate-fail-streak', () => {
    it('fires on 3 consecutive gate-reverted firings from the most recent', () => {
      const log = [
        flight({ shipped: false, gateResult: 'reverted' }),
        flight({ shipped: false, gateResult: 'reverted' }),
        flight({ shipped: false, gateResult: 'reverted' }),
        flight(),
      ];
      expect(detectAnomalies(log)).toContainEqual({
        kind: 'gate-fail-streak',
        evidence: '3 consecutive firings reverted by the gate.',
      });
    });

    it('does not fire when the streak is broken before reaching the threshold', () => {
      const log = [
        flight({ shipped: false, gateResult: 'reverted' }),
        flight(),
        flight({ shipped: false, gateResult: 'reverted' }),
        flight({ shipped: false, gateResult: 'reverted' }),
      ];
      expect(detectAnomalies(log).some((a) => a.kind === 'gate-fail-streak')).toBe(false);
    });

    it('does not fire below the streak threshold', () => {
      const log = [
        flight({ shipped: false, gateResult: 'reverted' }),
        flight({ shipped: false, gateResult: 'reverted' }),
        flight(),
      ];
      expect(detectAnomalies(log).some((a) => a.kind === 'gate-fail-streak')).toBe(false);
    });
  });

  it('can report more than one anomaly at once', () => {
    const log = [
      flight({ cost: 5, shipped: false, gateResult: 'reverted' }),
      flight({ shipped: false, gateResult: 'reverted', cost: 1 }),
      flight({ shipped: false, gateResult: 'reverted', cost: 1 }),
      ...Array.from({ length: 5 }, () => flight({ cost: 1 })),
    ];
    const kinds = detectAnomalies(log).map((a) => a.kind);
    expect(kinds).toContain('cost-spike');
    expect(kinds).toContain('gate-fail-streak');
  });
});

describe('orientDrag (via detectAnomalies)', () => {
  const orient = (...lengths: number[]) => lengths.map((n) => ({ actionsBeforeFirstEdit: n }));

  it('flags a latest firing that reads far longer before editing than its baseline', () => {
    const anomalies = detectAnomalies([], orient(24, 5, 6, 4, 5, 5));
    expect(anomalies).toEqual([
      {
        kind: 'orient-drag',
        evidence:
          'Latest firing took 24 actions before its first edit vs ~5.0 average of the last 5 edit-reaching firings.',
      },
    ]);
  });

  it('stays quiet below the action floor even when the ratio is high', () => {
    expect(detectAnomalies([], orient(8, 2, 2, 2, 2, 2))).toEqual([]);
  });

  it('stays quiet without enough baseline firings', () => {
    expect(detectAnomalies([], orient(50, 5, 5))).toEqual([]);
  });

  it('stays quiet when the latest firing is within the multiplier of its baseline', () => {
    expect(detectAnomalies([], orient(12, 8, 9, 10, 8, 9))).toEqual([]);
  });

  it('stays quiet with exactly WINDOW entries — no room for a full 5-firing baseline yet', () => {
    expect(detectAnomalies([], orient(24, 10, 10, 10, 10))).toEqual([]);
  });

  it('fires when the latest actions-before-first-edit sits exactly at the floor but still clears the baseline multiplier', () => {
    expect(detectAnomalies([], orient(10, 4, 4, 4, 4, 4))).toEqual([
      {
        kind: 'orient-drag',
        evidence:
          'Latest firing took 10 actions before its first edit vs ~4.0 average of the last 5 edit-reaching firings.',
      },
    ]);
  });

  it('stays quiet when the baseline average is exactly zero', () => {
    expect(detectAnomalies([], orient(20, 0, 0, 0, 0, 0))).toEqual([]);
  });

  it('fires when the latest firing sits exactly at the multiplier threshold, not just above it', () => {
    expect(detectAnomalies([], orient(10, 5, 5, 5, 5, 5))).toEqual([
      {
        kind: 'orient-drag',
        evidence:
          'Latest firing took 10 actions before its first edit vs ~5.0 average of the last 5 edit-reaching firings.',
      },
    ]);
  });
});

describe('familyRunaways (via detectAnomalies)', () => {
  it('surfaces one evidence-carrying chip per flagged family', () => {
    const anomalies = detectAnomalies(
      [],
      [],
      [
        { family: 'mutation testing widens to *', spendUsd: 62.4, firings: 45 },
        { family: 'wire mutation testing for *', spendUsd: 51, firings: 12 },
      ],
    );
    expect(anomalies).toEqual([
      {
        kind: 'family-runaway',
        evidence:
          'Recurring pattern "mutation testing widens to *" burned $62 across 45 firings ' +
          'under many task ids — no single id ever crossed the per-task threshold.',
      },
      {
        kind: 'family-runaway',
        evidence:
          'Recurring pattern "wire mutation testing for *" burned $51 across 12 firings ' +
          'under many task ids — no single id ever crossed the per-task threshold.',
      },
    ]);
  });

  it('stays quiet with no flagged families (and when the param is omitted)', () => {
    expect(detectAnomalies([], [], [])).toEqual([]);
    expect(detectAnomalies([])).toEqual([]);
  });
});

describe('intentCollisions (via detectAnomalies)', () => {
  it('surfaces one evidence-carrying chip per persisted breach', () => {
    const anomalies = detectAnomalies(
      [],
      [],
      [],
      [
        {
          file: 'apps/dashboard/src/read/source.ts',
          sibling: 'fleet-2',
          intent: 'apps/dashboard/src/read/source.ts — rework gather',
        },
      ],
    );
    expect(anomalies).toEqual([
      {
        kind: 'intent-collision',
        evidence:
          'A firing shipped apps/dashboard/src/read/source.ts while sibling fleet-2 had it ' +
          'claimed as its declared intent ("apps/dashboard/src/read/source.ts — rework gather").',
      },
    ]);
  });

  it('AGGREGATES many breaches into ONE chip with the count and latest evidence (badge-spam fix)', () => {
    // Operator report (2026-08-21): a card wore TWELVE identical
    // "intent collision" chips — one per historical event, forever. One
    // aggregated chip carries the same information without the wall of spam.
    // The read layer hands back rows newest-first (intentCollisionEvents'
    // `ORDER BY id DESC`), so the fixture is built newest-first too — index 0
    // is unit 11, the most recent breach.
    const collisions = Array.from({ length: 12 }, (_, i) => {
      const unit = 11 - i;
      return {
        file: `src/file-${unit}.ts`,
        sibling: 'fleet-' + ((unit % 3) + 2),
        intent: `src/file-${unit}.ts — unit ${unit}`,
      };
    });
    const anomalies = detectAnomalies([], [], [], collisions);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]?.kind).toBe('intent-collision');
    expect(anomalies[0]?.evidence).toContain('12 intent collisions');
    expect(anomalies[0]?.evidence).toContain('src/file-11.ts'); // the latest breach named
  });

  it('stays quiet with no persisted breaches (and when the param is omitted)', () => {
    expect(detectAnomalies([], [], [], [])).toEqual([]);
    expect(detectAnomalies([])).toEqual([]);
  });
});

describe('nearMissRecurring (via detectAnomalies)', () => {
  it('surfaces one evidence-carrying chip per persisted verdict', () => {
    const anomalies = detectAnomalies(
      [],
      [],
      [],
      [],
      [{ nearMissClass: 'guardDenials', streak: 4 }],
    );
    expect(anomalies).toEqual([
      {
        kind: 'near-miss-recurring',
        evidence:
          'guard denials stayed nonzero across the last 4 consecutive flights — ' +
          'SAFETY-II near-miss ritual (web-mt1qat5h-nxzgjs).',
      },
    ]);
  });

  it('stays quiet with no persisted verdicts (and when the param is omitted)', () => {
    expect(detectAnomalies([], [], [], [], [])).toEqual([]);
    expect(detectAnomalies([])).toEqual([]);
  });
});

describe('guardDenials (via detectAnomalies)', () => {
  it('surfaces one evidence-carrying chip for a single persisted denial', () => {
    const anomalies = detectAnomalies(
      [],
      [],
      [],
      [],
      [],
      [{ kind: 'containment', target: 'Read of a path outside the target repo: /etc/passwd.' }],
    );
    expect(anomalies).toEqual([
      {
        kind: 'guard-denial',
        evidence:
          'A firing hit a guard denial (containment): ' +
          'Read of a path outside the target repo: /etc/passwd.',
      },
    ]);
  });

  it('AGGREGATES many denials into ONE chip with the count and latest evidence', () => {
    // Rows arrive newest-first (guardDenialEvents' `ORDER BY id DESC`), so
    // the fixture is built newest-first too — index 0 is the latest denial.
    const denials = [
      { kind: 'read-hygiene' as const, target: 'generated output dir' },
      { kind: 'containment' as const, target: '/etc/passwd' },
      { kind: 'containment' as const, target: '/tmp/x' },
    ];
    const anomalies = detectAnomalies([], [], [], [], [], denials);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]?.kind).toBe('guard-denial');
    expect(anomalies[0]?.evidence).toContain('3 guard denials');
    expect(anomalies[0]?.evidence).toContain('generated output dir'); // the latest denial named
  });

  it('stays quiet with no persisted denials (and when the param is omitted)', () => {
    expect(detectAnomalies([], [], [], [], [], [])).toEqual([]);
    expect(detectAnomalies([])).toEqual([]);
  });
});

describe('syncBackRefusals (via detectAnomalies)', () => {
  it('surfaces one evidence-carrying chip for a single persisted refusal', () => {
    const anomalies = detectAnomalies(
      [],
      [],
      [],
      [],
      [],
      [],
      [{ details: "merge of 'flight-worktree' into 'flight' failed: CONFLICT in shell.ts" }],
    );
    expect(anomalies).toEqual([
      {
        kind: 'sync-back-refusal',
        evidence:
          'A firing hit a sync-back refusal: ' +
          "merge of 'flight-worktree' into 'flight' failed: CONFLICT in shell.ts",
      },
    ]);
  });

  it('AGGREGATES many refusals into ONE chip with the count and latest evidence', () => {
    // Rows arrive newest-first (syncBackRefusalEvents' `ORDER BY id DESC`), so
    // the fixture is built newest-first too — index 0 is the latest refusal.
    const refusals = [
      { details: 'still blocked on shell.ts' },
      { details: 'blocked on shell.ts (attempt 2)' },
      { details: 'blocked on shell.ts (attempt 1)' },
    ];
    const anomalies = detectAnomalies([], [], [], [], [], [], refusals);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]?.kind).toBe('sync-back-refusal');
    expect(anomalies[0]?.evidence).toContain('3 sync-back refusals');
    expect(anomalies[0]?.evidence).toContain('still blocked on shell.ts'); // the latest refusal named
  });

  it('stays quiet with no persisted refusals (and when the param is omitted)', () => {
    expect(detectAnomalies([], [], [], [], [], [], [])).toEqual([]);
    expect(detectAnomalies([])).toEqual([]);
  });
});

describe('landGateAlarms (via detectAnomalies)', () => {
  it('surfaces one evidence-carrying chip for a single persisted alarm', () => {
    const anomalies = detectAnomalies(
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [{ details: 'typecheck failed: 3 errors in packages/store/src/read-events.ts' }],
    );
    expect(anomalies).toEqual([
      {
        kind: 'land-gate-alarm',
        evidence:
          'The out-of-band land gate went red while a flight was running: ' +
          'typecheck failed: 3 errors in packages/store/src/read-events.ts',
      },
    ]);
  });

  it('AGGREGATES many alarms into ONE chip with the count and latest evidence', () => {
    // Rows arrive newest-first (landGateAlarmEvents' `ORDER BY id DESC`), so
    // the fixture is built newest-first too — index 0 is the latest alarm.
    const alarms = [
      { details: 'still red on the detached worktree' },
      { details: 'red on the detached worktree (attempt 2)' },
      { details: 'red on the detached worktree (attempt 1)' },
    ];
    const anomalies = detectAnomalies([], [], [], [], [], [], [], alarms);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]?.kind).toBe('land-gate-alarm');
    expect(anomalies[0]?.evidence).toContain('3 out-of-band land gate alarms');
    expect(anomalies[0]?.evidence).toContain('still red on the detached worktree'); // the latest alarm named
  });

  it('stays quiet with no persisted alarms (and when the param is omitted)', () => {
    expect(detectAnomalies([], [], [], [], [], [], [], [])).toEqual([]);
    expect(detectAnomalies([])).toEqual([]);
  });
});

describe('convergenceRedAlarms (via detectAnomalies)', () => {
  it('surfaces one evidence-carrying chip for a single persisted alarm', () => {
    const anomalies = detectAnomalies(
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [{ check: 'typecheck', details: "merge of 'flight-worktree' into 'flight': dupe keys" }],
    );
    expect(anomalies).toEqual([
      {
        kind: 'convergence-red',
        evidence:
          'A convergence gate went red after a sync-back (typecheck): ' +
          "merge of 'flight-worktree' into 'flight': dupe keys",
      },
    ]);
  });

  it('AGGREGATES many alarms into ONE chip with the count and latest evidence', () => {
    // Rows arrive newest-first (convergenceRedEvents' `ORDER BY id DESC`), so
    // the fixture is built newest-first too — index 0 is the latest alarm.
    const alarms = [
      { check: 'build', details: 'still red on the merged branch' },
      { check: 'typecheck', details: 'red on the merged branch (attempt 2)' },
      { check: 'typecheck', details: 'red on the merged branch (attempt 1)' },
    ];
    const anomalies = detectAnomalies([], [], [], [], [], [], [], [], alarms);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]?.kind).toBe('convergence-red');
    expect(anomalies[0]?.evidence).toContain('3 convergence-red alarms');
    expect(anomalies[0]?.evidence).toContain('still red on the merged branch'); // the latest alarm named
  });

  it('stays quiet with no persisted alarms (and when the param is omitted)', () => {
    expect(detectAnomalies([], [], [], [], [], [], [], [], [])).toEqual([]);
    expect(detectAnomalies([])).toEqual([]);
  });
});

describe('e2eLandBlocks (via detectAnomalies)', () => {
  it('surfaces one evidence-carrying chip for a single persisted refusal', () => {
    const anomalies = detectAnomalies(
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [{ detail: "converged branch 'main' e2e is red — ci.yml is failure" }],
    );
    expect(anomalies).toEqual([
      {
        kind: 'e2e-land-block',
        evidence:
          "A landing was refused because the converged branch's e2e is red: " +
          "converged branch 'main' e2e is red — ci.yml is failure",
      },
    ]);
  });

  it('AGGREGATES many refusals into ONE chip with the count and latest evidence', () => {
    // Rows arrive newest-first (e2eLandBlockEvents' `ORDER BY id DESC`), so
    // the fixture is built newest-first too — index 0 is the latest refusal.
    const blocks = [
      { detail: 'still red — ci.yml is failure' },
      { detail: 'red — ci.yml is timed_out (attempt 2)' },
      { detail: 'red — ci.yml is timed_out (attempt 1)' },
    ];
    const anomalies = detectAnomalies([], [], [], [], [], [], [], [], [], blocks);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]?.kind).toBe('e2e-land-block');
    expect(anomalies[0]?.evidence).toContain('3 e2e-land-block refusals');
    expect(anomalies[0]?.evidence).toContain('still red — ci.yml is failure'); // the latest refusal named
  });

  it('stays quiet with no persisted refusals (and when the param is omitted)', () => {
    expect(detectAnomalies([], [], [], [], [], [], [], [], [], [])).toEqual([]);
    expect(detectAnomalies([])).toEqual([]);
  });
});
