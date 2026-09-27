// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * PAYLOAD CENSUS (epic 0020 "the legible surface", slice 6 — the epic's
 * failure #1: "facts fetched and discarded at the client boundary." `gh pr
 * list` returned every check's name, state, timing and log url; the panel
 * rendered one word (`checkRuns` on `PrReviewCandidate`, fixed in slice 1).
 * `link-census.test.ts` (slice 5) already guards one narrow slice of this —
 * a fetched `url` with no `href` — this guards a second, independent slice:
 * a whole small display payload where SOME field never reaches the panel
 * that already renders its siblings.
 *
 * This is a deliberately bounded census, not the full sweep the epic
 * describes. `PAYLOAD_INTERFACES` below is a CURATED list, not a disk diff —
 * unlike `link-census.test.ts`'s fully automatic scan, most `flight/*.ts`
 * payload interfaces (`PrReviewCandidate`, every `MirrorPass*Finding`) mix
 * real display fields with fields documented as decision-only /
 * reasoning-only (see e.g. `PrReviewCandidate.viewerIsAuthor`'s own doc
 * comment: "the check can only narrow toward queue-for-human, never force a
 * merge") — a blind "every field must render" sweep would misfire on every
 * one of those. Every field of a censused interface is adjudicated: read off
 * its receiver, or listed in `DERIVED` (reaches the panel through a wrapper
 * field), `IN_REASONING` (folded into the `reasoning` text the panel paints —
 * checked against the real planner's output, not the source text) or
 * `EXCUSED` (a tracked gap). The `IssueTriageDecision` variants (slice c of
 * the split below) are the first censused through that adjudication;
 * `PrReviewCandidate` and the `MirrorPass*Finding` payloads are real
 * follow-up work, not scope creep this census skipped by accident.
 *
 * A read counts only when it is taken off a name the renderer binds THIS
 * payload to (`check.url`, not the PR's own `plan.pr.url`), in code rather
 * than a comment — VERDICT ap-mtui8t6l-0 caught a bare `\.url\b` match
 * holding three fields green with their real reads deleted
 * (docs/debriefs/2026-09-27-verdict-ap-mtui8t6l-0-payload-census-split-confirmed.md).
 * This is still a source-text inference; the render-and-diff census is the
 * sound follow-up that can retire the receiver lists.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { planIssueTriage, type IssueTriageDecision } from '../../src/flight/issue-triage.js';

const FLIGHT_DIR = fileURLToPath(new URL('../../src/flight/', import.meta.url));
const FEATURES_DIR = fileURLToPath(new URL('../../src/web/features/', import.meta.url));

/**
 * The renderer's own text plus every local helper it splices in via a
 * relative `.js` import (the "vanilla + `.toString()` splice architecture"
 * — see e.g. `web/features/publicity.ts` importing `publicityAffordanceTip`
 * from `../publicity-panel.js` and inlining `.toString()`'s output). A
 * field read only inside a spliced helper is still a field that reaches
 * the browser — checking the renderer file alone would false-positive on
 * exactly that shape. One level deep only: enough for every splice this
 * codebase currently does. Comments are stripped ({@link stripComments}).
 */
function rendererSourceWithLocalImports(rendererPath: string): string {
  const own = readFileSync(rendererPath, 'utf8');
  let combined = own;
  for (const importMatch of own.matchAll(/from ['"](\.[^'"]+)\.js['"]/g)) {
    const specifier = importMatch[1];
    if (specifier === undefined) continue;
    const importedPath = resolve(dirname(rendererPath), `${specifier}.ts`);
    if (existsSync(importedPath)) combined += `\n${readFileSync(importedPath, 'utf8')}`;
  }
  return stripComments(combined);
}

/**
 * `source` with its block and line comments removed, so a doc comment that
 * names a field (`entries[].claims[]`) never passes for a read of it. It is
 * deliberately naive: it also strips comment syntax inside the template-
 * literal client JS (right — those are comments in the shipped script too),
 * and a `/*` or `//` inside a string literal over-strips the rest of it.
 * Over-stripping only ever removes reads, so the coverage check fails closed
 * (red), never open; only the "still unread" honesty checks could miss a
 * read hidden that way, the lesser risk. `://` is spared so a URL literal
 * keeps the rest of its line.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<!:)\/\/.*$/gm, '');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True when `source` reads `field` off one of `receivers` — `check.url`,
 * `entry.issue.url`, `affordance?.reasoning` — and never on a bare `.url`
 * off some other object (`plan.pr.url`, a DOM node's `desc.id`) or a longer
 * path that merely ends in a receiver's name (`plan.check.url`). A renderer
 * that renames its receiver turns the census red, which is the safe way to
 * be wrong (VERDICT ap-mtui8t6l-0, slice a).
 */
