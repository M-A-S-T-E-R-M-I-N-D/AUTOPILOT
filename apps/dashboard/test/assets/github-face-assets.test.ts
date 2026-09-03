// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AVATAR_SIZE,
  SOCIAL_PREVIEW_HEIGHT,
  SOCIAL_PREVIEW_WIDTH,
  renderAvatarPng,
  renderSocialPreviewPng,
} from '../../src/assets/brandmark.js';

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));

/**
 * Epic 0008 slice 3's mechanical half: committed static PNG exports for the
 * GitHub-facing avatar and social-preview card, generated once (not served
 * per-request the way the favicon route is) since a human uploads them
 * through GitHub Settings, not a live endpoint. Same commit-and-guard
 * pattern as `readme-brand-assets.test.ts` — the file on disk must stay
 * byte-identical to a fresh render, so `goggles-mark.ts`'s geometry/color
 * stays the one source of truth instead of drifting from a hand-copied PNG.
 */
describe('GitHub face assets', () => {
  it('docs/brand/avatar.png matches a fresh renderAvatarPng() render', () => {
    const onDisk = readFileSync(join(REPO_ROOT, 'docs/brand/avatar.png'));
    expect(onDisk).toEqual(renderAvatarPng());
  });

  it('docs/brand/social-preview.png matches a fresh renderSocialPreviewPng() render', () => {
    const onDisk = readFileSync(join(REPO_ROOT, 'docs/brand/social-preview.png'));
    expect(onDisk).toEqual(renderSocialPreviewPng());
  });

  it('avatar.png is square at the documented AVATAR_SIZE', () => {
    const onDisk = readFileSync(join(REPO_ROOT, 'docs/brand/avatar.png'));
    expect(onDisk.readUInt32BE(16)).toBe(AVATAR_SIZE);
    expect(onDisk.readUInt32BE(20)).toBe(AVATAR_SIZE);
  });

  it("social-preview.png matches GitHub's recommended 1280x640 (2:1) card size", () => {
    const onDisk = readFileSync(join(REPO_ROOT, 'docs/brand/social-preview.png'));
    expect(onDisk.readUInt32BE(16)).toBe(SOCIAL_PREVIEW_WIDTH);
    expect(onDisk.readUInt32BE(20)).toBe(SOCIAL_PREVIEW_HEIGHT);
  });
});
