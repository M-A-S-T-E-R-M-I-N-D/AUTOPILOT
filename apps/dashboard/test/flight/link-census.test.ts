// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * LINK CENSUS (epic 0020 "the legible surface", slice 5 — operator,
 * 2026-09-09: "אם אנחנו מביאים מידע מהGITHUB למה אנחנו לא יכולים לקשר
 * באופן ישיר"). Slice 1 fixed the KEEPER PR-review panel: `gh` already
 * reports a PR's own url and every check run's log url, and the panel
 * rendered plain text next to them. `web/features/pool-client.ts` carried
 * the identical bug on its own issue number — `flight/pool-client.ts`'s
 * `PoolIssue.url` was fetched on every poll and never once read by the
 * renderer — invisible because nothing structural checked it.
 *
 * This diffs the flight DIRECTORY on disk, never a hand-kept list (the
 * census-must-diff-the-disk law, learned from chunks.test.ts and
 * pr-review.test.ts's own census): every `.ts` under `src/flight/` is read
 * for an exported, non-`Raw` interface carrying a real `url: string` field
 * — a GitHub noun's own link, as opposed to a `Raw*` defensive-parsing
 * shape where every field is still untyped input. Any file that fetches one
 * must have a `web/features/` renderer of the same name that actually reads
 * `.url` into an `href` — or be named in `NOT_YET_RENDERED` with a reason.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FLIGHT_DIR = fileURLToPath(new URL('../../src/flight/', import.meta.url));
const FEATURES_DIR = fileURLToPath(new URL('../../src/web/features/', import.meta.url));

/**
 * flight/*.ts files whose public payload carries a real GitHub `url` but
 * have no `web/features/` panel to link it yet — a genuine, tracked gap,
 * not the "fetched and silently discarded" bug this census exists to catch.
 * Remove an entry the day its panel ships.
 */
const NOT_YET_RENDERED = new Set<string>([
  // SocialSubmission (epic 0019 "role-gated dashboard", board
  // web-mtt3f7j6-3bj899, still queued): resolved by social-pass.ts but not
  // consumed by any web/features panel yet.
  'social-pass.ts',
  // ContributorListEntry (CONTRIBUTOR JOURNEY slice 1/4, board
  // web-mtt3hery-l8v0lf): this ships only the pure filter/rank core; the
  // live `gh issue list --label` read and the web/features panel that
  // renders this list are separate, later slices — too large to combine
  // with the core in one firing (docs/debriefs/2026-09-10-verdict-
  // ap-mttxbufs-0-contributor-journey-split-reconfirmed.md).
  'contributor-issue-list.ts',
]);

/** Payloads painted by a web feature that does not share the flight module's
 *  name — the census follows the map instead of excusing them. */
const RENDERED_BY = new Map<string, string>([
  // The 🍀 fit shortlist (issue #44) paints under the Fly bar, in fly.ts.
  ['lucky-fit.ts', 'fly.ts'],
]);

function flightSources(): readonly string[] {
  return readdirSync(FLIGHT_DIR).filter((f) => f.endsWith('.ts'));
}

/** Names of exported, non-`Raw` interfaces in `source` that carry a real
 *  (never `unknown`) `url` field. */
function urlBearingInterfaces(source: string): readonly string[] {
  const blocks = source.matchAll(/export interface (\w+)[^{]*\{([\s\S]*?)\n\}/g);
  const names: string[] = [];
  for (const match of blocks) {
    const [, name, body] = match;
    if (name === undefined || body === undefined || name.startsWith('Raw')) continue;
    if (/readonly url\??:\s*string\b/.test(body)) names.push(name);
  }
  return names;
}

describe('link census — every fetched GitHub url reaches a real anchor', () => {
  it('finds the flight directory and reads more than a handful of modules', () => {
    expect(flightSources().length).toBeGreaterThan(10);
  });

  it('renders (or explicitly excuses) every url-bearing flight payload', () => {
    const offenders: string[] = [];
    for (const file of flightSources()) {
      const source = readFileSync(join(FLIGHT_DIR, file), 'utf8');
      const interfaces = urlBearingInterfaces(source);
      if (interfaces.length === 0) continue;
      if (NOT_YET_RENDERED.has(file)) continue;

      const renderer = RENDERED_BY.get(file) ?? file;
      const rendererPath = join(FEATURES_DIR, renderer);
      if (!existsSync(rendererPath)) {
        offenders.push(
          `${file} (${interfaces.join(', ')}): fetches a GitHub url but web/features/${renderer} ` +
            `does not exist to link it`,
        );
        continue;
      }
      const rendererSource = readFileSync(rendererPath, 'utf8');
      if (!/\.url\b/.test(rendererSource) || !/href/i.test(rendererSource)) {
        offenders.push(
          `${file} (${interfaces.join(', ')}): fetches a url but web/features/${renderer} never ` +
            `sets an href from it — fetched and discarded at the client boundary`,
        );
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('keeps the exclusion list honest — every excused file still exists and still fetches a url', () => {
    for (const file of NOT_YET_RENDERED) {
      expect(flightSources()).toContain(file);
      const interfaces = urlBearingInterfaces(readFileSync(join(FLIGHT_DIR, file), 'utf8'));
      expect(
        interfaces.length,
        `${file} no longer fetches a url — remove it from NOT_YET_RENDERED`,
      ).toBeGreaterThan(0);
    }
  });
});