function fieldIsRead(source: string, receivers: readonly string[], field: string): boolean {
  // An empty alternation would match a bare `.field` again: fail closed.
  if (receivers.length === 0) return false;
  const receiver = receivers.map(escapeRegExp).join('|');
  return new RegExp(`(?<![\\w$.])(?:${receiver})\\??\\.${escapeRegExp(field)}\\b`).test(source);
}

interface PayloadInterface {
  readonly file: string;
  readonly interfaceName: string;
  /** The names the renderer and its spliced helpers bind this payload to. */
  readonly receivers: readonly string[];
}

/** Curated (file, interface) pairs — see the file header for why this is a
 *  hand-picked list rather than a disk diff. Each entry's flight file must
 *  have a same-named `web/features/` renderer already, so "reaches the
 *  panel" has somewhere real to check against. */
const PAYLOAD_INTERFACES: readonly PayloadInterface[] = [
  { file: 'pool-client.ts', interfaceName: 'PoolIssue', receivers: ['issue', 'entry.issue'] },
  { file: 'publicity.ts', interfaceName: 'PublicityAffordance', receivers: ['affordance'] },
  // `PrCheckRun` (not its parent `PrReviewCandidate` — see file header: that
  // interface mixes in ~30 decision-only/reasoning-only fields that would
  // need per-field adjudication) is the sub-shape `statusCheckRollup` feeds
  // the pipeline strip through, and every one of its fields is display-only
  // by its own doc comment.
  { file: 'pr-review.ts', interfaceName: 'PrCheckRun', receivers: ['check', 'c'] },
  // Every `IssueTriageDecision` variant (`IssueTriageDossier` and its four
  // siblings). The panel reads `decision` (badge, icon, counts) and
  // `reasoning` off `plan.decision`; each variant's other fields are
  // adjudicated one by one in `IN_REASONING` / `EXCUSED` below.
  ...[
    'IssueTriageDuplicate',
    'IssueTriageAccept',
    'IssueTriageSkip',
    'IssueTriageDossier',
    'IssueTriageNeedsFormat',
  ].map((interfaceName) => ({
    file: 'issue-triage.ts',
    interfaceName,
    receivers: ['plan.decision', 'p.decision'],
  })),
];

/** `${file}#${interfaceName}#${field}` -> why this one field is excused
 *  from the "every field reaches the renderer" rule — a genuine tracked
 *  gap, never a silent carve-out (same discipline as `link-census.test.ts`'s
 *  `NOT_YET_RENDERED`). Remove an entry the day its panel ships the field. */
const EXCUSED: Readonly<Record<string, string>> = {
  'pool-client.ts#PoolIssue#labels':
    'the panel does not yet show a pool issue’s labels — tracked UX gap, not a decision-only field',
  'pool-client.ts#PoolIssue#assignees':
    'the panel does not yet show who a pool issue is assigned to — tracked UX gap, not a decision-only field',
  'issue-triage.ts#IssueTriageDuplicate#matchedId':
    'the preview names the matched task only by title (inside reasoning), never by id — tracked UX gap: ' +
    'a duplicate does not yet link to the board task or backlog entry it matched',
};

/** A field that reaches the panel only through a same-named field of a
 *  wrapper interface the flight module derives from it server-side. */
interface DerivedRead {
  /** The wrapper interface, in the same flight file, that carries it. */
  readonly via: string;
  /** The names the renderer binds that wrapper to. */
  readonly receivers: readonly string[];
  readonly why: string;
}

/** `${file}#${interfaceName}#${field}` -> the derived field that carries it
 *  to the panel. Same key shape as `EXCUSED`, but this is a real read, not
 *  a gap: remove an entry the day the renderer reads the raw field. */
const DERIVED: Readonly<Record<string, DerivedRead>> = {
  'pool-client.ts#PoolIssue#claims': {
    via: 'PoolBrowseEntry',
    receivers: ['entry'],
    why:
      'planPoolBrowseBatch measures issueClaims(issue) into PoolBrowseEntry.claims, and the panel ' +
      'paints that ledger (poolClaimLedgerText(entry.claims)), never the raw claim list',
  },
};

