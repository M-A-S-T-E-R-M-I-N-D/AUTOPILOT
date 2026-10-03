// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  evaluatePreflight,
  formatPreflight,
  preflightRefusal,
  preflightWarnings,
  MIN_FREE_BYTES_BLOCK,
  MIN_FREE_BYTES_WARN,
  WIDE_FLEET_LANES,
  type PreflightFacts,
} from '../../src/flight/preflight.js';

const GIB = 1024 * 1024 * 1024;

function facts(over: Partial<PreflightFacts> = {}): PreflightFacts {
  return {
    targetDirty: 0,
    gitIdentity: { name: 'Pilot', email: 'pilot@example.test' },
    freeBytes: 40 * GIB,
    distOlderThanSource: false,
    staleLocks: [],
    dirtyLanes: [],
    parkedHeads: 0,
    cli: { found: true, version: '2.1.273 (Claude Code)' },
    engine: { kind: 'claude' },
    authDescription: 'Claude subscription (Claude Code login)',
    caps: { wallClockMin: 90, idleMin: 20 },
    laneCount: 1,
    ...over,
  };
}

function check(report: ReturnType<typeof evaluatePreflight>, name: string) {
  const c = report.checks.find((x) => x.name === name);
  if (c === undefined) throw new Error(`no check named ${name}`);
  return c;
}

