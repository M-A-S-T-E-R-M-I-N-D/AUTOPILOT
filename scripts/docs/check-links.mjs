// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Relative-link integrity scan for every committed Markdown file.
 *
 * A broken doc link is the first thing an outside contributor hits — GitHub
 * renders `[CONTRIBUTING.md](CONTRIBUTING.md)` as a live link and serves a 404
 * when the target moved. Nothing in the gate noticed that class until the
 * founder spotted it by hand (2026-08-24), so this is the machine check:
 * every `[text](path)` whose target is a repo-relative path must resolve to a
 * real file. External URLs, `mailto:`, and pure `#anchors` are out of scope —
 * this scan proves LOCAL paths only, which is what git can actually verify.
 *
 * Report-only by default; `--check` exits 1 on the first broken link so the
 * gate can block on it.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Directories that hold build output, dependencies, or sibling worktrees —
 *  never the repo's own authored docs. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.autopilot-worktrees',
  '.autopilot',
]);

const LINK_RE = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** Every `.md` file under `dir`, recursively, skipping {@link SKIP_DIRS}. */
function markdownFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.stryker')) continue;
      out.push(...markdownFiles(join(dir, entry.name)));
    } else if (entry.name.endsWith('.md')) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

/**
 * A link target this scan can verify against the filesystem — repo-relative
 * paths only. Absolute URLs, protocol links and in-page anchors are not
 * git-verifiable, so they are deliberately out of scope rather than guessed.
 * Pure — no fs access — so it can be unit-tested directly against fixture
 * strings, same shape as validate-no-personal-paths.mjs's findPersonalPaths().
 * @param {string} target
 * @returns {boolean}
 */
export function isLocalTarget(target) {
  if (target.length === 0) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return false; // http:, https:, mailto:, …
  if (target.startsWith('#')) return false;
  if (target.startsWith('//')) return false;
  return true;
}

function main() {
  const broken = [];
  let checked = 0;

  for (const file of markdownFiles(ROOT)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(LINK_RE)) {
      const raw = match[1];
      if (!isLocalTarget(raw)) continue;
      // An `#anchor` suffix names a heading inside the target, not a file.
      const path = raw.split('#')[0];
      if (path.length === 0) continue;
      checked += 1;
      const resolved = normalize(join(dirname(file), path));
      if (!existsSync(resolved)) {
        broken.push({ file: relative(ROOT, file), target: raw });
      }
    }
  }

  // ---- canonical-repo URLs --------------------------------------------------
  // The relative-link scan above cannot see absolute URLs, and that blind spot
  // shipped a real defect: `package.json`'s `homepage` still carried the
  // scaffold placeholder `github.com/mastermind/autopilot`, so CITATION.cff
  // pointed anyone citing this work at a repo that does not exist, and the LTS
  // chip asked GitHub for releases of a phantom (founder caught it by eye,
  // 2026-08-24). `homepage` is the single source of truth; every OTHER
  // github.com URL naming this project must agree with it.
  const HOMEPAGE = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).homepage ?? '';
  const CANONICAL = /^https:\/\/github\.com\/([^/]+)\/([^/#?]+)/.exec(HOMEPAGE);
  const GITHUB_URL_RE = /https:\/\/github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)/g;

  /** Docs and packaging metadata a human or a citation tool actually follows.
   *  Test files are excluded on purpose: their repo slugs are synthetic
   *  fixtures exercising parsing, not claims about where this project lives. */
  const METADATA_FILES = [
    'package.json',
    'CITATION.cff',
    'NOTICE',
    'REUSE.toml',
    'README.md',
    '.github/CONTRIBUTING.md',
    '.github/SECURITY.md',
    '.github/ISSUE_TEMPLATE/config.yml',
  ];

  const wrongRepo = [];
  if (CANONICAL) {
    const [, owner, repo] = CANONICAL;
    for (const rel of METADATA_FILES) {
      const abs = join(ROOT, rel);
      if (!existsSync(abs)) continue;
      for (const m of readFileSync(abs, 'utf8').matchAll(GITHUB_URL_RE)) {
        // Only URLs claiming to BE this project — a link to some other
        // project's repo (a dependency, an upstream issue) is legitimate.
        // A clone URL legitimately carries a `.git` suffix on the repo name.
        const seenRepo = m[2].replace(/\.git$/, '');
        if (m[1] === owner && seenRepo === repo) continue;
        if (
          m[1].toLowerCase() === owner.toLowerCase() ||
          seenRepo.toLowerCase() === repo.toLowerCase()
        ) {
          wrongRepo.push({ file: rel, url: m[0] });
        }
      }
    }
  }

  const label = process.argv.includes('--check') ? 'check-links' : 'check-links (report)';
  process.stdout.write(
    `${label}: ${checked} relative link(s) checked, ${broken.length} broken; ` +
      `canonical repo ${CANONICAL ? `${CANONICAL[1]}/${CANONICAL[2]}` : '(unset)'}, ` +
      `${wrongRepo.length} mismatched URL(s).\n`,
  );
  for (const b of broken) {
    process.stdout.write(`  ${b.file.split('\\').join('/')}  ->  ${b.target}\n`);
  }
  for (const w of wrongRepo) {
    process.stdout.write(`  ${w.file}  ->  ${w.url}  (not the canonical repo)\n`);
  }

  if (broken.length > 0) {
    process.stdout.write('\nA relative link must resolve to a real file in this repo.\n');
  }
  if (wrongRepo.length > 0) {
    process.stdout.write("\nProject URLs must match package.json's homepage.\n");
  }
  if ((broken.length > 0 || wrongRepo.length > 0) && process.argv.includes('--check')) {
    process.exit(1);
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
