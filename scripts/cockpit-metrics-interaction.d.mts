// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

export interface InteractionTimings {
  evalMs: number;
  tickDrains: number[];
  durations: number[];
}

export interface InteractionSummary {
  interactions: number;
  inpP75: number;
  inpMax: number;
  evalMs: number;
  maxTickMs: number;
  longestTask: number;
}

export declare function percentile(values: number[], p: number): number;
export declare function summarizeInteractionTiming(timings: InteractionTimings): InteractionSummary;
