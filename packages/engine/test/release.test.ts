// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  parseConventionalCommit,
  computeBump,
  bumpVersion,
  cutChangelogRelease,
  groupedReleaseNotes,
  buildReleaseTagMessage,
  planRelease,
  executeRelease,
  InvalidMilestoneTagError,
  type Releasable,
  type ReleaseWriter,
  type TagOutcome,
} from '../src/release.js';

describe('parseConventionalCommit', () => {
  it('parses a plain type', () => {
    expect(parseConventionalCommit('feat: add the thing')).toEqual({
      type: 'feat',
      breaking: false,
    });
  });

  it('parses a scoped type', () => {
    expect(parseConventionalCommit('fix(dashboard): stop the crash')).toEqual({
      type: 'fix',
      breaking: false,
    });
  });

  it('detects a breaking-change marker before the colon, scoped or not', () => {
    expect(parseConventionalCommit('feat!: drop the old API')).toEqual({
      type: 'feat',
      breaking: true,
    });
    expect(parseConventionalCommit('feat(engine)!: drop the old API')).toEqual({
      type: 'feat',
      breaking: true,
    });
  });

  it('returns a null type for a subject with no conventional-commit prefix', () => {
    expect(parseConventionalCommit('wip checkpoint')).toEqual({ type: null, breaking: false });
    expect(parseConventionalCommit('')).toEqual({ type: null, breaking: false });
  });

  it('rejects a type that is not anchored at the very start of the subject', () => {
    expect(parseConventionalCommit('x feat: add the thing')).toEqual({
      type: null,
      breaking: false,
    });
  });
});

describe('computeBump', () => {
  it('returns "none" for an empty commit list', () => {
    expect(computeBump([])).toBe('none');
  });

  it('returns "none" when nothing present bumps the version (docs/chore/test/etc)', () => {
    expect(computeBump(['docs: fix a typo', 'chore: bump a dep', 'test: cover an edge case'])).toBe(
      'none',
    );
  });

  it('returns "patch" for fix/perf/revert commits', () => {
    expect(computeBump(['fix: null pointer'])).toBe('patch');
    expect(computeBump(['perf: speed up the gate'])).toBe('patch');
    expect(computeBump(['revert: revert "feat: bad idea"'])).toBe('patch');
  });

  it('returns "minor" for a feat commit, outranking a patch-level commit in the same set', () => {
    expect(computeBump(['fix: a bug', 'feat: a new capability'])).toBe('minor');
  });

  it('returns "major" when any commit carries a breaking-change marker, outranking feat/fix', () => {
    expect(computeBump(['feat: a new capability', 'feat!: breaking change', 'fix: a bug'])).toBe(
      'major',
    );
  });

  it('ignores unconventional subjects mixed in with real ones', () => {
    expect(computeBump(['wip checkpoint', 'feat: a new capability'])).toBe('minor');
  });

  it('does not let a later patch-level commit downgrade an already-earned minor bump', () => {
    expect(computeBump(['feat: a new capability', 'fix: a bug'])).toBe('minor');
  });
});

describe('bumpVersion', () => {
  it('bumps major, resetting minor and patch to 0', () => {
    expect(bumpVersion('0.12.3', 'major')).toBe('1.0.0');
  });

  it('bumps minor, resetting patch to 0 and preserving major', () => {
    expect(bumpVersion('0.12.3', 'minor')).toBe('0.13.0');
  });

  it('bumps patch, preserving major and minor', () => {
    expect(bumpVersion('0.12.3', 'patch')).toBe('0.12.4');
  });

  it('returns the current version unchanged for "none"', () => {
    expect(bumpVersion('0.12.3', 'none')).toBe('0.12.3');
  });

  it('throws on a malformed current version rather than silently guessing', () => {
    expect(() => bumpVersion('not-a-version', 'patch')).toThrow(
      'bumpVersion: "not-a-version" is not a "major.minor.patch" version',
    );
    expect(() => bumpVersion('1.2', 'patch')).toThrow(
      'bumpVersion: "1.2" is not a "major.minor.patch" version',
    );
  });

  it('handles multi-digit major and patch numbers, not just multi-digit minor', () => {
    expect(bumpVersion('12.5.34', 'patch')).toBe('12.5.35');
  });

  it('rejects a version with leading or trailing text around the digits', () => {
    expect(() => bumpVersion('x1.2.3', 'patch')).toThrow(
      'bumpVersion: "x1.2.3" is not a "major.minor.patch" version',
    );
    expect(() => bumpVersion('1.2.3-beta', 'patch')).toThrow(
      'bumpVersion: "1.2.3-beta" is not a "major.minor.patch" version',
    );
  });
});

