// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Executable DELIVERABLE predicates — the hard half of the DELIVERABLE
 * verifier (deliverable.ts is the soft half). Born from the UNLOCK A
 * false-close (RESEARCH-LIBRARY, "Goodhart in the firing loop"): a task
 * whose clause demanded "shell.ts under 300 lines" was closed `complete` at
 * ~5,000 lines because the vocabulary check only greps the patch for shared
 * words — it can confirm a claim is MENTIONED, never that it is MET.
 *
 * This module parses the measurable claims a clause can carry (a closed,
 * read-only DSL — never arbitrary commands, since titles arrive from the
 * API and from agent proposals) and EXECUTES them against the repo at HEAD:
 *   - max-lines:    `wc -l <path> under 300` / `<file> under 300 lines`
 *   - file-exists:  `<path> exists`
 * A parsed predicate that fails demotes the "complete" claim to a slice in
 * fly.ts's markTaskDoneIfShipped, exactly like the vocabulary check — but on
 * measured evidence instead of word overlap. Clauses with no parseable
 * predicate keep the old (soft) behavior.
 *
 * Strictness is deliberate: an unresolvable file (missing at HEAD, or an
 * ambiguous bare basename) FAILS rather than passing unverified — a claim
 * the machine cannot check must not close a task on the agent's word. Seeds
 * should use full repo-relative paths; doctrine lives in RESEARCH-LIBRARY.
 */

/** One measurable claim extracted from a DELIVERABLE clause. */
export type DeliverablePredicate =
  | { kind: 'max-lines'; file: string; max: number; strict: boolean }
  | { kind: 'file-exists'; file: string };

/** The read-only slice of GitVcs the evaluator needs (all against HEAD). */
export interface PredicateVcs {
  fileExists(path: string): Promise<boolean>;
  showFile(path: string): Promise<string>;
  lsFiles(patterns: readonly string[]): Promise<readonly string[]>;
}

/**
 * Extensions a BARE basename may carry and still count as a file claim.
 * Pathful tokens (containing `/`) skip this filter — writing a path is
 * explicit intent. Bare names need the allow-list because prose mentions
 * domains and product names that lex like filenames (`arxiv.org`).
 */
const BARE_NAME_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'md',
  'json',
  'yml',
  'yaml',
  'css',
  'html',
  'py',
  'go',
  'rs',
  'java',
  'sh',
]);

/** A filename-shaped token: optional path prefix, then `name.ext` with a letter-initial extension. */
const FILE_TOKEN = String.raw`[A-Za-z0-9_./-]*[A-Za-z0-9_]\.[A-Za-z][A-Za-z0-9]{0,5}`;

/**
 * Comparator alternation. Word comparators are boundary-anchored so "under"
 * can never match inside "thunder"; `<=` must precede `<` so the two-char
 * form wins. `at most`, `no more than`, and `<=` are the non-strict forms.
 */
const CMP = String.raw`\b(?:under|below|at\s+most|no\s+more\s+than|fewer\s+than)\b|<=|<`;

const WC_FORM = new RegExp(
  String.raw`\bwc\s+-l\s+(${FILE_TOKEN})\s+(?:prints\s+)?(${CMP})\s*(\d+)`,
  'gi',
);

/**
 * `<file> … under N lines`: the gap between file and comparator stays inside
 * one comma/semicolon/period segment and is capped at 40 chars, so a claim
 * about a DIFFERENT subject later in the sentence ("refactor big.ts fully,
 * keep every function under 50 lines") is not pinned to the file.
 */
const LINES_FORM = new RegExp(
  String.raw`(${FILE_TOKEN})[^,;.]{0,40}?(${CMP})\s*(\d+)\s*lines?\b`,
  'gi',
);

const EXISTS_FORM = new RegExp(String.raw`(${FILE_TOKEN})\s+exists\b`, 'gi');

/** True for tokens allowed to become predicates: any path, or a bare name with a known code extension. */
function isPlausibleFile(token: string): boolean {
  if (token.includes('/')) return true;
  const ext = token.slice(token.lastIndexOf('.') + 1).toLowerCase();
  return BARE_NAME_EXTENSIONS.has(ext);
}

/** True when the matched comparator means `<=` rather than `<`. */
function isNonStrict(cmp: string): boolean {
  const norm = cmp.toLowerCase().replace(/\s+/g, ' ');
  return norm === 'at most' || norm === 'no more than' || norm === '<=';
}

