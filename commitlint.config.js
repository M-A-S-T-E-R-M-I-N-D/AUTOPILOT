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
  },
};
