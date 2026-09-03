// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countText } from './wordcount.js';

test('counts lines, words, and chars like wc', () => {
  const result = countText('hello world\nsecond line\n');
  assert.deepEqual(result, { lines: 2, words: 4, chars: 24 });
});

test('handles empty input', () => {
  assert.deepEqual(countText(''), { lines: 0, words: 0, chars: 0 });
});

test('counts a single line with no trailing newline', () => {
  const result = countText('one two three');
  assert.deepEqual(result, { lines: 0, words: 3, chars: 13 });
});

test('collapses runs of whitespace between words', () => {
  const result = countText('a   b\tc');
  assert.deepEqual(result, { lines: 0, words: 3, chars: 7 });
});
