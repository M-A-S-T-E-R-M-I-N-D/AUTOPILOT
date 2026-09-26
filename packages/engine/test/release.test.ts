// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  parseConventionalCommit,
  computeBump,
  bumpVersion,
  cutChangelogRelease,
  unreleasedBody,
  unreleasedGaps,
  releaseWorthySubjects,
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

  it('returns "minor" for a feat commit, outranking a patch-level commit in the same set — once the batch is not small', () => {
    // SMALL RELEASE (2026-09-14): under the threshold a feat batch is a sub-update.
    expect(computeBump(['fix: a bug', 'feat: a new capability'])).toBe('patch');
    expect(computeBump(['fix: a bug', 'feat: a new capability'], 1)).toBe('minor');
    const eight = [
      'feat: one',
      'fix: two',
      'feat: three',
      'perf: four',
      'feat: five',
      'fix: six',
      'feat: seven',
      'feat: eight',
    ];
    expect(computeBump(eight)).toBe('minor');
    expect(computeBump(eight.slice(0, 7))).toBe('patch');
    // Non-release-worthy subjects do not count toward the batch size.
    expect(computeBump([...eight.slice(0, 7), 'docs: notes', 'chore: deps', 'test: more'])).toBe(
      'patch',
    );
  });

  it('returns "major" when any commit carries a breaking-change marker, outranking feat/fix', () => {
    expect(computeBump(['feat: a new capability', 'feat!: breaking change', 'fix: a bug'])).toBe(
      'major',
    );
  });

  it('ignores unconventional subjects mixed in with real ones', () => {
    expect(computeBump(['wip checkpoint', 'feat: a new capability'], 1)).toBe('minor');
  });

  it('does not let a later patch-level commit downgrade an already-earned minor bump', () => {
    expect(computeBump(['feat: a new capability', 'fix: a bug'], 1)).toBe('minor');
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

  it('matches the type only at the START of the subject', () => {
    // Every section pattern is anchored. Unanchored, a subject merely
    // MENTIONING another type would be filed under it — a docs commit about
    // the feat workflow would appear in Added as though something shipped.
    expect(
      groupedReleaseNotes([
        'docs: explain how feat: and fix: subjects are grouped',
        'chore: tidy the perf: notes',
      ]),
    ).toBe('');
  });

  it('puts each entry of a section on its own line', () => {
    // The joiner is the only thing separating two bullets. Emptied, the whole
    // section collapses onto one line and the CHANGELOG stops being a list.
    const notes = groupedReleaseNotes(['feat: one', 'feat: two']);
    expect(notes.split('\n')).toEqual(['### Added', '', '- feat: one', '- feat: two']);
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

  // The "is the Unreleased section empty?" decision is the ONLY thing the body
  // extraction feeds, so a test only discriminates if it makes that decision
  // flip. Each fixture below is built to do exactly that.
  it('reads the section to the end when no heading follows Unreleased', () => {
    // No later heading, so the search returns -1 and the WHOLE remainder is the
    // section. The body here is one non-whitespace character at the very end:
    // slicing it off — which both the always-slice and the -1/+1 mutants do —
    // leaves whitespace, so an already-written section would be treated as
    // empty and seeded over. Content written by hand would be joined by
    // generated notes it never asked for.
    const tail = ['# Changelog', '', '## [Unreleased]', '', '  x'].join('\n');
    const cut = cutChangelogRelease(tail, '0.2.0', '2026-09-04', ['feat: shine']);
    expect(cut).toContain('## [0.2.0] — 2026-09-04');
    expect(cut).not.toContain('### Added');
    expect(cut).toContain('  x');
  });

  it('finds the next section only at a LINE start, never mid-line', () => {
    // The search is anchored per line. Unanchored, an INDENTED "## " — prose
    // quoting a heading, which this changelog does — is mistaken for the end of
    // the Unreleased section. Everything before it here is whitespace, so the
    // section would read as empty and get seeded with generated notes on top of
    // the operator's own words.
    const quoting = [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '   ## looks like a heading but is indented',
      '',
      '## [0.1.0] — 2026-08-01',
      '',
    ].join('\n');
    const cut = cutChangelogRelease(quoting, '0.2.0', '2026-09-04', ['feat: shine']);
    expect(cut).not.toContain('### Added');
    expect(cut).toContain('   ## looks like a heading but is indented');
  });

  it('cuts a bare heading when the section is empty AND no subjects were supplied', () => {
    // Both halves of the seed guard have to hold. With the `subjects` half
    // removed, this exact call — empty section, no subjects — reaches
    // groupedReleaseNotes(undefined) and throws on a release that should
    // simply produce an empty dated heading. Every other fixture supplies
    // subjects, has a non-empty body, or both, so none of them reach it.
    const empty = ['# Changelog', '', '## [Unreleased]', '', '## [0.1.0] — 2026-08-01', ''].join(
      '\n',
    );
    const cut = cutChangelogRelease(empty, '0.2.0', '2026-09-04');
    expect(cut).toContain('## [0.2.0] — 2026-09-04');
    expect(cut).not.toContain('### Added');
    expect(cut).toContain('## [0.1.0] — 2026-08-01');
  });

  it('writes a bare dated heading — with no trailing blank lines — when there is nothing to seed', () => {
    // The seeded and unseeded headings differ only by the two newlines and the
    // notes that follow. Always taking the seeded shape appends a blank run to
    // every release that had nothing to seed.
    const written = ['# Changelog', '', '## [Unreleased]', '', '- a note', ''].join('\n');
    const cut = cutChangelogRelease(written, '0.2.0', '2026-09-04', ['feat: shine']);
    expect(cut).toContain('## [0.2.0] — 2026-09-04\n\n- a note');
    expect(cut).not.toContain('## [0.2.0] — 2026-09-04\n\n\n');
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
      bump: 'patch',
      version: '0.12.4',
      changelog: cutChangelogRelease(changelog, '0.12.4', '2026-08-12', [
        'fix: a bug',
        'feat: a thing',
      ]),
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
      changelog: cutChangelogRelease(changelog, '1.0.0', '2026-08-12', ['feat!: breaking change']),
    });
  });
});