describe('evaluatePreflight — the go/no-go before a flight spends a dollar', () => {
  it('a healthy machine is GO, every check ok, the caps stated', () => {
    const report = evaluatePreflight(facts());
    expect(report.go).toBe(true);
    expect(report.checks.every((c) => c.ok)).toBe(true);
    expect(report.checks.map((c) => c.name)).toEqual([
      'target-clean',
      'git-identity',
      'claude-cli',
      'disk-space',
      'build-fresh',
      'per-firing-caps',
    ]);
    expect(check(report, 'target-clean')).toEqual({
      level: 'info',
      name: 'target-clean',
      ok: true,
      detail: 'live checkout is clean',
    });
    expect(check(report, 'git-identity')).toEqual({
      level: 'info',
      name: 'git-identity',
      ok: true,
      detail: 'Pilot <pilot@example.test>',
    });
    expect(check(report, 'claude-cli')).toEqual({
      level: 'info',
      name: 'claude-cli',
      ok: true,
      detail: 'claude 2.1.273 (Claude Code) — Claude subscription (Claude Code login)',
    });
    expect(check(report, 'disk-space')).toEqual({
      level: 'info',
      name: 'disk-space',
      ok: true,
      detail: '40.0 GiB free',
    });
    expect(check(report, 'build-fresh')).toEqual({
      level: 'info',
      name: 'build-fresh',
      ok: true,
      detail: 'built flight matches its sources',
    });
    expect(check(report, 'per-firing-caps')).toEqual({
      level: 'info',
      name: 'per-firing-caps',
      ok: true,
      detail: 'wall clock 90 min, idle 20 min without output',
    });
  });

  it('a dirty live checkout BLOCKS — every sync-back into it would refuse', () => {
    const report = evaluatePreflight(facts({ targetDirty: 3 }));
    expect(report.go).toBe(false);
    expect(check(report, 'target-clean')).toEqual({
      level: 'block',
      name: 'target-clean',
      ok: false,
      detail:
        '3 changed or untracked path(s) in the live checkout — every sync-back into it would refuse; commit or stash them first',
    });
  });

  it('a target that is not a git repository flies: nothing to sync, no identity needed', () => {
    const report = evaluatePreflight(
      facts({ targetDirty: null, gitIdentity: { name: null, email: null } }),
    );
    expect(report.go).toBe(true);
    expect(check(report, 'target-clean')).toEqual({
      level: 'info',
      name: 'target-clean',
      ok: true,
      detail: 'not a git repository — the flight edits files in place, nothing to sync',
    });
    expect(report.checks.some((c) => c.name === 'git-identity')).toBe(false);
  });

  it('a missing git identity BLOCKS in a repository — name or email alone is not enough', () => {
    const noName = evaluatePreflight(facts({ gitIdentity: { name: null, email: 'p@x.test' } }));
    const noEmail = evaluatePreflight(facts({ gitIdentity: { name: 'P', email: null } }));
    for (const report of [noName, noEmail]) {
      expect(report.go).toBe(false);
      expect(check(report, 'git-identity')).toEqual({
        level: 'block',
        name: 'git-identity',
        ok: false,
        detail:
          'git user.name / user.email are not set in this checkout — every commit the flight makes would fail; run `git config user.name … && git config user.email …`',
      });
    }
  });

  it('no `claude` on the PATH BLOCKS; a version without a number still reports', () => {
    const missing = evaluatePreflight(facts({ cli: { found: false, version: null } }));
    expect(missing.go).toBe(false);
    expect(check(missing, 'claude-cli')).toEqual({
      level: 'block',
      name: 'claude-cli',
      ok: false,
      detail: '`claude` is not on the PATH — install Claude Code and sign in once before flying',
    });
    const unknown = evaluatePreflight(facts({ cli: { found: true, version: null } }));
    expect(check(unknown, 'claude-cli').detail).toBe(
      'claude (version unknown) — Claude subscription (Claude Code login)',
    );
  });

  it('a Claude lane adds no engine line', () => {
    expect(evaluatePreflight(facts()).checks.some((c) => c.name === 'engine')).toBe(false);
  });

  it('an AUTOPILOT_ENGINE setting the flight would refuse BLOCKS with its own reason', () => {
    const reason =
      'AUTOPILOT_ENGINE=codex needs AUTOPILOT_ENGINE_MODEL to name the model Codex runs (e.g. gpt-5-codex).';
    const report = evaluatePreflight(facts({ engine: { kind: 'refused', reason } }));
    expect(report.go).toBe(false);
    expect(check(report, 'engine')).toEqual({
      level: 'block',
      name: 'engine',
      ok: false,
      detail: reason,
    });
  });

  it('a codex or gemini lane whose CLI is not on the PATH BLOCKS, naming the binary', () => {
    const codex = evaluatePreflight(
      facts({
        engine: { kind: 'cli', engine: 'codex', model: 'gpt-5-codex', found: false, version: null },
      }),
    );
    expect(codex.go).toBe(false);
    expect(check(codex, 'engine')).toEqual({
      level: 'block',
      name: 'engine',
      ok: false,
      detail:
        '`codex` is not on the PATH — AUTOPILOT_ENGINE=codex flies every firing on the Codex CLI; install it and sign in once, or unset AUTOPILOT_ENGINE',
    });
    const gemini = evaluatePreflight(
      facts({
        engine: {
          kind: 'cli',
          engine: 'gemini',
          model: 'gemini-2.5-pro',
          found: false,
          version: null,
        },
      }),
    );
    expect(check(gemini, 'engine').detail).toBe(
      '`gemini` is not on the PATH — AUTOPILOT_ENGINE=gemini flies every firing on the Gemini CLI; install it and sign in once, or unset AUTOPILOT_ENGINE',
    );
  });

  it('a codex or gemini lane whose CLI answers reports its version and model after claude-cli', () => {
    const report = evaluatePreflight(
      facts({
        engine: {
          kind: 'cli',
          engine: 'gemini',
          model: 'gemini-2.5-pro',
          found: true,
          version: '0.8.2',
        },
      }),
    );
    expect(report.go).toBe(true);
    const names = report.checks.map((c) => c.name);
    expect(names.indexOf('engine')).toBe(names.indexOf('claude-cli') + 1);
    expect(check(report, 'engine')).toEqual({
      level: 'info',
      name: 'engine',
      ok: true,
      detail:
        'Gemini CLI 0.8.2 on gemini-2.5-pro (AUTOPILOT_ENGINE) — no cost is recorded, since Gemini reports no price',
    });
    const unknown = evaluatePreflight(
      facts({
        engine: { kind: 'cli', engine: 'codex', model: 'gpt-5-codex', found: true, version: null },
      }),
    );
    expect(check(unknown, 'engine').detail).toBe(
      'Codex CLI (version unknown) on gpt-5-codex (AUTOPILOT_ENGINE) — no cost is recorded, since Codex reports no price',
    );
  });

  it('a codex lane whose CLI says it is not signed in WARNS: its own config may route to a provider that needs none', () => {
    const codex = {
      kind: 'cli' as const,
      engine: 'codex' as const,
      model: 'gpt-5-codex',
      found: true,
      version: '0.46.0',
    };
    const signedOut = evaluatePreflight(facts({ engine: { ...codex, signedIn: false } }));
    expect(signedOut.go).toBe(true);
    expect(check(signedOut, 'engine')).toEqual({
      level: 'warn',
      name: 'engine',
      ok: true,
      detail:
        "Codex CLI 0.46.0 on gpt-5-codex (AUTOPILOT_ENGINE) is not signed in (`codex login status`) — every firing fails unless Codex's own config routes the model to a provider that needs no sign-in; run `codex login`, or set CODEX_API_KEY",
    });
    expect(formatPreflight(signedOut)).toContain(
      `[--] engine: ${check(signedOut, 'engine').detail}`,
    );
    const signedIn = evaluatePreflight(facts({ engine: { ...codex, signedIn: true } }));
    expect(check(signedIn, 'engine')).toEqual({
      level: 'info',
      name: 'engine',
      ok: true,
      detail:
        'Codex CLI 0.46.0 on gpt-5-codex (AUTOPILOT_ENGINE) — no cost is recorded, since Codex reports no price',
    });
  });

  it('a gemini lane with no auth method set WARNS: the lane may still find one the preflight cannot see', () => {
    const gemini = {
      kind: 'cli' as const,
      engine: 'gemini' as const,
      model: 'gemini-2.5-pro',
      found: true,
      version: '0.8.2',
    };
    const unset = evaluatePreflight(facts({ engine: { ...gemini, authConfigured: false } }));
    expect(unset.go).toBe(true);
    expect(check(unset, 'engine')).toEqual({
      level: 'warn',
      name: 'engine',
      ok: true,
      detail:
        'Gemini CLI 0.8.2 on gemini-2.5-pro (AUTOPILOT_ENGINE) has no auth method set (`security.auth.selectedType` in its settings, or GEMINI_API_KEY, GOOGLE_GENAI_USE_VERTEXAI or GOOGLE_GENAI_USE_GCA in the env or a .env file) — every firing exits before its first turn; run `gemini` once and sign in, or set GEMINI_API_KEY',
    });
    expect(formatPreflight(unset)).toContain(`[--] engine: ${check(unset, 'engine').detail}`);
    const set = evaluatePreflight(facts({ engine: { ...gemini, authConfigured: true } }));
    expect(check(set, 'engine')).toEqual({
      level: 'info',
      name: 'engine',
      ok: true,
      detail:
        'Gemini CLI 0.8.2 on gemini-2.5-pro (AUTOPILOT_ENGINE) — no cost is recorded, since Gemini reports no price',
    });
  });

  it('a codex lane still needs `claude`: the commit reviewer stays on it', () => {
    const report = evaluatePreflight(
      facts({
        cli: { found: false, version: null },
        engine: {
          kind: 'cli',
          engine: 'codex',
          model: 'gpt-5-codex',
          found: true,
          version: '0.46.0',
        },
      }),
    );
    expect(report.go).toBe(false);
    expect(check(report, 'claude-cli').level).toBe('block');
  });

  it('disk space: block under the floor, warn under the comfort line, silent when unknown', () => {
    expect(MIN_FREE_BYTES_BLOCK).toBe(1 * GIB);
    expect(MIN_FREE_BYTES_WARN).toBe(5 * GIB);
    const blocked = evaluatePreflight(facts({ freeBytes: MIN_FREE_BYTES_BLOCK - 1 }));
    expect(blocked.go).toBe(false);
    expect(check(blocked, 'disk-space')).toEqual({
      level: 'block',
      name: 'disk-space',
      ok: false,
      detail:
        '1.0 GiB free — under 1.0 GiB; the gate, the store snapshot and a lane worktree cannot all fit',
    });
    const atFloor = evaluatePreflight(facts({ freeBytes: MIN_FREE_BYTES_BLOCK }));
    expect(atFloor.go).toBe(true);
    expect(check(atFloor, 'disk-space')).toEqual({
      level: 'warn',
      name: 'disk-space',
      ok: true,
      detail: '1.0 GiB free — under 5.0 GiB; a long round may run out mid-flight',
    });
    const comfortable = evaluatePreflight(facts({ freeBytes: MIN_FREE_BYTES_WARN }));
    expect(check(comfortable, 'disk-space').level).toBe('info');
    const unknown = evaluatePreflight(facts({ freeBytes: null }));
    expect(unknown.checks.some((c) => c.name === 'disk-space')).toBe(false);
  });

  it('a stale build WARNS with the rebuild command; an unknown build state says nothing', () => {
    const stale = evaluatePreflight(facts({ distOlderThanSource: true }));
    expect(stale.go).toBe(true);
    expect(check(stale, 'build-fresh')).toEqual({
      level: 'warn',
      name: 'build-fresh',
      ok: true,
      detail:
        "the built flight is older than the engine sources — run `pnpm run build` (or `pnpm dashboard:restart`) or this flight runs yesterday's engine",
    });
    const unknown = evaluatePreflight(facts({ distOlderThanSource: null }));
    expect(unknown.checks.some((c) => c.name === 'build-fresh')).toBe(false);
  });

  it('stale locks, dirty lanes and parked heads each add one line naming them', () => {
    const report = evaluatePreflight(
      facts({
        staleLocks: ['engine-fly-x.lock', 'engine-fly-x--fleet-2.lock'],
        dirtyLanes: ['/lanes/fleet-2', '/lanes/fleet-3'],
        parkedHeads: 12,
      }),
    );
    expect(report.go).toBe(true);
    expect(check(report, 'stale-locks')).toEqual({
      level: 'warn',
      name: 'stale-locks',
      ok: true,
      detail:
        '2 engine lock(s) left by dead processes (engine-fly-x.lock, engine-fly-x--fleet-2.lock) — reclaimed automatically at launch',
    });
    expect(check(report, 'lanes-clean')).toEqual({
      level: 'warn',
      name: 'lanes-clean',
      ok: true,
      detail:
        '2 lane worktree(s) carry uncommitted leftovers (/lanes/fleet-2, /lanes/fleet-3) — such a lane can neither be moved aside nor fast-forwarded and launches stale; `git -C <lane> stash` to clear',
    });
    expect(check(report, 'parked-heads')).toEqual({
      level: 'info',
      name: 'parked-heads',
      ok: true,
      detail:
        '12 unfinished unit(s) kept under refs/autopilot/parked — `git for-each-ref refs/autopilot/parked` lists them; their inbox tasks name the branch',
    });
    const quiet = evaluatePreflight(facts());
    for (const name of ['stale-locks', 'lanes-clean', 'parked-heads', 'fleet-width']) {
      expect(quiet.checks.some((c) => c.name === name)).toBe(false);
    }
  });

  it('a fleet wider than the disk can feed WARNS — at the boundary it does not', () => {
    expect(WIDE_FLEET_LANES).toBe(4);
    expect(
      evaluatePreflight(facts({ laneCount: 4 })).checks.some((c) => c.name === 'fleet-width'),
    ).toBe(false);
    const wide = evaluatePreflight(facts({ laneCount: 5 }));
    expect(check(wide, 'fleet-width')).toEqual({
      level: 'warn',
      name: 'fleet-width',
      ok: true,
      detail:
        '5 lanes on one disk — gates queue behind 4 lanes and most firings need the long wall clock; expect fewer ships per lane',
    });
  });

  it('GO is exactly "no block": warnings alone never refuse, one block always does', () => {
    const warnings = evaluatePreflight(
      facts({ distOlderThanSource: true, dirtyLanes: ['x'], staleLocks: ['y'], laneCount: 8 }),
    );
    expect(warnings.go).toBe(true);
    const oneBlock = evaluatePreflight(facts({ freeBytes: 0 }));
    expect(oneBlock.go).toBe(false);
  });
});

