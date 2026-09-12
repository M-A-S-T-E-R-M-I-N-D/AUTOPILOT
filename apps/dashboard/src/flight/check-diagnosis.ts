// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0020 slice 8 (board web-mtvpuoj4-tv1z09), "Diagnose & fix a red
 * check" — the fourth maintainer verb the PR card is missing. `re-run`
 * (`human-merge.ts`'s `createRerunChecksApi`) is the right answer to a
 * flake and useless against a real defect, which is the case an operator
 * actually needs help with. The epic's own worked example (PR #37: an
 * axe-core assertion failed, the PR only bumped `zod`, and `zod` is
 * imported by exactly one file that cannot reach the failing panel) does
 * the classification in three steps by hand: read the log, check whether
 * the PR's own changes can even reach the failure, and only then decide.
 * This ships the pure decision core, {@link diagnoseFailedCheck} —
 * `unknown` is a real, common answer here (FAILURE-DOCTRINE row 6: a
 * classifier that always decides is the cry-wolf failure wearing a new
 * hat), never a confident guess dressed up as one.
 *
 * Rather than inventing a second flake registry, this reads the same
 * `config/quarantine/flaky-tests.json` entries `scripts/ci/quarantine-
 * report.mjs` already validates (`testPath`/`owner`/`reason`/`addedDate`)
 * — a test already known to flake, that the PR does not itself touch, is
 * the strongest cheap signal available without re-running the suite
 * against `main`. Deferred to a follow-up derivation, per the epic's own
 * "Shape" section: the `🔧 Diagnose` button, the server route, and the
 * `defect` verdict's diff-for-approval preparation — none of that exists
 * yet, so this slice is backend-only.
 */

/** One entry from `config/quarantine/flaky-tests.json`, in the shape
 *  `scripts/ci/quarantine-report.mjs`'s `validateQuarantineList` already
 *  enforces. */
export interface QuarantineEntry {
  readonly testPath: string;
  readonly owner: string;
  readonly reason: string;
  readonly addedDate: string;
}

/** `defect` and `flake` are only minted on affirmative evidence; anything
 *  short of that is `unknown` — the epic's own non-goal is "no guessing
 *  when the evidence is thin". */
export type CheckDiagnosisVerdict = 'flake' | 'defect' | 'unknown';

export interface CheckDiagnosisInput {
  /** The failing job's own log text, as fetched from its GitHub Actions
   *  run. Plain text — this classifier never calls out to `gh` itself. */
  readonly jobLog: string;
  /** The PR's touched file paths, e.g. `PrReviewCandidate.touchedPaths`. */
  readonly touchedPaths: readonly string[];
  /** The flaky-test quarantine list. Optional: an empty/absent list only
   *  narrows what can be classified `flake`, it never affects `defect`. */
  readonly quarantine?: readonly QuarantineEntry[];
}

export interface CheckDiagnosisResult {
  readonly verdict: CheckDiagnosisVerdict;
  /** Human-readable evidence for the verdict — the epic's own principle:
   *  "the reasoning is the product; the button is just where it lives." */
  readonly reasoning: readonly string[];
  /** Every test file path the log's own failure lines named. */
  readonly failingTestPaths: readonly string[];
  /** The subset of {@link failingTestPaths} the PR itself touches — direct
   *  evidence the PR's change can reach the failure. */
  readonly touchedFailingPaths: readonly string[];
  /** The quarantine entries matching a path in {@link failingTestPaths}. */
  readonly matchedQuarantineEntries: readonly QuarantineEntry[];
}

const FAILING_LINE_PATTERN = /\bFAIL\b|[✗×]|\bfailed\b/i;
const TEST_FILE_PATTERN = /[\w./\\-]+\.(?:test|spec)\.[jt]sx?/g;

/** Pulls test-file paths off a job log's own failure-marked lines (`FAIL`,
 *  `✗`/`×`, or "failed" — vitest's default and dot reporters all use one of
 *  these). Windows CI logs backslash their paths; normalized to forward
 *  slashes so they compare equal to `touchedPaths` and quarantine entries,
 *  which are always POSIX-style. A line naming no `.test.`/`.spec.` file is
 *  silently skipped — this is deliberately a heuristic reading of common
 *  reporter output, not a log-format parser. */
export function extractFailingTestPaths(jobLog: string): readonly string[] {
  const found = new Set<string>();
  for (const line of jobLog.split('\n')) {
    if (!FAILING_LINE_PATTERN.test(line)) continue;
    const matches = line.match(TEST_FILE_PATTERN);
    if (!matches) continue;
    for (const match of matches) found.add(match.replace(/\\/g, '/'));
  }
  return Array.from(found);
}

/**
 * Classifies a failing check as `flake`, `defect`, or `unknown`. Direct
 * evidence always wins: a PR that touches the exact file its own check
 * reports failing is a `defect` even if that same file also carries a
 * standing quarantine entry — the PR may be the one thing that just broke
 * it for real. Only once that is ruled out does a quarantine match narrow
 * the verdict to `flake`. Everything else — no known signature, no direct
 * overlap, or a log with no recognizable failure line at all — is
 * `unknown`, with reasoning that says exactly what evidence was and was
 * not found, so an operator can act on honest uncertainty.
 */
export function diagnoseFailedCheck(input: CheckDiagnosisInput): CheckDiagnosisResult {
  const quarantine = input.quarantine ?? [];
  const failingTestPaths = extractFailingTestPaths(input.jobLog);
  const touchedFailingPaths = failingTestPaths.filter((path) => input.touchedPaths.includes(path));
  const matchedQuarantineEntries = quarantine.filter((entry) =>
    failingTestPaths.includes(entry.testPath),
  );

  if (touchedFailingPaths.length > 0) {
    return {
      verdict: 'defect',
      reasoning: [
        `The PR directly touches the failing test file(s): ${touchedFailingPaths.join(', ')}.`,
      ],
      failingTestPaths,
      touchedFailingPaths,
      matchedQuarantineEntries,
    };
  }

  if (matchedQuarantineEntries.length > 0) {
    return {
      verdict: 'flake',
      reasoning: matchedQuarantineEntries.map(
        (entry) => `${entry.testPath} is already quarantined as flaky (${entry.reason}).`,
      ),
      failingTestPaths,
      touchedFailingPaths,
      matchedQuarantineEntries,
    };
  }

  return {
    verdict: 'unknown',
    reasoning:
      failingTestPaths.length === 0
        ? ['Could not identify a failing test file from the job log.']
        : [
            `${failingTestPaths.join(', ')} failed. The PR does not touch it directly and it ` +
              'carries no quarantine entry — not enough evidence to classify automatically.',
          ],
    failingTestPaths,
    touchedFailingPaths,
    matchedQuarantineEntries,
  };
}
