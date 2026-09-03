// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

export interface RtlHazardFinding {
  file: string;
  line: number;
  hazard: string;
  suggestion: string;
}

export declare function scanCssSource(source: string, file: string): RtlHazardFinding[];
export declare function scanRoot(root: string): RtlHazardFinding[];
export declare function formatReport(findings: RtlHazardFinding[], root: string): string;
