// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 4, `docs/epics/0005-cockpit-redesign.md`):
 * "Color is semantic only: green = flying/shipped, amber = waiting/queued/paused,
 * red = failure/danger, one accent for identity." The dashboard-wide semantic-color
 * pass mapped the project page's four surfaces — board task chips, flight-log
 * verdict chips, the worker card, the phase rail — onto those tokens, but only the
 * chart surfaces had the mapping pinned (`charts-cockpit-language.test.ts`); a
 * refactor could silently hand a project-page state a borrowed severity color
 * again. Same assertion idiom as that test: find the rule in the emitted
 * stylesheet, pin its tokens.
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

function ruleFor(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `rule "${selector}" exists`).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('}', start);
  return css.slice(start, end + 1);
}

const css = layoutCss();

describe('board task chips carry semantic color only (COCKPIT 4/6)', () => {
  it('a done task reads success, never the borrowed severity green', () => {
    const done = ruleFor(css, '.task-done');
    expect(done).toContain('var(--color-success)');
    expect(done).not.toContain('--color-sev-low');
  });

  it('the mark-done CTA reads success too', () => {
    const btn = ruleFor(css, '.task-done-btn');
    expect(btn).toContain('var(--color-success)');
    expect(btn).not.toContain('--color-sev-low');
  });

  it('an in-progress task reads the identity accent', () => {
    expect(ruleFor(css, '.task-in_progress')).toContain('var(--color-accent)');
  });
});

describe('flight-log verdict chips map outcomes onto the semantic tokens (COCKPIT 4/6)', () => {
  it('shipped reads success, never the borrowed severity green', () => {
    const shipped = ruleFor(css, '.flight-shipped');
    expect(shipped).toContain('var(--color-success)');
    expect(shipped).not.toContain('--color-sev-low');
  });

  it('failure verdicts read danger', () => {
    expect(ruleFor(css, '.flight-reverted')).toContain('var(--color-sev-high)');
    expect(ruleFor(css, '.flight-turn-capped, .flight-timed-out, .flight-errored')).toContain(
      'var(--color-sev-high)',
    );
  });

  it('attention verdicts read amber', () => {
    expect(ruleFor(css, '.flight-unverified, .flight-checkpointed')).toContain(
      'var(--color-sev-medium)',
    );
  });

  it('a verdict-carrying flight reads the identity accent', () => {
    expect(ruleFor(css, '.flight-verdict-carrying')).toContain('var(--color-accent)');
  });
});

describe('the worker card is the accent-identified live surface (COCKPIT 4/6)', () => {
  it('rests on an accent border over a raised surface with real depth', () => {
    const worker = ruleFor(css, '.live-worker');
    expect(worker).toContain('var(--color-accent)');
    expect(worker).toContain('var(--color-surface-raised)');
    expect(worker).toContain('var(--elevation-level-1)');
  });

  it('its phase tags keep their semantics: commit = accent, gate = attention', () => {
    expect(ruleFor(css, '.live-phase-commit')).toContain('var(--color-accent)');
    expect(ruleFor(css, '.live-phase-gate')).toContain('var(--color-sev-medium)');
  });
});

describe('the phase rail marks the active phase with the accent (COCKPIT 4/6)', () => {
  it('the on-segment reads the identity accent, not a decorative color', () => {
    expect(ruleFor(css, '.phase-on')).toContain('var(--color-accent)');
  });
});
