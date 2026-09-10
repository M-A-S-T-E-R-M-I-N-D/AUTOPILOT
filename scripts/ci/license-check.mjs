// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * license-check (board web-mtluaot4-g7kjuu): an allowlist gate over `pnpm
 * licenses list --json` so a new dependency under a copyleft license
 * (GPL/AGPL/SSPL) or an unrecognized/missing license can never land
 * silently. Default-deny: only an SPDX id (or an "OR" expression containing
 * one) explicitly on the allowlist passes — anything else, including a
 * license this list has never seen before, fails closed. That default-deny
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
  if (trimmed === '') return false;
  return EXACT_ALLOWED.has(trimmed);
}

/**
 * A license field can be a bare SPDX id or an SPDX boolean expression, e.g.
 * `(MIT OR Apache-2.0)` for a dual-licensed package. `OR` passes if ANY
 * alternative is allowed (a consumer may pick the permissive one); `AND`
 * passes only if EVERY term is allowed, since all terms apply at once.
 * @param {string} license @returns {boolean}
 */
export function isAllowedLicenseExpression(license) {
  const stripped = license.trim().replace(/^\(|\)$/g, '');
  if (/ OR /i.test(stripped)) {
    return stripped.split(/ OR /i).some((term) => isAllowedLicenseId(term));
  }
  if (/ AND /i.test(stripped)) {
    return stripped.split(/ AND /i).every((term) => isAllowedLicenseId(term));
  }
  return isAllowedLicenseId(stripped);
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
    'Allowed: MIT*, ISC, BSD*, Apache-2.0, MPL-2.0, CC0*, 0BSD, BlueOak*, Python-2.0, CC-BY-4.0 ' +
      '(or an SPDX OR-expression containing one of these).',
  );
  process.exit(1);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
