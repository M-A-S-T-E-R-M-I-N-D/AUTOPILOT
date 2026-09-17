// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  fetchCollaborationSnapshot,
  createCollaborationApi,
} from '../../src/flight/collaboration.js';
import { ROADMAP_LABEL } from '../../src/flight/roadmap-items.js';
import { HELP_WANTED_LABEL } from '../../src/flight/help-wanted-items.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

const roadmapIssue = {
  number: 16,
  title: 'Full dashboard i18n',
  url: 'https://github.com/example/repo/issues/16',
  labels: [{ name: ROADMAP_LABEL }],
  assignees: [{ login: 'octocat' }],
};

const helpWantedIssue = {
  number: 42,
  title: 'Fix the thing',
  url: 'https://github.com/example/repo/issues/42',
  labels: [{ name: HELP_WANTED_LABEL }],
  assignees: [],
};

describe('fetchCollaborationSnapshot', () => {
  it('combines the roadmap and help-wanted reads behind one call', async () => {
    const exec: CliExec = vi.fn().mockImplementation(async (_cmd, args: readonly string[]) => {
      const label = args[args.indexOf('--label') + 1];
      if (label === ROADMAP_LABEL) {
        return { code: 0, stdout: JSON.stringify([roadmapIssue]) };
      }
      if (label === HELP_WANTED_LABEL) {
        return { code: 0, stdout: JSON.stringify([helpWantedIssue]) };
      }
      return { code: 0, stdout: '[]' };
    });

    const snapshot = await fetchCollaborationSnapshot(exec);

    expect(snapshot.roadmap).toEqual([
      {
        number: 16,
        title: 'Full dashboard i18n',
        url: 'https://github.com/example/repo/issues/16',
        labels: [ROADMAP_LABEL],
        assignees: ['octocat'],
      },
    ]);
    expect(snapshot.helpWanted).toEqual([
      {
        number: 42,
        title: 'Fix the thing',
        url: 'https://github.com/example/repo/issues/42',
        labels: [HELP_WANTED_LABEL],
        assignees: [],
      },
    ]);
  });

  it('returns empty lists when both reads come back empty', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: '[]' });

    const snapshot = await fetchCollaborationSnapshot(exec);

    expect(snapshot).toEqual({ roadmap: [], helpWanted: [] });
  });
});

describe('createCollaborationApi', () => {
  it('degrades to an empty snapshot rather than rejecting when exec throws', async () => {
    const exec: CliExec = vi.fn().mockRejectedValue(new Error('gh unavailable'));
    const api = createCollaborationApi(exec);

    const snapshot = await api();

    expect(snapshot).toEqual({ roadmap: [], helpWanted: [] });
  });

  it('resolves the composed snapshot on success', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: '[]' });
    const api = createCollaborationApi(exec);

    await expect(api()).resolves.toEqual({ roadmap: [], helpWanted: [] });
  });
});
