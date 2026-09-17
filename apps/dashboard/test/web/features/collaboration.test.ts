// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the COLLABORATION panel client
 * (`web/features/collaboration.ts`, board web-mtpzqrxl-z7jgbu) — a
 * self-init deferred region under `web/features/`, the same shape
 * `web/features/contributor-issue-list.ts` establishes.
 */

import { describe, it, expect } from 'vitest';
import {
  collaborationClaimStateLabel,
  isMyCollaborationClaim,
} from '../../../src/web/collaboration-panel.js';
import { collaborationJs } from '../../../src/web/features/collaboration.js';

describe('collaborationJs', () => {
  it('embeds collaborationClaimStateLabel/isMyCollaborationClaim real compiled source via .toString()', () => {
    const out = collaborationJs();
    expect(out).toContain(collaborationClaimStateLabel.toString());
    expect(out).toContain(isMyCollaborationClaim.toString());
  });

  it('fetches GET /api/collaboration and self-initializes on a poll timer', () => {
    const out = collaborationJs();
    expect(out).toContain("fetch('/api/collaboration'");
    expect(out).toContain('loadCollaborationPanel();');
    expect(out).toContain('setInterval(loadCollaborationPanel, COLLABORATION_POLL_MS);');
  });

  it('resolves the viewer login via the shared socialIdentity() resolver, not a second fetch', () => {
    const out = collaborationJs();
    expect(out).toContain('socialIdentity()');
    expect(out).not.toContain("fetch('/api/social-identity'");
  });

  it('renders into #collaboration-panel and hides it when both lists come back empty', () => {
    const out = collaborationJs();
    expect(out).toContain("document.getElementById('collaboration-panel')");
    expect(out).toContain('var empty = roadmap.length === 0 && helpWanted.length === 0;');
  });

  it('keeps the roadmap/help-wanted split — one group per label family, in order', () => {
    const out = collaborationJs();
    const roadmapIdx = out.indexOf("collaborationGroup(section, visibleRoadmap, 'Roadmap'");
    const helpWantedIdx = out.indexOf(
      "collaborationGroup(section, visibleHelpWanted, 'Help wanted'",
    );
    expect(roadmapIdx).toBeGreaterThan(-1);
    expect(helpWantedIdx).toBeGreaterThan(roadmapIdx);
  });

  it('gives the my-claims toggle a real checkbox input, keyboard-reachable like every other control here', () => {
    const out = collaborationJs();
    expect(out).toContain("toggle.type = 'checkbox';");
    expect(out).toContain("toggle.addEventListener('change'");
  });

  it('only offers the my-claims toggle once a viewer login has resolved', () => {
    const out = collaborationJs();
    expect(out).toContain('if (collaborationViewerLogin) {');
  });

  it('sweeps i18n after rendering', () => {
    expect(collaborationJs()).toContain("translateDom(document.documentElement.lang || 'en');");
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = collaborationJs();
    expect(out).toBe(out.trim());
  });
});
