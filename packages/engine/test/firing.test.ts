// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  runFiring,
  wipCheckpointMessage,
  finishLineCaps,
  finishLinePrompt,
  type FiringDeps,
  type FiringInput,
} from '../src/firing.js';
import { DEFAULT_ENGINE_CONFIG } from '../src/config.js';
import { INITIAL_RESILIENCE_STATE } from '../src/resilience.js';
import type {
  ModelPort,
  ModelResponse,
  ModelEnvelope,
  InvokeCaps,
  VcsPort,
  CommitRef,
  GatePort,
  GateResult,
  StorePort,
  ClockPort,
} from '../src/ports.js';
import type { FiringRecord } from '../src/telemetry.js';

function envelope(over: Partial<ModelEnvelope> = {}): ModelEnvelope {
  return {
    result: null,
    isError: false,
    apiErrorStatus: null,
    costUsd: 6,
    numTurns: 10,
    durationMs: 1000,
    stopReason: 'end_turn',
    modelUsed: null,
    tokensIn: 100,
    tokensOut: 50,
    cacheRead: 1000,
    cacheCreate: 10,
    ...over,
  };
}

function response(over: Partial<ModelResponse> = {}): ModelResponse {
  return { stdout: '', exitCode: 0, envelope: envelope(), ...over };
}

/** A successful envelope whose result carries a shipped METRICS self-report. */
function shippedResponse(item = 'AP-1', sha = 'abc'): ModelResponse {
  return response({
    envelope: envelope({
      result: `work done\nMETRICS:{"item":"${item}","outcome":"shipped","sha":"${sha}"}`,
    }),
  });
}

/** A quota-blocked attempt (the CLI billing/limit signal). */
function quotaResponse(): ModelResponse {
  return response({
    exitCode: 1,
    envelope: envelope({ isError: true, apiErrorStatus: 'usage limit reached' }),
  });
}

class FakeModel implements ModelPort {
  readonly calls: string[] = [];
  readonly resumeIds: (string | undefined)[] = [];
  readonly prompts: string[] = [];
  readonly caps: (InvokeCaps | undefined)[] = [];
  constructor(private readonly queue: ModelResponse[]) {}
  invoke(
    model: string,
    prompt: string,
    resumeSessionId?: string,
    caps?: InvokeCaps,
  ): Promise<ModelResponse> {
    this.calls.push(model);
    this.resumeIds.push(resumeSessionId);
    this.prompts.push(prompt);
    this.caps.push(caps);
    const next = this.queue.shift();
    if (!next) throw new Error('FakeModel: no queued response');
    return Promise.resolve(next);
  }
}

class FakeVcs implements VcsPort {
  revertCalls = 0;
  revertSinceRefs: (string | undefined)[] = [];
  commitInFiringRangeCalls = 0;
  private headIdx = 0;
  constructor(
    private readonly opts: {
      readonly heads: readonly string[];
      readonly last?: CommitRef | null;
      readonly existing?: ReadonlySet<string>;
      /** What `changedFiles` reports for any range — the shipped net diff. */
      readonly changed?: readonly string[];
    },
  ) {}
  head(): Promise<string> {
    const idx = Math.min(this.headIdx, this.opts.heads.length - 1);
    this.headIdx++;
    return Promise.resolve(this.opts.heads[idx] ?? '');
  }
  lastCommit(): Promise<CommitRef | null> {
    return Promise.resolve(this.opts.last ?? null);
  }
  commitInFiringRange(sha: string, _headBefore: string, _headAfter: string): Promise<boolean> {
    this.commitInFiringRangeCalls++;
    return Promise.resolve(this.opts.existing?.has(sha) ?? false);
  }
  changedFilesCalls: [string, string][] = [];
  changedFiles(fromRef: string, toRef: string): Promise<readonly string[]> {
    this.changedFilesCalls.push([fromRef, toRef]);
    return Promise.resolve(this.opts.changed ?? []);
  }
  revertLast(sinceRef?: string): Promise<void> {
    this.revertCalls++;
    this.revertSinceRefs.push(sinceRef);
    return Promise.resolve();
  }

  dirty = false;
  /** When set, overrides `dirty` per call (like `heads`) — for scenarios where
   *  isDirty() is checked more than once and the answer legitimately changes
   *  (e.g. a finish-line extension's own commit cleans a tree that was dirty
   *  before it ran). */
  dirtySequence: readonly boolean[] | null = null;
  private dirtyIdx = 0;
  checkpointMessages: string[] = [];
  commitAllError: Error | null = null;
  isDirty(): Promise<boolean> {
    if (this.dirtySequence) {
      const idx = Math.min(this.dirtyIdx, this.dirtySequence.length - 1);
      this.dirtyIdx++;
      return Promise.resolve(this.dirtySequence[idx] ?? false);
    }
    return Promise.resolve(this.dirty);
  }
  commitAll(message: string): Promise<void> {
    if (this.commitAllError) return Promise.reject(this.commitAllError);
    this.checkpointMessages.push(message);
    this.dirty = false;
    return Promise.resolve();
  }
}

class FakeGate implements GatePort {
  runs = 0;
  constructor(
    private readonly ok: boolean,
    private readonly crashed = false,
  ) {}
  run(): Promise<GateResult> {
    this.runs++;
    return Promise.resolve({ ok: this.ok, ...(this.crashed ? { crashed: true } : {}) });
  }
}

/** A gate port that REJECTS instead of resolving — e.g. RemediatingGate's
 * internal commitAll/revertLast git call throwing. */
class ThrowingGate implements GatePort {
  runs = 0;
  constructor(private readonly message: string) {}
  run(): Promise<GateResult> {
    this.runs++;
    return Promise.reject(new Error(this.message));
  }
}

class FakeStore implements StorePort {
  readonly records: FiringRecord[] = [];
  recordFiring(record: FiringRecord): void {
    this.records.push(record);
  }
}

const CLOCK: ClockPort = { nowEpochSec: () => 1000, nowIso: () => '2026-07-07T00:00:00Z' };

