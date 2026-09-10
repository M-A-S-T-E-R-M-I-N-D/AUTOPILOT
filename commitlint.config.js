// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Conventional Commits enforcement for AUTOPILOT.
 * Feeds automated changelog generation + SemVer bumps (PATTERNS-AND-STANDARDS §8).
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'refactor',
        'docs',
        'test',
        'chore',
        'perf',
        'ci',
        'build',
        'revert',
        'style',
        // Engine-authored WIP checkpoint commits (packages/engine/src/firing.ts
        // WIP_CHECKPOINT_PREFIX) — not a human commit type, but must validate so
        // a firing that dies mid-unit can still pack up its work instead of
        // losing it (see the "commitlint bug" that stranded flight #12 firing 6).
        'wip',
      ],
    ],
    'body-max-line-length': [0, 'always'],
    'footer-max-line-length': [0, 'always'],
    // Enforce DCO sign-off (PATTERNS-AND-STANDARDS §8): every commit must carry a
    // `Signed-off-by:` trailer (`git commit -s`).
    'signed-off-by': [2, 'always', 'Signed-off-by:'],
    // NO OPERATOR-ENVIRONMENT DETAIL IN A PUBLIC LOG (operator, 2026-09-10).
    //
    // Commit subjects once carried operator-environment detail — a wall-clock
    // time and the state of the maintainer's own hardware. A public log is
    // the wrong home for either: they are private infrastructure facts with
    // no engineering value to a reader, in a place that should describe the
    // change rather than the session.
    //
    // It is the same failure as the ritual's internal monologue on PR #33
    // (FAILURE-DOCTRINE rows 19-20), relocated from GitHub comments into
    // commit messages: writing for the author instead of the reader. A
    // commit message says WHAT CHANGED and WHY. Whose machine died, at what
    // o'clock, on which afternoon, is a debrief detail — debriefs are the
    // right home and they already exist.
    //
    // Deliberately a WARNING (level 1), not an error: a false positive must
    // never block a firing that is mid-unit and trying to check its work in
    // (the same reason `wip` is an allowed type above). It is loud enough to
    // catch the eye at commit time, which is the whole job.
    'subject-no-operator-environment': [1, 'always'],
  },
  plugins: [
    {
      rules: {
        'subject-no-operator-environment': ({ subject }) => {
          if (!subject) return [true];
          const patterns = [
            /\b\d{1,2}:\d{2}\b/, // a wall-clock time
            /power (loss|cut|outage|failure)/i,
            /\bmy (machine|computer|laptop|desktop|box)\b/i,
            /\bthe operator's (machine|computer|laptop|box)\b/i,
          ];
          const hit = patterns.find((re) => re.test(subject));
          return [
            !hit,
            `subject leaks operator-environment detail (${hit?.source ?? ''}) — say what changed, not what happened to the machine; session detail belongs in a debrief`,
          ];
        },
      },
    },
  ],
};