/**
 * Measurable claims found in a DELIVERABLE clause, in discovery order
 * (wc-form first — it is the most explicit — then lines-form, then exists),
 * deduped per file+kind so a claim stated twice is checked once.
 */
export function parseDeliverablePredicates(clause: string): readonly DeliverablePredicate[] {
  const found = new Map<string, DeliverablePredicate>();
  const add = (p: DeliverablePredicate): void => {
    const key = `${p.kind} ${p.file}`;
    if (!found.has(key)) found.set(key, p);
  };
  for (const m of clause.matchAll(WC_FORM)) {
    const [, file, cmp, max] = m as unknown as [string, string, string, string];
    if (isPlausibleFile(file)) {
      add({ kind: 'max-lines', file, max: Number(max), strict: !isNonStrict(cmp) });
    }
  }
  for (const m of clause.matchAll(LINES_FORM)) {
    const [, file, cmp, max] = m as unknown as [string, string, string, string];
    if (isPlausibleFile(file)) {
      add({ kind: 'max-lines', file, max: Number(max), strict: !isNonStrict(cmp) });
    }
  }
  for (const m of clause.matchAll(EXISTS_FORM)) {
    const [, file] = m as unknown as [string, string];
    if (isPlausibleFile(file)) add({ kind: 'file-exists', file });
  }
  return Array.from(found.values());
}

/** Line count with `wc -l` semantics: a trailing newline ends the last line, it doesn't start a phantom one. */
export function countLines(content: string): number {
  if (content === '') return 0;
  // Stryker disable next-line StringLiteral: mutating the endsWith needle to
  // '' makes the ternary always slice — but slicing one trailing NON-newline
  // char never changes split('\n').length, and when the char IS a newline
  // both branches agree by design, so the mutant is equivalent everywhere.
  const body = content.endsWith('\n') ? content.slice(0, -1) : content;
  return body.split('\n').length;
}

/**
 * A predicate file resolved to its committed path, or a failure reason.
 * Pathful tokens must exist at HEAD as written OR resolve as the unique
 * path SUFFIX of one committed file (seeds often write a shortened path
 * like `flight/intent-claims.ts` — unambiguous, so refusing it produced a
 * false demotion loop); bare basenames must resolve to exactly ONE
 * committed file (root-level or nested). In every form, zero or several
 * matches is a failure, not a pass, so an uncheckable claim can never
 * close a task.
 */
async function resolveFile(
  file: string,
  vcs: PredicateVcs,
): Promise<{ path: string } | { failure: string }> {
  if (file.includes('/')) {
    if (await vcs.fileExists(file)) return { path: file };
    const suffixMatches = await vcs.lsFiles([`*/${file}`]);
    if (suffixMatches.length === 1) return { path: suffixMatches[0]! };
    // Stryker disable next-line EqualityOperator: the `=== 1` branch above
    // returns unconditionally, so by the time this line runs
    // suffixMatches.length is provably 0 or >= 2 — `> 1` and `>= 1` agree on
    // every reachable value; equivalent, not killable.
    if (suffixMatches.length > 1) {
      return {
        failure: `'${file}' matches ${suffixMatches.length} committed files (ambiguous) — use a full repo-relative path`,
      };
    }
    return { failure: `'${file}' is not committed at HEAD` };
  }
  const matches = await vcs.lsFiles([file, `*/${file}`]);
  if (matches.length === 1) return { path: matches[0]! };
  if (matches.length === 0) return { failure: `'${file}' matches no committed file` };
  return {
    failure: `'${file}' matches ${matches.length} committed files (ambiguous) — use a full repo-relative path`,
  };
}

/**
 * Executes every predicate against HEAD; returns the FIRST failure reason,
 * or null when all pass (the caller demotes the "complete" claim on any
 * failure and needs one honest line to log, not a report).
 */
export async function evaluateDeliverablePredicates(
  predicates: readonly DeliverablePredicate[],
  vcs: PredicateVcs,
): Promise<string | null> {
  for (const p of predicates) {
    const resolved = await resolveFile(p.file, vcs);
    if ('failure' in resolved) return resolved.failure;
    if (p.kind === 'max-lines') {
      const lines = countLines(await vcs.showFile(resolved.path));
      const ok = p.strict ? lines < p.max : lines <= p.max;
      if (!ok) {
        const demand = p.strict ? `under ${p.max}` : `at most ${p.max}`;
        return `'${resolved.path}' is ${lines} lines at HEAD — DELIVERABLE demands ${demand}`;
      }
    }
  }
  return null;
}