describe('groupedReleaseNotes', () => {
  it('groups feat/fix/perf into Added/Fixed/Performance and drops everything else', () => {
    const notes = groupedReleaseNotes([
      'feat(a): one',
      'fix: two',
      'perf(b): three',
      'docs(self-study): flight-end automated data refresh',
      'chore: noise',
    ]);
    expect(notes).toBe(
      '### Added\n\n- feat(a): one\n\n### Fixed\n\n- fix: two\n\n### Performance\n\n- perf(b): three',
    );
  });

  it('returns an empty string when nothing qualifies, so callers can gate', () => {
    expect(groupedReleaseNotes(['docs: only', 'chore: noise'])).toBe('');
  });
});

describe('buildReleaseTagMessage', () => {
  it('writes the headline plus the grouped body — the "Release v0.22.0" placeholder-notes lesson', () => {
    expect(buildReleaseTagMessage('0.22.0', 'minor', '2026-09-04', ['feat: shine'])).toBe(
      'Release v0.22.0 (minor) — 2026-09-04\n\n### Added\n\n- feat: shine',
    );
  });

  it('falls back to the bare headline when no subject qualifies for the body', () => {
    expect(buildReleaseTagMessage('0.22.1', 'patch', '2026-09-04', [])).toBe(
      'Release v0.22.1 (patch) — 2026-09-04',
    );
  });
});

