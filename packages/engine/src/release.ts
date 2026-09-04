// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Release automation policy primitives (BACKLOG web-msnshavs-z0obmh, "Release
 * automation"). Pure Conventional-Commits → SemVer bump computation, the
 * CHANGELOG `[Unreleased]` → dated `[x.y.z]` section cut, `planRelease`
 * composing the two into one release-planning step, and `executeRelease`
 * composing `planRelease` with real writes + a git commit + tag — mirroring
 * how Landing EXECUTE's `executeLanding` (landing.ts) composes a gate run
 * with `GitVcs.land`. Annotated tag creation and the `git notes` attestation
 * both live on `GitVcs` (`adapters/git.ts`), since they need real git
 * plumbing, not a pure string transform. The CSRF-guarded HTTP endpoint
 * wiring `executeRelease` to real inputs already shipped (dashboard's
 * `release/execute.ts`). `docs/RELEASING.md`'s `m<N>` milestone tag is
 * mechanized as an optional `executeRelease` input (`MILESTONE_TAG_PATTERN`):
 * *whether* a release completes a milestone stays a human call (it depends
 * on DoD being met, not on commit subjects alone — see the changelog's own
 * v0.9.0 vs v0.10.0 split, where only the latter closed M3), but once a
 * human names one, tagging it at the same commit as the `v<semver>` tag is
 * pure plumbing.
 *
 * Only the commit *subject* line is available here (see `CommitRef` in
 * ports.ts) — a `BREAKING CHANGE:` footer in the commit body can't be
 * detected from that alone, so this only recognizes the `!` breaking marker
 * (`feat!:` / `feat(scope)!:`), which is the Conventional Commits spec's
 * other sanctioned way to flag a breaking change and is visible on the
 * subject line.
 */

const CONVENTIONAL_SUBJECT = /^([a-z]+)(\([^)]*\))?(!)?:\s/;

/** `docs/RELEASING.md`'s "Git tags" table: the human-friendly milestone
 *  marker (`m0`, `m1`, ...) — what a caller-supplied `executeRelease`
 *  milestone tag must match before it is trusted to name a real git tag. */
export const MILESTONE_TAG_PATTERN = /^m\d+$/;

export interface ParsedCommit {
  /** The Conventional Commits type (`feat`, `fix`, ...), or `null` when the subject doesn't match the convention. */
  readonly type: string | null;
  /** Whether the subject carries the `!` breaking-change marker. */
  readonly breaking: boolean;
}

export function parseConventionalCommit(subject: string): ParsedCommit {
  const match = CONVENTIONAL_SUBJECT.exec(subject);
  if (!match) return { type: null, breaking: false };
  return { type: match[1] ?? null, breaking: match[3] === '!' };
}

export type SemverBump = 'major' | 'minor' | 'patch' | 'none';

// Angular-preset release rules (the de facto Conventional Commits standard
// used by semantic-release/standard-version): only these types trigger a
// release on their own; anything else (docs/chore/refactor/test/ci/build/
// style/wip) is changelog-worthy at most, never version-worthy.
const PATCH_TYPES = new Set(['fix', 'perf', 'revert']);

/**
 * The highest-priority bump implied by a set of commit subjects (newest and
 * oldest order don't matter — every commit is inspected). A single breaking
 * marker anywhere in the set outranks every `feat`/`fix`; a single `feat`
 * outranks every patch-level commit. Non-conventional or changelog-only
 * subjects (docs, chore, ...) never contribute a bump.
 */