const FAKE_WRITER_PATHS = ['package.json', 'CHANGELOG.md'];

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
      paths: () => FAKE_WRITER_PATHS,
    },
    versions,
    changelogs,
  };
}

const UNSIGNED: TagOutcome = { ok: false, details: 'tag is not signed' };

function fakeVcs(
  tagResult: TagOutcome,
  notesResult: TagOutcome = { ok: true, details: 'attached a note' },
  milestoneTagResult: TagOutcome = tagResult,
  verifyTagResult: TagOutcome = UNSIGNED,
): {
  vcs: Releasable;
  commitCalls: string[];
  commitPathsCalls: Array<readonly string[]>;
  tagCalls: Array<[string, string]>;
  notesCalls: Array<[string, string]>;
  verifyTagCalls: string[];
} {
  const commitCalls: string[] = [];
  const commitPathsCalls: Array<readonly string[]> = [];
  const tagCalls: Array<[string, string]> = [];
  const notesCalls: Array<[string, string]> = [];
  const verifyTagCalls: string[] = [];
  return {
    vcs: {
      commitPaths: (paths, message) => {
        commitPathsCalls.push(paths);
        commitCalls.push(message);
        return Promise.resolve(true);
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
      verifyTag: (name) => {
        verifyTagCalls.push(name);
        return Promise.resolve(verifyTagResult);
      },
    },
    commitCalls,
    commitPathsCalls,
    tagCalls,
    notesCalls,
    verifyTagCalls,
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
    const { vcs, commitCalls, commitPathsCalls, tagCalls, notesCalls } = fakeVcs({
      ok: true,
      details: "created annotated tag 'v0.12.4' at HEAD",
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
      details: 'released v0.12.4 (patch)',
      version: '0.12.4',
      bump: 'patch',
      attestation: { ok: true, details: 'attached a note' },
      signature: UNSIGNED,
    });
    expect(versions).toEqual(['0.12.4']);
    expect(changelogs).toEqual([
      cutChangelogRelease(changelog, '0.12.4', '2026-08-12', ['feat: a thing']),
    ]);
    expect(commitCalls).toEqual(['chore(release): v0.12.4']);
    // the release commit must stay scoped to exactly what the writer touched,
    // never a whole-tree sweep — see release.ts's Releasable doc comment.
    expect(commitPathsCalls).toEqual([FAKE_WRITER_PATHS]);
    expect(tagCalls).toEqual([
      ['v0.12.4', 'Release v0.12.4 (patch) — 2026-08-12\n\n### Added\n\n- feat: a thing'],
    ]);
    expect(notesCalls).toEqual([
      ['HEAD', 'Release v0.12.4 (patch) — 2026-08-12\n1 commit included:\n- feat: a thing'],
    ]);
  });

  it('reports a successful release even when the attestation fails to attach', async () => {
    const { writer } = fakeWriter();
    const { vcs } = fakeVcs(
      { ok: true, details: "created annotated tag 'v0.12.4' at HEAD" },
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
    const { vcs, commitCalls, notesCalls, verifyTagCalls } = fakeVcs({
      ok: false,
      details: "tag 'v0.12.4' already exists",
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
      details: "tag 'v0.12.4' already exists",
      version: '0.12.4',
      bump: 'patch',
    });
    // the commit still landed even though the tag failed
    expect(commitCalls).toEqual(['chore(release): v0.12.4']);
    // no tag means nothing to attest to yet
    expect(notesCalls).toHaveLength(0);
    // ...and no signature to verify either — the key must be absent, not
    // merely `undefined`, same as `milestoneTag` below.
    expect(verifyTagCalls).toHaveLength(0);
    expect(result).not.toHaveProperty('signature');
  });

  it("verifies the new version tag's signature and reports it under `signature` (board web-mtq0rtub-jxpptv, FOUNDATION 3/3 — the ritual verifies, it never assumes)", async () => {
    const { writer } = fakeWriter();
    const { vcs, verifyTagCalls } = fakeVcs(
      { ok: true, details: 'created' },
      undefined,
      undefined,
      { ok: true, details: "tag 'v0.12.4' is signed by 1234567890ABCDEF1234567890ABCDEF12345678" },
    );

    const result = await executeRelease(
      '0.12.3',
      changelog,
      ['feat: a thing'],
      '2026-08-12',
      writer,
      vcs,
    );

    expect(verifyTagCalls).toEqual(['v0.12.4']);
    expect(result.ok).toBe(true);
    expect(result.signature).toEqual({
      ok: true,
      details: "tag 'v0.12.4' is signed by 1234567890ABCDEF1234567890ABCDEF12345678",
    });
  });

  it('an unsigned or unverifiable tag rides along as a non-fatal `signature` note — the release itself already succeeded', async () => {
    const { writer } = fakeWriter();
    const { vcs } = fakeVcs({ ok: true, details: 'created' }, undefined, undefined, {
      ok: false,
      details: "tag 'v0.12.4' is not signed (git config tag.gpgSign true signs the next one)",
    });

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
    expect(result.signature).toEqual({
      ok: false,
      details: "tag 'v0.12.4' is not signed (git config tag.gpgSign true signs the next one)",
    });
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
        'Release v0.12.4 (patch) — 2026-08-12\n2 commits included:\n- fix: a bug\n- feat: a thing',
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
      ['v0.12.4', 'Release v0.12.4 (patch) — 2026-08-12\n\n### Added\n\n- feat: a thing'],
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
      ['v0.12.4', 'Release v0.12.4 (patch) — 2026-08-12\n\n### Added\n\n- feat: a thing'],
      ['m4', 'Milestone m4 — v0.12.4'],
    ]);
  });

  it('reports a successful release even when the milestone tag fails to attach', async () => {
    const { writer } = fakeWriter();
    const { vcs } = fakeVcs(
      { ok: true, details: "created annotated tag 'v0.12.4' at HEAD" },
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
    const { vcs, tagCalls } = fakeVcs({ ok: false, details: "tag 'v0.12.4' already exists" });

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
      ['v0.12.4', 'Release v0.12.4 (patch) — 2026-08-12\n\n### Added\n\n- feat: a thing'],
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
      ['v0.12.4', 'Release v0.12.4 (patch) — 2026-08-12\n\n### Added\n\n- feat: a thing'],
      ['m10', 'Milestone m10 — v0.12.4'],
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

/**
 * A SECTION WRITTEN ONCE AND LEFT BEHIND (2026-09-21). `cutChangelogRelease`
 * seeds a section only when Unreleased is EMPTY, because hand-written content
 * always wins untouched — the v0.22.0 lesson. That law has a hole v0.22.0 did
 * not cover: two bullets are not silence, so no seed fires, and a release came
 * one step from publishing two lines for ninety-nine commits. The seed fills
 * total silence; this fills partial silence.
 */
describe('unreleasedBody', () => {
  it('returns the text between the Unreleased heading and the next section', () => {
    const changelog = ['## [Unreleased]', '', '- a bullet', '', '## [0.1.0] — 2026-01-01', ''].join(
      '\n',
    );
    expect(unreleasedBody(changelog)).toBe('\n\n- a bullet\n\n');
  });

  it('reads to the very end when no section follows Unreleased', () => {
    expect(unreleasedBody('## [Unreleased]\n\n- only this\n')).toBe('\n\n- only this\n');
  });

  it('is an empty string, not null, for a section that exists but is empty', () => {
    expect(unreleasedBody('## [Unreleased]\n\n## [0.1.0] — 2026-01-01\n')).toBe('\n\n');
  });

  it('is null when there is no Unreleased heading at all', () => {
    expect(unreleasedBody('# Changelog\n\n## [0.1.0] — 2026-01-01\n')).toBeNull();
  });
});

describe('unreleasedGaps', () => {
  const body = '\n\n- feat: the one that was written down\n';

  it('names the release-worthy subjects the body never mentions', () => {
    expect(
      unreleasedGaps(body, ['feat: the one that was written down', 'fix: the one that was not']),
    ).toEqual(['fix: the one that was not']);
  });

  it('counts a subject as covered only when the body has it verbatim', () => {
    expect(unreleasedGaps(body, ['feat: the one that was written'])).toEqual([]);
    expect(unreleasedGaps(body, ['feat: written down but reworded'])).toEqual([
      'feat: written down but reworded',
    ]);
  });

  it('ignores subjects no release note would publish anyway (docs, chore, test)', () => {
    expect(unreleasedGaps('', ['docs: a typo', 'chore: a dep', 'test: a case'])).toEqual([]);
  });

  it('treats perf as release-worthy, the same way the grouped notes do', () => {
    expect(unreleasedGaps('', ['perf: faster'])).toEqual(['perf: faster']);
  });

  it('reports every release-worthy subject when the body is empty', () => {
    expect(unreleasedGaps('', ['feat: a', 'fix: b'])).toEqual(['feat: a', 'fix: b']);
  });

  it('reports nothing when the body already mentions all of them', () => {
    expect(unreleasedGaps('- feat: a\n- fix: b\n', ['feat: a', 'fix: b'])).toEqual([]);
  });
});

describe('cutChangelogRelease completes a section that fell behind', () => {
  const behind = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '',
    '- feat: the one someone wrote down',
    '',
    '## [0.1.0] — 2026-01-01',
    '',
    '- the old release',
    '',
  ].join('\n');

  it('appends the commits the section never mentions, under their own heading', () => {
    const cut = cutChangelogRelease(behind, '0.2.0', '2026-09-21', [
      'feat: the one someone wrote down',
      'fix: the one that arrived after',
      'feat: and this one too',
    ]);
    expect(cut).toContain('### Also in this release');
    expect(cut).toContain('- fix: the one that arrived after');
    expect(cut).toContain('- feat: and this one too');
  });

  it('leaves every hand-written line exactly where it was', () => {
    const cut = cutChangelogRelease(behind, '0.2.0', '2026-09-21', ['fix: the one that arrived']);
    expect(cut).toContain('### Added\n\n- feat: the one someone wrote down');
    expect(cut.indexOf('### Added')).toBeLessThan(cut.indexOf('### Also in this release'));
  });

  it('keeps the caught-up block inside the NEW dated section, above the older one', () => {
    const cut = cutChangelogRelease(behind, '0.2.0', '2026-09-21', ['fix: arrived after']);
    expect(cut.indexOf('## [0.2.0] — 2026-09-21')).toBeLessThan(
      cut.indexOf('### Also in this release'),
    );
    expect(cut.indexOf('### Also in this release')).toBeLessThan(cut.indexOf('## [0.1.0]'));
  });

  it('adds nothing when the section already mentions every release-worthy commit', () => {
    const cut = cutChangelogRelease(behind, '0.2.0', '2026-09-21', [
      'feat: the one someone wrote down',
      'chore: not a release note',
    ]);
    expect(cut).not.toContain('### Also in this release');
    expect(cut).toBe(cutChangelogRelease(behind, '0.2.0', '2026-09-21'));
  });

  it('still seeds — not "also in this release" — when the section is empty', () => {
    const empty = ['# Changelog', '', '## [Unreleased]', '', '## [0.1.0] — 2026-01-01', ''].join(
      '\n',
    );
    const cut = cutChangelogRelease(empty, '0.2.0', '2026-09-21', ['feat: a thing']);
    // Exact, not `toContain`: the section that FOLLOWS Unreleased must appear
    // exactly once. A cut that pasted the whole changelog back in place of
    // its own head would still contain every fragment a looser assertion
    // looks for.
    expect(cut).toBe(
      [
        '# Changelog',
        '',
        '## [Unreleased]',
        '',
        '## [0.2.0] — 2026-09-21',
        '',
        '### Added',
        '',
        '- feat: a thing',
        '',
        '## [0.1.0] — 2026-01-01',
        '',
      ].join('\n'),
    );
    expect(cut).not.toContain('### Also in this release');
  });

  it('leaves a blank line between the hand-written body and the appended block', () => {
    const cut = cutChangelogRelease(behind, '0.2.0', '2026-09-21', ['fix: arrived after']);
    expect(cut).toContain('- feat: the one someone wrote down\n\n### Also in this release');
  });

  it('separates the appended block from the section that follows', () => {
    const cut = cutChangelogRelease(behind, '0.2.0', '2026-09-21', ['fix: arrived after']);
    expect(cut).toContain('- fix: arrived after\n\n## [0.1.0]');
  });

  it('touches nothing when no subjects are supplied at all', () => {
    const cut = cutChangelogRelease(behind, '0.2.0', '2026-09-21');
    expect(cut).not.toContain('### Also in this release');
    expect(cut).toContain('### Added\n\n- feat: the one someone wrote down');
  });

  it('puts each caught-up subject on its own line', () => {
    const cut = cutChangelogRelease(behind, '0.2.0', '2026-09-21', ['fix: one', 'fix: two']);
    expect(cut).toContain('- fix: one\n- fix: two');
  });

  it('carries the caught-up commits through planRelease, so a release can hide none', () => {
    const plan = planRelease(
      '0.1.0',
      behind,
      ['fix: arrived after the section was written'],
      '2026-09-21',
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.changelog).toContain('- fix: arrived after the section was written');
  });
});

/**
 * A RELEASE NOTE IS A LIST OF CHANGES, NOT OF COMMITS (2026-09-21). Preparing
 * v0.53.0, the generated tag body announced the pinned-task unpin button
 * twice: it had shipped, been reverted, and shipped again, so its subject
 * appeared twice in the log. The same blind spot reads the other way — a
 * `Revert "X"` leaves X in the log, so notes built from raw subjects would
 * announce a feature that was taken back out before the release.
 */
describe('releaseWorthySubjects', () => {
  it('names a subject once even when it landed twice', () => {
    expect(releaseWorthySubjects(['feat: the thing', 'feat: the thing'])).toEqual([
      'feat: the thing',
    ]);
  });

  it('nets a reverted-then-reapplied commit down to one line', () => {
    expect(
      releaseWorthySubjects(['feat: the thing', 'Revert "feat: the thing"', 'feat: the thing']),
    ).toEqual(['feat: the thing']);
  });

  it('drops a commit that was reverted and never reapplied', () => {
    expect(releaseWorthySubjects(['feat: the thing', 'Revert "feat: the thing"'])).toEqual([]);
  });

  it('keeps a commit whose landings outnumber its reverts', () => {
    expect(
      releaseWorthySubjects(['fix: flaky', 'fix: flaky', 'fix: flaky', 'Revert "fix: flaky"']),
    ).toEqual(['fix: flaky']);
  });

  it('never emits the revert commit itself', () => {
    expect(releaseWorthySubjects(['Revert "feat: gone"'])).toEqual([]);
  });

  it('keeps only the types a release note publishes', () => {
    expect(
      releaseWorthySubjects(['feat: a', 'fix: b', 'perf: c', 'docs: d', 'chore: e', 'test: f']),
    ).toEqual(['feat: a', 'fix: b', 'perf: c']);
  });

  it('preserves the order the subjects arrived in', () => {
    expect(releaseWorthySubjects(['fix: second', 'feat: first'])).toEqual([
      'fix: second',
      'feat: first',
    ]);
  });

  it('is not fooled by a subject that ENDS by quoting a revert — the anchor is the start', () => {
    // Unanchored at the start, this docs commit would cancel the feature it
    // merely talks about, and the release would lose a line for it.
    expect(releaseWorthySubjects(['feat: a', 'docs: on Revert "feat: a"'])).toEqual(['feat: a']);
  });

  it('is not fooled by a subject that only BEGINS like a revert — the anchor is the end', () => {
    // `git revert` writes exactly `Revert "<subject>"`. Anything carrying a
    // tail is someone else's sentence and must not cancel a shipped commit.
    expect(releaseWorthySubjects(['feat: a', 'Revert "feat: a" (again)'])).toEqual(['feat: a']);
  });

  it('is empty for an empty commit list', () => {
    expect(releaseWorthySubjects([])).toEqual([]);
  });
});

describe('groupedReleaseNotes counts changes, not commits', () => {
  it('lists a reverted-then-reapplied feature once, not twice', () => {
    const notes = groupedReleaseNotes([
      'feat: the unpin button',
      'Revert "feat: the unpin button"',
      'feat: the unpin button',
    ]);
    expect(notes).toBe('### Added\n\n- feat: the unpin button');
  });

  it('announces nothing for a feature that was reverted and left out', () => {
    expect(groupedReleaseNotes(['feat: the unpin button', 'Revert "feat: the unpin button"'])).toBe(
      '',
    );
  });
});

describe('unreleasedGaps agrees with the notes about what counts', () => {
  it('asks about a twice-landed subject once', () => {
    expect(unreleasedGaps('', ['feat: a', 'feat: a'])).toEqual(['feat: a']);
  });

  it('never asks the section to mention something the notes leave out', () => {
    expect(unreleasedGaps('', ['feat: a', 'Revert "feat: a"'])).toEqual([]);
  });
});