/** A field the flight module folds into the payload's own `reasoning` text,
 *  which the panel paints — so it reaches the browser as prose, never as a
 *  raw read. */
interface ReasoningFold {
  /** The text(s) `reasoning` must contain for the field's `value`. */
  readonly shown: (value: unknown) => readonly string[];
  readonly why: string;
}

const AS_TEXT = (value: unknown): readonly string[] => [String(value)];

/** `${file}#${interfaceName}#${field}` -> how the field shows up in
 *  `reasoning`. Unlike the other lists this is checked against BEHAVIOR:
 *  the honesty case runs the real planner and looks for `shown(value)` in the
 *  reasoning it wrote, so a reasoning template that stops mentioning a field
 *  turns the census red. Remove an entry the day the renderer reads the raw
 *  field. */
const IN_REASONING: Readonly<Record<string, ReasoningFold>> = {
  'issue-triage.ts#IssueTriageDuplicate#matchedTitle': {
    shown: (value) => [`"${String(value)}"`],
    why: 'the reasoning quotes the existing title the issue overlaps',
  },
  'issue-triage.ts#IssueTriageDuplicate#score': {
    shown: (value) => [`${Math.round(Number(value) * 100)}%`],
    why: 'the reasoning states the overlap as a whole percentage',
  },
  'issue-triage.ts#IssueTriageAccept#releasedFromHumansAfterDays': {
    shown: (value) => [`unclaimed for ${String(value)} days`],
    why: 'the reasoning says how long the good-first-issue reservation sat unclaimed',
  },
  'issue-triage.ts#IssueTriageAccept#dimension': {
    shown: (value) => [`"pool: ${String(value)}"`],
    why: 'the reasoning names the pool label it will set',
  },
  'issue-triage.ts#IssueTriageAccept#area': {
    shown: AS_TEXT,
    why: 'the reasoning names the area label it will set',
  },
  'issue-triage.ts#IssueTriageAccept#priority': {
    shown: AS_TEXT,
    why: 'the reasoning names the priority label it will set',
  },
  'issue-triage.ts#IssueTriageAccept#milestone': {
    shown: (value) => [`milestone "${String(value)}"`],
    why: 'the reasoning names the milestone it will set',
  },
  'issue-triage.ts#IssueTriageNeedsFormat#kind': {
    shown: (value) => [`the ${String(value)} template`],
    why: 'the reasoning names which template the body was filed off',
  },
  'issue-triage.ts#IssueTriageNeedsFormat#missing': {
    shown: (value) => (value as readonly string[]).map((heading) => `"${heading}"`),
    why: 'the reasoning quotes every missing template section',
  },
};

const TRIAGE_NOW = Date.parse('2026-09-27T00:00:00Z');
const DAY_MS = 86_400_000;
const CONFORMING_BUG_BODY =
  '### What happened?\nx\n### Steps to reproduce\nx\n### Expected behavior\nx';

/** One real `planIssueTriage` decision per `IssueTriageDecision` variant,
 *  each built so every optional field of its interface is present — the
 *  fixtures `IN_REASONING`'s honesty case reads the folded values from. */
function triageDecisionsByInterface(): Readonly<Record<string, IssueTriageDecision>> {
  const accept = planIssueTriage(
    {
      number: 7,
      title: 'Crash when the security scanner reads a symlink',
      body: CONFORMING_BUG_BODY,
      labels: ['good first issue'],
      createdAt: new Date(TRIAGE_NOW - 20 * DAY_MS).toISOString(),
    },
    [],
    [],
    undefined,
    TRIAGE_NOW,
    undefined,
    ['Foundations', 'V1', 'Hardening'],
  );
  const duplicate = planIssueTriage(
    { number: 8, title: 'Keyboard nav is broken in the fleet table', body: '' },
    [{ id: 'web-abc', title: 'Keyboard nav is broken in the fleet table view' }],
    [],
  );
  const needsFormat = planIssueTriage({ number: 9, title: 'Crash on startup', body: '' }, [], []);
  const dossier = planIssueTriage(
    { number: 10, title: 'Partner application', body: '', labels: ['partner-application'] },
    [],
    [],
  );
  const skip = planIssueTriage(
    { number: 11, title: 'Taken', body: '', assignees: ['octocat'] },
    [],
    [],
  );
  return {
    IssueTriageAccept: accept,
    IssueTriageDuplicate: duplicate,
    IssueTriageNeedsFormat: needsFormat,
    IssueTriageDossier: dossier,
    IssueTriageSkip: skip,
  };
}

