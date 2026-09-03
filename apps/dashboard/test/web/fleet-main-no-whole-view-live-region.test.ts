// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0015 lead #1 (cockpit supervisory control, "whole-view live region"),
 * re-verdicted 2026-08-28: `<main id="fleet">` has carried
 * `aria-live="polite"` since the first auto-refreshing UI (bdfd27a5),
 * making the whole fleet view — 77% of the document's nodes at 8 fleet rows
 * — announcement-eligible on every real state change, not just the curated
 * per-control status lines (`#updated`, `#fly-status`) that already cover
 * meaningful updates. A screen reader would have every fleet-card DOM diff
 * read out uncurated on top of those. First of the lead's two task-ready
 * cuts (the second, quieting `#updated`/`#fly-status` on unchanged polls,
 * already shipped). The single-announcer replacement this cut moves toward
 * is separate follow-on work — removing the whole-view region is already a
 * strict improvement on its own.
 */

import { describe, it, expect } from 'vitest';
import { renderShell } from '../../src/web/shell.js';

describe('#fleet carries no whole-view live region', () => {
  it('does not set aria-live on <main id="fleet">', () => {
    document.open();
    document.write(renderShell());
    document.close();

    const fleet = document.getElementById('fleet')!;
    expect(fleet.hasAttribute('aria-live')).toBe(false);
  });

  it('still tracks loading state via aria-busy', () => {
    document.open();
    document.write(renderShell());
    document.close();

    const fleet = document.getElementById('fleet')!;
    expect(fleet.getAttribute('aria-busy')).toBe('true');
  });
});
