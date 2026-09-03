// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * RTL-hazard inventory (board web-msnsndki-dz3vn1, the i18n foundation's
 * "dir=rtl layout audit" deliverable, made durable): a scan of the dashboard's
 * CSS-in-TS sources (`apps/dashboard/src/web/*-css.ts` — `layout-css.ts`
 * today — plus any plain `.css` files that appear later) for
 * physical-direction CSS declarations that break `dir="rtl"` layout. The
 * one-time audit already happened (`8265c489` converted `layout-css.ts` to
 * logical properties: `margin-inline-start`, `inset-inline-end`,
 * `text-align: start`, …); this script keeps it true, because every restyle
 * of that file is a fresh chance for `margin-left` to creep back in and
 * silently push Hebrew layout the wrong way.
 *
 * Detection is a line-based regex scan, not a CSS parser — deliberately
 * matching `find-untagged-strings.mjs`'s conventions (plain `node:fs`,
 * exported pure functions, a thin `main()`). Each finding names the logical
 * equivalent to use instead, so the report is directly actionable:
 *   - `margin-left`/`padding-right` → `margin-inline-start`/`padding-inline-end`
 *   - `border-left[-width|-style|-color]` → `border-inline-start…`
 *   - `border-top-left-radius` → `border-start-start-radius` (etc.)
 *   - bare `left:`/`right:` position offsets → `inset-inline-start`/`-end`
 *   - `text-align: left|right` → `text-align: start|end`
 *   - `float`/`clear`: `left|right` → `inline-start|inline-end`
 * A line carrying an `rtl-ok` comment marker is skipped — the escape hatch
 * for the rare declaration whose physical direction is genuinely intended (a
 * viewport-pinned coordinate that must not flip with text direction).
 * JS-computed positioning (`tip-position.ts`'s viewport math) is out of
 * scope by design: viewport coordinates are direction-agnostic.
 * Report-only from the CLI, like its sibling script — but unlike untagged
 * strings (a rolling frontier), "zero hazards" is the audited steady state,
 * so `find-rtl-hazards.test.ts` also asserts the live tree scans clean.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = 'apps/dashboard/src/web';

const RTL_OK_MARKER = 'rtl-ok';

/** @typedef {{ file: string, line: number, hazard: string, suggestion: string }} Finding */

/** Each hazard pattern pairs a declaration-matching regex with the logical
 *  equivalent to suggest. Patterns are anchored on the `:` so property NAMES
 *  appearing in prose (doc comments mentioning `margin-left`) don't match. */
const HAZARD_PATTERNS = [
  {
    re: /\b(margin|padding)-(left|right)\s*:/g,
    /** @param {RegExpMatchArray} m @returns {string} */
    suggest: (m) => `${m[1]}-inline-${m[2] === 'left' ? 'start' : 'end'}`,
    /** @param {RegExpMatchArray} m @returns {string} */
    hazard: (m) => `${m[1]}-${m[2]}`,
  },
  {
    re: /\bborder-(left|right)(-(?:width|style|color))?\s*:/g,
    /** @param {RegExpMatchArray} m @returns {string} */
    suggest: (m) => `border-inline-${m[1] === 'left' ? 'start' : 'end'}${m[2] ?? ''}`,
    /** @param {RegExpMatchArray} m @returns {string} */
    hazard: (m) => `border-${m[1]}${m[2] ?? ''}`,
  },
  {
    re: /\bborder-(top|bottom)-(left|right)-radius\s*:/g,
    /** @param {RegExpMatchArray} m @returns {string} */
    suggest: (m) =>
      `border-${m[1] === 'top' ? 'start' : 'end'}-${m[2] === 'left' ? 'start' : 'end'}-radius`,
    /** @param {RegExpMatchArray} m @returns {string} */
    hazard: (m) => `border-${m[1]}-${m[2]}-radius`,
  },
  {
    // Bare position offsets; the lookbehind keeps `margin-left:` (already
    // covered above) and logical names from double-matching.
    re: /(?<![-\w])(left|right)\s*:/g,
    /** @param {RegExpMatchArray} m @returns {string} */
    suggest: (m) => `inset-inline-${m[1] === 'left' ? 'start' : 'end'}`,
    /** @param {RegExpMatchArray} m @returns {string} */
    hazard: (m) => m[1],
  },
  {
    re: /\btext-align\s*:\s*(left|right)\b/g,
    /** @param {RegExpMatchArray} m @returns {string} */
    suggest: (m) => `text-align: ${m[1] === 'left' ? 'start' : 'end'}`,
    /** @param {RegExpMatchArray} m @returns {string} */
    hazard: (m) => `text-align: ${m[1]}`,
  },
  {
    re: /\b(float|clear)\s*:\s*(left|right)\b/g,
    /** @param {RegExpMatchArray} m @returns {string} */
    suggest: (m) => `${m[1]}: inline-${m[2] === 'left' ? 'start' : 'end'}`,
    /** @param {RegExpMatchArray} m @returns {string} */
    hazard: (m) => `${m[1]}: ${m[2]}`,
  },
];

/**
 * @param {string} source
 * @param {string} file
 * @returns {Finding[]}
 */
export function scanCssSource(source, file) {
  /** @type {Finding[]} */
  const findings = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes(RTL_OK_MARKER)) continue;
    for (const pattern of HAZARD_PATTERNS) {
      for (const match of line.matchAll(pattern.re)) {
        findings.push({
          file,
          line: i + 1,
          hazard: pattern.hazard(match),
          suggestion: pattern.suggest(match),
        });
      }
    }
  }
  return findings;
}

/** True for the files this repo keeps CSS in: the `*-css.ts` CSS-in-TS
 *  convention (`layout-css.ts`) and any plain stylesheet.
 *  @param {string} name @returns {boolean} */
function isCssFile(name) {
  return (name.endsWith('-css.ts') && !name.endsWith('.test.ts')) || name.endsWith('.css');
}

/** @param {string} dir @returns {string[]} */
function listCssFiles(dir) {
  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listCssFiles(full));
    } else if (entry.isFile() && isCssFile(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

/**
 * @param {string} root
 * @returns {Finding[]}
 */
export function scanRoot(root) {
  return listCssFiles(root)
    .sort()
    .flatMap((file) => scanCssSource(readFileSync(file, 'utf8'), relative(root, file)));
}

/**
 * @param {Finding[]} findings
 * @param {string} root
 * @returns {string}
 */
export function formatReport(findings, root) {
  if (findings.length === 0) {
    return `i18n:rtl: 0 physical-direction CSS declaration(s) found under ${root}`;
  }
  const lines = findings.map((f) => `  - ${f.file}:${f.line} ${f.hazard} → use ${f.suggestion}`);
  return [
    `i18n:rtl: ${findings.length} physical-direction CSS declaration(s) found under ${root}:`,
    ...lines,
    '',
    'These flip the wrong way (or refuse to flip) under dir="rtl". Replace each with',
    'its logical equivalent, or mark the line /* rtl-ok */ when the physical',
    'direction is genuinely intended (e.g. viewport-pinned coordinates).',
  ].join('\n');
}

function main() {
  const root = process.argv[2] ?? DEFAULT_ROOT;
  const findings = scanRoot(root);
  console.log(formatReport(findings, root));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
