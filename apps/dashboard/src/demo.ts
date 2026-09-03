// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * `pnpm dashboard:demo` — populate the dashboard with real, inspectable data so
 * the Fleet view has something to show before the live engine loop lands.
 *
 * These are genuine sample repos put through the ACTUAL onboarding pipeline
 * (backup ritual → gate detection → content-hash index) into the real store at
 * the canonical DB path — nothing here is fabricated telemetry. Firings/findings
 * are honestly empty until a project actually flies. Idempotent: re-running
 * resumes each project instead of duplicating it. All artifacts live under the
 * git-ignored `.autopilot/` workspace.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { openStore, migrate, SqliteSearchStore } from '@autopilot/store';
import {
  onboard,
  GitBackup,
  FsFileSource,
  SqliteIndexStore,
  SqliteProjectStore,
  readFsSnapshot,
  taskIdSource,
  type OnboardDeps,
} from '@autopilot/onboarding';
import { resolveDbPath } from './read/config.js';

interface Sample {
  readonly name: string;
  readonly files: Readonly<Record<string, string>>;
}

const SAMPLES: readonly Sample[] = [
  {
    name: 'checkout-web',
    files: {
      'package.json': `${JSON.stringify(
        { name: 'checkout-web', scripts: { test: 'vitest run', build: 'tsc -b' } },
        null,
        2,
      )}\n`,
      'pnpm-lock.yaml': '',
      'src/index.ts':
        'export const total = (items: number[]) => items.reduce((a, b) => a + b, 0);\n',
      'src/cart.ts': 'export interface Cart {\n  items: number[];\n}\n',
      'README.md': '# checkout-web\n\nA sample TypeScript storefront.\n',
    },
  },
  {
    name: 'billing-svc',
    files: {
      'pyproject.toml': '[tool.pytest.ini_options]\ntestpaths = ["tests"]\n',
      'app.py': 'def invoice(amount: float) -> float:\n    return round(amount * 1.17, 2)\n',
      'tests/test_app.py':
        'from app import invoice\n\n\ndef test_invoice():\n    assert invoice(100) == 117.0\n',
      'README.md': '# billing-svc\n\nA sample Python billing service.\n',
    },
  },
  {
    name: 'edge-router',
    files: {
      'go.mod': 'module edge-router\n\ngo 1.22\n',
      'main.go': 'package main\n\nfunc main() {}\n',
      'router.go': 'package main\n\nfunc route(path string) string { return path }\n',
      'README.md': '# edge-router\n\nA sample Go edge router.\n',
    },
  },
];

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

function git(repo: string, args: readonly string[]): void {
  execFileSync('git', ['-C', repo, ...args], { stdio: 'ignore' });
}

/** Create a real git repo for a sample the first time; no-op if it exists. */
function ensureRepo(dir: string, files: Readonly<Record<string, string>>): void {
  if (existsSync(join(dir, '.git'))) return;
  mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'demo@autopilot.local']);
  git(dir, ['config', 'user.name', 'AUTOPILOT Demo']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'seed demo project']);
}

async function main(): Promise<void> {
  const dbPath = resolveDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });
  const demoRoot = join(dirname(dbPath), 'demo');

  const store = openStore(dbPath);
  migrate(store);
  const nextDemoTaskId = taskIdSource('demo-task');

  out('Seeding demo projects (real onboarding: backup → detect → index)…');
  try {
    for (const sample of SAMPLES) {
      const dir = join(demoRoot, sample.name);
      ensureRepo(dir, sample.files);
      const deps: OnboardDeps = {
        vcs: new GitBackup(dir),
        readSnapshot: (root) => readFsSnapshot(root),
        fileSource: new FsFileSource(dir),
        indexStore: new SqliteIndexStore(store),
        contentIndex: new SqliteSearchStore(store),
        projects: new SqliteProjectStore(store, nextDemoTaskId),
        newId: () => `demo-${sample.name}`,
      };
      const result = await onboard(deps, { root: dir, name: sample.name });
      out(
        `  ${result.resumed ? 'resumed ' : 'onboarded'} ${sample.name.padEnd(14)} ` +
          `${result.gate.spec.ecosystem.padEnd(7)} +${result.indexDiff.added.length} files`,
      );
    }
  } finally {
    store.close();
  }

  out('');
  out(`Done — ${SAMPLES.length} projects in ${dbPath}`);
  out('Start/refresh the dashboard to watch them:  pnpm dashboard:start');
}

void main();
