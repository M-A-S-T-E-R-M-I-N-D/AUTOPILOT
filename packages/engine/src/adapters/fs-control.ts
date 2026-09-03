// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { INITIAL_RESILIENCE_STATE, type ResilienceState } from '../resilience.js';

// `Number.isFinite` (unlike the global `isFinite`) never coerces its
// argument — it returns `false` outright for any non-number, making a
// preceding `typeof v === 'number'` guard provably redundant.
function numOr0(v: unknown): number {
  return Number.isFinite(v) ? (v as number) : 0;
}

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface FsControlOptions {
  /** STOP sentinel path — its presence requests a graceful stop. */
  readonly stopFile: string;
  /** Persisted runner state (resilience streaks + cooldown), restart-safe. */
  readonly stateFile: string;
  /** The prompt/SOUL file; its SHA-256 prefix is the prompt version. */
  readonly promptFile: string;
  /** Optional structured log file. */
  readonly logFile?: string;
  /** Retro appendix appended to the prompt on RETRO firings. */
  readonly retroAppendix?: (firing: number) => string;
  /** STOP-aware sleep chunk (default 60s); smaller in tests. */
  readonly sleepChunkMs?: number;
  /** Injectable delay (tests). */
  readonly delay?: (ms: number) => Promise<void>;
}

/**
 * Filesystem control surface for the loop: STOP sentinel, restart-safe runner
 * state, prompt loading + versioning, and STOP-aware chunked sleep (ENGINE-
 * RESEARCH G7/G10). Kept adapter-thin so the loop stays pure and testable.
 */
export class FsControl {
  constructor(private readonly opts: FsControlOptions) {}

  stopRequested(): Promise<boolean> {
    return Promise.resolve(existsSync(this.opts.stopFile));
  }

  loadState(): Promise<ResilienceState> {
    try {
      const raw = JSON.parse(readFileSync(this.opts.stateFile, 'utf8')) as Record<string, unknown>;
      return Promise.resolve({
        consecQuota: numOr0(raw['consecQuota']),
        reprobeAfterEpoch: numOr0(raw['reprobeAfterEpoch']),
        consecGlobalExhaust: numOr0(raw['consecGlobalExhaust']),
      });
    } catch {
      return Promise.resolve(INITIAL_RESILIENCE_STATE);
    }
  }

  saveState(state: ResilienceState): Promise<void> {
    writeFileSync(this.opts.stateFile, JSON.stringify(state));
    return Promise.resolve();
  }

  buildPrompt(firing: number, retro: boolean): Promise<{ text: string; version: string }> {
    const base = readFileSync(this.opts.promptFile, 'utf8');
    const version = createHash('sha256').update(base).digest('hex').slice(0, 8);
    const text = retro && this.opts.retroAppendix ? base + this.opts.retroAppendix(firing) : base;
    return Promise.resolve({ text, version });
  }

  async sleep(minutes: number): Promise<void> {
    // No `minutes <= 0` guard needed: `chunks` below is <= 0 whenever
    // `minutes` is, so the loop's own `i < chunks` bound already makes this
    // a no-op — a preceding early return would be provably dead code.
    const chunkMs = this.opts.sleepChunkMs ?? 60_000;
    const delay = this.opts.delay ?? defaultDelay;
    const chunks = Math.ceil((minutes * 60_000) / chunkMs);
    for (let i = 0; i < chunks; i++) {
      if (existsSync(this.opts.stopFile)) return; // STOP-aware: wake to exit
      await delay(chunkMs);
    }
  }

  log(message: string): void {
    if (this.opts.logFile) {
      appendFileSync(this.opts.logFile, `${new Date().toISOString()}  ${message}\n`);
    }
  }
}
