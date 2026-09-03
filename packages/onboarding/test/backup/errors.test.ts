// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  RepoNotBackedUpError,
  PossibleSecretsDetectedError,
  HugeFileDetectedError,
} from '../../src/backup/errors.js';

describe('RepoNotBackedUpError', () => {
  it('carries the repo root in the message and sets name+instanceof', () => {
    const err = new RepoNotBackedUpError('/tmp/some-repo');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('RepoNotBackedUpError');
    expect(err.message).toBe(
      'repo is not backed up (missing MYTH/LEGACY snapshot): /tmp/some-repo',
    );
  });
});

describe('PossibleSecretsDetectedError', () => {
  it('joins multiple offending paths with ", " in the message', () => {
    const err = new PossibleSecretsDetectedError(['.env', 'config/secret.pem']);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('PossibleSecretsDetectedError');
    expect(err.message).toBe(
      'baseline aborted — possible secret(s) detected, remove or .gitignore them first: .env, config/secret.pem',
    );
  });

  it('renders a single path with no separator', () => {
    const err = new PossibleSecretsDetectedError(['.env']);
    expect(err.message).toBe(
      'baseline aborted — possible secret(s) detected, remove or .gitignore them first: .env',
    );
  });
});

describe('HugeFileDetectedError', () => {
  it('joins multiple offending paths with ", " in the message', () => {
    const err = new HugeFileDetectedError(['dist/bundle.wasm', 'data/dump.sqlite']);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('HugeFileDetectedError');
    expect(err.message).toBe(
      'baseline aborted — file(s) too large to stage, remove or .gitignore them first: dist/bundle.wasm, data/dump.sqlite',
    );
  });

  it('renders a single path with no separator', () => {
    const err = new HugeFileDetectedError(['dist/bundle.wasm']);
    expect(err.message).toBe(
      'baseline aborted — file(s) too large to stage, remove or .gitignore them first: dist/bundle.wasm',
    );
  });
});
