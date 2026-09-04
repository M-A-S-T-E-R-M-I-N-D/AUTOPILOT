// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Release-maturity intelligence (operator ask, 2026-09-04: "does the release
 * ritual KNOW it's an alpha?"). Pure decision core — no I/O, no git — that
 * classifies a version string into a release phase the same way a careful
 * maintainer would, grounded in SemVer 2.0.0's own rules rather than a
 * guess:
 *
 * - §9: a pre-release SUFFIX (`1.0.0-alpha.1`, `2.0.0-beta`, `1.0.0-rc.2`)
 *   names its phase explicitly — honor it verbatim.
 * - §4: "Major version zero (0.y.z) is for initial development. Anything
 *   MAY change at any time. The public API SHOULD NOT be considered
 *   stable." — every 0.x release is therefore an alpha unless the operator
 *   says otherwise.
 * - Everything else (>= 1.0.0, no suffix) is a stable release.
 *
 * The operator stays in command: an explicit override (`choice` other than
 * `'auto'`) wins over every detection rule, mirroring how `milestoneTag` is
 * "a call only the operator can make". The `prerelease` flag is what the
 * publish leg feeds `gh release create --prerelease` — GitHub then badges
 * the release "Pre-release" and never promotes it to "Latest", which is
 * exactly the honest public signal a 0.x alpha owes its visitors.
 */

/** The maturity phases a release can carry — GitHub's own vocabulary. */
export type ReleasePhase = 'alpha' | 'beta' | 'rc' | 'stable';

/** What the operator asks for: a concrete phase, or `'auto'` to let the
 *  version string decide. Omitted means `'auto'`. */
export type MaturityChoice = ReleasePhase | 'auto';

/** Why the phase came out the way it did — surfaced to the operator so the
 *  decision is auditable, never a silent guess. */
export interface ReleaseMaturity {
  readonly phase: ReleasePhase;
  /** `true` → the publish leg passes `--prerelease`; GitHub badges the
   *  release and keeps it off "Latest". */
  readonly prerelease: boolean;
  readonly source: 'override' | 'prerelease-suffix' | 'zero-major' | 'stable-version';
  readonly reasoning: string;
}

const PHASES: readonly ReleasePhase[] = ['alpha', 'beta', 'rc', 'stable'];

/** Type guard for {@link MaturityChoice} — the HTTP boundary's validator. */
export function isMaturityChoice(value: unknown): value is MaturityChoice {
  return value === 'auto' || PHASES.includes(value as ReleasePhase);
}

/**
 * Classifies `version` (a bare SemVer string, no leading `v`) into its
 * release phase. `choice` other than `'auto'` overrides detection entirely.
 * A malformed version degrades to alpha/prerelease — the honest floor: a
 * version we cannot read is nothing anyone should install as "Latest".
 */
export function releaseMaturityOf(
  version: string,
  choice: MaturityChoice = 'auto',
): ReleaseMaturity {
  if (choice !== 'auto') {
    return {
      phase: choice,
      prerelease: choice !== 'stable',
      source: 'override',
      reasoning: `operator override: ${choice}`,
    };
  }

  const match = /^(\d+)\.\d+\.\d+(?:-([0-9A-Za-z.-]+))?$/.exec(version);
  if (!match) {
    return {
      phase: 'alpha',
      prerelease: true,
      source: 'zero-major',
      reasoning: `unreadable version "${version}" — treated as pre-release, the honest floor`,
    };
  }

  const major = Number(match[1]);
  const suffix = match[2];
  if (suffix !== undefined) {
    const head = suffix.split('.')[0]!.toLowerCase();
    const phase: ReleasePhase = head === 'beta' ? 'beta' : head === 'rc' ? 'rc' : 'alpha';
    return {
      phase,
      prerelease: true,
      source: 'prerelease-suffix',
      reasoning: `SemVer pre-release suffix "-${suffix}" names the phase itself (SemVer 2.0.0 §9)`,
    };
  }
  if (major === 0) {
    return {
      phase: 'alpha',
      prerelease: true,
      source: 'zero-major',
      reasoning:
        'major version zero — SemVer 2.0.0 §4: initial development, anything may change; published as a pre-release, never "Latest"',
    };
  }
  return {
    phase: 'stable',
    prerelease: false,
    source: 'stable-version',
    reasoning: `>= 1.0.0 with no pre-release suffix — a stable release`,
  };
}
