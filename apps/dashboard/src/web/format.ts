// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure formatting helpers for the fleet dashboard — client-only (no server
 * counterpart, unlike `shared/*.ts`), so it lives in `web/` rather than
 * `shared/` (epic 0002 "shell decomposition", slice 2: feature-module split
 * of `shell.ts`), following the same pattern `office-map.ts` proved for the
 * office map's pure geometry.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** Human-readable byte size ("512 B" / "3.4 KB" / "1.2 MB"). */
export function fmtBytes(n: number): string {
  if (n < 1024) return n + ' B';
  if (n < 1048576) {
    // toFixed(1) can round e.g. 1048550 (1023.975 KB) up to "1024.0" —
    // re-check against the rounded string instead of the raw value so that
    // case promotes to the MB suffix instead of rendering the malformed
    // "1024.0 KB" (mirrors fmtTokens's k/M boundary fix below).
    const kilobytes = (n / 1024).toFixed(1);
    if (kilobytes === '1024.0') return (n / 1048576).toFixed(1) + ' MB';
    return kilobytes + ' KB';
  }
  return (n / 1048576).toFixed(1) + ' MB';
}

/** Dollar-formatted cost, with a "<$0.01" floor for sub-cent spend
 *  (magnitude-only — applies the same on negative sub-cent amounts, so a
 *  tiny refund/credit renders "-<$0.01" instead of the misleading "-$0.00"). */
export function fmtCost(n: number): string {
  n = n || 0;
  const sign = n < 0 ? '-' : '';
  if (n !== 0 && Math.abs(n) < 0.01) return sign + '<$0.01';
  return sign + '$' + Math.abs(n).toFixed(2);
}

/** Compact token count ("850" / "12.3k" / "1.5M"). */
export function fmtTokens(n: number): string {
  n = n || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) {
    // toFixed(1) can round e.g. 999950 (999.95k) up to "1000.0" — re-check
    // against the rounded string instead of the raw value so that case
    // promotes to the M suffix instead of rendering the malformed "1000.0k".
    const thousands = (n / 1000).toFixed(1);
    if (thousands === '1000.0') return (n / 1000000).toFixed(1) + 'M';
    return thousands + 'k';
  }
  return String(n);
}

/** Relative-past label ("just now" / "5s ago" / "3m ago" / "2h ago" / "1d ago"). */
export function fmtAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 2) return 'just now';
  if (s < 60) return s + 's ago';
  const m = Math.round(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.round(s / 3600);
  if (h < 24) return h + 'h ago';
  return Math.round(s / 86400) + 'd ago';
}

/** A duration ("3m 12s"), not a relative-past label like fmtAgo — used for how
 *  long a still-live firing has been running. */
export function fmtElapsed(startedAt: number): string {
  const s = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ' + (s % 60) + 's';
  const h = Math.floor(m / 60);
  return h + 'h ' + (m % 60) + 'm';
}

/** A raw duration ("2h 15m") from a millisecond span — unlike fmtElapsed (which
 *  measures "since startedAt against the clock"), this formats an already-
 *  computed duration (e.g. a DORA lead-time/MTTR value) directly. */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ' + (s % 60) + 's';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ' + (m % 60) + 'm';
  const d = Math.floor(h / 24);
  return d + 'd ' + (h % 24) + 'h';
}
