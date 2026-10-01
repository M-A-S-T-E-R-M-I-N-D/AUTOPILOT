// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, type Store } from '@autopilot/store';
import { toOtlpResourceSpans, type FiringRecord } from '@autopilot/engine';
import { firingPayloadSpan, readPipelineSpans } from '../../src/read/pipeline-spans.js';

/** Same real, engine-shaped record the pipeline-graph golden test uses. */
const BASE_RECORD: FiringRecord = {
  ts: '2026-07-07T00:00:00.000Z',
  firing: 1,
  promptVersion: 'firing-v8.1',
  model: 'opus',
  retro: false,
  attempts: 1,
  quotaFallback: false,
  startedOn: 'primary',
  quotaStreak: 0,
  globalExhaust: false,
  exitCode: 0,
  isError: false,
  stopReason: 'end_turn',
  maxTurnsHit: false,
  numTurns: 12,
  durationMs: 4000,
  costUsd: 6.5,
  realCostUsd: null,
  tokensIn: 100,
  tokensOut: 200,
  cacheRead: 5000,
  cacheCreate: 50,
  iterMetrics: 'ok',
  item: 'AP-1',
  outcome: 'shipped',
  shipped: true,
  completion: 'complete',
  completionMissing: false,
  gateResult: 'passed',
  gateChecks: [{ label: 'typecheck', pass: true, durationMs: 10 }],
  guardDenials: 0,
  guardDenialDetails: [],
  resumed: null,
  sha: 'abc123',
  shaVerified: true,
  headAdvanced: true,
  headBefore: 'h0',
  headAfter: 'h1',
  testsBefore: 10,
  testsAfter: 13,
  testsDelta: 3,
  verifierUsed: null,
  kind: 'feat',
  area: null,
  deferredTo: null,
  testFirst: null,
  pickedRank: null,
  deviationReason: null,
  commitSubject: 'feat(engine): OTLP export for firing records',
  instanceId: null,
};

describe('firingPayloadSpan', () => {
  it('round-trips a durable FiringRecord payload into the exact span the exporter emits', () => {
    const expected = toOtlpResourceSpans(BASE_RECORD).resourceSpans[0]!.scopeSpans[0]!.spans[0]!;

    const span = firingPayloadSpan(JSON.stringify(BASE_RECORD));

    expect(span).toEqual(expected);
    expect(span!.name).toBe('autopilot.firing');
    // Deterministic identity: re-projecting the same payload yields byte-identical ids.
    expect(firingPayloadSpan(JSON.stringify(BASE_RECORD))).toEqual(span);
  });

  it('returns null for a firing that recorded no payload event', () => {
    expect(firingPayloadSpan(null)).toBeNull();
  });

  it('returns null for unparseable payload JSON', () => {
    expect(firingPayloadSpan('{not json')).toBeNull();
  });

  it('returns null for a payload that is not a record object', () => {
    expect(firingPayloadSpan('"just a string"')).toBeNull();
    expect(firingPayloadSpan('null')).toBeNull();
  });

  it('returns null when ts is missing or does not parse as a date', () => {
    const noTs = { ...BASE_RECORD, ts: undefined };
    expect(firingPayloadSpan(JSON.stringify(noTs))).toBeNull();
    const badTs = { ...BASE_RECORD, ts: 'not-a-date' };
    expect(firingPayloadSpan(JSON.stringify(badTs))).toBeNull();
  });
});

let dir: string | undefined;

function project(store: Store, id: string): void {
  store.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
       VALUES (?, ?, ?, '/tmp/x', 'flying', NULL, 1, 1)`,
    )
    .run(id, id, id);
}

function firing(
  store: Store,
  projectId: string,
  firingId: string,
  createdAt: number,
  payload: string | null,
): void {
  store.db
    .prepare(
      `INSERT INTO metrics (project_id, firing_id, item, kind, sha, shipped, gate_result, cost_usd,
                            duration_ms, commit_subject, model, created_at)
       VALUES (?, ?, 'AP-1', 'feat', NULL, 1, 'passed', 1, 1000, 'feat: x', 'claude-sonnet-5', ?)`,
    )
    .run(projectId, firingId, createdAt);
  if (payload !== null) {
    store.db
      .prepare(
        `INSERT INTO events (project_id, firing_id, type, payload, created_at)
         VALUES (?, ?, 'firing', ?, ?)`,
      )
      .run(projectId, firingId, payload, createdAt);
  }
}

afterEach(() => {
  if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('readPipelineSpans', () => {
  it('returns null when the db file does not exist', () => {
    dir = mkdtempSync(join(tmpdir(), 'ap-dash-pipeline-spans-'));
    const dbPath = join(dir, 'missing.sqlite');
    expect(readPipelineSpans(dbPath, 'fly-a')).toBeNull();
  });

  it('returns null for an unknown project', () => {
    dir = mkdtempSync(join(tmpdir(), 'ap-dash-pipeline-spans-'));
    const dbPath = join(dir, 'db.sqlite');
    const store = openStore(dbPath);
    migrate(store);
    project(store, 'fly-a');
    store.close();

    expect(readPipelineSpans(dbPath, 'fly-ghost')).toBeNull();
  });

  it("maps a project's firings to spans oldest-first, skipping malformed payloads", () => {
    dir = mkdtempSync(join(tmpdir(), 'ap-dash-pipeline-spans-'));
    const dbPath = join(dir, 'db.sqlite');
    const store = openStore(dbPath);
    migrate(store);
    project(store, 'fly-a');
    const older = { ...BASE_RECORD, ts: '2026-07-07T00:00:00.000Z', firing: 1 };
    const newer = { ...BASE_RECORD, ts: '2026-07-08T00:00:00.000Z', firing: 2 };
    firing(store, 'fly-a', 'fly-a:1', 1, JSON.stringify(older));
    firing(store, 'fly-a', 'fly-a:2', 2, 'not malformed json but no ts match');
    firing(store, 'fly-a', 'fly-a:3', 3, JSON.stringify(newer));
    store.close();

    const spans = readPipelineSpans(dbPath, 'fly-a');

    expect(spans).not.toBeNull();
    expect(spans).toHaveLength(2);
    expect(spans![0]).toEqual(firingPayloadSpan(JSON.stringify(older)));
    expect(spans![1]).toEqual(firingPayloadSpan(JSON.stringify(newer)));
  });

  it('returns null when the store cannot be read (e.g. an unmigrated db)', () => {
    dir = mkdtempSync(join(tmpdir(), 'ap-dash-pipeline-spans-'));
    const dbPath = join(dir, 'db.sqlite');
    openStore(dbPath).close();

    expect(readPipelineSpans(dbPath, 'fly-a')).toBeNull();
  });
});