function deps(model: FakeModel, vcs: FakeVcs, gate: GatePort, store: FakeStore): FiringDeps {
  return { model, vcs, gate, store, clock: CLOCK };
}

const baseInput: Omit<FiringInput, 'state'> = {
  firing: 1,
  promptText: 'do the highest-value verifiable work',
  promptVersion: 'abcd1234',
  retro: false,
  machineWide30dListPriceUsd: null,
};

describe('runFiring', () => {
  it('ships a gated commit: gate passes, sha verified, telemetry persisted', async () => {
    const model = new FakeModel([shippedResponse('AP-1', 'abc')]);
    const vcs = new FakeVcs({
      heads: ['h0', 'h1'],
      last: { subject: 'feat: AP-1', shortSha: 'abc' },
      existing: new Set(['abc']),
      changed: ['src/a.ts', 'docs/b.md'],
    });
    const gate = new FakeGate(true);
    const store = new FakeStore();

    const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
      ...baseInput,
      state: INITIAL_RESILIENCE_STATE,
    });

    expect(model.calls).toEqual(['fable']);
    expect(gate.runs).toBe(1);
    expect(vcs.revertCalls).toBe(0);
    expect(out.gateResult).toBe('passed');
    expect(out.bad).toBe(false);
    expect(out.record).toMatchObject({
      item: 'AP-1',
      outcome: 'shipped',
      shipped: true,
      shaVerified: true,
      headAdvanced: true,
      quotaFallback: false,
      gateChecks: [],
    });
    expect(out.record.proposals).toBeUndefined();
    expect(out.record.checkpointError).toBeUndefined();
    expect(out.record.gateError).toBeUndefined();
    // D4 file lens (epic 0015): a gate-passed firing carries the net
    // headBefore→headAfter diff as filesTouched → autopilot.files.
    expect(vcs.changedFilesCalls).toEqual([['h0', 'h1']]);
    expect(out.record.filesTouched).toEqual(['src/a.ts', 'docs/b.md']);
    expect(store.records).toHaveLength(1);
  });

  it('additively reverts a commit that fails the gate', async () => {
    const model = new FakeModel([shippedResponse('AP-2', 'def')]);
    const vcs = new FakeVcs({
      heads: ['h0', 'h1'],
      last: { subject: 'feat: AP-2', shortSha: 'def' },
      existing: new Set(['def']),
    });
    const gate = new FakeGate(false);
    const store = new FakeStore();

    const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
      ...baseInput,
      state: INITIAL_RESILIENCE_STATE,
    });

    expect(vcs.revertCalls).toBe(1);
    // GATE HOLE 3 (board web-mtb8hghd-72z52z): the revert must target the
    // FULL range back to headBefore, not just the tip, in case the firing
    // made more than one commit.
    expect(vcs.revertSinceRefs).toEqual(['h0']);
    expect(out.gateResult).toBe('reverted');
    expect(out.record.outcome).toBe('reverted');
    expect(out.record.shipped).toBe(false);
    expect(out.record.headBefore).toBe('h0');
    expect(out.record.headAfter).toBe('h1');
    // Reverted work is undone — no filesTouched, never a fabricated list
    // (and the diff is never even computed for a non-passed gate).
    expect(vcs.changedFilesCalls).toEqual([]);
    expect(out.record.filesTouched).toBeUndefined();
  });

  it('does NOT revert a crashed gate (missing dep/OOM/tool error is not a real failure)', async () => {
    const model = new FakeModel([shippedResponse('AP-3', 'ghi')]);
    const vcs = new FakeVcs({
      heads: ['h0', 'h1'],
      last: { subject: 'feat: AP-3', shortSha: 'ghi' },
      existing: new Set(['ghi']),
    });
    const gate = new FakeGate(false, true);
    const store = new FakeStore();

    const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
      ...baseInput,
      state: INITIAL_RESILIENCE_STATE,
    });

    expect(vcs.revertCalls).toBe(0);
    expect(out.gateResult).toBe('unverifiable');
    expect(out.record.shipped).toBe(false);
  });

  it("survives a gate PORT that throws instead of resolving (e.g. RemediatingGate's git commit/revert failing) — never propagates the rejection", async () => {
    const model = new FakeModel([shippedResponse('AP-4', 'jkl')]);
    const vcs = new FakeVcs({
      heads: ['h0', 'h1'],
      last: { subject: 'feat: AP-4', shortSha: 'jkl' },
      existing: new Set(['jkl']),
    });
    const gate = new ThrowingGate('git commit (checkpoint) failed (exit 1): hook rejected');
    const store = new FakeStore();

    const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
      ...baseInput,
      state: INITIAL_RESILIENCE_STATE,
    });

    expect(gate.runs).toBe(1);
    expect(vcs.revertCalls).toBe(0); // a thrown gate is not proof the work is bad — never reverted
    expect(out.gateResult).toBe('unverifiable');
    expect(out.record.shipped).toBe(false);
    expect(out.record.gateError).toContain('hook rejected');
    expect(store.records).toHaveLength(1); // the loop's outer while(...) never sees a rejection
  });

  it('refuses to certify a commit when uncommitted changes remain after it (GATE HOLE 2: the gate would judge the working tree, not the commit)', async () => {
    const model = new FakeModel([shippedResponse('AP-5', 'mno')]);
    const vcs = new FakeVcs({
      heads: ['h0', 'h1'],
      last: { subject: 'feat: AP-5', shortSha: 'mno' },
      existing: new Set(['mno']),
    });
    vcs.dirty = true; // a stray uncommitted fix riding along with the commit
    const gate = new FakeGate(true); // would pass — but on the CONTAMINATED tree
    const store = new FakeStore();

    const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
      ...baseInput,
      state: INITIAL_RESILIENCE_STATE,
    });

    expect(gate.runs).toBe(0); // never let a dirty tree stand in for the commit
    expect(vcs.revertCalls).toBe(0); // dirty is not proof the commit itself is bad
    expect(out.gateResult).toBe('unverifiable');
    expect(out.record.shipped).toBe(false);
    expect(out.record.gateError).toContain('uncommitted');
  });

  it('does not run the gate when HEAD did not advance (no commit)', async () => {
    const model = new FakeModel([
      response({ envelope: envelope({ result: 'thought about it, nothing to do' }) }),
    ]);
    const vcs = new FakeVcs({ heads: ['h0', 'h0'] });
    const gate = new FakeGate(true);
    const store = new FakeStore();

    const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
      ...baseInput,
      state: INITIAL_RESILIENCE_STATE,
    });

    expect(gate.runs).toBe(0);
    expect(out.gateResult).toBe('no-commit');
    expect(out.record.iterMetrics).toBe('missing');
    expect(out.record.shipped).toBe(false);
    // No sha to verify (nothing shipped) — the commit-range check is never
    // reached at all, not merely assumed false.
    expect(out.record.shaVerified).toBe(false);
    expect(vcs.commitInFiringRangeCalls).toBe(0);
    expect(out.record.gateChecks).toEqual([]);
  });

  it('ZERO WORK LOSS: packs uncommitted WIP into a checkpoint commit when a firing dies mid-unit', async () => {
    const model = new FakeModel([
      response({ envelope: envelope({ result: 'ran out of turns mid-refactor' }) }),
    ]);
    const vcs = new FakeVcs({
      heads: ['h0', 'h0'], // no commit made by the agent…
      last: {
        subject: 'wip(autopilot): checkpoint — firing 7 died mid-unit; next firing resumes it',
        shortSha: 'ckpt7',
      },
    });
    vcs.dirty = true; // …but the tree has WIP
    const gate = new FakeGate(true);
    const store = new FakeStore();

    const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
      ...baseInput,
      firing: 7,
      state: INITIAL_RESILIENCE_STATE,
    });

    expect(out.gateResult).toBe('checkpointed');
    expect(vcs.checkpointMessages).toHaveLength(1);
    expect(vcs.checkpointMessages[0]).toContain('wip(autopilot): checkpoint');
    expect(vcs.checkpointMessages[0]).toContain('firing 7');
    // GATE HOLE 4 (board web-mtb8i2jo-5g4fo5): a checkpoint IS gate-run now —
    // for honest telemetry only, never to gate whether it lands.
    expect(gate.runs).toBe(1);
    expect(vcs.revertCalls).toBe(0); // a checkpoint is never reverted, gate result notwithstanding
    expect(out.record.shipped).toBe(false); // honest: preserved, not shipped
    // HONEST HEADLINES: the checkpoint commit that WAS made must ride along in
    // telemetry — otherwise the dashboard has nothing to show but a false
    // "nothing committed" fallback (observed live, firing 163).
    expect(out.record.commitSubject).toBe(
      'wip(autopilot): checkpoint — firing 7 died mid-unit; next firing resumes it',
    );
  });

  it('GATE HOLE 4: a red gate on a checkpoint is recorded honestly but never reverted (ZERO-WORK-LOSS holds)', async () => {
    const model = new FakeModel([
      response({ envelope: envelope({ result: 'ran out of turns mid-refactor' }) }),
    ]);
    const vcs = new FakeVcs({
      heads: ['h0', 'h0'],
      last: {
        subject: 'wip(autopilot): checkpoint — firing 7 died mid-unit; next firing resumes it',
        shortSha: 'ckpt7',
      },
    });
    vcs.dirty = true;
    const checks = [{ label: 'typecheck', pass: false, durationMs: 12 }];
    const gate = { run: () => Promise.resolve({ ok: false, checks }) };
    const store = new FakeStore();

    const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
      ...baseInput,
      firing: 7,
      state: INITIAL_RESILIENCE_STATE,
    });

    expect(out.gateResult).toBe('checkpointed'); // red gate does NOT flip this to 'reverted'
    expect(vcs.revertCalls).toBe(0); // the WIP survives regardless of the gate verdict
    expect(vcs.checkpointMessages).toHaveLength(1);
    expect(out.record.gateChecks).toEqual(checks); // but the real verdict rides along, not an empty []
  });

  it("GATE HOLE 4: a checkpoint's gate port crashing is swallowed into gateError, never thrown or reverted", async () => {
    const model = new FakeModel([
      response({ envelope: envelope({ result: 'ran out of turns mid-refactor' }) }),
    ]);
    const vcs = new FakeVcs({
      heads: ['h0', 'h0'],
      last: {
        subject: 'wip(autopilot): checkpoint — firing 7 died mid-unit; next firing resumes it',
        shortSha: 'ckpt7',
      },
    });
    vcs.dirty = true;
    const gate = new ThrowingGate('gate crashed: missing dependency');
    const store = new FakeStore();

    const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
      ...baseInput,
      firing: 7,
      state: INITIAL_RESILIENCE_STATE,
    });

    expect(out.gateResult).toBe('checkpointed');
    expect(vcs.revertCalls).toBe(0);
    expect(vcs.checkpointMessages).toHaveLength(1);
    expect(out.record.gateError).toContain('gate crashed: missing dependency');
  });

  it('regression: the checkpoint header stays within commitlint header-max-length (100)', () => {
    // The real checkpoint message once ran to 107 chars and got rejected by
    // the commit-msg hook (commitlint's header-max-length, extended from
    // @commitlint/config-conventional) — silently stranding the WIP because
    // the caller's try/catch swallows commitAll failures. firing 12345 is a
    // generous upper bound on realistic firing numbers.
    expect(wipCheckpointMessage(12345).length).toBeLessThanOrEqual(100);
  });

  it('surfaces a swallowed checkpoint-commit failure in telemetry instead of vanishing it', async () => {
    const model = new FakeModel([
      response({ envelope: envelope({ result: 'ran out of turns mid-refactor' }) }),
    ]);
    const vcs = new FakeVcs({ heads: ['h0', 'h0'] });
    vcs.dirty = true; // WIP present…
    vcs.commitAllError = new Error('nothing stageable'); // …but the checkpoint itself fails
    const gate = new FakeGate(true);
    const store = new FakeStore();

    const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
      ...baseInput,
      state: INITIAL_RESILIENCE_STATE,
    });

    expect(out.gateResult).toBe('no-commit'); // honest: the checkpoint did not land
    expect(vcs.checkpointMessages).toHaveLength(0);
    expect(out.record.checkpointError).toBe('nothing stageable');
  });

  it('a clean tree with no commit stays plain no-commit (nothing to checkpoint)', async () => {
    const model = new FakeModel([response({ envelope: envelope({ result: 'noop' }) })]);
    const vcs = new FakeVcs({ heads: ['h0', 'h0'] });
    const gate = new FakeGate(true);
    const store = new FakeStore();
    const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
      ...baseInput,
      state: INITIAL_RESILIENCE_STATE,
    });
    expect(out.gateResult).toBe('no-commit');
    expect(vcs.checkpointMessages).toHaveLength(0);
  });

  it('does not trust a "shipped" self-report without a real commit (G2)', async () => {
    const model = new FakeModel([
      response({
        envelope: envelope({ result: 'METRICS:{"item":"AP-9","outcome":"shipped","sha":"lies"}' }),
      }),
    ]);
    const vcs = new FakeVcs({ heads: ['h0', 'h0'] }); // HEAD never advances → no real commit
    const gate = new FakeGate(true);
    const store = new FakeStore();

    const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
      ...baseInput,
      state: INITIAL_RESILIENCE_STATE,
    });

    expect(gate.runs).toBe(0);
    expect(out.gateResult).toBe('no-commit');
    expect(out.record.shipped).toBe(false); // git is ground truth, not the self-report
  });

  it('refires on the fallback after a primary quota failure', async () => {
    const model = new FakeModel([quotaResponse(), shippedResponse('AP-3', 'aaa')]);
    const vcs = new FakeVcs({
      heads: ['h0', 'h1'],
      last: { subject: 'fix: AP-3', shortSha: 'aaa' },
      existing: new Set(['aaa']),
    });
    const gate = new FakeGate(true);
    const store = new FakeStore();

    const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
      ...baseInput,
      state: INITIAL_RESILIENCE_STATE,
    });

    expect(model.calls).toEqual(['fable', 'opus']);
    expect(out.record.attempts).toBe(2);
    expect(out.record.quotaFallback).toBe(true);
    expect(out.state.consecQuota).toBe(1);
    expect(out.globalExhaust).toBe(false);
    expect(out.gateResult).toBe('passed');
  });

  it('detects global exhaustion when both models are quota-blocked', async () => {
    const model = new FakeModel([quotaResponse(), quotaResponse()]);
    const vcs = new FakeVcs({ heads: ['h0', 'h0'] });
    const gate = new FakeGate(true);
    const store = new FakeStore();

    const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
      ...baseInput,
      state: INITIAL_RESILIENCE_STATE,
    });

    expect(out.globalExhaust).toBe(true);
    expect(out.state.consecGlobalExhaust).toBe(1);
    expect(out.record.attempts).toBe(2);
  });

  it('starts on the fallback directly when the primary is exhausted (promoted)', async () => {
    const model = new FakeModel([shippedResponse('AP-4', 'bbb')]);
    const vcs = new FakeVcs({
      heads: ['h0', 'h1'],
      last: { subject: 'feat: AP-4', shortSha: 'bbb' },
      existing: new Set(['bbb']),
    });
    const gate = new FakeGate(true);
    const store = new FakeStore();

    const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
      ...baseInput,
      state: { consecQuota: 3, reprobeAfterEpoch: 9_999_999, consecGlobalExhaust: 0 },
    });

    expect(model.calls).toEqual(['opus']);
    expect(out.record.startedOn).toBe('fallback');
    expect(out.record.attempts).toBe(1);
    expect(out.state.consecQuota).toBe(3); // untouched — the primary was never attempted
  });

  it('degrades gracefully: derives from the commit when the envelope is missing', async () => {
    const model = new FakeModel([
      response({ envelope: null, stdout: 'raw output, no json envelope' }),
    ]);
    const vcs = new FakeVcs({
      heads: ['h0', 'h1'],
      last: { subject: 'fix: AP-7 the bug', shortSha: 'sha7' },
    });
    const gate = new FakeGate(true);
    const store = new FakeStore();

    const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
      ...baseInput,
      state: INITIAL_RESILIENCE_STATE,
    });

    expect(out.record.iterMetrics).toBe('envelope-error');
    expect(out.record.item).toBe('AP-7');
    expect(out.record.kind).toBe('fix');
    expect(out.record.sha).toBe('sha7');
    expect(out.record.shaVerified).toBe(false); // sha not in the existing set
    expect(out.gateResult).toBe('passed');
    expect(out.bad).toBe(true); // envelope-error trips the churn guard
  });

  it('DEATH-COST: a checkpoint death still records the real observed turns/tokens, not $0/0 (docs/EVALUATION-2026-08.md §3.6)', async () => {
    const model = new FakeModel([
      response({
        envelope: null,
        exitCode: 1,
        stdout: '',
        partialUsage: {
          modelUsed: 'claude-sonnet-5',
          tokensIn: 400,
          tokensOut: 80,
          turnsObserved: 2,
        },
      }),
    ]);
    const vcs = new FakeVcs({
      heads: ['h0'], // no advance — the dying firing never committed itself
      last: {
        subject: 'wip(autopilot): checkpoint — firing 1 died mid-unit; next firing resumes it',
        shortSha: 'ck1',
      },
    });
    vcs.dirty = true; // uncommitted WIP left behind by the killed child
    const gate = new FakeGate(true);
    const store = new FakeStore();

    const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
      ...baseInput,
      state: INITIAL_RESILIENCE_STATE,
    });

    expect(out.gateResult).toBe('checkpointed');
    // The real spend must not vanish into a fabricated $0/0 row just because
    // the envelope died mid-stream — the last streamed usage snapshot rides along.
    expect(out.record.model).toBe('claude-sonnet-5');
    expect(out.record.numTurns).toBe(2);
    expect(out.record.tokensIn).toBe(400);
    expect(out.record.tokensOut).toBe(80);
    // Cost is never invented from tokens — no pricing table to trust, stays unknown.
    expect(out.record.costUsd).toBeNull();
  });

  it('treats an empty HEAD read as no advance, never a fresh commit (a failed git command is not proof of work)', async () => {
    const model = new FakeModel([response({ envelope: envelope({ result: 'noop' }) })]);
    const vcs = new FakeVcs({ heads: ['h0', ''] }); // headAfter came back empty — vcs.head() failed
    const gate = new FakeGate(true);
    const store = new FakeStore();

    const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
      ...baseInput,
      state: INITIAL_RESILIENCE_STATE,
    });

    expect(gate.runs).toBe(0);
    expect(out.gateResult).toBe('no-commit');
    expect(out.record.headAdvanced).toBe(false);
  });

  it('resets a nonzero quota streak after a clean primary success', async () => {
    const model = new FakeModel([shippedResponse('AP-10', 'ccc')]);
    const vcs = new FakeVcs({
      heads: ['h0', 'h1'],
      last: { subject: 'feat: AP-10', shortSha: 'ccc' },
      existing: new Set(['ccc']),
    });
    const gate = new FakeGate(true);
    const store = new FakeStore();

    const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
      ...baseInput,
      state: { consecQuota: 2, reprobeAfterEpoch: 12345, consecGlobalExhaust: 0 },
    });

    expect(out.state.consecQuota).toBe(0);
    expect(out.state.reprobeAfterEpoch).toBe(0);
  });

  it('does NOT reset the quota streak on an unparseable envelope (not proof of a clean run)', async () => {
    const model = new FakeModel([
      response({ envelope: null, stdout: 'raw output, no json envelope' }),
    ]);
    const vcs = new FakeVcs({
      heads: ['h0', 'h1'],
      last: { subject: 'fix: AP-11 the bug', shortSha: 'sha11' },
    });
    const gate = new FakeGate(true);
    const store = new FakeStore();

    const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
      ...baseInput,
      state: { consecQuota: 2, reprobeAfterEpoch: 12345, consecGlobalExhaust: 0 },
    });

    expect(out.state.consecQuota).toBe(2); // unchanged — a missing envelope proves nothing
    expect(out.state.reprobeAfterEpoch).toBe(12345);
  });

  it('refires on the fallback when isError alone signals quota (exit code 0)', async () => {
    const model = new FakeModel([
      response({
        exitCode: 0,
        envelope: envelope({ isError: true, apiErrorStatus: 'usage limit reached' }),
      }),
      shippedResponse('AP-12', 'ddd'),
    ]);
    const vcs = new FakeVcs({
      heads: ['h0', 'h1'],
      last: { subject: 'feat: AP-12', shortSha: 'ddd' },
      existing: new Set(['ddd']),
    });
    const gate = new FakeGate(true);
    const store = new FakeStore();

    const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
      ...baseInput,
      state: INITIAL_RESILIENCE_STATE,
    });

    expect(model.calls).toEqual(['fable', 'opus']);
    expect(out.record.quotaFallback).toBe(true);
    expect(out.record.attempts).toBe(2);
  });

  it('carries the full envelope facts into the record', async () => {
    const model = new FakeModel([
      response({
        envelope: envelope({
          result: 'work done\nMETRICS:{"item":"AP-13","outcome":"shipped","sha":"eee"}',
          modelUsed: 'the-real-model-id',
          stopReason: 'end_turn',
          numTurns: 7,
          durationMs: 4321,
          costUsd: 1.23,
          tokensIn: 555,
          tokensOut: 222,
          cacheRead: 111,
          cacheCreate: 33,
        }),
      }),
    ]);
    const vcs = new FakeVcs({
      heads: ['h0', 'h1'],
      last: { subject: 'feat: AP-13', shortSha: 'eee' },
      existing: new Set(['eee']),
    });
    const gate = new FakeGate(true);
    const store = new FakeStore();

    const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
      ...baseInput,
      state: INITIAL_RESILIENCE_STATE,
    });

    expect(out.record).toMatchObject({
      model: 'the-real-model-id',
      stopReason: 'end_turn',
      numTurns: 7,
      durationMs: 4321,
      costUsd: 1.23,
      tokensIn: 555,
      tokensOut: 222,
      cacheRead: 111,
      cacheCreate: 33,
    });
  });

  it('reads the METRICS/PROPOSALS self-report text — never just re-derives from the commit', async () => {
    const model = new FakeModel([
      response({
        envelope: envelope({
          result:
            'work done\n' +
            'METRICS:{"item":"AP-99","outcome":"shipped","sha":"zzz"}\n' +
            'PROPOSALS:[{"title":"Add a retry budget","dimension":"data","severity":"medium"}]',
        }),
      }),
    ]);
    const vcs = new FakeVcs({
      heads: ['h0', 'h1'],
      // Deliberately unrelated to the self-report, so a fallback that
      // re-derives item/outcome from the commit subject instead of reading
      // the self-report text would disagree with these assertions.
      last: { subject: 'chore: unrelated commit subject', shortSha: 'zzz' },
      existing: new Set(['zzz']),
    });
    const gate = new FakeGate(true);
    const store = new FakeStore();

    const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
      ...baseInput,
      state: INITIAL_RESILIENCE_STATE,
    });

    expect(out.record.item).toBe('AP-99');
    expect(out.record.proposals).toEqual([
      {
        title: 'Add a retry budget',
        dimension: 'data',
        severity: 'medium',
        invalidTags: false,
        fromBacklog: false,
      },
    ]);
  });

  describe('WARM SESSIONS (docs/epics/0009-warm-sessions.md)', () => {
    it('passes input.resumeSessionId through to the model port on the primary attempt', async () => {
      const model = new FakeModel([shippedResponse('AP-5', 'mno')]);
      const vcs = new FakeVcs({
        heads: ['h0', 'h1'],
        last: { subject: 'feat: AP-5', shortSha: 'mno' },
        existing: new Set(['mno']),
      });
      const gate = new FakeGate(true);
      const store = new FakeStore();

      await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
        ...baseInput,
        state: INITIAL_RESILIENCE_STATE,
        resumeSessionId: 'prior-firing-session',
      });

      expect(model.resumeIds).toEqual(['prior-firing-session']);
    });

    it('omits resumeSessionId when the input has none (the default cold-spawn path)', async () => {
      const model = new FakeModel([shippedResponse('AP-6', 'pqr')]);
      const vcs = new FakeVcs({
        heads: ['h0', 'h1'],
        last: { subject: 'feat: AP-6', shortSha: 'pqr' },
        existing: new Set(['pqr']),
      });
      const gate = new FakeGate(true);
      const store = new FakeStore();

      await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
        ...baseInput,
        state: INITIAL_RESILIENCE_STATE,
      });

      expect(model.resumeIds).toEqual([undefined]);
    });

    it('treats a null resumeSessionId the same as absent (no session on hand → cold spawn)', async () => {
      const model = new FakeModel([shippedResponse('AP-7', 'stu')]);
      const vcs = new FakeVcs({
        heads: ['h0', 'h1'],
        last: { subject: 'feat: AP-7', shortSha: 'stu' },
        existing: new Set(['stu']),
      });
      const gate = new FakeGate(true);
      const store = new FakeStore();

      await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
        ...baseInput,
        state: INITIAL_RESILIENCE_STATE,
        resumeSessionId: null,
      });

      expect(model.resumeIds).toEqual([undefined]);
    });

    it('reuses the SAME resumeSessionId on the quota-fallback retry (not the fallback model starting cold)', async () => {
      const model = new FakeModel([quotaResponse(), shippedResponse('AP-8', 'vwx')]);
      const vcs = new FakeVcs({
        heads: ['h0', 'h1'],
        last: { subject: 'feat: AP-8', shortSha: 'vwx' },
        existing: new Set(['vwx']),
      });
      const gate = new FakeGate(true);
      const store = new FakeStore();

      await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
        ...baseInput,
        state: INITIAL_RESILIENCE_STATE,
        resumeSessionId: 'prior-firing-session',
      });

      expect(model.calls).toEqual(['fable', 'opus']);
      expect(model.resumeIds).toEqual(['prior-firing-session', 'prior-firing-session']);
    });

    it("records the model port's resumed flag on the FiringRecord (the measurable-win telemetry signal)", async () => {
      const model = new FakeModel([shippedResponse('AP-11', 'res1')]);
      const vcs = new FakeVcs({
        heads: ['h0', 'h1'],
        last: { subject: 'feat: AP-11', shortSha: 'res1' },
        existing: new Set(['res1']),
      });
      const gate = new FakeGate(true);
      const store = new FakeStore();

      const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
        ...baseInput,
        state: INITIAL_RESILIENCE_STATE,
        resumeSessionId: 'prior-firing-session',
      });

      // FakeModel's queued response carries no `resumed` field (ModelPort
      // fakes needn't set it) — the firing must fall back to `null`, never
      // fabricate `false`, when the driver didn't report it either way.
      expect(out.record.resumed).toBeNull();
    });

    it('records resumed:true when the model port reports a successful resume', async () => {
      const model = new FakeModel([{ ...shippedResponse('AP-12', 'res2'), resumed: true }]);
      const vcs = new FakeVcs({
        heads: ['h0', 'h1'],
        last: { subject: 'feat: AP-12', shortSha: 'res2' },
        existing: new Set(['res2']),
      });
      const gate = new FakeGate(true);
      const store = new FakeStore();

      const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
        ...baseInput,
        state: INITIAL_RESILIENCE_STATE,
        resumeSessionId: 'prior-firing-session',
      });

      expect(out.record.resumed).toBe(true);
    });

    it('records resumed:false when the model port fell back to a cold retry', async () => {
      const model = new FakeModel([{ ...shippedResponse('AP-13', 'res3'), resumed: false }]);
      const vcs = new FakeVcs({
        heads: ['h0', 'h1'],
        last: { subject: 'feat: AP-13', shortSha: 'res3' },
        existing: new Set(['res3']),
      });
      const gate = new FakeGate(true);
      const store = new FakeStore();

      const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
        ...baseInput,
        state: INITIAL_RESILIENCE_STATE,
        resumeSessionId: 'prior-firing-session',
      });

      expect(out.record.resumed).toBe(false);
    });

    it('defaults guardDenials to 0 on the FiringRecord when the driver reports none', async () => {
      const model = new FakeModel([shippedResponse('AP-14', 'res4')]);
      const vcs = new FakeVcs({
        heads: ['h0', 'h1'],
        last: { subject: 'feat: AP-14', shortSha: 'res4' },
        existing: new Set(['res4']),
      });
      const gate = new FakeGate(true);
      const store = new FakeStore();

      const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
        ...baseInput,
        state: INITIAL_RESILIENCE_STATE,
      });

      expect(out.guardDenials).toBe(0);
      expect(out.record.guardDenials).toBe(0);
    });

    it('records the guardDenials count from the model port on both the outcome and the FiringRecord', async () => {
      const model = new FakeModel([{ ...shippedResponse('AP-15', 'res5'), guardDenials: 3 }]);
      const vcs = new FakeVcs({
        heads: ['h0', 'h1'],
        last: { subject: 'feat: AP-15', shortSha: 'res5' },
        existing: new Set(['res5']),
      });
      const gate = new FakeGate(true);
      const store = new FakeStore();

      const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
        ...baseInput,
        state: INITIAL_RESILIENCE_STATE,
      });

      expect(out.guardDenials).toBe(3);
      expect(out.record.guardDenials).toBe(3);
    });

    it('defaults guardDenialDetails to [] on the FiringRecord when the driver reports none', async () => {
      const model = new FakeModel([shippedResponse('AP-14b', 'res4b')]);
      const vcs = new FakeVcs({
        heads: ['h0', 'h1'],
        last: { subject: 'feat: AP-14b', shortSha: 'res4b' },
        existing: new Set(['res4b']),
      });
      const gate = new FakeGate(true);
      const store = new FakeStore();

      const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
        ...baseInput,
        state: INITIAL_RESILIENCE_STATE,
      });

      expect(out.record.guardDenialDetails).toEqual([]);
    });

    it('threads structured guardDenialDetails (kind + target) from the model port onto the FiringRecord', async () => {
      const detail = { kind: 'containment' as const, target: 'outside the target repo.' };
      const model = new FakeModel([
        { ...shippedResponse('AP-15b', 'res5b'), guardDenials: 1, guardDenialDetails: [detail] },
      ]);
      const vcs = new FakeVcs({
        heads: ['h0', 'h1'],
        last: { subject: 'feat: AP-15b', shortSha: 'res5b' },
        existing: new Set(['res5b']),
      });
      const gate = new FakeGate(true);
      const store = new FakeStore();

      const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
        ...baseInput,
        state: INITIAL_RESILIENCE_STATE,
      });

      expect(out.record.guardDenialDetails).toEqual([detail]);
    });

    it("surfaces this firing's own session id from the final attempt's envelope, for the NEXT firing to resume", async () => {
      const model = new FakeModel([
        response({
          envelope: envelope({
            result: 'work done\nMETRICS:{"item":"AP-10","outcome":"shipped","sha":"yz1"}',
            sessionId: 'this-firings-session',
          }),
        }),
      ]);
      const vcs = new FakeVcs({
        heads: ['h0', 'h1'],
        last: { subject: 'feat: AP-10', shortSha: 'yz1' },
        existing: new Set(['yz1']),
      });
      const gate = new FakeGate(true);
      const store = new FakeStore();

      const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
        ...baseInput,
        state: INITIAL_RESILIENCE_STATE,
      });

      expect(out.sessionId).toBe('this-firings-session');
    });

    it('reports a null sessionId when the envelope carries none (next firing falls back to cold spawn)', async () => {
      const model = new FakeModel([shippedResponse('AP-11', 'yz2')]);
      const vcs = new FakeVcs({
        heads: ['h0', 'h1'],
        last: { subject: 'feat: AP-11', shortSha: 'yz2' },
        existing: new Set(['yz2']),
      });
      const gate = new FakeGate(true);
      const store = new FakeStore();

      const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
        ...baseInput,
        state: INITIAL_RESILIENCE_STATE,
      });

      expect(out.sessionId).toBeNull();
    });

    it('reports a null sessionId when the envelope never arrived at all (killed mid-firing)', async () => {
      const model = new FakeModel([{ stdout: '', exitCode: 1, envelope: null }]);
      const vcs = new FakeVcs({ heads: ['h0', 'h0'] });
      const gate = new FakeGate(true);
      const store = new FakeStore();

      const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
        ...baseInput,
        state: INITIAL_RESILIENCE_STATE,
      });

      expect(out.sessionId).toBeNull();
    });
  });

  describe('FINISH-LINE EXTENSION (founder policy 2026-08-20: whoever started, finishes)', () => {
    // Measured: a checkpoint hand-off makes a FRESH firing re-pay orientation,
    // and blanket session-resume costs MORE than it saves (-$1.28/firing over
    // 197 resumed firings). The cheapest closer of a mid-unit death is the
    // SAME worker with a slightly more open tap: one bounded resume of this
    // firing's own session, told explicitly to close the unit or cut a slice.
    /** A firing that died at its cap MID-UNIT, with a session to resume. */
    function capDeathResponse(over: Partial<ModelEnvelope> = {}): ModelResponse {
      return response({
        envelope: envelope({
          result: 'ran out mid-unit',
          stopReason: 'max_turns',
          sessionId: 'sess-own',
          costUsd: 5,
          numTurns: 120,
          ...over,
        }),
      });
    }

    it('grants ONE bounded extension on the SAME session, and a closing commit ships through the gate', async () => {
      const model = new FakeModel([
        capDeathResponse(),
        response({
          envelope: envelope({
            result: 'closed it\nMETRICS:{"item":"AP-9","outcome":"shipped","sha":"abc"}',
            sessionId: 'sess-own',
            costUsd: 1.5,
            numTurns: 20,
            stopReason: 'end_turn',
          }),
        }),
      ]);
      // head(): before, after-attempt (unchanged), after-extension (advanced)
      const vcs = new FakeVcs({
        heads: ['h0', 'h0', 'h1'],
        last: { subject: 'feat: closed the unit', shortSha: 'abc' },
        existing: new Set(['abc']),
      });
      // isDirty(): dirty pre-extension (triggers it), clean after the
      // extension's own closing commit (GATE HOLE 2 — a dirty post-commit
      // tree would otherwise block the gate from ever running here).
      vcs.dirtySequence = [true, false];
      const gate = new FakeGate(true);
      const store = new FakeStore();

      const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
        ...baseInput,
        state: INITIAL_RESILIENCE_STATE,
      });

      expect(model.calls).toHaveLength(2);
      expect(model.resumeIds[1]).toBe('sess-own'); // the SAME worker continues
      expect(model.caps[1]).toEqual(finishLineCaps(DEFAULT_ENGINE_CONFIG)); // a bounded tap, not a fresh full one
      expect(model.prompts[1]).toContain('FINISH-LINE EXTENSION'); // the worker is TOLD it is happening
      expect(model.prompts[1]).toContain('slice'); // …and told to cut if the unit is too big
      expect(out.gateResult).toBe('passed');
      expect(gate.runs).toBe(1);
      expect(vcs.checkpointMessages).toHaveLength(0); // no checkpoint — the unit CLOSED
      expect(out.record.extended).toBe(true);
      expect(out.record.costUsd).toBe(6.5); // honest accounting: both invocations
      expect(out.record.numTurns).toBe(140);
      expect(out.record.maxTurnsHit).toBe(false); // the extension ENDED cleanly — not a cap death
      expect(out.record.shipped).toBe(true);
    });

    it('a still-unclosed extension falls back to the checkpoint exactly as before', async () => {
      const model = new FakeModel([
        capDeathResponse(),
        response({
          envelope: envelope({
            result: 'still too big',
            sessionId: 'sess-own',
            costUsd: 1,
            numTurns: 10,
          }),
        }),
      ]);
      const vcs = new FakeVcs({ heads: ['h0', 'h0', 'h0'] });
      vcs.dirty = true;
      const gate = new FakeGate(true);
      const store = new FakeStore();

      const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
        ...baseInput,
        firing: 9,
        state: INITIAL_RESILIENCE_STATE,
      });

      expect(model.calls).toHaveLength(2);
      expect(out.gateResult).toBe('checkpointed');
      expect(vcs.checkpointMessages).toHaveLength(1);
      expect(out.record.extended).toBe(true);
      expect(out.record.costUsd).toBe(6); // 5 + 1 — the extension attempt is still paid for honestly
    });

    it('no session id on the dying attempt → no extension, straight to checkpoint (single invoke)', async () => {
      const model = new FakeModel([
        response({ envelope: envelope({ result: 'died mid-unit', stopReason: 'max_turns' }) }),
      ]);
      const vcs = new FakeVcs({ heads: ['h0', 'h0'] });
      vcs.dirty = true;
      const gate = new FakeGate(true);
      const store = new FakeStore();

      const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
        ...baseInput,
        state: INITIAL_RESILIENCE_STATE,
      });

      expect(model.calls).toHaveLength(1);
      expect(out.gateResult).toBe('checkpointed');
      expect(out.record.extended).toBeUndefined();
    });

    it('a CLEAN tree never gets an extension — there is no unit to finish', async () => {
      const model = new FakeModel([capDeathResponse()]);
      const vcs = new FakeVcs({ heads: ['h0', 'h0'] }); // dirty stays false
      const gate = new FakeGate(true);
      const store = new FakeStore();

      const out = await runFiring(deps(model, vcs, gate, store), DEFAULT_ENGINE_CONFIG, {
        ...baseInput,
        state: INITIAL_RESILIENCE_STATE,
      });

      expect(model.calls).toHaveLength(1);
      expect(out.gateResult).toBe('no-commit');
    });

    it("record.resumed reflects the ORIGINAL invocation, never the extension's own resume", async () => {
      const model = new FakeModel([
        capDeathResponse(), // original cold spawn: no `resumed` key at all
        {
          ...response({
            envelope: envelope({ result: 'still open', sessionId: 'sess-own', numTurns: 5 }),
          }),
          resumed: true, // the extension is by definition a resumed invocation
        },
      ]);
      const vcs = new FakeVcs({ heads: ['h0', 'h0', 'h0'] });
      vcs.dirty = true;
      const store = new FakeStore();

      const out = await runFiring(
        deps(model, vcs, new FakeGate(true), store),
        DEFAULT_ENGINE_CONFIG,
        {
          ...baseInput,
          state: INITIAL_RESILIENCE_STATE,
        },
      );

      // the warm-sessions measurement must not count extension resumes as
      // ordinary resumed firings — that would poison the very economics the
      // extension exists to beat.
      expect(out.record.resumed).toBeNull();
    });

    it('guard denials from both invocations are summed', async () => {
      const model = new FakeModel([
        { ...capDeathResponse(), guardDenials: 2 },
        {
          ...response({ envelope: envelope({ result: 'x', sessionId: 'sess-own' }) }),
          guardDenials: 1,
        },
      ]);
      const vcs = new FakeVcs({ heads: ['h0', 'h0', 'h0'] });
      vcs.dirty = true;
      const store = new FakeStore();

      const out = await runFiring(
        deps(model, vcs, new FakeGate(true), store),
        DEFAULT_ENGINE_CONFIG,
        {
          ...baseInput,
          state: INITIAL_RESILIENCE_STATE,
        },
      );

      expect(out.guardDenials).toBe(3);
    });

    it('guard denial details from both invocations are concatenated in wire order', async () => {
      const first = { kind: 'containment' as const, target: 'first denial.' };
      const second = { kind: 'read-hygiene' as const, target: 'second denial.' };
      const model = new FakeModel([
        { ...capDeathResponse(), guardDenials: 1, guardDenialDetails: [first] },
        {
          ...response({ envelope: envelope({ result: 'x', sessionId: 'sess-own' }) }),
          guardDenials: 1,
          guardDenialDetails: [second],
        },
      ]);
      const vcs = new FakeVcs({ heads: ['h0', 'h0', 'h0'] });
      vcs.dirty = true;
      const store = new FakeStore();

      const out = await runFiring(
        deps(model, vcs, new FakeGate(true), store),
        DEFAULT_ENGINE_CONFIG,
        {
          ...baseInput,
          state: INITIAL_RESILIENCE_STATE,
        },
      );

      expect(out.record.guardDenialDetails).toEqual([first, second]);
    });
  });

  describe('finishLineCaps', () => {
    it('grants ~40% of the firing caps', () => {
      expect(finishLineCaps(DEFAULT_ENGINE_CONFIG)).toEqual({ maxTurns: 48, maxBudgetUsd: 12 });
    });

    it('never grants less than a usable floor (10 turns, $1)', () => {
      expect(finishLineCaps({ ...DEFAULT_ENGINE_CONFIG, maxTurns: 12, maxBudgetUsd: 1.5 })).toEqual(
        { maxTurns: 10, maxBudgetUsd: 1 },
      );
    });
  });

  describe('finishLinePrompt', () => {
    it('notifies, bounds, and teaches the cut-a-slice rule', () => {
      const p = finishLinePrompt(42);
      expect(p).toContain('FINISH-LINE EXTENSION');
      expect(p).toContain('firing 42');
      expect(p).toContain('ONE');
      expect(p).toContain('slice');
      expect(p).toContain('METRICS');
    });
  });
});
