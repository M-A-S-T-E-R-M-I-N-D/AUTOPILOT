// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  fetchRepoIdentity,
  planPublicityAffordances,
  createPublicityPreviewApi,
  type RepoIdentity,
} from '../../src/flight/publicity.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

describe('fetchRepoIdentity', () => {
  it('calls gh repo view with the expected argv', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({
        nameWithOwner: 'octocat/hello-world',
        url: 'https://github.com/octocat/hello-world',
        isPrivate: false,
      }),
    });

    await fetchRepoIdentity(exec);

    expect(exec).toHaveBeenCalledWith('gh', [
      'repo',
      'view',
      '--json',
      'nameWithOwner,url,isPrivate,stargazerCount,watchers,forkCount',
    ]);
  });

  it('parses the star/watcher/fork counts, unwrapping gh’s nested watchers.totalCount', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({
        nameWithOwner: 'octocat/hello-world',
        url: 'https://github.com/octocat/hello-world',
        isPrivate: false,
        stargazerCount: 7,
        watchers: { totalCount: 3 },
        forkCount: 2,
      }),
    });

    expect(await fetchRepoIdentity(exec)).toEqual({
      nameWithOwner: 'octocat/hello-world',
      url: 'https://github.com/octocat/hello-world',
      isPrivate: false,
      stars: 7,
      watchers: 3,
      forks: 2,
    });
  });

  it('degrades each malformed count to undefined independently, never failing the identity', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({
        nameWithOwner: 'octocat/hello-world',
        url: 'https://github.com/octocat/hello-world',
        isPrivate: false,
        stargazerCount: 'seven',
        watchers: { totalCount: -1 },
        forkCount: 2,
      }),
    });

    const identity = await fetchRepoIdentity(exec);
    expect(identity?.stars).toBeUndefined();
    expect(identity?.watchers).toBeUndefined();
    expect(identity?.forks).toBe(2);
    expect(identity?.nameWithOwner).toBe('octocat/hello-world');
  });

  it('resolves the parsed identity on success', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({
        nameWithOwner: 'octocat/hello-world',
        url: 'https://github.com/octocat/hello-world',
        isPrivate: true,
      }),
    });

    expect(await fetchRepoIdentity(exec)).toEqual({
      nameWithOwner: 'octocat/hello-world',
      url: 'https://github.com/octocat/hello-world',
      isPrivate: true,
    });
  });

  it('returns undefined on a non-zero exit', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 1, stdout: '' });
    expect(await fetchRepoIdentity(exec)).toBeUndefined();
  });

  it('returns undefined on unparseable stdout', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: 'not json' });
    expect(await fetchRepoIdentity(exec)).toBeUndefined();
  });

  it('returns undefined when the payload is missing a required field', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({ nameWithOwner: 'octocat/hello-world' }),
    });
    expect(await fetchRepoIdentity(exec)).toBeUndefined();
  });

  it('returns undefined when the payload is not an object', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: JSON.stringify(null) });
    expect(await fetchRepoIdentity(exec)).toBeUndefined();
  });

  it('returns undefined when nameWithOwner is an empty string', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({
        nameWithOwner: '',
        url: 'https://github.com/octocat/hello-world',
        isPrivate: false,
      }),
    });
    expect(await fetchRepoIdentity(exec)).toBeUndefined();
  });
});