function censusSources(file: string): { readonly flight: string; readonly renderer: string } {
  return {
    flight: readFileSync(`${FLIGHT_DIR}${file}`, 'utf8'),
    renderer: rendererSourceWithLocalImports(`${FEATURES_DIR}${file}`),
  };
}

/** Top-level `readonly field: ...` / `readonly field?: ...` names declared
 *  directly on `interfaceName` in `source` — one level, no descent into
 *  nested object-literal types (no censused interface has one). */
function interfaceFields(source: string, interfaceName: string): readonly string[] {
  const pattern = new RegExp(`export interface ${interfaceName}[^{]*\\{([\\s\\S]*?)\\n\\}`);
  const match = pattern.exec(source);
  if (match === null || match[1] === undefined) return [];
  const fields: string[] = [];
  for (const fieldMatch of match[1].matchAll(/^\s*readonly (\w+)\??:/gm)) {
    const name = fieldMatch[1];
    if (name !== undefined) fields.push(name);
  }
  return fields;
}

describe('payload census matcher — a read counts only off the payload’s own receiver', () => {
  it('does not count a same-named field read off another object', () => {
    // The PR's own url kept `PrCheckRun.url` green with every `check.url` gone.
    expect(fieldIsRead("chip.setAttribute('href', plan.pr.url);", ['check', 'c'], 'url')).toBe(
      false,
    );
    // A DOM element's `id` kept `PublicityAffordance.id` green.
    expect(fieldIsRead('desc.id = descId;', ['affordance'], 'id')).toBe(false);
    // A longer path that merely ends in a receiver's name is not that receiver.
    expect(fieldIsRead('var u = plan.check.url;', ['check'], 'url')).toBe(false);
  });

  it('does not count a field named only in a comment', () => {
    // A doc comment kept `PoolIssue.claims` green with the ledger read gone.
    const source = stripComments(
      '/** paints `entry.claims` as the ledger */\n' +
        'var ledger = poolClaimLedgerText([]); // entry.claims was here\n',
    );
    expect(fieldIsRead(source, ['entry'], 'claims')).toBe(false);
  });

  it('counts a read off the payload’s own receiver, nested receiver paths included', () => {
    expect(
      fieldIsRead("if (check.url) chip.setAttribute('href', check.url);", ['check'], 'url'),
    ).toBe(true);
    expect(fieldIsRead("gating.filter((c) => c.state === 'pass')", ['check', 'c'], 'state')).toBe(
      true,
    );
    expect(fieldIsRead('el("a", "", entry.issue.title)', ['issue', 'entry.issue'], 'title')).toBe(
      true,
    );
    expect(fieldIsRead('var tip = affordance?.reasoning;', ['affordance'], 'reasoning')).toBe(true);
  });

  it('keeps the rest of a line after a URL literal when it strips comments', () => {
    expect(stripComments("a.href = 'https://github.com/' + check.url; // the log")).toContain(
      'check.url',
    );
  });
});

