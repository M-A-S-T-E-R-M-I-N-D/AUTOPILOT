// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The LANDING card's EXECUTE action (web-msnqeegt-ki7dm0 — the HTTP half of
 * "Landing EXECUTE v3"; the engine-level gate-then-merge primitives shipped
 * first, in packages/engine/src/landing.ts + GitVcs.land). Given a known
 * project id, builds a REAL gate from its stored gate_config (the same
 * typecheck→lint→format→test→build mapping fly.ts uses to gate a live
 * flight) and a GitVcs against its root_path, resolves the base branch fresh
 * (never trusts a client-supplied base — the preview and the execute must
 * agree on what "base" means), then hands off to the engine's
 * `executeLanding`: gate-then-merge, refusing to touch git at all on a red
 * gate.
 *
 * On a successful land of the SELF-hosted project (the folder this dashboard
 * is running from — see self-restart.ts), fires the rebuild+restart trigger.
 * Fire-and-forget: never awaited, never blocks or changes the returned
 * result — a rebuild is a background concern, not part of "did it land".
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, listProjects } from '@autopilot/store';
import {
  GateRunner,
  GitVcs,
  addDetachedWorktree,
  executeLanding,
  removeWorktree,
  type GateProgressEvent,
  type LandingExecuteResult,
} from '@autopilot/engine';
import type { GateSpec } from '@autopilot/onboarding';
import type { SelfRestartTrigger } from './self-restart.js';
import { samePath } from '../paths.js';
import { gateCommands } from '../gate-commands.js';
import { ciWorkflowStatus, createGhRun, type GhRun } from '../control/ci-status.js';

/** The dashboard's own root, paired with the trigger to fire when the
 *  landed project's root_path resolves to this same folder. Path comparison
 *  is case-insensitive on win32 (NTFS paths aren't case-sensitive). */
export interface SelfRestart {
  readonly root: string;
  readonly trigger: SelfRestartTrigger;
}

export type { LandingExecuteResult } from '@autopilot/engine';

/** `gate_config` stores `JSON.stringify(GateSpec)` (onboard.ts) — a flat
 *  object, not wrapped. Malformed/missing JSON degrades to "no gate
 *  commands" rather than throwing — GateRunner already treats an empty
 *  command list as a vacuous pass, so a project onboarded before gate
 *  detection existed still lands (just without gate protection). */
function parseGateSpec(gateConfig: string | null): GateSpec | null {
  if (!gateConfig) return null;
  try {
    const spec = JSON.parse(gateConfig) as GateSpec;
    return typeof spec.ecosystem === 'string' ? spec : null;
  } catch {
    return null;
  }
}

/** `LandingExecuteResult['reason']` widened with the refusal reasons that
 *  never reach the engine at all: a flight is running against this project
 *  (`'flight-running'`), so the gate/merge is refused before either even
 *  starts; or the converged branch's own e2e is red (`'e2e-red'`, operator
 *  decision 09-02, "option A" of ADR 0008 — see {@link E2eLandGuard}). */
export type LandingExecuteApiReason = LandingExecuteResult['reason'] | 'flight-running' | 'e2e-red';

/** A `LandingExecuteResult` plus whether this attempt fired the self-restart
 *  trigger — the CSRF-guarded endpoint passes this straight through so the
 *  LANDING panel can show a "rebuilding…" affordance instead of going quiet
 *  mid-swap. `false` on every path that isn't a self-hosted green land. */
export type LandingExecuteApiResult = Omit<LandingExecuteResult, 'reason'> & {
  readonly reason: LandingExecuteApiReason;
  readonly restarting: boolean;
};

/** One LANDING EXECUTE attempt for a project, or `null` when the project id
 *  is unknown (the HTTP handler turns that into a 404, same convention as
 *  the other project-scoped write actions). */
export type LandingExecuteApi = (projectId: string) => Promise<LandingExecuteApiResult | null>;

/** Live gate-step reporting for the LANDING job registry (`landing/job.ts`):
 *  the gate runs for minutes, so the job needs to know WHICH step is running
 *  to show an operator anything honest meanwhile. Purely observational — the
 *  gate's own verdict is untouched, and omitting this changes nothing. */
export type LandingGateProgress = (projectId: string, event: GateProgressEvent) => void;

/** Fire-and-forget hook invoked when EXECUTE is refused because a flight is
 *  running — the one moment the real gate is skipped entirely, since the
 *  live checkout is off-limits to `land()` while the flight owns it (SAFETY
 *  comment above). A real implementation ({@link
 *  createOutOfBandLandGateCheck}) runs the SAME gate in an isolated
 *  worktree and alarms if it's red, so the operator learns the converged
 *  branch wouldn't pass BEFORE the flight even finishes — without touching
 *  or blocking it. The caller never awaits this: an implementation MUST
 *  swallow its own errors and MUST NOT throw synchronously. Omit it (e.g. in
 *  tests) and a flight-running refusal does nothing beyond the refusal
 *  itself, same as before this hook existed. */
