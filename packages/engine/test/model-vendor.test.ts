// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * WHO MADE THE MODEL (operator, 2026-09-14). The rules worth pinning are
 * the ones that keep a provenance line honest: every model this build can
 * actually fly is attributed, an unknown one says so rather than guessing,
 * and a locally-served model keeps BOTH facts — who published it and that
 * it ran here.
 */

import { describe, it, expect } from 'vitest';
import { resolveModelVendor, isLocallyServed, modelCredit } from '../src/model-vendor.js';
import { MODEL_CATALOGUE } from '../src/models.js';

describe('resolveModelVendor', () => {
  it('attributes every model in this build’s own catalogue', () => {
    // The catalogue is what a picker offers. If any entry resolved to
    // "unknown", the fleet would be flying something it cannot credit.
    for (const entry of MODEL_CATALOGUE) {
      const resolved = resolveModelVendor(entry.id);
      expect(resolved.confidence, entry.id).toBe('named');
      expect(resolved.vendor.id, entry.id).toBe('anthropic');
    }
  });

  it('reads a vendor off a model this build has never seen', () => {
    // The whole point of matching conventions rather than a fixed list: a
    // model released after this build still gets credited correctly.
    expect(resolveModelVendor('claude-fable-7').vendor.name).toBe('Anthropic');
    expect(resolveModelVendor('gpt-6-turbo').vendor.name).toBe('OpenAI');
    expect(resolveModelVendor('gemini-4-pro').vendor.name).toBe('Google');
    expect(resolveModelVendor('llama-5-70b').vendor.name).toBe('Meta');
    expect(resolveModelVendor('grok-5').vendor.name).toBe('xAI');
    expect(resolveModelVendor('qwen3-coder').vendor.name).toBe('Alibaba Cloud');
    expect(resolveModelVendor('deepseek-v4').vendor.name).toBe('DeepSeek');
    expect(resolveModelVendor('devstral-2').vendor.name).toBe('Mistral AI');
  });

  it('admits ignorance instead of guessing', () => {
    const r = resolveModelVendor('some-model-7b');
    expect(r.confidence).toBe('unknown');
    expect(r.vendor.id).toBe('unknown');
    expect(r.because).toContain('matches no naming convention');
  });

  it('says so when no model was recorded at all', () => {
    for (const blank of ['', '   ']) {
      const r = resolveModelVendor(blank);
      expect(r.confidence).toBe('unknown');
      expect(r.because).toContain('no model was recorded');
    }
  });

  it('keeps both halves of a locally-served model: who published it, and that it ran here', () => {
    const r = resolveModelVendor('ollama/llama3.1:8b');
    expect(r.vendor.name).toBe('Meta');
    expect(r.confidence).toBe('named');
    expect(isLocallyServed('ollama/llama3.1:8b')).toBe(true);
    expect(isLocallyServed('claude-sonnet-5')).toBe(false);
  });

  it('falls back to "a local model" when a local id names no publisher', () => {
    const r = resolveModelVendor('ollama/my-finetune');
    expect(r.vendor.id).toBe('local');
    expect(r.confidence).toBe('unknown');
  });

  it('gives every named vendor a URL a reader can check, and none to the two that have no claim to make', () => {
    for (const id of ['claude-sonnet-5', 'gpt-6', 'gemini-4-pro', 'grok-5']) {
      expect(resolveModelVendor(id).vendor.url, id).toMatch(/^https:\/\//);
    }
    expect(resolveModelVendor('').vendor.url).toBeUndefined();
    expect(resolveModelVendor('ollama/my-finetune').vendor.url).toBeUndefined();
  });
});

describe('modelCredit', () => {
  it('prints one sentence a human can read, never a guess dressed as a fact', () => {
    expect(modelCredit('claude-sonnet-5')).toBe('claude-sonnet-5 (Anthropic)');
    expect(modelCredit('some-model-7b')).toBe('some-model-7b (publisher not identified)');
    expect(modelCredit('  ')).toBe('Model not recorded');
  });
});
