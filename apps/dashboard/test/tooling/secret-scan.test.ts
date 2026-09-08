// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for the pure findSecrets() rule engine of scripts/ci/secret-scan.mjs,
 * the CI gate that fails a run if a tracked file leaks a high-confidence
 * credential pattern. `main()` itself stays unimported — it shells out to
 * `git ls-files` and reads the whole tree, same stance
 * apps/dashboard/test/tooling/detect-flaky.test.ts takes for its sibling script.
 *
 * Fixtures build each secret shape via runtime string concatenation instead of
 * a literal match in source — otherwise this very file's raw text would trip
 * secret-scan.mjs when `pnpm run verify` scans the tree (same reason
 * apps/dashboard/test/connection/service.test.ts uses an under-threshold
 * 'sk-ant-test-not-real' fixture instead of a real-shaped key).
 */
import { describe, it, expect } from 'vitest';
import { findSecrets } from '../../../../scripts/ci/secret-scan.mjs';

describe('findSecrets', () => {
  it('returns no findings for clean text', () => {
    expect(findSecrets('const greeting = "hello world";\nexport default greeting;')).toEqual([]);
  });

  it('detects a private key block', () => {
    const line = '-----BEGIN' + ' RSA PRIVATE KEY-----';
    expect(findSecrets(line)).toEqual([{ line: 1, rule: 'private-key-block' }]);
  });

  it('detects an AWS access key id', () => {
    const line = 'AKIA' + 'ABCDEFGHIJKLMNOP';
    expect(findSecrets(line)).toEqual([{ line: 1, rule: 'aws-access-key-id' }]);
  });

  it('detects a github token', () => {
    const line = 'ghp_' + 'A'.repeat(36);
    expect(findSecrets(line)).toEqual([{ line: 1, rule: 'github-token' }]);
  });

  it('detects a github fine-grained PAT', () => {
    const line = 'github_pat_' + 'A'.repeat(22);
    expect(findSecrets(line)).toEqual([{ line: 1, rule: 'github-fine-grained-pat' }]);
  });

  it('detects a slack token', () => {
    const line = 'xoxb-' + '1234567890';
    expect(findSecrets(line)).toEqual([{ line: 1, rule: 'slack-token' }]);
  });

  it('detects a google api key', () => {
    const line = 'AIza' + 'A'.repeat(35);
    expect(findSecrets(line)).toEqual([{ line: 1, rule: 'google-api-key' }]);
  });

  it('detects a stripe live secret key', () => {
    const line = 'sk_live_' + 'A'.repeat(24);
    expect(findSecrets(line)).toEqual([{ line: 1, rule: 'stripe-secret-key' }]);
  });

  it('detects an anthropic api key', () => {
    const line = 'sk-ant-' + 'A'.repeat(20);
    expect(findSecrets(line)).toEqual([{ line: 1, rule: 'anthropic-api-key' }]);
  });

  it('detects an openai api key', () => {
    const line = 'sk-' + 'A'.repeat(48);
    expect(findSecrets(line)).toEqual([{ line: 1, rule: 'openai-api-key' }]);
  });

  it('detects an npm token', () => {
    const line = 'npm_' + 'A'.repeat(36);
    expect(findSecrets(line)).toEqual([{ line: 1, rule: 'npm-token' }]);
  });

  it('detects a jwt', () => {
    const line = 'eyJ' + 'A'.repeat(10) + '.' + 'B'.repeat(10) + '.' + 'C'.repeat(10);
    expect(findSecrets(line)).toEqual([{ line: 1, rule: 'jwt' }]);
  });

  it('detects a slack webhook url', () => {
    const line = 'https://hooks.slack.com/services/' + 'A'.repeat(20);
    expect(findSecrets(line)).toEqual([{ line: 1, rule: 'slack-webhook' }]);
  });

  it('detects url-embedded credentials', () => {
    const line = 'https://user' + ':pass@example.com';
    expect(findSecrets(line)).toEqual([{ line: 1, rule: 'url-embedded-credentials' }]);
  });

  it('does not match an under-threshold near-miss key', () => {
    // Same shape as the anthropic rule but too short — a real regression here
    // (an accidentally-loosened quantifier) would start flagging test fixtures
    // like this repo's own 'sk-ant-test-not-real' placeholders.
    expect(findSecrets('sk-ant-test-not-real')).toEqual([]);
  });

  it('reports 1-indexed line numbers for a match past the first line', () => {
    const key = 'AKIA' + 'ABCDEFGHIJKLMNOP';
    const text = `const a = 1;\nconst b = 2;\nconst leaked = "${key}";`;
    expect(findSecrets(text)).toEqual([{ line: 3, rule: 'aws-access-key-id' }]);
  });

  it('collects one finding per matching rule across multiple lines', () => {
    const aws = 'AKIA' + 'ABCDEFGHIJKLMNOP';
    const npm = 'npm_' + 'B'.repeat(36);
    const text = `const a = "${aws}";\nconst clean = "fine";\nconst b = "${npm}";`;
    expect(findSecrets(text)).toEqual([
      { line: 1, rule: 'aws-access-key-id' },
      { line: 3, rule: 'npm-token' },
    ]);
  });
});