export type OutOfBandLandGateCheck = (
  projectId: string,
  rootPath: string,
  gateConfig: string | null,
) => void;

/** One converged-branch e2e health read — `ok: false` means the base branch's
 *  own e2e is currently red and this landing should be refused before it
 *  even starts. `detail` is a short, human-readable line (surfaced verbatim
 *  in the refusal's `details`, which the LANDING panel already renders for
 *  ANY refusal reason — see `web/landing-panel.ts`'s `landingExecuteResult`). */
export interface E2eLandGuardResult {
  readonly ok: boolean;
  readonly detail: string;
}

/** Pre-land converged-branch e2e guard (epic 0010 slice 4, operator decision
 *  09-02, "option A" of ADR 0008 — `docs/adr/0008-e2e-does-not-gate-direct-push-landings.md`):
 *  consulted BEFORE `executeLanding` runs, against `base` (the branch this
 *  landing would merge into — "the converged branch"). Synchronous and
 *  cheap by construction: a real implementation ({@link
 *  createRealE2eLandGuard}) reads the LATEST already-computed GitHub Actions
 *  result for `base` rather than running e2e itself, so this never adds the
 *  multi-minute Playwright cost ADR 0008 refused to put in the landing's own
 *  critical path. Omit it (e.g. in tests) and every land proceeds exactly as
 *  before this guard existed. */
export type E2eLandGuard = (rootPath: string, base: string) => E2eLandGuardResult;

/** Builds the real {@link E2eLandGuard}: the converged branch's latest
 *  `ci.yml` run (epic 0010 slice 2's `ciWorkflowStatus`, filtered to `base`
 *  so a PR-triggered run never outranks the actual push-to-base result the
 *  fleet's own direct-push landings care about) — already computed by GitHub
 *  Actions on the last push to `base`, never re-run here. `gh`
 *  absent/unauthenticated, no runs yet, or malformed output all degrade to
 *  `ok: true` (never block a landing on an UNKNOWN e2e state, only a
 *  genuinely red one), same posture `ciWorkflowStatus` itself already takes. */
export function createRealE2eLandGuard(
  run?: (rootPath: string) => GhRun,
  now: () => number = Date.now,
): E2eLandGuard {
  return (rootPath, base) => {
    const nowMs = now();
    const status = ciWorkflowStatus('ci.yml', (run ?? createGhRun)(rootPath), nowMs, base);
    // STALENESS (EVALUATION 2026-09-02, caught on this guard's FIRST live
    // refusal): ci.yml's e2e job runs on PRs, and the fleet lands by direct
    // push — so `base` often has NO fresh run at all, and "the latest" can be
    // a failure from a week-old commit. A red verdict older than the
    // freshness window says nothing about the branch being landed NOW, so it
    // degrades to the same never-block-on-UNKNOWN posture gh-absent already
    // takes. A fresh red still refuses. The real fix — an out-of-band run
    // against the converged branch itself — is the E2E LANDING DAEMON slice.
    if (
      !status.ok &&
      status.createdAtMs !== null &&
      nowMs - status.createdAtMs > E2E_VERDICT_FRESHNESS_MS
    ) {
      return {
        ok: true,
        detail: `stale e2e verdict ignored (${status.detail}) — no fresh run exists for '${base}'; the pre-land daemon slice will close this`,
      };
    }
    return { ok: status.ok, detail: status.detail };
  };
}

/** How old a RED e2e verdict may be and still refuse a landing — older than
 *  this and it describes a long-gone commit, not the branch landing now. */
export const E2E_VERDICT_FRESHNESS_MS = 48 * 60 * 60 * 1000;

/** Build the LANDING execute API against the real store + real git/gate —
 *  the production wiring `main.ts` injects into the server. `selfRestart`
 *  is optional: omit it (e.g. in tests) and a landed self-project simply
 *  doesn't trigger a rebuild — the land itself is unaffected either way.
 *
 *  `isFlightRunning` (SAFETY — the FlightRunnerRegistry consult this API
 *  previously skipped entirely) reports whether a flight is currently
 *  running against a folder. A live flight ends its firing with its OWN
 *  commit against this same repo; landing concurrently would checkout/merge
 *  the base branch out from under it — a real git race, not a theoretical
 *  one. Refused BEFORE the gate even runs, same as a red gate: neither git
 *  nor the self-restart trigger is ever touched on this path. Omit it (e.g.
 *  in tests, or a caller with no registry to consult) and every project
 *  lands as if no flight were ever running. */
