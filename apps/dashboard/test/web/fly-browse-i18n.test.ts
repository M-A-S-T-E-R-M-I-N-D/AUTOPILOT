// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The browse-folder modal's remaining runtime-built English (board
 * web-msnsndki-dz3vn1): the firing-204 slice translated the modal's two
 * imperatively-set aria-labels (`browseDrives`/`browseUpParent`) but left
 * its static TEXT English — the "Browse a folder" title, the error body,
 * the Close/Cancel/"Use this folder" buttons, the empty-state line, and
 * the subfolder group's path-bearing aria-label. All of it is built fresh
 * inside `paintBrowse()`/`paintBrowseError()` on every open, so `tr()` at
 * build time is the right sweep — there is no persistent DOM node for
 * `translateDom()` to revisit, the same reason the aria-labels went this
 * way. Same generated-text assertion style as `fly-browse-tooltips.test.ts`;
 * `client-tr-keys.test.ts` resolves every key asserted here against
 * STRINGS, so a typo'd key fails that suite rather than rendering
 * `undefined`. The `data-tip` hover texts stay English by the same policy
 * every prior slice applied, and the literal '.. (up)' stays path-notation
 * (its aria-label is the translated half).
 */

import { describe, it, expect } from 'vitest';
import { flyJs } from '../../src/web/features/fly.js';

describe('the browse-folder modal reads its static text from STRINGS', () => {
  const out = flyJs();

  it('titles both dialogs (success and error paint) via tr()', () => {
    // One builder titles both paints, leading with its icon (epic 0025,
    // browse-dialog-title-icon.test.ts drives it in the DOM).
    expect(out).toContain("h.appendChild(document.createTextNode(tr('browseFolderTitle')));");
    expect(out.match(/dialog\.appendChild\(browseTitle\(\)\);/g) ?? []).toHaveLength(2);
    expect(out).not.toContain("'Browse a folder'");
  });

  it('translates the error dialog body and its Close button', () => {
    expect(out).toContain("el('p', 'browse-path', tr('browseError'))");
    // Each action leads with its icon (epic 0025,
    // browse-dialog-action-icons.test.ts drives them in the DOM).
    expect(out).toContain("close.appendChild(document.createTextNode(tr('close')));");
    expect(out).not.toContain("'Could not list that folder.'");
  });

  it('translates the Cancel and "Use this folder" actions', () => {
    expect(out).toContain("cancel.appendChild(document.createTextNode(tr('cancel')));");
    expect(out).toContain("use.appendChild(document.createTextNode(tr('useThisFolder')));");
  });

  it('translates the empty-state line', () => {
    expect(out).toContain("el('p', 'muted browse-empty', tr('noSubfolders'))");
    expect(out).not.toContain("'No subfolders here.'");
  });

  it('templates the subfolder group aria-label so the path lands where the locale puts it', () => {
    expect(out).toContain(
      "list.setAttribute('aria-label', tr('browseSubfoldersOf', { path: data.path }));",
    );
    expect(out).not.toContain("'Subfolders of ' + data.path");
  });
});