describe('cutChangelogRelease', () => {
  it('seeds an EMPTY Unreleased section from the grouped subjects instead of cutting a bare heading (the empty-[0.22.0]-section lesson)', () => {
    const empty = '# Changelog\n\n## [Unreleased]\n\n## [0.1.0] — 2026-08-01\n\n- old\n';
    const cut = cutChangelogRelease(empty, '0.2.0', '2026-09-04', ['feat: shine', 'fix: patch']);
    expect(cut).toContain(
      '## [0.2.0] — 2026-09-04\n\n### Added\n\n- feat: shine\n\n### Fixed\n\n- fix: patch',
    );
    expect(cut).toContain('## [Unreleased]');
    expect(cut).toContain('## [0.1.0] — 2026-08-01');
  });

  it('never seeds over hand-written Unreleased content — the human words win untouched', () => {
    const written =
      '# Changelog\n\n## [Unreleased]\n\n- hand-written note\n\n## [0.1.0] — 2026-08-01\n';
    const cut = cutChangelogRelease(written, '0.2.0', '2026-09-04', ['feat: shine']);
    expect(cut).toContain('## [0.2.0] — 2026-09-04\n\n- hand-written note');
    expect(cut).not.toContain('### Added');
  });

  const changelog = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '- **A new thing.** Details about it.',
    '- **Another thing.** More details.',
    '',
    '## [0.12.0] — 2026-08-11 — the self-governing era',
    '',
    '### Added',
    '',
    '- old entry',
    '',
  ].join('\n');

  it('promotes the Unreleased content under a new dated version heading, leaving Unreleased empty', () => {
    const result = cutChangelogRelease(changelog, '0.13.0', '2026-08-12');
    expect(result).toBe(
      [
        '# Changelog',
        '',
        '## [Unreleased]',
        '',
        '## [0.13.0] — 2026-08-12',
        '',
        '- **A new thing.** Details about it.',
        '- **Another thing.** More details.',
        '',
        '## [0.12.0] — 2026-08-11 — the self-governing era',
        '',
        '### Added',
        '',
        '- old entry',
        '',
      ].join('\n'),
    );
  });

  it('leaves content before Unreleased and prior release sections untouched', () => {
    const result = cutChangelogRelease(changelog, '0.13.0', '2026-08-12');
    expect(result).toContain('# Changelog');
    expect(result).toContain(
      '## [0.12.0] — 2026-08-11 — the self-governing era\n\n### Added\n\n- old entry',
    );
  });

  it('throws when the changelog has no "## [Unreleased]" heading', () => {
    expect(() =>
      cutChangelogRelease('# Changelog\n\n## [0.12.0]\n', '0.13.0', '2026-08-12'),
    ).toThrow('cutChangelogRelease: no "## [Unreleased]" heading found in the changelog');
  });

  it('ignores a line that only mentions the heading text without starting the line with it', () => {
    // "possible ## [Unreleased]" ends the line the same way the real heading
    // does, but isn't the FIRST thing on it — must not be mistaken for the
    // real heading three lines down.
    const result = cutChangelogRelease(
      'possible ## [Unreleased]\n\n## [Unreleased]\n\n- entry\n',
      '0.13.0',
      '2026-08-12',
    );
    expect(result).toBe(
      'possible ## [Unreleased]\n\n## [Unreleased]\n\n## [0.13.0] — 2026-08-12\n\n- entry\n',
    );
  });

  it('ignores a line that starts with the heading text but has trailing content after it', () => {
    // "## [Unreleased] extra" starts the line the same way the real heading
    // does, but doesn't END the line there — must not be mistaken for the
    // real heading three lines down.
    const result = cutChangelogRelease(
      '## [Unreleased] extra\n\n## [Unreleased]\n\n- entry\n',
      '0.13.0',
      '2026-08-12',
    );
    expect(result).toBe(
      '## [Unreleased] extra\n\n## [Unreleased]\n\n## [0.13.0] — 2026-08-12\n\n- entry\n',
    );
  });
});

describe('planRelease', () => {
  const changelog = ['# Changelog', '', '## [Unreleased]', '', '- entry', ''].join('\n');

  it('plans a release when the subjects imply a bump, cutting the changelog at the new version', () => {
    const plan = planRelease('0.12.3', changelog, ['fix: a bug', 'feat: a thing'], '2026-08-12');
    expect(plan).toEqual({
      ok: true,
      bump: 'minor',
      version: '0.13.0',
      changelog: cutChangelogRelease(changelog, '0.13.0', '2026-08-12'),
    });
  });

  it('refuses when no subject warrants a bump, touching neither version nor changelog', () => {
    const plan = planRelease(
      '0.12.3',
      changelog,
      ['docs: fix a typo', 'chore: bump a dep'],
      '2026-08-12',
    );
    expect(plan).toEqual({
      ok: false,
      reason: 'no-op',
      details: 'no release-worthy commits since the last release',
    });
  });

  it('refuses the same way for an empty commit list', () => {
    const plan = planRelease('0.12.3', changelog, [], '2026-08-12');
    expect(plan.ok).toBe(false);
  });

  it('propagates a major bump through to the planned version', () => {
    const plan = planRelease('0.12.3', changelog, ['feat!: breaking change'], '2026-08-12');
    expect(plan).toEqual({
      ok: true,
      bump: 'major',
      version: '1.0.0',
      changelog: cutChangelogRelease(changelog, '1.0.0', '2026-08-12'),
    });
  });
});

