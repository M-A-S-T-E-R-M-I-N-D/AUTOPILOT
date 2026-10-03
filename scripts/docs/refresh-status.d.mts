// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

export interface EpicBuckets {
  shipped: number;
  active: number;
  draft: number;
}

export interface StatusFacts {
  version: string;
  released: string;
  nodeFloor: string;
  promptVersion: string;
  testFilesRounded: number;
  mutationConfigs: number;
  anomalyKinds: number;
  doctrineRows: number;
  epics: EpicBuckets;
}

export declare const STATUS_TARGETS: readonly string[];
export declare function epicBucket(statusLine: string): 'shipped' | 'active' | 'draft';
export declare function collectFacts(root?: string): StatusFacts;
export declare function renderFacts(facts: StatusFacts): string;
export declare function rewriteBlock(text: string, line: string): string | null;
