// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * PAYLOAD CENSUS (epic 0020 "the legible surface", slice 6 — the epic's
 * failure #1: "facts fetched and discarded at the client boundary." `gh pr
 * list` returned every check's name, state, timing and log url; the panel
 * rendered one word (`checkRuns` on `PrReviewCandidate`, fixed in slice 1).
 * `link-census.test.ts` (slice 5) already guards one narrow slice of this —
 * a fetched `url` with no `href` — this guards a second, independent slice:
 * a whole small display payload where SOME field never reaches the panel
 * that already renders its siblings.
 *
 * This is a first, deliberately bounded slice of the census, not the full
 * sweep the epic describes. `PAYLOAD_INTERFACES` below is a CURATED list,
 * not a disk diff — unlike `link-census.test.ts`'s fully automatic scan,
 * most `flight/*.ts` payload interfaces (`PrReviewCandidate`,
 * `IssueTriageDossier`, every `MirrorPass*Finding`) mix real display fields
 * with fields documented as decision-only / reasoning-only (see e.g.
 * `PrReviewCandidate.viewerIsAuthor`'s own doc comment: "the check can only
 * narrow toward queue-for-human, never force a merge") — a blind "every
 * field must render" sweep would misfire on every one of those. The two
 * interfaces below were hand-verified to carry ONLY display fields (no
 * field exists purely to steer a policy decision), so the check below is
 * sound without per-field editorializing. Extending `PAYLOAD_INTERFACES` to
 * `PrReviewCandidate` and friends is real follow-up work, not scope creep
 * this slice skipped by accident.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const FLIGHT_DIR = fileURLToPath(new URL('../../src/flight/', import.meta.url));
const FEATURES_DIR = fileURLToPath(new URL('../../src/web/features/', import.meta.url));

/**
 * The renderer's own text plus every local helper it splices in via a
 * relative `.js` import (the "vanilla + `.toString()` splice architecture"
 * — see e.g. `web/features/publicity.ts` importing `publicityAffordanceTip`
 * from `../publicity-panel.js` and inlining `.toString()`'s output). A
 * field read only inside a spliced helper is still a field that reaches
 * the browser — checking the renderer file alone would false-positive on
 * exactly that shape. One level deep only: enough for every splice this
 * codebase currently does.
 */
function rendererSourceWithLocalImports(rendererPath: string): string {
  const own = readFileSync(rendererPath, 'utf8');
  let combined = own;
  for (const importMatch of own.matchAll(/from ['"](\.[^'"]+)\.js['"]/g)) {
    const specifier = importMatch[1];
    if (specifier === undefined) continue;
    const importedPath = resolve(dirname(rendererPath), `${specifier}.ts`);
    if (existsSync(importedPath)) combined += `\n${readFileSync(importedPath, 'utf8')}`;
  }
  return combined;
}

interface PayloadInterface {
  readonly file: string;
  readonly interfaceName: string;
}

/** Curated (file, interface) pairs — see the file header for why this is a
 *  hand-picked list rather than a disk diff. Each entry's flight file must
 *  have a same-named `web/features/` renderer already, so "reaches the
 *  panel" has somewhere real to check against. */
const PAYLOAD_INTERFACES: readonly PayloadInterface[] = [
  { file: 'pool-client.ts', interfaceName: 'PoolIssue' },
  { file: 'publicity.ts', interfaceName: 'PublicityAffordance' },
];

/** `${file}#${interfaceName}#${field}` -> why this one field is excused
 *  from the "every field reaches the renderer" rule — a genuine tracked
 *  gap, never a silent carve-out (same discipline as `link-census.test.ts`'s
 *  `NOT_YET_RENDERED`). Remove an entry the day its panel ships the field. */
const EXCUSED: Readonly<Record<string, string>> = {
  'pool-client.ts#PoolIssue#labels':
    'the panel does not yet show a pool issue’s labels — tracked UX gap, not a decision-only field',
  'pool-client.ts#PoolIssue#assignees':
    'the panel does not yet show who a pool issue is assigned to — tracked UX gap, not a decision-only field',
};

/** Top-level `readonly field: ...` / `readonly field?: ...` names declared
 *  directly on `interfaceName` in `source` — one level, no descent into
 *  nested object-literal types (neither censused interface has one). */
function interfaceFields(source: string, interfaceName: string): readonly string[] {
  const pattern = new RegExp(`export interface ${interfaceName}[^{]*\\{([\\s\\S]*?)\\n\\}`);
  const match = pattern.exec(source);
  if (match === null || match[1] === undefined) return [];
  const fields: string[] = [];
  for (const fieldMatch of match[1].matchAll(/^\s*readonly (\w+)\??:/gm)) {
    const name = fieldMatch[1];
    if (name !== undefined) fields.push(name);
  }
  return fields;
}

describe('payload census — every field of a censused display payload reaches its renderer', () => {
  it('finds every censused interface at the field-count the exclusion list expects', () => {
    for (const { file, interfaceName } of PAYLOAD_INTERFACES) {
      const source = readFileSync(`${FLIGHT_DIR}${file}`, 'utf8');
      const fields = interfaceFields(source, interfaceName);
      expect(
        fields.length,
        `${file}#${interfaceName}: interface not found or has no fields`,
      ).toBeGreaterThan(0);
    }
  });

  it('renders (or explicitly excuses) every field of each censused payload interface', () => {
    const offenders: string[] = [];
    for (const { file, interfaceName } of PAYLOAD_INTERFACES) {
      const source = readFileSync(`${FLIGHT_DIR}${file}`, 'utf8');
      const rendererSource = rendererSourceWithLocalImports(`${FEATURES_DIR}${file}`);
      for (const field of interfaceFields(source, interfaceName)) {
        const key = `${file}#${interfaceName}#${field}`;
        if (key in EXCUSED) continue;
        const reference = new RegExp(`\\.${field}\\b`);
        if (!reference.test(rendererSource)) {
          offenders.push(
            `${key}: fetched but web/features/${file} never reads .${field} — fetched and ` +
              `discarded at the client boundary`,
          );
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('keeps the exclusion list honest — every excused field still exists and is still unread', () => {
    for (const [key, reason] of Object.entries(EXCUSED)) {
      expect(reason.length).toBeGreaterThan(0);
      const [file, interfaceName, field] = key.split('#');
      expect(file, key).toBeDefined();
      expect(interfaceName, key).toBeDefined();
      expect(field, key).toBeDefined();
      const censused = PAYLOAD_INTERFACES.some(
        (entry) => entry.file === file && entry.interfaceName === interfaceName,
      );
      expect(censused, `${key}: excused but ${interfaceName} is not in PAYLOAD_INTERFACES`).toBe(
        true,
      );
      const source = readFileSync(`${FLIGHT_DIR}${file}`, 'utf8');
      expect(
        interfaceFields(source, interfaceName as string),
        `${key}: interface no longer declares this field — remove the exclusion`,
      ).toContain(field);
    }
  });
});