function fakeWriter(): { writer: ReleaseWriter; versions: string[]; changelogs: string[] } {
  const versions: string[] = [];
  const changelogs: string[] = [];
  return {
    writer: {
      writeVersion: (version) => {
        versions.push(version);
      },
      writeChangelog: (cl) => {
        changelogs.push(cl);
      },
    },
    versions,
    changelogs,
  };
}

function fakeVcs(
  tagResult: TagOutcome,
  notesResult: TagOutcome = { ok: true, details: 'attached a note' },
  milestoneTagResult: TagOutcome = tagResult,
): {
  vcs: Releasable;
  commitCalls: string[];
  tagCalls: Array<[string, string]>;
  notesCalls: Array<[string, string]>;
} {
  const commitCalls: string[] = [];
  const tagCalls: Array<[string, string]> = [];
  const notesCalls: Array<[string, string]> = [];
  return {
    vcs: {
      commitAll: (message) => {
        commitCalls.push(message);
        return Promise.resolve();
      },
      tag: (name, message) => {
        tagCalls.push([name, message]);
        // The `v<semver>` release tag and the `m<N>` milestone tag can carry
        // independent outcomes (e.g. the milestone tag already exists even
        // though the release tag is brand new) — distinguish by prefix so
        // callers can exercise that split without a second fake.
        return Promise.resolve(name.startsWith('v') ? tagResult : milestoneTagResult);
      },
      notes: (commitish, message) => {
        notesCalls.push([commitish, message]);
        return Promise.resolve(notesResult);
      },
    },
    commitCalls,
    tagCalls,
    notesCalls,
  };
}

