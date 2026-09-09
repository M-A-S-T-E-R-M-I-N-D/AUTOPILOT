// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The Social Flight's weave-in trigger (epic 0016 "The GitHub Social
 * Flight", slice 3/6 — board web-mtpzzx23-n1kqv0's follow-on slice):
 * `docs/epics/0016-github-social-flight.md`'s own wording, "fly.ts hooks
 * (start/interval/end) behind `AUTOPILOT_SOCIAL_FLIGHT=off|start|end|full`".
 *
 * This slice ships only the pure decision the toggle makes — parsing the raw
 * env var ({@link parseSocialFlightToggle}) and deciding, per call site,
 * whether a given flight phase should run the pass ({@link
 * shouldRunSocialFlight}). Wiring these into `fly.ts`'s actual start/
 * interval/end call sites and the dashboard toggle UI in the fly bar are
 * their own follow-up slices — this module has no I/O and is never called
 * from anywhere yet, matching how `social-pass.ts`'s own laws each shipped
 * as an isolated, unwired pure planner before later slices wired them in.
 *
 * The toggle has four values but three phases: `'full'` runs the pass at
 * every phase including `'interval'`, but `'interval'` is not itself a
 * toggle value — there is no way to request "only the interval pass", only
 * "every phase" or "just start" or "just end". A toggle of `'start'` or
 * `'end'` therefore never triggers the interval phase; only `'full'` does.
 * An unrecognized or missing raw value parses to `'off'` — the fail-closed
 * default a social pass must have, since silently defaulting to "on" would
 * mean an unset env var starts posting to GitHub on someone's behalf.
 */

/** `docs/epics/0016-github-social-flight.md`'s own toggle values. `'off'`
 *  never runs the pass; `'full'` runs it at every phase; `'start'`/`'end'`
 *  run it only at that one phase. */
export type SocialFlightToggle = 'off' | 'start' | 'end' | 'full';

/** The three points `fly.ts` calls a weave-in hook from, per the epic's own
 *  "fly.ts hooks (start/interval/end)" wording. */
export type SocialFlightPhase = 'start' | 'interval' | 'end';

const TOGGLE_VALUES: readonly SocialFlightToggle[] = ['off', 'start', 'end', 'full'];

/** Parses `process.env.AUTOPILOT_SOCIAL_FLIGHT` (pass the raw value in,
 *  never reads `process.env` itself, so this stays a pure function callers
 *  can test without env mutation). Anything other than the four exact
 *  recognized values — unset, empty, misspelled, wrong case — parses to
 *  `'off'`: an unrecognized toggle must never be read as permission to post
 *  to GitHub. */
export function parseSocialFlightToggle(raw: string | undefined): SocialFlightToggle {
  return TOGGLE_VALUES.includes(raw as SocialFlightToggle) ? (raw as SocialFlightToggle) : 'off';
}

/** Decides whether `phase` should run the social pass under `toggle`. Pure,
 *  no I/O: `'off'` never runs; `'full'` always runs, including `'interval'`
 *  (the phase the toggle has no dedicated value for); `'start'`/`'end'` run
 *  only their own matching phase and never `'interval'`, since there is no
 *  toggle value that means "only the interval pass". */
export function shouldRunSocialFlight(
  toggle: SocialFlightToggle,
  phase: SocialFlightPhase,
): boolean {
  if (toggle === 'off') return false;
  if (toggle === 'full') return true;
  return toggle === phase;
}
