// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

export interface CountResult {
  readonly lines: number;
  readonly words: number;
  readonly chars: number;
}

/** Mirrors `wc`: lines counts newline characters, not "logical" text lines. */
export function countText(text: string): CountResult {
  if (text.length === 0) {
    return { lines: 0, words: 0, chars: 0 };
  }

  const lines = (text.match(/\n/g) ?? []).length;
  const trimmed = text.trim();
  const words = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;

  return { lines, words, chars: text.length };
}