describe('preflightRefusal / preflightWarnings / formatPreflight', () => {
  it('the warning clause names every warning check with its advice, joined, and nothing else', () => {
    const report = evaluatePreflight(
      facts({
        distOlderThanSource: true,
        engine: {
          kind: 'cli',
          engine: 'codex',
          model: 'gpt-5-codex',
          found: true,
          version: 'codex-cli 0.46.0',
          signedIn: false,
        },
      }),
    );
    expect(report.go).toBe(true);
    expect(preflightWarnings(report)).toBe(
      "preflight warns: engine: Codex CLI codex-cli 0.46.0 on gpt-5-codex (AUTOPILOT_ENGINE) is not signed in (`codex login status`) — every firing fails unless Codex's own config routes the model to a provider that needs no sign-in; run `codex login`, or set CODEX_API_KEY | build-fresh: the built flight is older than the engine sources — run `pnpm run build` (or `pnpm dashboard:restart`) or this flight runs yesterday's engine",
    );
  });

  it('a report with no warning check has no warning clause, however many info lines it carries', () => {
    expect(preflightWarnings(evaluatePreflight(facts()))).toBeNull();
    expect(
      preflightWarnings({
        go: false,
        checks: [{ level: 'block', name: 'target-clean', ok: false, detail: '2 changed path(s)' }],
      }),
    ).toBeNull();
  });

  it('the refusal names every blocking check with its advice, joined', () => {
    const report = evaluatePreflight(
      facts({ targetDirty: 1, cli: { found: false, version: null } }),
    );
    expect(preflightRefusal(report)).toBe(
      'preflight refused: target-clean: 1 changed or untracked path(s) in the live checkout — every sync-back into it would refuse; commit or stash them first | claude-cli: `claude` is not on the PATH — install Claude Code and sign in once before flying',
    );
  });

  it('the doctor lines tag block/warn/info and end with the verdict', () => {
    const go = formatPreflight(evaluatePreflight(facts({ distOlderThanSource: true })));
    expect(go[0]).toBe('[ok] target-clean: live checkout is clean');
    expect(go).toContain(
      "[--] build-fresh: the built flight is older than the engine sources — run `pnpm run build` (or `pnpm dashboard:restart`) or this flight runs yesterday's engine",
    );
    expect(go[go.length - 1]).toBe('preflight: GO');
    const noGo = formatPreflight(evaluatePreflight(facts({ targetDirty: 2 })));
    expect(noGo[0]).toBe(
      '[!!] target-clean: 2 changed or untracked path(s) in the live checkout — every sync-back into it would refuse; commit or stash them first',
    );
    expect(noGo[noGo.length - 1]).toBe('preflight: NO-GO — fix the [!!] lines above');
  });
});
