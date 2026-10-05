// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * FLIGHT DEBRIEF digest (board web-msnt50ct-oezq8r): "when a flight ends,
 * the landing card gains a digest — ships/deaths, $, duration, best and
 * worst firing, notable events — one glance tells the whole story." Pure
 * aggregation over a flight's firing log — client-only (no server
 * counterpart), so it lives in `web/` rather than `shared/` (epic 0002
 * "shell decomposition", slice 2), following the same pattern
 * `flight-metrics.ts`/`heatmap.ts` proved. Takes `verdictOf` via injection
 * rather than importing `flightVerdictOf` from `./flight-metrics.js`, the
 * same `heatmapDays` pattern every module in this epic uses to stay
 * import-free (these modules get spliced into the client bundle via
 * `.toString()`, which carries only the function's own source text).
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** A flight-log entry's fields {@link flightDebriefOf} aggregates. */
export interface FlightDebriefEntry {
  readonly shipped: boolean;
  readonly cost: number;
  /** The firing record carries no price (`FlightEntry.costUnpriced`): a
   *  Codex or Gemini run reports none, so its `cost` column reads 0. */
  readonly costUnpriced?: boolean;
  readonly durationMs?: number | null;
  readonly guardDenials?: number;
  readonly autoformatRescued?: boolean;
}

/** The whole-flight digest {@link flightDebriefOf} returns. `best`/`worst`
 *  carry the ORIGINAL log entries (not a derived subset) so a caller that
 *  already has `flightHeadlineOf`/`taskById` in scope can resolve their
 *  headline itself, the same "compose at the call site" reasoning
 *  `flightTimelineStrip`'s DOM loop already applies to `flightBarMeta`. */
export interface FlightDebrief<F> {
  readonly firings: number;
  readonly shipped: number;
  readonly deaths: number;
  /** Spend of the priced firings alone. */
  readonly totalCost: number;
  /** Firings whose record carries no price, left out of {@link totalCost}. */
  readonly unpriced: number;
  readonly totalDurationMs: number;
  readonly guardDenials: number;
  readonly remediations: number;
  readonly best: F | null;
  readonly worst: F | null;
}

/**
 * Aggregates a flight's firings into the FLIGHT DEBRIEF digest. `deaths`
 * counts only the red-tier verdicts ({@link flightVerdictOf} in
 * `flight-metrics.ts`: 'reverted', 'turn-capped', 'timed-out', 'errored') — a
 * checkpointed or unverified firing packed real WIP into a commit and
 * doesn't read as a failure. `best` is the cheapest SHIPPED firing (the
 * most cost-efficient win); `worst` is the priciest firing that did NOT
 * ship (the costliest dead end) — both `null` when the flight has none of
 * that kind. A firing whose cost is unknown (recorded as 0 — an
 * envelope-less death, a resumed checkpoint) competes for neither: "🏆 Best
 * $0.00" was the debrief crowning a firing whose spend nobody measured
 * (operator, 2026-09-17). A firing whose record carries no price
 * (`costUnpriced`, epic 0036) is counted in `unpriced` and left out of
 * `totalCost`, whatever its cost column holds, so a Codex lane's ships no
 * longer read as free. Returns `null` for an empty log rather than a
 * digest of zeroes — nothing to debrief yet.
 */
export function flightDebriefOf<F extends FlightDebriefEntry>(
  log: readonly F[],
  verdictOf: (f: F) => string,
): FlightDebrief<F> | null {
  if (!log.length) return null;
  let shipped = 0;
  let deaths = 0;
  let totalCost = 0;
  let unpriced = 0;
  let totalDurationMs = 0;
  let guardDenials = 0;
  let remediations = 0;
  let best: F | null = null;
  let worst: F | null = null;
  for (const f of log) {
    if (f.shipped) shipped++;
    const verdict = verdictOf(f);
    if (
      verdict === 'reverted' ||
      verdict === 'turn-capped' ||
      verdict === 'timed-out' ||
      verdict === 'errored'
    )
      deaths++;
    if (f.costUnpriced === true) unpriced++;
    else totalCost += f.cost || 0;
    totalDurationMs += f.durationMs || 0;
    guardDenials += f.guardDenials || 0;
    if (f.autoformatRescued) remediations++;
    const costKnown = f.costUnpriced !== true && typeof f.cost === 'number' && f.cost > 0;
    if (f.shipped && costKnown && (!best || f.cost < best.cost)) best = f;
    if (!f.shipped && costKnown && (!worst || f.cost > worst.cost)) worst = f;
  }
  return {
    firings: log.length,
    shipped,
    deaths,
    totalCost,
    unpriced,
    totalDurationMs,
    guardDenials,
    remediations,
    best,
    worst,
  };
}

/** One digest stat chip's text/tip/aria-label triple, in `tipChip`'s own
 *  argument order — the same shape `stat-tiles.ts`'s `RoundStatItem` uses. */
export type FlightDebriefChipItem = readonly [text: string, tip: string, ariaLabel: string];

/** The `STRINGS` keys {@link flightDebriefChipItems}/{@link
 *  flightDebriefNotableItems} route through — i18n foundation (board
 *  web-msnsndki-dz3vn1): this module's stat-chip/notable-event text was the
 *  FLIGHT DEBRIEF panel's last hardcoded-English surface; every static label
 *  around it (`landingDebriefTitle`, `landingDebriefBestLabel`, …) already
 *  routes through `tr()`. */
export type FlightDebriefStringKey =
  | 'flightDebriefShippedCount'
  | 'flightDebriefShippedTip'
  | 'flightDebriefDeathCount'
  | 'flightDebriefDeathTip'
  | 'flightDebriefTotalSpendTip'
  | 'flightDebriefTotalSpendAria'
  | 'flightDebriefTotalSpendPartlyUnpriced'
  | 'flightDebriefTotalSpendAllUnpriced'
  | 'flightDebriefTotalSpendUnpricedTip'
  | 'flightDebriefTotalDurationTip'
  | 'flightDebriefTotalDurationAria'
  | 'flightDebriefGuardDenialSingular'
  | 'flightDebriefGuardDenialPlural'
  | 'flightDebriefGuardDenialTip'
  | 'flightDebriefRemediationSingular'
  | 'flightDebriefRemediationPlural'
  | 'flightDebriefRemediationTip'
  | 'flightDebriefSocialPassSingular'
  | 'flightDebriefSocialPassPlural'
  | 'flightDebriefSocialPassTip'
  | 'flightDebriefSocialCaps'
  | 'flightDebriefSocialCapsTip'
  | 'flightDebriefSocialVerdicts'
  | 'flightDebriefSocialVerdictsTip'
  | 'flightDebriefSocialSkippedForeign'
  | 'flightDebriefSocialSkippedForeignTip'
  | 'flightDebriefSocialSkippedGh'
  | 'flightDebriefSocialSkippedGhTip'
  | 'flightDebriefSocialMirrorPreview'
  | 'flightDebriefSocialMirrorPreviewTip'
  | 'flightDebriefSocialReadOnly'
  | 'flightDebriefSocialReadOnlyTip';

/** The bundle's `tr(key, subs)` (`web/features/locale.ts`), injected rather
 *  than imported — a `.toString()`-spliced helper carries no free variables
 *  with it, so a translator it closed over would resolve to nothing in the
 *  generated client bundle. Same injection route `card-actions.ts`'s
 *  `CardActionsTranslator` takes. */
export type FlightDebriefTranslator = (
  key: FlightDebriefStringKey,
  subs?: Readonly<Record<string, string | number>>,
) => string;

/** The FLIGHT DEBRIEF panel's stat-chip triples (shipped, died, total spend,
 *  total duration), in the panel's fixed render order. Takes
 *  `fmtCost`/`fmtDuration` via injection rather than importing them from
 *  `./format.ts`, the same `roundStatItems`/`doraTileItems` pattern. The
 *  spend chip names the firings that reported no price beside the priced
 *  total (`$2.00 + 2 unpriced`), or alone when none was priced, rather than
 *  a total that reads them as free (epic 0036). */
export function flightDebriefChipItems<F>(
  d: FlightDebrief<F>,
  fmtCost: (n: number) => string,
  fmtDuration: (ms: number) => string,
  tr: FlightDebriefTranslator,
): readonly FlightDebriefChipItem[] {
  const shippedText = tr('flightDebriefShippedCount', { count: d.shipped });
  const deathText = tr('flightDebriefDeathCount', { count: d.deaths });
  const priced = d.firings - d.unpriced;
  const spendText =
    d.unpriced === 0
      ? fmtCost(d.totalCost)
      : priced === 0
        ? tr('flightDebriefTotalSpendAllUnpriced', { count: d.unpriced })
        : tr('flightDebriefTotalSpendPartlyUnpriced', {
            amount: fmtCost(d.totalCost),
            count: d.unpriced,
          });
  const durationText = fmtDuration(d.totalDurationMs);
  return [
    [shippedText, tr('flightDebriefShippedTip'), shippedText],
    [deathText, tr('flightDebriefDeathTip'), deathText],
    [
      spendText,
      tr(d.unpriced === 0 ? 'flightDebriefTotalSpendTip' : 'flightDebriefTotalSpendUnpricedTip'),
      tr('flightDebriefTotalSpendAria', { amount: spendText }),
    ],
    [
      durationText,
      tr('flightDebriefTotalDurationTip'),
      tr('flightDebriefTotalDurationAria', { amount: durationText }),
    ],
  ];
}

/** The FLIGHT DEBRIEF panel's "notable events" line items — guard denials
 *  (PreToolUse containment/read-hygiene hits) and mechanical remediations
 *  (`RemediatingGate` auto-fixes), each omitted entirely when zero rather
 *  than padding the line with a "0 guard denials" non-event. Returns
 *  tip-bearing triples in `flightDebriefChipItems`'s own shape (web-app-wide
 *  interactivity audit v2, web-msm66jlc-gm4oom) — this jargon ("guard
 *  denial", "auto-remediation") needs the same hover/focus explanation
 *  every other digest value already carries. */
export function flightDebriefNotableItems<F>(
  d: FlightDebrief<F>,
  tr: FlightDebriefTranslator,
): readonly FlightDebriefChipItem[] {
  const items: FlightDebriefChipItem[] = [];
  if (d.guardDenials > 0) {
    const text = tr(
      d.guardDenials === 1 ? 'flightDebriefGuardDenialSingular' : 'flightDebriefGuardDenialPlural',
      { count: d.guardDenials },
    );
    items.push([text, tr('flightDebriefGuardDenialTip'), text]);
  }
  if (d.remediations > 0) {
    const text = tr(
      d.remediations === 1 ? 'flightDebriefRemediationSingular' : 'flightDebriefRemediationPlural',
      { count: d.remediations },
    );
    items.push([text, tr('flightDebriefRemediationTip'), text]);
  }
  return items;
}

/** The standalone Fly GitHub flight's mirror-pass preview counts, the
 *  panel's own restatement of `flight/social-flight-debrief.ts`'s
 *  `SocialFlightMirrorDigest` — previewed, never applied. */
export interface SocialFlightMirrorDigestLike {
  readonly checked: number;
  readonly toClose: number;
  readonly toReopen: number;
  readonly toNote: number;
  readonly toSettle: number;
  readonly inSync: number;
}

/** The served SOCIAL digest (`GET /api/landing`'s `socialDebrief`) — the
 *  panel's own restatement of `flight/social-flight-debrief.ts`'s
 *  `SocialFlightDebrief`, the `FixCommitProposalLike` route: no web module
 *  imports a flight one. `mirror` is present only when a standalone Fly
 *  GitHub flight's mirror preview ran that flight. */
export interface SocialFlightDebriefLike {
  readonly passesRan: number;
  readonly skippedForeignTarget: number;
  readonly skippedGhDisconnected: number;
  readonly newIssuesAllowed: number;
  readonly newIssueBudget: number;
  readonly commentsAllowed: number;
  readonly commentBudget: number;
  readonly queued: number;
  readonly duplicate: number;
  readonly refused: number;
  readonly mirror?: SocialFlightMirrorDigestLike;
}

/** The FLIGHT DEBRIEF panel's SOCIAL line (epic 0016 slice 5/6) — the flight
 *  log's end-of-flight `SOCIAL debrief:` line as tip-bearing chips, in the
 *  same order and under the same rules: caps and verdict totals only when a
 *  pass ran (a 0/0 budget is not a reading), the mirror preview's counts
 *  only when one ran, each refusal only when it happened, and an outright
 *  "nothing posted" while the passes stay read-only, never a said/filed/
 *  closed tally that could only read zero. */
export function flightDebriefSocialItems(
  s: SocialFlightDebriefLike,
  tr: FlightDebriefTranslator,
): readonly FlightDebriefChipItem[] {
  const items: FlightDebriefChipItem[] = [];
  const passes = tr(
    s.passesRan === 1 ? 'flightDebriefSocialPassSingular' : 'flightDebriefSocialPassPlural',
    { count: s.passesRan },
  );
  items.push([passes, tr('flightDebriefSocialPassTip'), passes]);
  if (s.passesRan > 0) {
    const caps = tr('flightDebriefSocialCaps', {
      issues: s.newIssuesAllowed + '/' + s.newIssueBudget,
      comments: s.commentsAllowed + '/' + s.commentBudget,
    });
    items.push([caps, tr('flightDebriefSocialCapsTip'), caps]);
    const verdicts = tr('flightDebriefSocialVerdicts', {
      queued: s.queued,
      duplicate: s.duplicate,
      refused: s.refused,
    });
    items.push([verdicts, tr('flightDebriefSocialVerdictsTip'), verdicts]);
  }
  if (s.mirror) {
    const m = s.mirror;
    const mirror = tr('flightDebriefSocialMirrorPreview', {
      checked: m.checked,
      toClose: m.toClose,
      toReopen: m.toReopen,
      toNote: m.toNote,
      toSettle: m.toSettle,
      inSync: m.inSync,
    });
    items.push([mirror, tr('flightDebriefSocialMirrorPreviewTip'), mirror]);
  }
  if (s.skippedForeignTarget > 0) {
    const text = tr('flightDebriefSocialSkippedForeign', { count: s.skippedForeignTarget });
    items.push([text, tr('flightDebriefSocialSkippedForeignTip'), text]);
  }
  if (s.skippedGhDisconnected > 0) {
    const text = tr('flightDebriefSocialSkippedGh', { count: s.skippedGhDisconnected });
    items.push([text, tr('flightDebriefSocialSkippedGhTip'), text]);
  }
  const readOnly = tr('flightDebriefSocialReadOnly');
  items.push([readOnly, tr('flightDebriefSocialReadOnlyTip'), readOnly]);
  return items;
}
