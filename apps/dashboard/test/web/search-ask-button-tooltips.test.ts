// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit v2 (web-msm66jlc-gm4oom): the searchbar was
 * half-finished — the "Deep" toggle already explains itself via [data-tip],
 * but its four sibling buttons (Search, Ask, and the GENIUS/ARCHITECT persona
 * switch) carried no tip at all, so the search-vs-ask split and the persona
 * semantics stayed invisible until you tried them. Static markup, so the
 * assertions read the attributes straight off renderShell().
 */

import { describe, it, expect } from 'vitest';
import { renderShell } from '../../src/web/shell.js';

function bootStatic(): void {
  document.open();
  document.write(renderShell());
  document.close();
}

describe('the searchbar buttons explain themselves on hover/focus', () => {
  it('tips Search as a code search over the selected project', () => {
    bootStatic();
    const btn = document.getElementById('search-go');
    expect(btn?.getAttribute('data-tip')).toBe(
      'Find matching code in the selected project — hits list the file, line, and surrounding excerpt.',
    );
  });

  it('tips Ask as a streamed AI answer built from the indexed code', () => {
    bootStatic();
    const btn = document.getElementById('ask-go');
    expect(btn?.getAttribute('data-tip')).toBe(
      'Ask the question instead of searching — an AI answer built from the indexed code streams in below.',
    );
  });

  it('tips GENIUS as the read-only default persona', () => {
    bootStatic();
    const btn = document.querySelector('[data-persona-btn="genius"]');
    expect(btn?.getAttribute('data-tip')).toBe(
      'Read-only persona (default): answers questions but never touches the dashboard.',
    );
  });

  it('tips ARCHITECT as the propose-and-approve persona that resets each session', () => {
    bootStatic();
    const btn = document.querySelector('[data-persona-btn="architect"]');
    expect(btn?.getAttribute('data-tip')).toBe(
      'Can propose dashboard actions for you to approve — opt-in per session, resets to GENIUS on reload.',
    );
  });
});