export function computeBump(subjects: readonly string[]): SemverBump {
  let bump: SemverBump = 'none';
  for (const subject of subjects) {
    const { type, breaking } = parseConventionalCommit(subject);
    if (breaking) return 'major'; // nothing outranks major — short-circuit
    if (type === 'feat') bump = 'minor';
    else if (
      bump !== 'minor' &&
      // Stryker disable next-line ConditionalExpression: narrows `type` from
      // `string | null` to `string` for `PATCH_TYPES.has` below — TypeScript
      // needs this, but at runtime `Set.has(null)` is already safely `false`,
      // so removing the check changes nothing observable. Provably
      // equivalent, not killable.
      type !== null &&
      PATCH_TYPES.has(type)
    )
      bump = 'patch';
  }
  return bump;
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * Applies a bump to a `major.minor.patch` version string. `'none'` returns
 * `current` unchanged (the caller's signal that nothing warrants a release).
 * Throws on a malformed `current` rather than guessing at a version — a
 * release is exactly the place NOT to silently paper over bad input.
 */
export function bumpVersion(current: string, bump: SemverBump): string {
  const match = SEMVER.exec(current);
  if (!match) throw new Error(`bumpVersion: "${current}" is not a "major.minor.patch" version`);
  const [, majorStr, minorStr, patchStr] = match;
  const major = Number(majorStr);
  const minor = Number(minorStr);
  const patch = Number(patchStr);
  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    case 'none':
      return current;
  }
}

const UNRELEASED_HEADING = /^## \[Unreleased\]$/m;

/**
 * The release-worthy commit subjects grouped into Keep-a-Changelog `###`
 * sections — feat → Added, fix → Fixed, perf → Performance; everything else
 * (docs/chore/test/refactor and the flight's own `docs(self-study)` refresh
 * noise) stays out, because a release note is for readers, not a raw log
 * (the raw log already rides the `git notes` attestation in full). Returns
 * `''` when nothing qualifies so callers can gate rather than emit empty
 * headings. Shared by the changelog cut AND the annotated tag body, so the
 * CHANGELOG section and the GitHub Release notes (`--notes-from-tag`) can
 * never tell two different stories.
 */
export function groupedReleaseNotes(subjects: readonly string[]): string {
  const sections: Array<[string, RegExp]> = [
    ['Added', /^feat[(!:]/],
    ['Fixed', /^fix[(!:]/],
    ['Performance', /^perf[(!:]/],
  ];
  const parts: string[] = [];
  for (const [title, pattern] of sections) {
    const matched = subjects.filter((subject) => pattern.test(subject));
    if (matched.length === 0) continue;
    parts.push(`### ${title}\n\n` + matched.map((subject) => `- ${subject}`).join('\n'));
  }
  return parts.join('\n\n');
}

/**
 * The annotated `v<semver>` tag's message: headline + {@link
 * groupedReleaseNotes} body. This is what `gh release create
 * --notes-from-tag` renders as the GitHub Release notes — the 2026-09-04
 * v0.22.0 release shipped with the bare "Release v0.22.0" headline and read
 * like a placeholder next to the hand-written genesis release; the body now
 * writes itself from the commits that earned the bump.
 */
export function buildReleaseTagMessage(
  version: string,
  bump: Exclude<SemverBump, 'none'>,
  date: string,
  subjects: readonly string[],
): string {
  const head = `Release v${version} (${bump}) — ${date}`;
  const body = groupedReleaseNotes(subjects);
  return body ? `${head}\n\n${body}` : head;
}

/**
 * `docs/RELEASING.md`'s release checklist step 3, mechanized: "promote
 * `[Unreleased]` → dated `[x.y.z]`". A pure string transform — inserts a new
 * `## [version] — date` heading directly under `## [Unreleased]`, which
 * demotes everything that was accruing under Unreleased to live under the
 * new dated heading instead, leaving Unreleased itself empty. Everything
 * before the Unreleased heading and every earlier `## [...]` section is
 * untouched. Throws when no `## [Unreleased]` heading is found rather than
 * silently no-op'ing — same "fail loud on malformed input" stance as
 * `bumpVersion`.
 *
 * `subjects` (optional, for compatibility with pre-existing callers): when
 * the Unreleased section has NO accrued hand-written content, the new dated
 * section is seeded from {@link groupedReleaseNotes} instead of being cut
 * empty — the v0.22.0 lesson, where an empty Unreleased produced a dated
 * heading with nothing under it. Hand-written Unreleased content always
 * wins untouched; the seed only ever fills silence.
 */
export function cutChangelogRelease(
  changelog: string,
  version: string,
  date: string,
  subjects?: readonly string[],
): string {
  const match = UNRELEASED_HEADING.exec(changelog);
  if (!match) {
    throw new Error('cutChangelogRelease: no "## [Unreleased]" heading found in the changelog');
  }
  const insertAt = match.index + match[0].length;
  const rest = changelog.slice(insertAt);
  const nextHeading = rest.search(/^## /m);
  const unreleasedBody = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
  const seed =
    subjects !== undefined && unreleasedBody.trim() === '' ? groupedReleaseNotes(subjects) : '';
  const section = seed
    ? `\n\n## [${version}] — ${date}\n\n${seed}`
    : `\n\n## [${version}] — ${date}`;
  return changelog.slice(0, insertAt) + section + rest;
}

/** A planned release: the bump that triggered it, the version it lands on, and the changelog already cut to match. */
export interface ReleasePlanned {
  readonly ok: true;
  readonly bump: Exclude<SemverBump, 'none'>;
  readonly version: string;
  readonly changelog: string;
}

/** No release is warranted — none of the given subjects imply a bump. */
export interface ReleasePlanSkipped {
  readonly ok: false;
  readonly reason: 'no-op';
  readonly details: string;
}

export type ReleasePlan = ReleasePlanned | ReleasePlanSkipped;

/**
 * Composes `computeBump` → `bumpVersion` → `cutChangelogRelease` into the one
 * release-planning step, the same way `executeLanding` (landing.ts) composes
 * `gate.run()` → `vcs.land()`: a pure policy function callers can unit-test
 * directly, ahead of the HTTP/adapter wiring that gathers the real inputs
 * (commit subjects since the last tag, the current `package.json` version,
 * `CHANGELOG.md`'s text) and, on `ok: true`, writes the result and creates
 * the `v<semver>` tag via `GitVcs.tag`. Refuses (`ok: false`) up front on a
 * `'none'` bump rather than cutting an empty release — same
 * fail-loud-on-nothing-to-do stance as `GitVcs.land`'s dirty-tree refusal.
 */
export function planRelease(
  currentVersion: string,
  changelog: string,
  subjects: readonly string[],
  date: string,
): ReleasePlan {
  const bump = computeBump(subjects);
  if (bump === 'none') {
    return {
      ok: false,
      reason: 'no-op',
      details: 'no release-worthy commits since the last release',
    };
  }
  const version = bumpVersion(currentVersion, bump);
  return {
    ok: true,
    bump,
    version,
    changelog: cutChangelogRelease(changelog, version, date, subjects),
  };
}

/** Outcome of {@link GitVcs.tag} — duplicated here (not imported) to keep this
 *  module free of an `adapters/git.js` dependency, same reasoning as
 *  `Landable` in landing.ts staying a minimal structural interface rather
 *  than importing `GitVcs` itself. */
export interface TagOutcome {
  readonly ok: boolean;
  readonly details: string;
}

/** Thrown by {@link executeRelease} when a caller-supplied milestone tag
 *  doesn't match {@link MILESTONE_TAG_PATTERN} — refused up front, before any
 *  write or git operation, same fail-loud-on-malformed-input stance as
 *  `bumpVersion`. A malformed milestone tag is an integration bug (the HTTP
 *  layer should validate before ever reaching here), not a normal refusal
 *  like a `'none'` bump or an already-existing tag. */
export class InvalidMilestoneTagError extends Error {
  constructor(milestoneTag: string) {
    super(`executeRelease: milestone tag "${milestoneTag}" does not match "m<N>" (e.g. "m4")`);
    this.name = 'InvalidMilestoneTagError';
  }
}

/** Minimal VCS capability `executeRelease` needs — implemented by `GitVcs`'s
 *  `commitAll` + `tag` + `notes` methods (adapters/git.ts). */
export interface Releasable {
  commitAll(message: string): Promise<void>;
  tag(name: string, message: string): Promise<TagOutcome>;
  notes(commitish: string, message: string): Promise<TagOutcome>;
}

/**
 * The `git notes` flight-log body attached to the release commit —
 * `docs/RELEASING.md`'s "Git notes" section, mechanized with what
 * `executeRelease` actually has on hand: the version/bump `planRelease`
 * computed and the commit subjects that earned it. The DoD-met record, gate
 * + coverage numbers, and review verdict `docs/RELEASING.md` also calls for
 * aren't threaded through this call yet — a caller with that data can extend
 * the message before it reaches `vcs.notes`, but honesty about what's
 * actually attested here matters more than a note that implies more rigor
 * than ran.
 */
export function buildReleaseAttestation(
  version: string,
  bump: Exclude<SemverBump, 'none'>,
  date: string,
  subjects: readonly string[],
): string {
  const lines = [
    `Release v${version} (${bump}) — ${date}`,
    `${subjects.length} commit${subjects.length === 1 ? '' : 's'} included:`,
    ...subjects.map((subject) => `- ${subject}`),
  ];
  return lines.join('\n');
}

/** Writes the two files a release touches — the real `package.json`/
 *  `CHANGELOG.md` on disk in production, an in-memory fake in tests. Kept
 *  separate from `Releasable` since one is a git operation and the other is a
 *  plain file write; a caller can fake either independently. */
export interface ReleaseWriter {
  writeVersion(version: string): Promise<void> | void;
  writeChangelog(changelog: string): Promise<void> | void;
}

/** Why one release-execute attempt succeeded or was refused. */
export type ReleaseExecuteReason = 'no-op' | 'tag-failed' | 'released';

export interface ReleaseExecuteResult {
  readonly ok: boolean;
  readonly reason: ReleaseExecuteReason;
  readonly details: string;
  /** The version this attempt landed on (or would have) — absent on a `'no-op'` refusal, since `planRelease` never computed one. */
  readonly version?: string;
  readonly bump?: Exclude<SemverBump, 'none'>;
  /** Outcome of attaching the `git notes` flight-log attestation to the release commit — present only when a tag was actually created, since there is nothing to attest to on a `'no-op'` or `'tag-failed'` result. A failed attestation does NOT flip the overall `ok`/`reason`: the release itself (commit + tag) already succeeded, so this surfaces as a visible, non-fatal degradation rather than an all-or-nothing failure. */
  readonly attestation?: TagOutcome;
  /** Outcome of creating the paired `m<N>` milestone tag at the same commit as `v<semver>` — present only when the caller passed a `milestoneTag` AND the version tag was actually created. Same non-fatal-degradation stance as `attestation`: a milestone tag failure (e.g. it already exists) never flips the overall `ok`/`reason`, since the release itself already succeeded. */
  readonly milestoneTag?: TagOutcome;
}

/**
 * Composes `planRelease` → write files → `commitAll` → `tag` → `notes` into
 * the one release-execute step, the same way `executeLanding` (landing.ts)
 * composes `gate.run()` → `vcs.land()`. Refuses up front (`reason: 'no-op'`,
 * touches nothing) on a `planRelease` refusal — same fail-loud-on-nothing-to-do
 * stance as `planRelease` itself. Writes the version + changelog and commits
 * them BEFORE tagging (the tag must point at the commit that actually carries
 * the bump), so a `'tag-failed'` result still means the commit landed — the
 * caller sees the real version/bump either way, not just on full success. The
 * `git notes` attestation is attempted only once the tag exists, and its
 * outcome rides along under `attestation` without affecting the overall
 * `ok`/`reason` — the release itself already succeeded by that point. A
 * caller-supplied `milestoneTag` (`docs/RELEASING.md`'s `m<N>` — a human
 * call, since only a human knows whether this release actually completes a
 * milestone's DoD) is tagged at the same HEAD right alongside it, and rides
 * along under `milestoneTag` the same non-fatal way `attestation` does.
 * Throws {@link InvalidMilestoneTagError} up front, before touching anything,
 * when `milestoneTag` doesn't match {@link MILESTONE_TAG_PATTERN} — the HTTP
 * layer is expected to validate first, so reaching here malformed is an
 * integration bug, not a normal refusal.
 */
export async function executeRelease(
  currentVersion: string,
  changelog: string,
  subjects: readonly string[],
  date: string,
  writer: ReleaseWriter,
  vcs: Releasable,
  milestoneTag?: string,
): Promise<ReleaseExecuteResult> {
  if (milestoneTag !== undefined && !MILESTONE_TAG_PATTERN.test(milestoneTag)) {
    throw new InvalidMilestoneTagError(milestoneTag);
  }

  const plan = planRelease(currentVersion, changelog, subjects, date);
  if (!plan.ok) {
    return { ok: false, reason: 'no-op', details: plan.details };
  }

  await writer.writeVersion(plan.version);
  await writer.writeChangelog(plan.changelog);
  await vcs.commitAll(`chore(release): v${plan.version}`);

  const tag = await vcs.tag(
    `v${plan.version}`,
    buildReleaseTagMessage(plan.version, plan.bump, date, subjects),
  );
  if (!tag.ok) {
    return {
      ok: false,
      reason: 'tag-failed',
      details: tag.details,
      version: plan.version,
      bump: plan.bump,
    };
  }

  const attestation = await vcs.notes(
    'HEAD',
    buildReleaseAttestation(plan.version, plan.bump, date, subjects),
  );

  const milestoneTagOutcome = milestoneTag
    ? await vcs.tag(milestoneTag, `Milestone ${milestoneTag} — v${plan.version}`)
    : undefined;

  return {
    ok: true,
    reason: 'released',
    details: `released v${plan.version} (${plan.bump})`,
    version: plan.version,
    bump: plan.bump,
    attestation,
    ...(milestoneTagOutcome !== undefined ? { milestoneTag: milestoneTagOutcome } : {}),
  };
}