describe('planPublicityAffordances', () => {
  it('dormants every affordance with a placeholder href when identity is unresolved', () => {
    const affordances = planPublicityAffordances(undefined);

    expect(affordances).toHaveLength(4);
    for (const affordance of affordances) {
      expect(affordance.dormant).toBe(true);
      expect(affordance.url).toBe('#');
      expect(affordance.reasoning).toBe('GitHub repo identity unavailable — connect gh to enable');
    }
    expect(affordances.map((a) => a.id)).toEqual(['repo', 'watch', 'star', 'discussions']);
  });

  it('dormants every affordance at the real repo URL while private', () => {
    const repo: RepoIdentity = {
      nameWithOwner: 'octocat/hello-world',
      url: 'https://github.com/octocat/hello-world',
      isPrivate: true,
    };

    const affordances = planPublicityAffordances(repo);

    for (const affordance of affordances) {
      expect(affordance.dormant).toBe(true);
      expect(affordance.reasoning).toBe(
        'octocat/hello-world is private — publicity affordances stay dormant until it goes public',
      );
    }
    const byId = Object.fromEntries(affordances.map((a) => [a.id, a]));
    expect(byId['repo']?.url).toBe('https://github.com/octocat/hello-world');
    expect(byId['watch']?.url).toBe('https://github.com/octocat/hello-world/subscription');
    expect(byId['star']?.url).toBe('https://github.com/octocat/hello-world/stargazers');
    expect(byId['discussions']?.url).toBe('https://github.com/octocat/hello-world/discussions');
  });

  it('deep-links every affordance to its OWN GitHub page — the operator caught all four landing on the repo root', () => {
    const repo: RepoIdentity = {
      nameWithOwner: 'octocat/hello-world',
      url: 'https://github.com/octocat/hello-world',
      isPrivate: false,
    };

    const urls = planPublicityAffordances(repo).map((a) => a.url);

    expect(urls).toEqual([
      'https://github.com/octocat/hello-world',
      'https://github.com/octocat/hello-world/subscription',
      'https://github.com/octocat/hello-world/stargazers',
      'https://github.com/octocat/hello-world/discussions',
    ]);
    // Four affordances, four distinct destinations — no duplicates.
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('wears each identity count as the matching affordance badge: stars on Star, watchers on Watch, forks on View repo', () => {
    const repo: RepoIdentity = {
      nameWithOwner: 'octocat/hello-world',
      url: 'https://github.com/octocat/hello-world',
      isPrivate: false,
      stars: 7,
      watchers: 3,
      forks: 2,
    };

    const byId = Object.fromEntries(planPublicityAffordances(repo).map((a) => [a.id, a.count]));

    expect(byId).toEqual({ repo: 2, watch: 3, star: 7, discussions: undefined });
  });

  it('renders no count badges when the identity carries no counts', () => {
    const repo: RepoIdentity = {
      nameWithOwner: 'octocat/hello-world',
      url: 'https://github.com/octocat/hello-world',
      isPrivate: false,
    };

    for (const affordance of planPublicityAffordances(repo)) {
      expect(affordance.count).toBeUndefined();
    }
  });

  it('makes every affordance live once the repo is public', () => {
    const repo: RepoIdentity = {
      nameWithOwner: 'octocat/hello-world',
      url: 'https://github.com/octocat/hello-world',
      isPrivate: false,
    };

    const affordances = planPublicityAffordances(repo);

    for (const affordance of affordances) {
      expect(affordance.dormant).toBe(false);
      expect(affordance.reasoning).toBe(
        'octocat/hello-world is public — publicity affordances are live',
      );
    }
  });

  it('carries display labels for every affordance', () => {
    const affordances = planPublicityAffordances(undefined);
    const byId = Object.fromEntries(affordances.map((a) => [a.id, a.label]));
    expect(byId).toEqual({
      repo: 'View repo',
      watch: 'Watch',
      star: 'Star',
      discussions: 'Discussions',
    });
  });
});

describe('createPublicityPreviewApi', () => {
  it('resolves live affordances for a public repo', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({
        nameWithOwner: 'octocat/hello-world',
        url: 'https://github.com/octocat/hello-world',
        isPrivate: false,
      }),
    });

    const affordances = await createPublicityPreviewApi(exec)();

    expect(affordances.every((a) => !a.dormant)).toBe(true);
    expect(affordances.find((a) => a.id === 'repo')?.url).toBe(
      'https://github.com/octocat/hello-world',
    );
  });

  it('resolves dormant affordances for a private repo', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({
        nameWithOwner: 'octocat/hello-world',
        url: 'https://github.com/octocat/hello-world',
        isPrivate: true,
      }),
    });

    const affordances = await createPublicityPreviewApi(exec)();

    expect(affordances.every((a) => a.dormant)).toBe(true);
  });

  it('degrades to the unresolved-identity affordance set when exec rejects', async () => {
    const exec: CliExec = vi.fn().mockRejectedValue(new Error('gh not on PATH'));

    const affordances = await createPublicityPreviewApi(exec)();

    expect(affordances).toEqual(planPublicityAffordances(undefined));
  });

  it('degrades to the unresolved-identity affordance set on a non-zero exit', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 1, stdout: '' });

    const affordances = await createPublicityPreviewApi(exec)();

    expect(affordances).toEqual(planPublicityAffordances(undefined));
  });
});