describe('executeRelease', () => {
  const changelog = ['# Changelog', '', '## [Unreleased]', '', '- entry', ''].join('\n');

  it('refuses with reason "no-op" and touches neither files nor git when no bump is warranted', async () => {
    const { writer, versions, changelogs } = fakeWriter();
    const { vcs, commitCalls, tagCalls, notesCalls } = fakeVcs({ ok: true, details: 'created' });

    const result = await executeRelease(
      '0.12.3',
      changelog,
      ['docs: fix a typo'],
      '2026-08-12',
      writer,
      vcs,
    );

    expect(result).toEqual({
      ok: false,
      reason: 'no-op',
      details: 'no release-worthy commits since the last release',
    });
    expect(versions).toHaveLength(0);
    expect(changelogs).toHaveLength(0);
    expect(commitCalls).toHaveLength(0);
    expect(tagCalls).toHaveLength(0);
    expect(notesCalls).toHaveLength(0);
  });

  it('writes the version + changelog, commits, tags, and attests on a release-worthy commit set', async () => {
    const { writer, versions, changelogs } = fakeWriter();
    const { vcs, commitCalls, tagCalls, notesCalls } = fakeVcs({
      ok: true,
      details: "created annotated tag 'v0.13.0' at HEAD",
    });

    const result = await executeRelease(
      '0.12.3',
      changelog,
      ['feat: a thing'],
      '2026-08-12',
      writer,
      vcs,
    );

    expect(result).toEqual({
      ok: true,
      reason: 'released',
      details: 'released v0.13.0 (minor)',
      version: '0.13.0',
      bump: 'minor',
      attestation: { ok: true, details: 'attached a note' },
    });
    expect(versions).toEqual(['0.13.0']);
    expect(changelogs).toEqual([
      cutChangelogRelease(changelog, '0.13.0', '2026-08-12', ['feat: a thing']),
    ]);
    expect(commitCalls).toEqual(['chore(release): v0.13.0']);
    expect(tagCalls).toEqual([
      ['v0.13.0', 'Release v0.13.0 (minor) — 2026-08-12\n\n### Added\n\n- feat: a thing'],
    ]);
    expect(notesCalls).toEqual([
      ['HEAD', 'Release v0.13.0 (minor) — 2026-08-12\n1 commit included:\n- feat: a thing'],
    ]);
  });

  it('reports a successful release even when the attestation fails to attach', async () => {
    const { writer } = fakeWriter();
    const { vcs } = fakeVcs(
      { ok: true, details: "created annotated tag 'v0.13.0' at HEAD" },
      { ok: false, details: "a note already exists on 'HEAD'" },
    );

    const result = await executeRelease(
      '0.12.3',
      changelog,
      ['feat: a thing'],
      '2026-08-12',
      writer,
      vcs,
    );

    expect(result.ok).toBe(true);
    expect(result.reason).toBe('released');
    expect(result.attestation).toEqual({ ok: false, details: "a note already exists on 'HEAD'" });
  });

  it('writes and commits BEFORE tagging, so a tag failure still reports the real version/bump', async () => {
    const { writer } = fakeWriter();
    const { vcs, commitCalls, notesCalls } = fakeVcs({
      ok: false,
      details: "tag 'v0.13.0' already exists",
    });

    const result = await executeRelease(
      '0.12.3',
      changelog,
      ['feat: a thing'],
      '2026-08-12',
      writer,
      vcs,
    );

    expect(result).toEqual({
      ok: false,
      reason: 'tag-failed',
      details: "tag 'v0.13.0' already exists",
      version: '0.13.0',
      bump: 'minor',
    });
    // the commit still landed even though the tag failed
    expect(commitCalls).toEqual(['chore(release): v0.13.0']);
    // no tag means nothing to attest to yet
    expect(notesCalls).toHaveLength(0);
  });

  it('pluralizes the attestation commit count for more than one subject', async () => {
    const { writer } = fakeWriter();
    const { vcs, notesCalls } = fakeVcs({ ok: true, details: 'created' });

    await executeRelease(
      '0.12.3',
      changelog,
      ['fix: a bug', 'feat: a thing'],
      '2026-08-12',
      writer,
      vcs,
    );

    expect(notesCalls).toEqual([
      [
        'HEAD',
        'Release v0.13.0 (minor) — 2026-08-12\n2 commits included:\n- fix: a bug\n- feat: a thing',
      ],
    ]);
  });

  it('propagates a major bump message end to end', async () => {
    const { writer } = fakeWriter();
    const { vcs } = fakeVcs({ ok: true, details: 'created' });

    const result = await executeRelease(
      '0.12.3',
      changelog,
      ['feat!: breaking change'],
      '2026-08-12',
      writer,
      vcs,
    );

    expect(result.ok).toBe(true);
    expect(result.version).toBe('1.0.0');
    expect(result.bump).toBe('major');
  });

  it('does not create a milestone tag when none is given', async () => {
    const { writer } = fakeWriter();
    const { vcs, tagCalls } = fakeVcs({ ok: true, details: 'created' });

    const result = await executeRelease(
      '0.12.3',
      changelog,
      ['feat: a thing'],
      '2026-08-12',
      writer,
      vcs,
    );

    expect(result.milestoneTag).toBeUndefined();
    // The KEY must be absent, not merely `undefined` — `{ milestoneTag:
    // undefined }` would serialize differently and lie to `'milestoneTag' in`.
    expect(result).not.toHaveProperty('milestoneTag');
    expect(tagCalls).toEqual([
      ['v0.13.0', 'Release v0.13.0 (minor) — 2026-08-12\n\n### Added\n\n- feat: a thing'],
    ]);
  });

  it('tags the milestone at the same HEAD as the version tag when one is given', async () => {
    const { writer } = fakeWriter();
    const { vcs, tagCalls } = fakeVcs({ ok: true, details: 'created' });

    const result = await executeRelease(
      '0.12.3',
      changelog,
      ['feat: a thing'],
      '2026-08-12',
      writer,
      vcs,
      'm4',
    );

    expect(result.ok).toBe(true);
    expect(result.milestoneTag).toEqual({ ok: true, details: 'created' });
    expect(tagCalls).toEqual([
      ['v0.13.0', 'Release v0.13.0 (minor) — 2026-08-12\n\n### Added\n\n- feat: a thing'],
      ['m4', 'Milestone m4 — v0.13.0'],
    ]);
  });

  it('reports a successful release even when the milestone tag fails to attach', async () => {
    const { writer } = fakeWriter();
    const { vcs } = fakeVcs(
      { ok: true, details: "created annotated tag 'v0.13.0' at HEAD" },
      undefined,
      { ok: false, details: "tag 'm4' already exists" },
    );

    const result = await executeRelease(
      '0.12.3',
      changelog,
      ['feat: a thing'],
      '2026-08-12',
      writer,
      vcs,
      'm4',
    );

    expect(result.ok).toBe(true);
    expect(result.reason).toBe('released');
    expect(result.milestoneTag).toEqual({ ok: false, details: "tag 'm4' already exists" });
  });

  it('does not attempt the milestone tag when the version tag itself fails', async () => {
    const { writer } = fakeWriter();
    const { vcs, tagCalls } = fakeVcs({ ok: false, details: "tag 'v0.13.0' already exists" });

    const result = await executeRelease(
      '0.12.3',
      changelog,
      ['feat: a thing'],
      '2026-08-12',
      writer,
      vcs,
      'm4',
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('tag-failed');
    expect(tagCalls).toEqual([
      ['v0.13.0', 'Release v0.13.0 (minor) — 2026-08-12\n\n### Added\n\n- feat: a thing'],
    ]);
  });

  it('throws InvalidMilestoneTagError up front on a malformed milestone tag, touching nothing', async () => {
    const { writer, versions } = fakeWriter();
    const { vcs, commitCalls, tagCalls, notesCalls } = fakeVcs({ ok: true, details: 'created' });

    const error: unknown = await executeRelease(
      '0.12.3',
      changelog,
      ['feat: a thing'],
      '2026-08-12',
      writer,
      vcs,
      'milestone-4',
    ).then(
      () => null,
      (e: unknown) => e,
    );

    // Class, name, AND message — the message is operator-facing (it reaches
    // the HTTP 400 body), so its content is behavior, not decoration.
    expect(error).toBeInstanceOf(InvalidMilestoneTagError);
    expect((error as Error).name).toBe('InvalidMilestoneTagError');
    expect((error as Error).message).toContain('"milestone-4"');
    expect((error as Error).message).toContain('does not match "m<N>"');

    expect(versions).toHaveLength(0);
    expect(commitCalls).toHaveLength(0);
    expect(tagCalls).toHaveLength(0);
    expect(notesCalls).toHaveLength(0);
  });

  it('accepts a multi-digit milestone tag (m10 — the pattern is m<N>, not m<digit>)', async () => {
    const { writer } = fakeWriter();
    const { vcs, tagCalls } = fakeVcs({ ok: true, details: 'created' });

    const result = await executeRelease(
      '0.12.3',
      changelog,
      ['feat: a thing'],
      '2026-08-12',
      writer,
      vcs,
      'm10',
    );

    expect(result.ok).toBe(true);
    expect(tagCalls).toEqual([
      ['v0.13.0', 'Release v0.13.0 (minor) — 2026-08-12\n\n### Added\n\n- feat: a thing'],
      ['m10', 'Milestone m10 — v0.13.0'],
    ]);
  });

  it('rejects near-miss milestone shapes — the pattern is anchored at BOTH ends', async () => {
    // `m4x` passes an unanchored-end pattern, `am4` an unanchored-start one —
    // each shape pins one anchor of MILESTONE_TAG_PATTERN.
    for (const bad of ['m4x', 'am4']) {
      const { writer } = fakeWriter();
      const { vcs, tagCalls } = fakeVcs({ ok: true, details: 'created' });
      await expect(
        executeRelease('0.12.3', changelog, ['feat: a thing'], '2026-08-12', writer, vcs, bad),
      ).rejects.toThrow(InvalidMilestoneTagError);
      expect(tagCalls).toHaveLength(0);
    }
  });
});
