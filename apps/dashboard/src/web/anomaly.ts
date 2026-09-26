// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure label/tip/aria-label text math for per-firing chips — the fleet
 * card's needs-you anomaly chips (`read/anomalies.ts`'s cost-spike/
 * death-cluster/gate-fail-streak detections) and the guard-denial chip a
 * firing carries when the containment/read-hygiene guard blocked a tool
 * call, plus the commit-review chip for a firing whose diff review flagged
 * something — client-only (no server counterpart beyond the `Anomaly` shape
 * itself), so it lives in `web/` rather than `shared/`, the same reason
 * `flight-map.ts`'s `fnodeTip` does (epic 0002 "shell decomposition",
 * slice 2: feature-module split of `shell.ts`).
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** One anomaly chip's label/tip/aria-label triple. */
export interface AnomalyChipMeta {
  readonly label: string;
  readonly tip: string;
  readonly ariaLabel: string;
}

/** A needs-you chip's label/tip/aria-label math for one detected anomaly —
 *  label names the rule (falling back to the raw kind for any kind the
 *  caller's label map carries no entry for), the tip alone carries the
 *  evidence that fired it — that `anomalyChip` previously computed inline.
 *  The aria-label names the rule concisely instead of re-shipping the
 *  evidence sentence as a second attribute on every chip (D1 ATTRIBUTE
 *  PAYLOAD, epic 0015 — the same concise-aria-label fix the burn/runaway/
 *  budget-risk/stale task chips got); the visible label stays inside the
 *  accessible name (WCAG 2.5.3 Label in Name). Takes the label map via
 *  injection rather than importing it, the same `statusPillMeta`-takes-`tips`
 *  pattern. */
export function anomalyChipMeta(
  a: { readonly kind: string; readonly evidence: string },
  labels: Readonly<Record<string, string>>,
): AnomalyChipMeta {
  const label = labels[a.kind] || a.kind;
  return { label, tip: a.evidence, ariaLabel: 'anomaly: ' + label };
}

/** A firing's guard-denial chip's label/tip/aria-label triple — the
 *  containment/read-hygiene guard's tool-call denial count formatted for
 *  `tipChip` — that `firingTimelineSection` and the flight-log row builder
 *  each hand-retyped as an identical block before appending the chip
 *  (epic 0002 "shell decomposition", slice 2, eighty-third cut). Callers
 *  only invoke this once they've confirmed `guardDenials` is truthy — the
 *  same "gate stays inline, meta stays pure" split `anomalyChipMeta`'s own
 *  caller (`anomalyChip`) uses. */
export function guardDenialChipMeta(guardDenials: number): AnomalyChipMeta {
  // Epic 0025 slice 2 continuation (icons, board web-mtzpcw6f-26443t): no
  // more baked-in 🛡️ glyph in the label — both callers (shell.ts, features/
  // firing-timeline.ts) now pass tipChip() a leading shield icon instead.
  return {
    label: guardDenials + ' blocked',
    tip:
      'The containment/read-hygiene guard denied ' +
      guardDenials +
      ' tool call(s) during this firing — it tried to step outside its boundary and was stopped.',
    ariaLabel:
      'guard blocked ' + guardDenials + ' tool call(s) this firing (containment / read-hygiene)',
  };
}

/** A firing's commit-time review as the flight log row carries it —
 *  `FlightEntry.review` (read/fleet.ts), narrowed to what the chip reads. */
export interface ReviewChipInput {
  readonly status: string;
  readonly findings?: readonly {
    readonly severity: string;
    readonly file: string | null;
    readonly problem: string;
  }[];
}

/** The review chip's triple plus the live values its i18n templates wrap. */
export interface ReviewChipMeta extends AnomalyChipMeta {
  readonly args: { readonly n: number; readonly top: string };
}

/** The commit-review chip (docs/BACKLOG-999.md §L C5) for a firing whose
 *  independent diff review flagged something, or null when there is nothing
 *  to show — a clean review, a skipped one, or a firing never reviewed. The
 *  tip leads with the most severe finding, which the engine sorts first. The
 *  review is advisory (it never changed the gate verdict), and the tip says
 *  so. The finding text is model output: callers only ever put it in
 *  attributes and textContent, never markup. */
export function commitReviewChipMeta(
  review: ReviewChipInput | null | undefined,
): ReviewChipMeta | null {
  if (!review || review.status !== 'reviewed' || !review.findings) return null;
  const [first] = review.findings;
  if (!first) return null;
  const n = review.findings.length;
  const top = '[' + first.severity + '] ' + (first.file ? first.file + ': ' : '') + first.problem;
  return {
    label: n + ' flagged',
    tip:
      "An independent reviewer read this firing's diff after the gate passed and flagged " +
      n +
      ' possible problem(s) — advisory only, the gate verdict stands. Most severe: ' +
      top,
    ariaLabel: 'commit review flagged ' + n + " possible problem(s) in this firing's diff",
    args: { n, top },
  };
}

/** Every anomaly kind `read/anomalies.ts` can emit, in the order the labels
 *  below list them. The popover word census (anomaly-popover.test.ts) walks
 *  this list: every kind has a "what it means" and a "what you can do". */
export const ANOMALY_KINDS: readonly string[] = [
  'cost-spike',
  'death-cluster',
  'gate-fail-streak',
  'orient-drag',
  'family-runaway',
  'intent-collision',
  'near-miss-recurring',
  'guard-denial',
  'sync-back-refusal',
  'land-gate-alarm',
  'convergence-red',
  'e2e-land-block',
  'convergence-unverifiable',
  'guard-verify-failed',
];

/** The chip label per kind — the rule's name, short enough for a chip.
 *  Shared with the client via JSON.stringify, the same way TOUR_STEPS is. */
export const ANOMALY_LABELS: Readonly<Record<string, string>> = {
  'cost-spike': 'cost spike',
  'death-cluster': 'death cluster',
  'gate-fail-streak': 'gate fail streak',
  'orient-drag': 'orient drag',
  'family-runaway': 'family runaway',
  'intent-collision': 'intent collision',
  'near-miss-recurring': 'recurring near-miss',
  'guard-denial': 'guard denial',
  'sync-back-refusal': 'sync-back refused',
  'land-gate-alarm': 'land gate alarm',
  'convergence-red': 'convergence red',
  'e2e-land-block': 'e2e land block',
  'convergence-unverifiable': 'convergence unverifiable',
  'guard-verify-failed': 'guard verify failed',
};

/** `cost-spike` → `CostSpike`: the STRINGS key suffix a kind's popover words
 *  hang off. Pure string math, spliced into the client by `.toString()`. */
export function anomalyKeySuffix(kind: string): string {
  return kind
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/** The two STRINGS keys a kind's popover reads. */
export function anomalyMeaningKeys(kind: string): {
  readonly what: string;
  readonly action: string;
} {
  const suffix = anomalyKeySuffix(kind);
  return { what: 'anomalyWhat' + suffix, action: 'anomalyAction' + suffix };
}
