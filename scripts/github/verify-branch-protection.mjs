// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * verify-branch-protection — READ-ONLY drift check for epic 0007 slice 1's
 * "canonical lock". Fetches the LIVE branch protection via `gh api` (GET,
 * never PUT) and compares it against the desired
 * `.github/branch-protection.json`, reporting OK / DRIFT per key. The
 * verification half of gh:setup-branch-protection: the operator applies the
 * lock with their own authenticated `gh`, then runs
 * `pnpm run gh:verify-branch-protection` to prove it stuck — and re-runs it
 * any time to detect drift. Exit 0 = live matches desired; exit 1 = branch
 * unprotected or drifted; other failures (no gh auth, network) throw.
 * Like its setup sibling, deliberately NOT wired into the CI gate — it
 * needs the operator's authenticated `gh` against the live repo.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @returns {Record<string, unknown>} */
function loadConfig() {
  const raw = readFileSync('.github/branch-protection.json', 'utf8');
  return /** @type {Record<string, unknown>} */ (JSON.parse(raw));
}

/**
 * GET's response wraps booleans as `{ enabled: boolean }` — for
 * `enforce_admins` and `required_signatures` specifically, GitHub's live
 * shape is `{ url: string, enabled: boolean }`, so this must strip the
 * wrapper on the presence of `enabled` alone, not on an exact one-key
 * shape (a stricter check silently failed to normalize those two keys,
 * comparing the desired boolean against the whole object and reporting
 * false DRIFT even when `enabled` matched). The PUT payload uses plain
 * booleans — normalize so the two shapes compare.
 * @param {unknown} value
 * @returns {unknown}
 */
export function normalize(value) {
  if (value !== null && typeof value === 'object' && 'enabled' in value) {
    return /** @type {{ enabled: unknown }} */ (value).enabled;
  }
  return value;
}

/**
 * Compares one desired key against the live protection. Booleans compare
 * exactly; a `null` desired (e.g. `restrictions: null` = no restrictions)
 * requires the live side to be absent or disabled; an object desired (e.g.
 * `required_pull_request_reviews`) requires the live side to be present —
 * a deliberately shallow check: presence of the lock, not every sub-knob.
 * @param {unknown} desired
 * @param {unknown} live
 * @returns {boolean}
 */
export function matches(desired, live) {
  const normalized = normalize(live);
  if (desired === null)
    return normalized === undefined || normalized === null || normalized === false;
  if (typeof desired === 'boolean') return normalized === desired;
  return normalized !== undefined && normalized !== null;
}

function main() {
  const { branch, ...protection } = loadConfig();
  if (typeof branch !== 'string' || branch === '') {
    throw new Error('.github/branch-protection.json: missing "branch"');
  }

  let stdout;
  try {
    stdout = execFileSync('gh', ['api', `repos/{owner}/{repo}/branches/${branch}/protection`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const stderr = String(/** @type {{ stderr?: unknown }} */ (error).stderr ?? '');
    if (stderr.includes('Branch not protected') || stderr.includes('HTTP 404')) {
      console.error(`gh:verify-branch-protection DRIFT: "${branch}" is NOT protected at all`);
      process.exit(1);
    }
    throw error;
  }

  const live = /** @type {Record<string, unknown>} */ (JSON.parse(stdout));
  const drifted = Object.entries(protection).filter(
    ([key, desired]) => !matches(desired, live[key]),
  );

  if (drifted.length > 0) {
    for (const [key, desired] of drifted) {
      console.error(
        `gh:verify-branch-protection DRIFT: "${key}" desired ${JSON.stringify(desired)}, ` +
          `live ${JSON.stringify(normalize(live[key]) ?? null)}`,
      );
    }
    process.exit(1);
  }

  console.log(
    `gh:verify-branch-protection OK: "${branch}" matches .github/branch-protection.json ` +
      `(${Object.keys(protection).length} keys checked)`,
  );
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
