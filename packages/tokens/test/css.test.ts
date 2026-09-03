// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { stylesheet, colorVars, globalVars, m3Vars, shapeStateVars } from '../src/css.js';
import { DARK } from '../src/themes.js';

describe('css generation', () => {
  it('emits kebab-cased color custom properties for a theme', () => {
    const vars = colorVars(DARK);
    expect(vars['--color-surface']).toBe(DARK.surface);
    expect(vars['--color-surface-raised']).toBe(DARK.surfaceRaised);
    expect(vars['--color-sev-critical']).toBe(DARK.sevCritical);
  });

  it('emits theme-invariant primitives', () => {
    const vars = globalVars();
    expect(vars['--space-4']).toBe('1rem');
    expect(vars['--radius-md']).toBe('0.5rem');
    expect(vars['--text-xl']).toBe('1.5rem');
    expect(vars['--font-mono']).toContain('monospace');
    expect(vars['--font-sans']).toContain('"Inter"'); // self-hosted (M3 design foundation)
    expect(vars['--font-m3']).toContain('"Roboto"'); // the type-scale pass's typeface (live — see the next test)
    expect(vars['--duration-fast']).toBe('120ms');
    expect(vars['--duration-normal']).toBe('240ms');
    expect(vars['--ease']).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
  });

  it('emits Material 3 elevation, shape, motion, state, and type-scale vars', () => {
    const vars = m3Vars();
    expect(vars['--elevation-level-0']).toBe('none');
    expect(vars['--elevation-tint-5']).toBe('0.14');
    expect(vars['--shape-extra-large']).toBe('28px');
    expect(vars['--duration-short1']).toBe('50ms');
    expect(vars['--easing-standard-decelerate']).toMatch(/^cubic-bezier\(/);
    expect(vars['--state-hover']).toBe('0.08');
    expect(vars['--type-title-medium-size']).toBe('16px');
    expect(vars['--type-title-medium-line-height']).toBe('24px');
    expect(vars['--type-title-medium-weight']).toBe('500');
    expect(vars['--type-title-medium-tracking']).toBe('0.15px');
  });

  it('folds the M3 vars into globalVars (single :root emission)', () => {
    const vars = globalVars();
    expect(vars['--shape-full']).toBe('9999px');
    expect(vars['--type-body-large-size']).toBe('16px');
  });

  it('emits MX shape-morph hover/pressed radii per SHAPE role, skipping none/full', () => {
    const vars = shapeStateVars();
    expect(vars['--shape-extra-small-hover']).toBe('2px');
    expect(vars['--shape-extra-small-pressed']).toBe('6px');
    expect(vars['--shape-extra-large-hover']).toBe('26px');
    expect(vars['--shape-extra-large-pressed']).toBe('30px');
    expect(vars['--shape-none-hover']).toBeUndefined();
    expect(vars['--shape-none-pressed']).toBeUndefined();
    expect(vars['--shape-full-hover']).toBeUndefined();
    expect(vars['--shape-full-pressed']).toBeUndefined();
  });

  it('folds shape-state vars into m3Vars', () => {
    const vars = m3Vars();
    expect(vars['--shape-extra-small-hover']).toBe('2px');
    expect(vars['--shape-extra-small-pressed']).toBe('6px');
  });

  it('builds a stylesheet with :root globals and a block per theme', () => {
    const css = stylesheet();
    expect(css).toContain(':root {');
    expect(css).toContain("[data-theme='dark'] {");
    expect(css).toContain("[data-theme='light'] {");
    expect(css).toContain("[data-theme='terminal'] {");
    expect(css).toContain('--color-surface:');
    expect(css).toContain('--space-4: 1rem;');
  });

  it('joins adjacent property lines within a block with newlines, not concatenation', () => {
    const css = stylesheet();
    expect(css).toContain('--space-8: 3rem;\n  --radius-sm: 0.25rem;');
  });

  it('separates each block from the next with a blank line', () => {
    const css = stylesheet();
    expect(css).toContain("}\n\n[data-theme='dark'] {");
  });
});
