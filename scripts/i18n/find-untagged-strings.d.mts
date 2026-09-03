// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

export interface UntaggedFinding {
  file: string;
  line: number;
  kind: 'text' | 'aria-label' | 'placeholder';
  tag: string;
  text: string;
}

export declare function scanSource(source: string, file: string): UntaggedFinding[];
export declare function scanRoot(root: string): UntaggedFinding[];
export declare function formatReport(findings: UntaggedFinding[], root: string): string;
