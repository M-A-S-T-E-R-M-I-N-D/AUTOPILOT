// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  symlinkSync,
  readdirSync,
  readFileSync,
  lstatSync,
} from 'node:fs';
import type * as NodeFs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanForSecrets } from '../../src/backup/secret-guard.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>();
  return {
    ...actual,
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
    lstatSync: vi.fn(),
  };
});

describe('scanForSecrets', () => {
  let dir: string;
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'autopilot-secret-guard-'));
    const actual = await vi.importActual<typeof NodeFs>('node:fs');
    vi.mocked(readdirSync).mockImplementation(actual.readdirSync as typeof readdirSync);
    vi.mocked(readFileSync).mockImplementation(actual.readFileSync as typeof readFileSync);
    vi.mocked(lstatSync).mockImplementation(actual.lstatSync as typeof lstatSync);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('returns empty for a directory with only ordinary source files', () => {
    writeFileSync(join(dir, 'index.ts'), 'export const x = 1;\n');
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'app.ts'), 'console.log("hello world");\n');

    expect(scanForSecrets(dir)).toEqual([]);
  });

  it('flags a file whose content is a PEM private key block', () => {
    // Assembled at runtime so the repo's own secret-scan gate (which bans
    // LITERAL key blocks in tracked source) never sees one — the guard under
    // test receives the exact same bytes. Same recipe as guard.test.ts's
    // drive-path fixtures.
    const pemFixture = [
      '-----BEGIN RSA PRIVATE ',
      'KEY-----\nMIIBOgIBAAJB...\n-----END RSA PRIVATE ',
      'KEY-----\n',
    ].join('');
    writeFileSync(join(dir, 'weird-name.txt'), pemFixture);

    expect(scanForSecrets(dir)).toEqual(['weird-name.txt']);
  });

  it('flags an id_rsa file by name alone, regardless of content', () => {
    writeFileSync(join(dir, 'id_rsa'), 'not even a real key');

    expect(scanForSecrets(dir)).toEqual(['id_rsa']);
  });

  it('flags a .env file by name alone', () => {
    writeFileSync(join(dir, '.env'), 'SOME_VAR=value');

    expect(scanForSecrets(dir)).toEqual(['.env']);
  });

  it('flags a nested credentials file with a forward-slash relative path', () => {
    mkdirSync(join(dir, 'config'));
    writeFileSync(join(dir, 'config', 'credentials.json'), '{}');

    expect(scanForSecrets(dir)).toEqual(['config/credentials.json']);
  });

  it('flags content matching a high-confidence API key pattern', () => {
    // Runtime-assembled for the same reason as the PEM fixture above.
    const awsKeyFixture = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');
    writeFileSync(join(dir, 'notes.md'), `my key is ${awsKeyFixture}, do not share`);

    expect(scanForSecrets(dir)).toEqual(['notes.md']);
  });

  // The guard's docstring promises it MIRRORS scripts/ci/secret-scan.mjs. These
  // three content classes are in the CI scanner; without them a JWT, a Slack
  // webhook, or a URL with embedded credentials would slip into the local
  // baseline commit that this guard is the last line of defense for.
  // All fixtures are runtime-assembled so the literal secret never enters this
  // file's own source (which the CI scanner also reads).
  it('flags a file containing a JWT (mirrors the CI scanner)', () => {
    const jwt = ['eyJ', 'a'.repeat(12), '.', 'b'.repeat(12), '.', 'c'.repeat(12)].join('');
    writeFileSync(join(dir, 'token.txt'), `authorization: Bearer ${jwt}`);

    expect(scanForSecrets(dir)).toEqual(['token.txt']);
  });

  it('flags a file containing a Slack webhook URL (mirrors the CI scanner)', () => {
    const webhook = ['https://hooks.slack.com/services/', 'A'.repeat(24)].join('');
    writeFileSync(join(dir, 'notify.sh'), `curl -X POST ${webhook}`);

    expect(scanForSecrets(dir)).toEqual(['notify.sh']);
  });

  it('flags a file containing a URL with embedded credentials (mirrors the CI scanner)', () => {
    const url = ['https://', 'admin', ':', 'hunter2', '@', 'db.example.com/app'].join('');
    writeFileSync(join(dir, 'config.ini'), `database_url=${url}`);

    expect(scanForSecrets(dir)).toEqual(['config.ini']);
  });

  it('never descends into .git or node_modules', () => {
    mkdirSync(join(dir, '.git'));
    writeFileSync(join(dir, '.git', 'id_rsa'), 'x');
    mkdirSync(join(dir, 'node_modules'));
    writeFileSync(join(dir, 'node_modules', 'id_rsa'), 'x');

    expect(scanForSecrets(dir)).toEqual([]);
  });

  it('skips a dangling symlink without throwing', () => {
    // Creating a symlink needs elevated privileges on some Windows setups
    // (no Developer Mode, no admin) — skip rather than fail on those runners;
    // the behavior under test only matters where symlinks are actually usable.
    try {
      symlinkSync(join(dir, 'does-not-exist'), join(dir, 'broken-link'));
    } catch {
      return;
    }

    expect(() => scanForSecrets(dir)).not.toThrow();
    expect(scanForSecrets(dir)).toEqual([]);
  });

  it('returns multiple flagged paths sorted', () => {
    writeFileSync(join(dir, '.env'), 'A=1');
    mkdirSync(join(dir, 'a'));
    writeFileSync(join(dir, 'a', 'id_rsa'), 'x');

    expect(scanForSecrets(dir)).toEqual(['.env', 'a/id_rsa']);
  });

  it('returns empty for a directory that does not exist', () => {
    expect(scanForSecrets(join(dir, 'nope'))).toEqual([]);
  });

  it('skips a binary file (contains a NUL byte) without misreading it as text', () => {
    writeFileSync(join(dir, 'binary.dat'), Buffer.from([0x41, 0x4b, 0x49, 0x41, 0x00, 0x42]));

    expect(scanForSecrets(dir)).toEqual([]);
  });

  it('skips a file whose content cannot be read (permission error, race, device file) instead of throwing', () => {
    writeFileSync(
      join(dir, 'unreadable.txt'),
      `my key is ${['AKIA', 'ABCDEFGHIJKLMNOP'].join('')}, do not share`,
    );
    vi.mocked(readFileSync).mockImplementationOnce(() => {
      throw new Error('EACCES: permission denied');
    });

    expect(scanForSecrets(dir)).toEqual([]);
  });

  it('skips a file whose stat fails (race: vanished after listing) and keeps scanning siblings', async () => {
    // gone.txt's content deliberately matches a secret pattern: if the
    // catch branch below ever stopped skipping to the next entry, this file
    // would get read and flagged, distinguishing that regression from the
    // sibling-preserving behavior under test.
    writeFileSync(join(dir, 'gone.txt'), ['AKIA', 'ABCDEFGHIJKLMNOP'].join(''));
    writeFileSync(join(dir, 'id_rsa'), 'y');
    const gonePath = join(dir, 'gone.txt');
    const actual = await vi.importActual<typeof NodeFs>('node:fs');
    vi.mocked(lstatSync).mockImplementation(((path: NodeFs.PathLike, options?: unknown) => {
      if (path === gonePath) throw new Error('ENOENT: no such file or directory');
      return actual.lstatSync(path as never, options as never);
    }) as typeof lstatSync);

    expect(scanForSecrets(dir)).toEqual(['id_rsa']);
  });

  it('skips a file larger than the scan size cap without reading its content', () => {
    writeFileSync(join(dir, 'huge.txt'), Buffer.alloc(1024 * 1024 + 1, 'A'));

    expect(scanForSecrets(dir)).toEqual([]);
  });

  it('skips a directory entry that is neither a regular file, directory, nor symlink (e.g. a device or socket)', () => {
    const weirdEntry = {
      name: 'weird-device',
      isSymbolicLink: () => false,
      isDirectory: () => false,
      isFile: () => false,
    };
    vi.mocked(readdirSync).mockReturnValueOnce([weirdEntry] as unknown as ReturnType<
      typeof readdirSync
    >);

    expect(scanForSecrets(dir)).toEqual([]);
  });

  it('never follows a symlink even when it points at a secret-looking name', () => {
    const symlinkEntry = {
      name: 'id_rsa',
      isSymbolicLink: () => true,
      isDirectory: () => false,
      isFile: () => true,
    };
    vi.mocked(readdirSync).mockReturnValueOnce([symlinkEntry] as unknown as ReturnType<
      typeof readdirSync
    >);

    expect(scanForSecrets(dir)).toEqual([]);
  });

  it('skips a non-regular-file entry with a secret-looking name instead of flagging it by filename', () => {
    const deviceEntry = {
      name: 'id_rsa',
      isSymbolicLink: () => false,
      isDirectory: () => false,
      isFile: () => false,
    };
    vi.mocked(readdirSync).mockReturnValueOnce([deviceEntry] as unknown as ReturnType<
      typeof readdirSync
    >);

    expect(scanForSecrets(dir)).toEqual([]);
  });

  it('skips an oversized file even when it contains a high-confidence secret pattern', () => {
    const content = Buffer.concat([
      Buffer.from(['AKIA', 'ABCDEFGHIJKLMNOP '].join('')),
      Buffer.alloc(1024 * 1024, 'A'),
    ]);
    writeFileSync(join(dir, 'huge-secret.txt'), content);

    expect(scanForSecrets(dir)).toEqual([]);
  });

  it('scans a file exactly at the size cap (cap is inclusive, not exclusive)', () => {
    const prefix = ['AKIA', 'ABCDEFGHIJKLMNOP '].join('');
    const content = Buffer.concat([
      Buffer.from(prefix),
      Buffer.alloc(1024 * 1024 - prefix.length, 'A'),
    ]);
    expect(content.length).toBe(1024 * 1024);
    writeFileSync(join(dir, 'exactly-cap.txt'), content);

    expect(scanForSecrets(dir)).toEqual(['exactly-cap.txt']);
  });

  it('sorts flagged paths even when the filesystem returns entries out of alphabetical order', async () => {
    writeFileSync(join(dir, 'id_rsa'), 'x');
    writeFileSync(join(dir, '.env'), 'A=1');
    const actual = await vi.importActual<typeof NodeFs>('node:fs');
    const realEntries = actual.readdirSync(dir, { withFileTypes: true });
    vi.mocked(readdirSync).mockReturnValueOnce(
      [...realEntries].reverse() as unknown as ReturnType<typeof readdirSync>,
    );

    expect(scanForSecrets(dir)).toEqual(['.env', 'id_rsa']);
  });

  describe('secret filename patterns', () => {
    it('flags a private key file by extension alone (.pem/.pfx/.p12/.ppk/.key), regardless of content', () => {
      writeFileSync(join(dir, 'server.key'), 'not even a real key');

      expect(scanForSecrets(dir)).toEqual(['server.key']);
    });

    it('does not flag a filename that merely contains a private-key extension mid-name', () => {
      writeFileSync(join(dir, 'server.key.bak'), 'not a key file');

      expect(scanForSecrets(dir)).toEqual([]);
    });

    it('does not flag an id_rsa public key or a name merely prefixed with id_rsa', () => {
      writeFileSync(join(dir, 'id_rsa.pub'), 'ssh-rsa AAAA...');
      writeFileSync(join(dir, 'backup-id_rsa'), 'not a key file');

      expect(scanForSecrets(dir)).toEqual([]);
    });

    it('flags a dotenv file with a compound extension like .env.local', () => {
      writeFileSync(join(dir, '.env.local'), 'A=1');

      expect(scanForSecrets(dir)).toEqual(['.env.local']);
    });

    it('does not flag a filename that merely starts with or resembles .env', () => {
      writeFileSync(join(dir, 'myapp.env'), 'not a real env file');
      writeFileSync(join(dir, '.envrc'), 'export PATH=$PATH');

      expect(scanForSecrets(dir)).toEqual([]);
    });

    it('does not flag a credentials.json variant with an extra prefix or suffix', () => {
      writeFileSync(join(dir, 'mycredentials.json'), '{}');
      writeFileSync(join(dir, 'credentials.json.bak'), '{}');

      expect(scanForSecrets(dir)).toEqual([]);
    });

    it('flags a service-account key file at the very start of its name', () => {
      writeFileSync(join(dir, 'service-account.json'), '{}');

      expect(scanForSecrets(dir)).toEqual(['service-account.json']);
    });

    it('does not flag a service-account-ish name lacking the required separator, or with trailing content after .json', () => {
      writeFileSync(join(dir, 'myservice-account.json'), '{}');
      writeFileSync(join(dir, 'service-account.json.bak'), '{}');

      expect(scanForSecrets(dir)).toEqual([]);
    });
  });

  describe('secret content patterns', () => {
    it('flags a generic PEM private key block with no key-type prefix', () => {
      writeFileSync(
        join(dir, 'generic-pem.md'),
        ['-----BEGIN PRIVATE ', 'KEY-----\nMIIBOgIBAAJB...\n-----END PRIVATE ', 'KEY-----\n'].join(
          '',
        ),
      );

      expect(scanForSecrets(dir)).toEqual(['generic-pem.md']);
    });

    it('flags content matching a classic GitHub token pattern', () => {
      writeFileSync(join(dir, 'gh-token.md'), `token: ghp_${'A'.repeat(36)}`);

      expect(scanForSecrets(dir)).toEqual(['gh-token.md']);
    });

    it('flags content matching a GitHub fine-grained PAT pattern', () => {
      writeFileSync(join(dir, 'gh-pat.md'), `token: github_pat_${'A'.repeat(22)}`);

      expect(scanForSecrets(dir)).toEqual(['gh-pat.md']);
    });

    it('flags content matching a Slack token pattern', () => {
      writeFileSync(join(dir, 'slack-token.md'), `token: xoxb-${'A'.repeat(10)}`);

      expect(scanForSecrets(dir)).toEqual(['slack-token.md']);
    });

    it('flags content matching a Google API key pattern', () => {
      writeFileSync(join(dir, 'google-key.md'), `key: AIza${'A'.repeat(35)}`);

      expect(scanForSecrets(dir)).toEqual(['google-key.md']);
    });

    it('flags content matching a Stripe live secret key pattern', () => {
      writeFileSync(join(dir, 'stripe-key.md'), `key: sk_live_${'A'.repeat(24)}`);

      expect(scanForSecrets(dir)).toEqual(['stripe-key.md']);
    });

    it('flags content matching an Anthropic API key pattern', () => {
      writeFileSync(join(dir, 'anthropic-key.md'), `key: sk-ant-${'A'.repeat(20)}`);

      expect(scanForSecrets(dir)).toEqual(['anthropic-key.md']);
    });

    it('flags content matching a generic 48-char sk- key pattern', () => {
      writeFileSync(join(dir, 'generic-key.md'), `key: sk-${'A'.repeat(48)}`);

      expect(scanForSecrets(dir)).toEqual(['generic-key.md']);
    });

    it('flags content matching an npm token pattern', () => {
      writeFileSync(join(dir, 'npm-token.md'), `token: npm_${'A'.repeat(36)}`);

      expect(scanForSecrets(dir)).toEqual(['npm-token.md']);
    });
  });
});
