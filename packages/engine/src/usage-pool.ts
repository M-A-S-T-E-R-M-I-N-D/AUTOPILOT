// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cost semantics v3 (docs/epics/0013-cost-semantics-v3.md) slice 1 — the
 * pure, read-only half of the "MACHINE-WIDE 30d equiv" denominator: parsing
 * Claude Code session transcript JSONL lines and summing their list-price
 * cost, deduplicated, over a trailing window. No filesystem access lives
 * here — {@link ./adapters/usage-pool-scan.js} supplies already-read file
 * contents so this stays testable with in-memory fixture strings.
 *
 * SCHEMA CAVEAT: this flight's containment rules forbid reading a real
 * `~/.claude` transcript to confirm field names against the installed CLI
 * (see the epic's Constraints). The shape below — a `message.id` on
 * assistant entries, a sibling `requestId`, a top-level ISO `timestamp`, and
 * a pre-calculated `costUSD` — is instead sourced from the `ccusage` project
 * (the community tool the board title's "ccusage-method" phrase names as
 * prior art) and its public issue history: costUSD is the pre-calculated
 * list-price field Claude Code writes per entry (ccusage.com/guide/cost-modes);
 * `message.id` + `requestId` is the dedup key ccusage's own fix for branched-
 * conversation duplicates uses (ryoppippi/ccusage#58); and a later ccusage bug
 * (ryoppippi/ccusage#888) found that keeping the FIRST entry for a repeated
 * key undercounts, because transcripts can append an intermediate usage
 * snapshot before a final, larger one — this module keeps the LATEST-
 * timestamped entry per key instead, deliberately avoiding that bug rather
 * than reproducing it. Anthropic's own docs caution that `costUSD`/
 * `total_cost_usd` are client-side estimates, not authoritative billing
 * (code.claude.com/docs/en/agent-sdk/cost-tracking) — consistent with this
 * epic's `realCostUsd` being a derived estimate, never a billing source of
 * truth. Before this is trusted for anything beyond a labeled dashboard
 * estimate, a future firing NOT under this containment restriction should
 * verify the above against a real installed-CLI transcript sample.
 */

/** One transcript line's fields this pool cares about — everything else is ignored. */
export interface TranscriptCostEntry {
  /** `message.id` + `requestId` combined, or `null` when neither is present (undedupeable). */
  readonly dedupeKey: string | null;
  /** Parsed `timestamp`, or `null` when absent/unparseable (excluded from window sums). */
  readonly timestampMs: number | null;
  /** The entry's pre-calculated `costUSD`, or `null` when absent. */
  readonly costUsd: number | null;
}

function readStr(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  return typeof v === 'string' ? v : null;
}

function readNum(o: Record<string, unknown>, key: string): number | null {
  const v = o[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Parse one raw JSONL line into its cost-relevant fields, or `null` for a blank/malformed line. */
export function parseTranscriptLine(line: string): TranscriptCostEntry | null {
  const trimmed = line.trim();
  if (trimmed === '') return null;
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const messageRaw = o['message'];
  const messageId =
    messageRaw !== null && typeof messageRaw === 'object'
      ? readStr(messageRaw as Record<string, unknown>, 'id')
      : null;
  const requestId = readStr(o, 'requestId');
  const dedupeKey =
    messageId !== null || requestId !== null ? JSON.stringify([messageId, requestId]) : null;
  const timestampRaw = readStr(o, 'timestamp');
  const parsedMs = timestampRaw !== null ? Date.parse(timestampRaw) : NaN;
  return {
    dedupeKey,
    timestampMs: Number.isFinite(parsedMs) ? parsedMs : null,
    costUsd: readNum(o, 'costUSD'),
  };
}

/** Parse every line of a transcript file's raw contents, dropping blank/malformed lines. */
export function parseTranscriptJsonl(raw: string): TranscriptCostEntry[] {
  const entries: TranscriptCostEntry[] = [];
  for (const line of raw.split('\n')) {
    const entry = parseTranscriptLine(line);
    if (entry !== null) entries.push(entry);
  }
  return entries;
}

/**
 * Deduplicate entries by {@link TranscriptCostEntry.dedupeKey}, keeping the
 * entry with the LATEST `timestampMs` for each repeated key (see this
 * module's doc comment on why latest-wins, not first-wins). Entries with no
 * dedupe key can't be matched to a duplicate, so every one of them is kept.
 */
export function dedupeTranscriptEntries(
  entries: readonly TranscriptCostEntry[],
): TranscriptCostEntry[] {
  const latestByKey = new Map<string, TranscriptCostEntry>();
  const undeduped: TranscriptCostEntry[] = [];
  for (const entry of entries) {
    if (entry.dedupeKey === null) {
      undeduped.push(entry);
      continue;
    }
    const existing = latestByKey.get(entry.dedupeKey);
    if (
      existing === undefined ||
      (entry.timestampMs ?? -Infinity) >= (existing.timestampMs ?? -Infinity)
    ) {
      latestByKey.set(entry.dedupeKey, entry);
    }
  }
  return [...latestByKey.values(), ...undeduped];
}

/**
 * Sum deduplicated list-price cost for entries timestamped in
 * `[windowStartMs, windowEndMs)`. An entry with no parseable timestamp is
 * excluded (window membership can't be verified) rather than assumed
 * in-window; an entry with no `costUsd` contributes nothing.
 */
export function sumListPriceCostUsd(
  entries: readonly TranscriptCostEntry[],
  windowStartMs: number,
  windowEndMs: number,
): number {
  let total = 0;
  for (const entry of dedupeTranscriptEntries(entries)) {
    if (entry.timestampMs === null) continue;
    if (entry.timestampMs < windowStartMs || entry.timestampMs >= windowEndMs) continue;
    if (entry.costUsd === null) continue;
    total += entry.costUsd;
  }
  return total;
}

/**
 * The cost semantics v3 ratio (epic 0013 Acceptance criteria): a unit's
 * list-price `costUsd`, scaled by the subscription's real fixed price over
 * the machine-wide trailing-30-day list-price-equivalent usage pool it was
 * drawn from — `costUsd * (subscriptionPriceUsd / machineWide30dListPriceUsd)`.
 *
 * `null` whenever any input is missing (subscription price unconfigured, or
 * the pool was entirely unreadable per {@link scanUsagePoolListPriceUsd}'s
 * `totalUsd: null}` contract) or the pool total isn't strictly positive (a
 * zero or negative denominator makes the ratio undefined or nonsensical) —
 * the epic's "graceful absence" constraint applies here too: an estimate
 * this function can't support is `null`, never a fabricated number.
 */
export function computeRealCostUsd(
  costUsd: number | null,
  subscriptionPriceUsd: number | null,
  machineWide30dListPriceUsd: number | null,
): number | null {
  if (costUsd === null || subscriptionPriceUsd === null || machineWide30dListPriceUsd === null) {
    return null;
  }
  if (machineWide30dListPriceUsd <= 0) return null;
  return costUsd * (subscriptionPriceUsd / machineWide30dListPriceUsd);
}
