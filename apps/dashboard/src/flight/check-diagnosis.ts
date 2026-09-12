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
 * against `main`.
 *
 * {@link createCheckDiagnosisApi} is the follow-up derivation named in the
 * epic's own "Shape" section as the server route: it re-reads the PR's
 * open checks fresh from `gh` (same never-trust-the-card discipline as
 * `human-merge.ts`), fetches the failed job's own log with `gh run view
 * --log-failed`, loads the quarantine list off disk, and feeds all three
 * to the pure classifier above. Still deferred: the `🔧 Diagnose` button
 * and the `defect` verdict's diff-for-approval preparation — this
 * derivation only makes the classification reachable over HTTP.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CliExec } from '../connection/cli-probe.js';
import { ghExec } from './gh-exec.js';
import { fetchOpenPrCandidates } from './pr-review.js';
import { runIdFromCheckUrl } from './human-merge.js';

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

/** Checks that do not gate — the same "(optional)" convention
 *  `human-merge.ts`'s own `isOptionalCheck` uses: an optional job's red
 *  is not the failure an operator needs diagnosed. */
function isOptionalCheck(name: string): boolean {
  return name.toLowerCase().includes('(optional)');
}

/** Reads `config/quarantine/flaky-tests.json` off `repoRoot`. Best-effort:
 *  a missing file, unreadable JSON, or an entry missing a required field is
 *  silently dropped rather than thrown — the quarantine list only ever
 *  narrows a verdict toward `flake`, so a broken read degrades to "nothing
 *  quarantined" instead of failing the whole diagnosis. */
function loadQuarantineList(repoRoot: string): readonly QuarantineEntry[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(repoRoot, 'config/quarantine/flaky-tests.json'), 'utf8'));
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is QuarantineEntry => {
    const candidate = entry as Record<string, unknown>;
    return (
      typeof candidate?.['testPath'] === 'string' &&
      candidate['testPath'] !== '' &&
      typeof candidate?.['owner'] === 'string' &&
      typeof candidate?.['reason'] === 'string' &&
      typeof candidate?.['addedDate'] === 'string'
    );
  });
}

/** Either the classified verdict, or the reason there was nothing to
 *  classify — a refusal here is a normal result, not a transport failure,
 *  the same convention {@link RerunChecksResult} in `human-merge.ts`
 *  follows for its own sibling verb. */
export interface CheckDiagnosisApiOutcome {
  readonly diagnosis?: CheckDiagnosisResult;
  readonly reason?: string;
}

/** The API shape `GET /api/pr-review/diagnose?number=` wires. */
export type CheckDiagnosisApi = (number: number) => Promise<CheckDiagnosisApiOutcome>;

/**
 * Builds the diagnose API: re-reads the PR's open checks fresh from `gh`
 * (never the previewed card), reads the log of whichever gating check(s)
 * are failing, and classifies it against the PR's own touched paths and the
 * quarantine list on disk. Multiple failing checks that share one workflow
 * run (`runIdFromCheckUrl` dedupes them, same as `createRerunChecksApi`)
 * have their logs concatenated before classification — the classifier only
 * needs the failing test's own FAIL line, wherever in the log it lands.
 */
export function createCheckDiagnosisApi(
  exec: CliExec = ghExec,
  repoRoot: string = process.cwd(),
): CheckDiagnosisApi {
  return async (number) => {
    const candidates = await fetchOpenPrCandidates(exec);
    const pr = candidates.find((candidate) => candidate.number === number);
    if (!pr) return { reason: `#${number} is no longer open — nothing to diagnose.` };

    const failing = (pr.checkRuns ?? []).filter(
      (check) => check.state === 'fail' && !isOptionalCheck(check.name),
    );
    if (failing.length === 0) {
      return { reason: 'No gating check is failing — there is nothing to diagnose.' };
    }
    const runIds = [...new Set(failing.map((check) => runIdFromCheckUrl(check.url)))].filter(
      (id): id is string => id !== null,
    );
    if (runIds.length === 0) {
      return {
        reason:
          'The failing checks are not GitHub Actions runs (an external status, or gh ' +
          'reported no run link) — there is no log to read from here.',
      };
    }

    const logs: string[] = [];
    for (const id of runIds) {
      const { code, stdout } = await exec('gh', ['run', 'view', id, '--log-failed']);
      if (code === 0) logs.push(stdout);
    }
    if (logs.length === 0) {
      return { reason: 'gh could not read the failing job’s log — it may still be uploading.' };
    }

    return {
      diagnosis: diagnoseFailedCheck({
        jobLog: logs.join('\n'),
        touchedPaths: pr.touchedPaths,
        quarantine: loadQuarantineList(repoRoot),
      }),
    };
  };
}