describe('payload census — every field of a censused display payload reaches its renderer', () => {
  it('finds every censused interface at the field-count the exclusion list expects', () => {
    for (const { file, interfaceName } of PAYLOAD_INTERFACES) {
      const source = readFileSync(`${FLIGHT_DIR}${file}`, 'utf8');
      const fields = interfaceFields(source, interfaceName);
      expect(
        fields.length,
        `${file}#${interfaceName}: interface not found or has no fields`,
      ).toBeGreaterThan(0);
    }
  });

  it('renders (or explicitly excuses) every field of each censused payload interface', () => {
    const offenders: string[] = [];
    for (const { file, interfaceName, receivers } of PAYLOAD_INTERFACES) {
      const { flight, renderer } = censusSources(file);
      for (const field of interfaceFields(flight, interfaceName)) {
        const key = `${file}#${interfaceName}#${field}`;
        if (key in EXCUSED || key in IN_REASONING) continue;
        const derived = DERIVED[key];
        const readers = derived === undefined ? receivers : derived.receivers;
        if (!fieldIsRead(renderer, readers, field)) {
          offenders.push(
            `${key}: fetched but web/features/${file} never reads ${readers.join('|')}.${field} — ` +
              `fetched and discarded at the client boundary (or the renderer renamed its receiver: ` +
              `update receivers in PAYLOAD_INTERFACES)`,
          );
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('keeps the exclusion list honest — every excused field still exists and is still unread', () => {
    for (const [key, reason] of Object.entries(EXCUSED)) {
      expect(reason.length).toBeGreaterThan(0);
      const { entry, field } = censusedKey(key);
      const { flight, renderer } = censusSources(entry.file);
      expect(
        interfaceFields(flight, entry.interfaceName),
        `${key}: interface no longer declares this field — remove the exclusion`,
      ).toContain(field);
      expect(
        fieldIsRead(renderer, entry.receivers, field),
        `${key}: web/features/${entry.file} now reads this field — remove the exclusion`,
      ).toBe(false);
    }
  });

  it('keeps the derived-read list honest — each wrapper still carries the field it derives', () => {
    for (const [key, derived] of Object.entries(DERIVED)) {
      expect(derived.why.length, key).toBeGreaterThan(0);
      expect(key in EXCUSED, `${key}: both excused and derived`).toBe(false);
      expect(key in IN_REASONING, `${key}: both derived and folded into reasoning`).toBe(false);
      const { entry, field } = censusedKey(key);
      const { flight, renderer } = censusSources(entry.file);
      expect(interfaceFields(flight, entry.interfaceName), key).toContain(field);
      expect(
        interfaceFields(flight, derived.via),
        `${key}: ${derived.via} no longer carries ${field} — the derivation this entry names is gone`,
      ).toContain(field);
      expect(
        fieldIsRead(renderer, entry.receivers, field),
        `${key}: web/features/${entry.file} now reads the raw field — remove the derived entry`,
      ).toBe(false);
    }
  });

  it('builds one real triage decision per censused IssueTriageDecision variant', () => {
    const decisions = triageDecisionsByInterface();
    expect(decisions['IssueTriageAccept']?.decision).toBe('accept');
    expect(decisions['IssueTriageDuplicate']?.decision).toBe('duplicate');
    expect(decisions['IssueTriageNeedsFormat']?.decision).toBe('needs-format');
    expect(decisions['IssueTriageDossier']?.decision).toBe('dossier');
    expect(decisions['IssueTriageSkip']?.decision).toBe('skip');
  });

  it('keeps the reasoning-fold list honest — the real planner still writes each field into reasoning', () => {
    const decisions = triageDecisionsByInterface();
    for (const [key, fold] of Object.entries(IN_REASONING)) {
      expect(fold.why.length, key).toBeGreaterThan(0);
      expect(key in EXCUSED, `${key}: both excused and folded into reasoning`).toBe(false);
      const { entry, field } = censusedKey(key);
      const { flight, renderer } = censusSources(entry.file);
      expect(interfaceFields(flight, entry.interfaceName), key).toContain(field);
      expect(
        fieldIsRead(renderer, entry.receivers, field),
        `${key}: web/features/${entry.file} now reads the raw field — remove the reasoning-fold entry`,
      ).toBe(false);
      const decision = decisions[entry.interfaceName] as unknown as
        Readonly<Record<string, unknown>> | undefined;
      expect(decision, `${key}: no fixture decision for ${entry.interfaceName}`).toBeDefined();
      expect(decision, `${key}: the fixture decision does not carry ${field}`).toHaveProperty(
        field,
      );
      const reasoning = String(decision?.['reasoning']);
      for (const text of fold.shown(decision?.[field])) {
        expect(
          reasoning,
          `${key}: the planner's reasoning no longer shows ${field} — it no longer reaches the panel`,
        ).toContain(text);
      }
    }
  });
});

/** The censused interface and field a `${file}#${interfaceName}#${field}`
 *  key names — failing the test when the key is malformed or its interface
 *  is not in `PAYLOAD_INTERFACES`. */
function censusedKey(key: string): { readonly entry: PayloadInterface; readonly field: string } {
  const [file, interfaceName, field] = key.split('#');
  const entry = PAYLOAD_INTERFACES.find(
    (candidate) => candidate.file === file && candidate.interfaceName === interfaceName,
  );
  expect(entry, `${key}: ${interfaceName} is not in PAYLOAD_INTERFACES`).toBeDefined();
  expect(field, key).toBeDefined();
  return { entry: entry as PayloadInterface, field: field as string };
}
