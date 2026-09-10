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
    'no-operator-private-context': [1, 'always'],
  },
  plugins: [
    {
      rules: {
        // Reads the WHOLE message, subject and body alike. The first version
        // of this rule checked only the subject — and the very commit that
        // introduced it repeated the private detail in its own BODY, which
        // sailed straight through. A guard that covers one half of the
        // surface is how the thing it forbids comes back.
        'no-operator-private-context': ({ subject, body, footer }) => {
          const text = [subject, body, footer].filter(Boolean).join('\n');
          if (!text) return [true];
          const patterns = [
            // The operator's own environment — never a reader's concern.
            [/\b\d{1,2}:\d{2}\b/, 'a wall-clock time'],
            [/power (loss|cut|outage|failure)/i, 'the machine losing power'],
            [
              /\b(my|your|the operator's) (machine|computer|laptop|desktop|box|pc)\b/i,
              "someone's hardware",
            ],
            // Session narration — writing to the operator instead of to a
            // reader who will find this commit in two years with no context.
            [
              /\byou (asked|caught|noticed|said|wanted|flagged|pointed)\b/i,
              'second-person address',
            ],
            [/\bas you (said|noted|asked|put it)\b/i, 'second-person address'],
          ];
          const hit = patterns.find(([re]) => re.test(text));
          return [
            !hit,
            hit
              ? `commit message leaks private operator context (${hit[1]}) — a public log describes the CHANGE, not the session; put session detail in a debrief`
              : '',
          ];
        },
      },
    },
  ],
};
