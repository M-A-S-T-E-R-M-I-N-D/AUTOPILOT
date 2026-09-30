// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * license-check (board web-mtluaot4-g7kjuu): an allowlist gate over `pnpm
 * licenses list --json` so a new dependency under a copyleft license
 * (GPL/AGPL/SSPL) or an unrecognized/missing license can never land
 * silently. Default-deny: only an SPDX id explicitly on the allowlist (or an
 * SPDX expression satisfiable with such ids alone) passes — anything else,
 * including a license this list has never seen before, fails closed. That default-deny
 * shape doubles as the drift check: a brand-new disallowed license shows up
 * as a failure the moment it enters the lockfile, with no separate baseline
 * file to keep in sync.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Exact SPDX identifiers allowed — the allowlist itself pins the version AND
 * the exact variant, deliberately NOT a family-prefix match. A prefix check
 * (`id.startsWith('MIT')`, `id.startsWith('BSD')`) previously let unaudited
 * siblings of an allowed family through unreviewed — `MITNFA` ("MIT
 * +no-false-attribs", a real, stricter SPDX id) and `BSD-4-Clause` (the
 * advertising-clause variant, GPL-incompatible and normally excluded from a
 * permissive allowlist) both satisfied `startsWith('MIT'|'BSD')` while never
 * having been reviewed for this list. That silently contradicted this
 * module's own default-deny doc comment ("only an SPDX id explicitly on the
 * allowlist passes"): a prefix match is not an explicit allow. A genuinely
 * new, actually-safe variant (e.g. a future `BlueOak-1.1.0`) now fails
 * closed instead of passing by prefix luck — exactly the stated contract —
 * and gets added here once reviewed.
 */
const EXACT_ALLOWED = new Set([
  'Apache-2.0',
  'MPL-2.0',
  'Python-2.0',
  'CC-BY-4.0',
  '0BSD',
  'ISC',
  'MIT',
  'MIT-0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC0-1.0',
  'BlueOak-1.0.0',
]);

/** @param {string} id @returns {boolean} */
export function isAllowedLicenseId(id) {
  const trimmed = id.trim();
  // Stryker disable next-line ConditionalExpression,StringLiteral: EXACT_ALLOWED
  // never holds the empty string, so skipping this guard (`if (false)`) or
  // comparing against some other literal both fall through to the identical
  // `has('') -> false` below — the guard only spares a Set lookup, it never
  // changes observable output. Its `if (true)` / `!==` / `return true`
  // mutants ARE killed by license-check.test.ts.
  if (trimmed === '') return false;
  return EXACT_ALLOWED.has(trimmed);
}

/** An SPDX expression token: a parenthesis, or a run of anything else. */
const LICENSE_TOKEN_RE = /[()]|[^\s()]+/g;
const LICENSE_OPERATORS = new Set(['AND', 'OR', 'WITH']);

/**
 * @typedef {{ readonly tokens: readonly string[], pos: number }} LicenseCursor
 * Each parse step below returns whether its span is allowed, or `null` when
 * the span is malformed.
 */

/** @param {LicenseCursor} cursor @returns {string | undefined} */
function peekOperator(cursor) {
  return cursor.tokens[cursor.pos]?.toUpperCase();
}

/** @param {string | undefined} token @returns {token is string} */
function isIdToken(token) {
  return (
    token !== undefined &&
    token !== '(' &&
    token !== ')' &&
    !LICENSE_OPERATORS.has(token.toUpperCase())
  );
}

/** or-expression := and-expression ("OR" and-expression)*
 *  @param {LicenseCursor} cursor @returns {boolean | null} */
function parseOrExpression(cursor) {
  let allowed = parseAndExpression(cursor);
  while (allowed !== null && peekOperator(cursor) === 'OR') {
    cursor.pos += 1;
    const next = parseAndExpression(cursor);
    allowed = next === null ? null : allowed || next;
  }
  return allowed;
}

/** and-expression := term ("AND" term)*
 *  @param {LicenseCursor} cursor @returns {boolean | null} */
function parseAndExpression(cursor) {
  let allowed = parseLicenseTerm(cursor);
  // Stryker disable next-line ConditionalExpression: `allowed !== null` ->
  // `true` is equivalent here — `null && next` stays null, so parsing on past a
  // malformed term still returns null. The guard only stops early; the one in
  // parseOrExpression is load-bearing (`null || next` would not stay null).
  while (allowed !== null && peekOperator(cursor) === 'AND') {
    cursor.pos += 1;
    const next = parseLicenseTerm(cursor);
    allowed = next === null ? null : allowed && next;
  }
  return allowed;
}

/** term := "(" or-expression ")" | id ["WITH" exception-id]
 *  @param {LicenseCursor} cursor @returns {boolean | null} */
function parseLicenseTerm(cursor) {
  const token = cursor.tokens[cursor.pos];
  if (token === '(') {
    cursor.pos += 1;
    const inner = parseOrExpression(cursor);
    if (cursor.tokens[cursor.pos] !== ')') return null;
    cursor.pos += 1;
    return inner;
  }
  if (!isIdToken(token)) return null;
  cursor.pos += 1;
  if (peekOperator(cursor) !== 'WITH') return isAllowedLicenseId(token);
  const exception = cursor.tokens[cursor.pos + 1];
  if (!isIdToken(exception)) return null;
  cursor.pos += 2;
  // Stryker disable next-line StringLiteral: no `<id> WITH <exception>` pair is
  // on EXACT_ALLOWED yet, so blanking the looked-up key fails closed exactly the
  // same way; the lookup is the hook for the first reviewed exception.
  return isAllowedLicenseId(`${token} WITH ${exception}`);
}

/**
 * A license field can be a bare SPDX id or an SPDX boolean expression, e.g.
 * `(MIT OR Apache-2.0)` for a dual-licensed package. `OR` passes if ANY
 * alternative is allowed (a consumer may pick the permissive one); `AND`
 * passes only if EVERY term is allowed, since all terms apply at once.
 * Parentheses group and `AND` binds tighter than `OR`, as in the SPDX
 * grammar — so `GPL-3.0-only AND (MIT OR Apache-2.0)` still demands the GPL
 * term and fails. Splitting on `OR` first once let the parenthesised `MIT`
 * pass that whole expression. A `WITH` term is looked up whole, so an
 * unreviewed exception fails closed, and so does anything malformed (an
 * unbalanced parenthesis, a dangling or doubled operator, two ids with no
 * operator between them): it is not a license this list has reviewed.
 * @param {string} license @returns {boolean}
 */
export function isAllowedLicenseExpression(license) {
  // Stryker disable next-line ArrayDeclaration: match() is null only for an
  // empty or all-whitespace field, and any stand-in token list fails closed on
  // it exactly like the empty one (a lone unlisted id is not allowed either).
  const cursor = { tokens: license.match(LICENSE_TOKEN_RE) ?? [], pos: 0 };
  const allowed = parseOrExpression(cursor);
  return allowed === true && cursor.pos === cursor.tokens.length;
}

/**
 * @param {Record<string, ReadonlyArray<{ name: string, versions?: readonly string[], license?: string }>>} licensesJson
 *   `pnpm licenses list --json`'s own shape: keyed by the raw license string, each
 *   holding the packages reported under it.
 * @returns {Array<{ license: string, name: string, versions: readonly string[] }>}
 */
export function findLicenseViolations(licensesJson) {
  const violations = [];
  for (const [licenseKey, packages] of Object.entries(licensesJson)) {
    if (isAllowedLicenseExpression(licenseKey)) continue;
    for (const pkg of packages) {
      violations.push({
        license: pkg.license ?? licenseKey,
        name: pkg.name,
        versions: pkg.versions ?? [],
      });
    }
  }
  return violations;
}

// Stryker disable all: everything below is the process shell — it launches
// `pnpm licenses list --json` through the platform's shim, parses its output
// and calls `process.exit`, the same stance the other five ci/ configs take
// for their own impure glue. The logic it delegates to — the three allowlist
// functions above — IS mutation-tested.

/** On Windows, `pnpm` is a `.cmd` shim that `execFileSync` cannot launch
 *  directly (ENOENT) — same fix `scripts/ci/dependency-audit.mjs` applies. */
function pnpmInvocation(args) {
  return process.platform === 'win32'
    ? { bin: 'cmd.exe', args: ['/c', 'pnpm', ...args] }
    : { bin: 'pnpm', args: [...args] };
}

function runLicensesList() {
  const inv = pnpmInvocation(['licenses', 'list', '--json']);
  return execFileSync(inv.bin, inv.args, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function main() {
  const licensesJson = JSON.parse(runLicensesList());
  const violations = findLicenseViolations(licensesJson);
  if (violations.length === 0) {
    console.log(
      `license-check OK: every dependency license is on the allowlist ` +
        `(${Object.keys(licensesJson).length} license group(s) scanned)`,
    );
    process.exit(0);
  }
  console.error(
    `license-check FAILED: ${violations.length} package(s) under a disallowed license:`,
  );
  for (const violation of violations) {
    console.error(`  - ${violation.name}@${violation.versions.join(',')}: ${violation.license}`);
  }
  console.error(
    `Allowed: ${[...EXACT_ALLOWED].join(', ')} ` +
      '(or an SPDX expression satisfiable with these alone).',
  );
  process.exit(1);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
