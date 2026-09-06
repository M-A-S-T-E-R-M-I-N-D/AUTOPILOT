// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure status-pill label/tip/aria-label math
 * (`web/status-pill.ts`) — extracted under epic 0002 "shell decomposition",
 * slice 2. No existing test, direct or indirect, exercised this logic
 * beforehand — a genuine zero-coverage gap the same shape as the
 * twenty-second through twenty-fourth cuts.
 *
 * i18n (board web-msnsndki-dz3vn1): the helper now resolves each status's
 * label through the caller's `status → STRINGS key` map and an injected
 * translator, its tip through that key's `Tip` twin, and composes the
 * aria-label from the shared `statusAria` template; the injected `tr` here is
 * a fake, so these pin the key routing itself rather than any one locale's
 * text.
 */

import { describe, it, expect } from 'vitest';
import { statusPillMeta, type StatusPillTranslator } from '../../src/web/status-pill.js';

const KEYS = {
  flying: 'projectStatusFlying',
  needs_approval: 'taskStatusNeedsApproval',
};

const TEXT: Record<string, string> = {
  statusAria: 'Status: {label} — {tip}',
  projectStatusFlying: 'flying',
  projectStatusFlyingTip: 'A firing is in progress right now',
  taskStatusNeedsApproval: 'needs approval',
  taskStatusNeedsApprovalTip: 'Self-proposed — waiting on your approve/reject decision',
};

/** A `tr()` stand-in with the real one's `{slot}` substitution shape. */
const tr: StatusPillTranslator = (key, subs) =>
  Object.entries(subs ?? {}).reduce(
    (text, [slot, value]) => text.split(`{${slot}}`).join(String(value)),
    TEXT[key] ?? `<missing ${key}>`,
  );

describe('statusPillMeta', () => {
  it('resolves the label through the key map and the tip through its `Tip` twin key', () => {
    const meta = statusPillMeta('flying', KEYS, tr);
    expect(meta.label).toBe('flying');
    expect(meta.tip).toBe('A firing is in progress right now');
    expect(meta.labelKey).toBe('projectStatusFlying');
    expect(meta.tipKey).toBe('projectStatusFlyingTip');
  });

  it('composes the "Status: <label> — <tip>" aria-label from the statusAria template', () => {
    expect(statusPillMeta('flying', KEYS, tr).ariaLabel).toBe(
      'Status: flying — A firing is in progress right now',
    );
  });

  it('builds the aria-label off the translated label, not the raw status', () => {
    expect(statusPillMeta('needs_approval', KEYS, tr).ariaLabel).toBe(
      'Status: needs approval — Self-proposed — waiting on your approve/reject decision',
    );
  });

  it('follows the active locale through the translator, not a fixed English table', () => {
    const he: StatusPillTranslator = (key, subs) =>
      key === 'statusAria' ? `סטטוס: ${subs?.['label']} — ${subs?.['tip']}` : `he:${key}`;
    const meta = statusPillMeta('flying', KEYS, he);
    expect(meta.label).toBe('he:projectStatusFlying');
    expect(meta.tip).toBe('he:projectStatusFlyingTip');
    expect(meta.ariaLabel).toBe('סטטוס: he:projectStatusFlying — he:projectStatusFlyingTip');
  });

  it('falls back to the raw status with its first underscore spaced when the map has no entry', () => {
    expect(statusPillMeta('unknown_status', KEYS, tr).label).toBe('unknown status');
    expect(statusPillMeta('a_b_c', KEYS, tr).label).toBe('a b_c');
    expect(statusPillMeta('plain', KEYS, tr).label).toBe('plain');
  });

  it('returns a null tip, aria-label, and keys when the status has no entry in the map', () => {
    const meta = statusPillMeta('unknown_status', KEYS, tr);
    expect(meta.tip).toBeNull();
    expect(meta.ariaLabel).toBeNull();
    expect(meta.labelKey).toBeNull();
    expect(meta.tipKey).toBeNull();
  });
});