export function createLandingExecuteApi(
  dbPath: string,
  selfRestart?: SelfRestart,
  isFlightRunning?: (folder: string) => boolean,
  outOfBandGateCheck?: OutOfBandLandGateCheck,
  e2eLandGuard?: E2eLandGuard,
  onGateProgress?: LandingGateProgress,
): LandingExecuteApi {
  return async (projectId) => {
    const store = openStore(dbPath);
    try {
      const project = listProjects(store.db).find((p) => p.id === projectId);
      if (!project) return null;

      if (isFlightRunning?.(project.root_path)) {
        outOfBandGateCheck?.(projectId, project.root_path, project.gate_config);
        return {
          ok: false,
          reason: 'flight-running',
          details:
            'a flight is currently running against this project — wait for it to finish or pause it first',
          restarting: false,
        };
      }

      const vcs = new GitVcs(project.root_path);
      const base = await vcs.defaultBranch();
      if (base === '') {
        return {
          ok: false,
          reason: 'merge-failed',
          details: 'no discoverable base branch (main/master) to land onto',
          restarting: false,
        };
      }

      const e2eHealth = e2eLandGuard?.(project.root_path, base);
      if (e2eHealth && !e2eHealth.ok) {
        // Alarm event, same best-effort/never-fail-the-refusal-over-it
        // posture as the 'landed' event write below — an audit trail entry,
        // not something that can itself block anything.
        try {
          store.db
            .prepare(
              'INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, NULL, ?, ?, ?)',
            )
            .run(
              projectId,
              'e2e-land-block',
              JSON.stringify({ detail: e2eHealth.detail }),
              Date.now(),
            );
        } catch {
          /* alarm telemetry is best-effort — never fail the refusal over it */
        }
        return {
          ok: false,
          reason: 'e2e-red',
          details: `converged branch '${base}' e2e is red — ${e2eHealth.detail}`,
          restarting: false,
        };
      }

      const spec = parseGateSpec(project.gate_config);
      const gate = new GateRunner({
        cwd: project.root_path,
        commands: spec ? gateCommands(spec) : [],
        ...(onGateProgress
          ? { onProgress: (event: GateProgressEvent) => onGateProgress(projectId, event) }
          : {}),
      });
      const result = await executeLanding(gate, vcs, base);
      if (result.ok) {
        // Notifications channel flight-landed event (board web-msnsndlk-exw3t9):
        // persist one `landed` events row per green gate-then-merge, same
        // events-are-the-audit-trail contract as 'guard-denial' in fly.ts —
        // this is the ONE code path both the manual EXECUTE button and the
        // automatic land-watchdog go through, so a single write here covers
        // both triggers. Best-effort — never fail a real land over telemetry.
        try {
          store.db
            .prepare(
              'INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, NULL, ?, ?, ?)',
            )
            .run(projectId, 'landed', JSON.stringify({ details: result.details }), Date.now());
        } catch {
          /* landed telemetry is best-effort — never fail the land over it */
        }
      }
      const restarting =
        result.ok && !!selfRestart && samePath(project.root_path, selfRestart.root);
      if (restarting) selfRestart?.trigger();
      return { ...result, restarting };
    } finally {
      store.close();
    }
  };
}

/**
 * Builds the real {@link OutOfBandLandGateCheck}: on a flight-running
 * refusal, runs the SAME gate `spec ? gateCommands(spec) : []` produces —
 * but against a disposable DETACHED worktree of the project's current HEAD
 * (`addDetachedWorktree`) instead of the live checkout `land()` itself uses.
 * A detached checkout never contends for git's one-checkout-per-branch slot,
 * so this runs safely alongside the flight that already has that same
 * commit's branch checked out live.
 *
 * No gate commands configured ⇒ no worktree is even created — nothing to
 * verify. Persists a `land-gate-alarm` events row ONLY on a red gate, the
 * same alarm-only-on-trouble convention as fly.ts's `guard-denial`: a green
 * out-of-band check is silently reassuring, not news worth a row. Every
 * failure mode here (worktree add/remove, the gate itself throwing, the
 * event insert) is swallowed — this is a best-effort early warning, never a
 * reason to disturb the flight it's checking up on.
 */
export function createOutOfBandLandGateCheck(dbPath: string): OutOfBandLandGateCheck {
  return (projectId, rootPath, gateConfig) => {
    const spec = parseGateSpec(gateConfig);
    const commands = spec ? gateCommands(spec) : [];
    if (commands.length === 0) return;

    void (async () => {
      let worktreePath: string | undefined;
      try {
        worktreePath = mkdtempSync(join(tmpdir(), 'autopilot-land-gate-'));
        const added = await addDetachedWorktree(rootPath, worktreePath, 'HEAD');
        if (!added.ok) return;

        const gate = new GateRunner({ cwd: added.path, commands });
        const result = await gate.run();
        if (result.ok) return;

        const store = openStore(dbPath);
        try {
          store.db
            .prepare(
              'INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, NULL, ?, ?, ?)',
            )
            .run(
              projectId,
              'land-gate-alarm',
              JSON.stringify({ details: result.details }),
              Date.now(),
            );
        } finally {
          store.close();
        }
      } catch {
        /* best-effort out-of-band check — never surface a failure here */
      } finally {
        if (worktreePath) {
          try {
            await removeWorktree(rootPath, worktreePath);
          } catch {
            /* cleanup is best-effort too — a leftover scratch worktree is harmless */
          }
        }
      }
    })();
  };
}
