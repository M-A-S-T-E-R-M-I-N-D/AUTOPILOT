// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The Social Flight's weave-in pass (epic 0016 "The GitHub Social Flight",
 * slice 3/6 — board web-mtpzzx7v-72q2dv): the I/O half of what
 * `social-flight-trigger.ts` decides purely. `fly.ts` calls
 * {@link runSocialFlightPass} at all three phases — start (takeoff),
 * interval (from the engine loop's per-firing hook, between firings only:
 * `isBetweenFirings` keeps it off the last planned firing, where the end
 * pass speaks) and end (with the end-of-flight sweeps); the fly-bar toggle
 * is a follow-up slice. Everything the epic's own slice wording asks of the
 * weave-in is decided here, in this order:
 *
 *   1. the toggle — `AUTOPILOT_SOCIAL_FLIGHT=off|start|end|full`, parsed
 *      fail-closed by {@link parseSocialFlightToggle} and gated per phase by
 *      {@link shouldRunSocialFlight}; an unset var never reaches GitHub at
 *      all, not even for a read;
 *   2. the self-target guard — `ghExec` runs in the engine's own checkout,
 *      so a flight over someone else's folder would inventory (and, once a
 *      candidate source exists, speak on) THIS repository; the same guard
 *      `post-flight-sweeps.ts`'s `runStaleClaimSweep` carries (operator,
 *      2026-09-14: no cross-project leaks);
 *   3. "refuses cleanly when gh is not connected" — {@link
 *      resolveSocialIdentity} comes back `undefined` whenever `gh api user`
 *      or `gh repo view` cannot answer (no `gh`, not authenticated, not a
 *      GitHub repo), and a social pass must never guess at its own identity
 *      or verb set, so the pass says why in the flight log and stops before
 *      a single inventory read;
 *   4. the pass itself — the read-only inventories ({@link
 *      fetchOwnSubmissions}, {@link fetchOpenThreads}) and the protocol
 *      engine ({@link planSocialProtocol}) over the candidates this call was
 *      handed — the resolved login handed along, so a question asked of
 *      some other human is refused rather than answered in their place
 *      (epic law 5's second half) — with the caps printed in the flight log
 *      (epic law 4, "caps visible in the flight log").
 *
 * READ-ONLY BY CONSTRUCTION in this slice: no caller supplies candidates yet
 * (deriving them from mirror-pass findings is its own slice), so
 * `candidates` defaults to none, the verdict is empty, and nothing here ever
 * calls `executeSocialCommands` — the execute half is wired in only once a
 * candidate source exists, the same pure-planner-first order every
 * `social-pass.ts` law shipped in. Best-effort like every other sweep
 * `fly.ts` runs: a `gh` hiccup is reported as a skip, never thrown, so the
 * social pass can never fail the flight it is woven into.
 */

import type { CliExec } from '../connection/cli-probe.js';
import { ghExec } from './gh-exec.js';
import { out } from './firing-hooks.js';
import {
  parseSocialFlightToggle,
  shouldRunSocialFlight,
  type SocialFlightPhase,
  type SocialFlightToggle,
} from './social-flight-trigger.js';
import {
  fetchOpenThreads,
  fetchOwnSubmissions,
  planSocialProtocol,
  resolveSocialIdentity,
  type SocialCandidateAction,
  type SocialIdentity,
  type SocialProtocolCaps,
  type SocialProtocolVerdict,
} from './social-pass.js';

/** Per-pass caps for the woven-in pass (epic law 4, "budgeted voice"):
 *  deliberately tight for a pass nobody is watching live — one new issue
 *  and three comments per pass — and printed in the flight log every time
 *  the pass runs, so an operator can see the budget rather than trust it.
 *  {@link planSocialProtocol} queues (never drops) whatever exceeds them. */
export const SOCIAL_FLIGHT_PASS_CAPS: SocialProtocolCaps = { maxNewIssues: 1, maxComments: 3 };

/** Why a pass did not run. `'toggle-off'`: the env var is unset or not one
 *  of the four values (the fail-closed default). `'phase-not-enabled'`: the
 *  toggle is on, but not for this phase (`start` at the flight's end, `end`
 *  at its start). `'foreign-target'`: the flight flies a folder that is not
 *  this engine checkout. `'gh-disconnected'`: `gh` could not resolve an
 *  identity (absent, unauthenticated, not a GitHub repo), or the read
 *  itself threw. */
export type SocialFlightSkipReason =
  'toggle-off' | 'phase-not-enabled' | 'foreign-target' | 'gh-disconnected';

export interface SocialFlightPassSkipped {
  readonly ran: false;
  readonly phase: SocialFlightPhase;
  readonly toggle: SocialFlightToggle;
  readonly reason: SocialFlightSkipReason;
}

export interface SocialFlightPassRan {
  readonly ran: true;
  readonly phase: SocialFlightPhase;
  readonly toggle: SocialFlightToggle;
  readonly identity: SocialIdentity;
  readonly ownSubmissions: number;
  readonly openThreads: number;
  readonly caps: SocialProtocolCaps;
  readonly verdict: SocialProtocolVerdict;
}

export type SocialFlightPassOutcome = SocialFlightPassSkipped | SocialFlightPassRan;

export interface SocialFlightPassOptions {
  /** Defaults to the fleet's one guarded `gh` exec; tests inject a double. */
  readonly exec?: CliExec;
  /** The flown folder. When given and not `engineRepo`, the pass refuses:
   *  it would speak for THIS repository, not the flown one. */
  readonly target?: string;
  /** This engine checkout; defaults to `process.cwd()` like every sibling
   *  sweep's self-target guard. */
  readonly engineRepo?: string;
  /** Candidate actions for the protocol engine — none today (see the module
   *  doc); a later slice derives them from mirror-pass findings. */
  readonly candidates?: readonly SocialCandidateAction[];
  readonly caps?: SocialProtocolCaps;
}

function capsText(caps: SocialProtocolCaps): string {
  return `caps ≤${caps.maxNewIssues} new issue(s), ≤${caps.maxComments} comment(s)`;
}

function verdictText(candidates: number, verdict: SocialProtocolVerdict): string {
  return (
    `${candidates} candidate(s): ${verdict.allowed.length} allowed, ` +
    `${verdict.queued.length} queued, ${verdict.duplicate.length} duplicate, ` +
    `${verdict.refused.length} refused`
  );
}

/**
 * Runs one woven-in social pass for `phase` under the raw
 * `AUTOPILOT_SOCIAL_FLIGHT` value (passed in, never read from `process.env`
 * here, so callers and tests control it without env mutation). Never
 * throws: every reason not to run is returned as a `ran: false` outcome,
 * and the ones an operator who turned the toggle ON would want explained
 * (a foreign target, a disconnected `gh`) are also said in the flight log.
 * A silent `'toggle-off'` or `'phase-not-enabled'` is the expected case,
 * not a surprise, so those print nothing.
 */
export async function runSocialFlightPass(
  phase: SocialFlightPhase,
  rawToggle: string | undefined,
  options: SocialFlightPassOptions = {},
): Promise<SocialFlightPassOutcome> {
  const toggle = parseSocialFlightToggle(rawToggle);
  const skipped = (reason: SocialFlightSkipReason): SocialFlightPassSkipped => ({
    ran: false,
    phase,
    toggle,
    reason,
  });
  if (toggle === 'off') return skipped('toggle-off');
  if (!shouldRunSocialFlight(toggle, phase)) return skipped('phase-not-enabled');

  const engineRepo = options.engineRepo ?? process.cwd();
  if (options.target !== undefined && options.target !== engineRepo) {
    out(
      `  🗣 social pass (${phase}) skipped: the flown folder is not this engine checkout — ` +
        `the pass would speak for THIS repository, never the flown one.`,
    );
    return skipped('foreign-target');
  }

  const exec = options.exec ?? ghExec;
  const candidates = options.candidates ?? [];
  const caps = options.caps ?? SOCIAL_FLIGHT_PASS_CAPS;
  try {
    const identity = await resolveSocialIdentity(exec);
    if (identity === undefined) {
      out(
        `  🗣 social pass (${phase}) skipped: gh is not connected or not authenticated for this ` +
          `repo — identity unresolved, so the pass has no voice to speak with. Connect gh to weave it in.`,
      );
      return skipped('gh-disconnected');
    }
    const [ownSubmissions, openThreads] = await Promise.all([
      fetchOwnSubmissions(exec, identity.login),
      fetchOpenThreads(exec),
    ]);
    // The resolved login rides along so the engine can tell a question asked
    // of THIS identity from one asked of someone else (law 5's second half).
    const verdict = planSocialProtocol(
      candidates,
      caps,
      ownSubmissions,
      identity.role,
      openThreads,
      identity.login,
    );
    out(
      `  🗣 social pass (${phase}) as @${identity.login} [${identity.role}] on ` +
        `${identity.nameWithOwner} — ${ownSubmissions.length} own submission(s), ` +
        `${openThreads.length} open thread(s); ${capsText(caps)}; ` +
        `${verdictText(candidates.length, verdict)} (read-only pass — nothing posted).`,
    );
    return {
      ran: true,
      phase,
      toggle,
      identity,
      ownSubmissions: ownSubmissions.length,
      openThreads: openThreads.length,
      caps,
      verdict,
    };
  } catch {
    out(
      `  🗣 social pass (${phase}) skipped: the gh identity read failed — treating gh as ` +
        `disconnected (best-effort, non-fatal).`,
    );
    return skipped('gh-disconnected');
  }
}
