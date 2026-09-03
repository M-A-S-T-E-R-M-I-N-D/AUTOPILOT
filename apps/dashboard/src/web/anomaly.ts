// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure label/tip/aria-label text math for per-firing chips — the fleet
 * card's needs-you anomaly chips (`read/anomalies.ts`'s cost-spike/
 * death-cluster/gate-fail-streak detections) and the guard-denial chip a
 * firing carries when the containment/read-hygiene guard blocked a tool
 * call — client-only (no server counterpart beyond the `Anomaly` shape
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
  return {
    label: '🛡️ ' + guardDenials + ' blocked',
    tip:
      'The containment/read-hygiene guard denied ' +
      guardDenials +
      ' tool call(s) during this firing — it tried to step outside its boundary and was stopped.',
    ariaLabel:
      'guard blocked ' + guardDenials + ' tool call(s) this firing (containment / read-hygiene)',
  };
}
