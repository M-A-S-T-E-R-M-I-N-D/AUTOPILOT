// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Flat ESLint config for the AUTOPILOT monorepo.
 *
 * M0 baseline: JS-recommended + typescript-eslint recommended (syntactic,
 * fast, deterministic in CI) + Prettier compatibility. Type-aware rules are
 * introduced at M1 once real engine logic exists (tracked in BACKLOG-999).
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.tsbuildinfo',
      '.husky/**',
      // Local AUTOPILOT workspace (store DB + demo/flight sample repos, git-ignored).
      '.autopilot/**',
      '.autopilot-run/**',
      // Standalone target-repo fixtures under samples/ — each owns its
      // own eslint config and gate; not part of this monorepo's lint.
      'samples/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'error',
      'no-debugger': 'error',
      eqeqeq: ['error', 'always'],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Test files may use console for diagnostics and looser assertions.
    files: ['**/test/**/*.ts', '**/*.test.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // CI/tooling scripts run in Node and legitimately log to stdout/stderr.
    files: ['scripts/**/*.mjs', 'scripts/**/*.js'],
    rules: {
      'no-console': 'off',
    },
  },
  prettier,
);
