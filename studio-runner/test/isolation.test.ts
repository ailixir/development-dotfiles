/**
 * AC-22 — the isolation gate. **No DB, no vault, no CSI, no LLM.**
 *
 * This is the story's defining constraint, and it is a security property rather than a layering
 * preference: this is the process that opens untrusted web pages in a browser, so it must never
 * hold a credential to anything else. Architecture §9.2: *"the runner … has no platform user
 * session or DB/vault/CSI/LLM credentials"*.
 *
 * Three build-gated parts, all of which must fail if such a dependency is introduced:
 *
 * **(a) — here.** An allowlist over the *resolved production dependency closure*. The test reads
 * `package.json` `dependencies` plus the lockfile's transitive production closure and asserts it
 * equals an explicit enumerated list. Any package not on the list fails, **whatever it is**. This
 * is the part that catches the unanticipated case; a denylist only ever fails for a driver
 * somebody predicted.
 *
 * **(b) — `test/lint-boundary.test.ts`.** Named-module lint rules with one proving fixture per
 * entry. Fast and readable, layered on top of (a), not a substitute for it.
 *
 * **(c) — here.** The configuration surface. The loader enumerates the keys it accepts and
 * rejects anything else at startup; a config carrying a database URL, a vault address, a CSI
 * endpoint or an LLM gateway key fails to start rather than being silently ignored. A credential
 * the process never reads cannot leak.
 *
 * **What (a)–(c) cannot prove**, stated so nobody reads more into a green test than is there:
 * they prevent the runner from *linking* a client, not from reaching a database over plain HTTP
 * through a dependency it already has. **AC-3 is the complement** — outbound destinations are a
 * configured allowlist (callback API, object store, target page) and nothing else — and the two
 * must be read together.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ACCEPTED_KEYS, CONFIG_PREFIX, ConfigurationError, loadConfig } from '../src/server/config.js';
import { packageRoot } from './helpers/corpus.js';

/**
 * The complete permitted production dependency closure, with the justification for each entry.
 *
 * Adding a line here is the deliberate act the gate exists to force. Story 10.6 added **none**:
 * ADR-001 §5 allows this story one HTTP server library, and `node:http` was chosen instead
 * precisely so the closure would not grow. A framework would have put a transitive tree of
 * unaudited packages inside the browser-facing process to save writing a `switch`.
 */
const ALLOWED_PRODUCTION_PACKAGES: Readonly<Record<string, string>> = {
  '@aws-sdk/checksums': 'AWS S3 SDK transitive runtime: signing, credential resolution, checksums or HTTP transport.',
  '@aws-sdk/client-s3': 'Remote evidence upload to AWS S3 or S3-compatible Sonic; the runner adapter exposes only PutObject.',
  '@aws-sdk/core': 'AWS S3 SDK transitive runtime: signing, credential resolution, checksums or HTTP transport.',
  '@aws-sdk/credential-provider-env': 'AWS S3 SDK transitive runtime: signing, credential resolution, checksums or HTTP transport.',
  '@aws-sdk/credential-provider-http': 'AWS S3 SDK transitive runtime: signing, credential resolution, checksums or HTTP transport.',
  '@aws-sdk/credential-provider-ini': 'AWS S3 SDK transitive runtime: signing, credential resolution, checksums or HTTP transport.',
  '@aws-sdk/credential-provider-login': 'AWS S3 SDK transitive runtime: signing, credential resolution, checksums or HTTP transport.',
  '@aws-sdk/credential-provider-node': 'AWS S3 SDK transitive runtime: signing, credential resolution, checksums or HTTP transport.',
  '@aws-sdk/credential-provider-process': 'AWS S3 SDK transitive runtime: signing, credential resolution, checksums or HTTP transport.',
  '@aws-sdk/credential-provider-sso': 'AWS S3 SDK transitive runtime: signing, credential resolution, checksums or HTTP transport.',
  '@aws-sdk/credential-provider-web-identity': 'AWS S3 SDK transitive runtime: signing, credential resolution, checksums or HTTP transport.',
  '@aws-sdk/middleware-sdk-s3': 'AWS S3 SDK transitive runtime: signing, credential resolution, checksums or HTTP transport.',
  '@aws-sdk/nested-clients': 'AWS S3 SDK transitive runtime: signing, credential resolution, checksums or HTTP transport.',
  '@aws-sdk/signature-v4-multi-region': 'AWS S3 SDK transitive runtime: signing, credential resolution, checksums or HTTP transport.',
  '@aws-sdk/token-providers': 'AWS S3 SDK transitive runtime: signing, credential resolution, checksums or HTTP transport.',
  '@aws-sdk/types': 'AWS S3 SDK transitive runtime: signing, credential resolution, checksums or HTTP transport.',
  '@aws-sdk/xml-builder': 'AWS S3 SDK transitive runtime: signing, credential resolution, checksums or HTTP transport.',
  '@aws/lambda-invoke-store': 'AWS S3 SDK transitive runtime: signing, credential resolution, checksums or HTTP transport.',
  '@smithy/core': 'AWS S3 SDK transitive runtime: signing, credential resolution, checksums or HTTP transport.',
  '@smithy/credential-provider-imds': 'AWS S3 SDK transitive runtime: signing, credential resolution, checksums or HTTP transport.',
  '@smithy/fetch-http-handler': 'AWS S3 SDK transitive runtime: signing, credential resolution, checksums or HTTP transport.',
  '@smithy/node-http-handler': 'AWS S3 SDK transitive runtime: signing, credential resolution, checksums or HTTP transport.',
  '@smithy/signature-v4': 'AWS S3 SDK transitive runtime: signing, credential resolution, checksums or HTTP transport.',
  '@smithy/types': 'AWS S3 SDK transitive runtime: signing, credential resolution, checksums or HTTP transport.',
  'bowser': 'AWS S3 SDK transitive runtime: signing, credential resolution, checksums or HTTP transport.',
  'tslib': 'AWS S3 SDK transitive runtime: signing, credential resolution, checksums or HTTP transport.',
  playwright: 'ADR-001 §4.2 — the pinned browser library; the whole point of the component.',
  'playwright-core':
    "playwright's own engine, pulled in transitively at the same exact version by the same pin.",
  typescript:
    'ADR-001 §5 / story 10.2 — the validator parses artifacts with the TypeScript compiler API. ' +
    'It is a runtime dependency because the parser ships in the image.',
};

interface LockfileEntry {
  readonly version?: string;
  readonly dev?: boolean;
}

interface Lockfile {
  readonly lockfileVersion: number;
  readonly packages: Readonly<Record<string, LockfileEntry>>;
}

interface PackageJson {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as PackageJson;
const lock = JSON.parse(readFileSync(join(packageRoot, 'package-lock.json'), 'utf8')) as Lockfile;

/**
 * The resolved production closure: every lockfile entry npm did **not** mark `dev`.
 *
 * Reading it off the lockfile rather than walking the declared `dependencies` is what makes this
 * transitive — a driver pulled in three levels down by something innocent appears here and fails
 * the assertion, which is the case the allowlist exists for.
 */
function productionClosure(): readonly string[] {
  return Object.entries(lock.packages)
    .filter(([name, entry]) => name.startsWith('node_modules/') && entry.dev !== true)
    .map(([name]) => name.slice('node_modules/'.length))
    .sort();
}

describe('AC-22a — allowlist over the resolved production dependency closure', () => {
  it('the lockfile is a version whose dev marking this test can rely on', () => {
    // v2 and v3 both carry `dev: true`; anything older has no per-package marking and the
    // closure below would silently include devDependencies. Fail closed on an unexpected format.
    expect(lock.lockfileVersion).toBeGreaterThanOrEqual(2);
  });

  it('contains exactly the allowlisted packages and nothing else', () => {
    expect(productionClosure()).toEqual(Object.keys(ALLOWED_PRODUCTION_PACKAGES).sort());
  });

  it('every declared runtime dependency is allowlisted and exact-pinned', () => {
    for (const [name, range] of Object.entries(pkg.dependencies ?? {})) {
      expect(Object.keys(ALLOWED_PRODUCTION_PACKAGES)).toContain(name);
      // ADR-001 §4.2: exact pins, no range operator. `check:pins` covers Playwright's four copies.
      expect(range).toMatch(/^\d+\.\d+\.\d+$/u);
    }
  });

  it('every allowlist entry carries a justification', () => {
    for (const [name, reason] of Object.entries(ALLOWED_PRODUCTION_PACKAGES)) {
      expect(reason.length, `${name} has no justification`).toBeGreaterThan(20);
    }
  });

  it('story 10.6 added no production dependency: the HTTP server is node:http', () => {
    // ADR-001 §5 permitted this story one HTTP server library. It took none.
    const serverSource = readFileSync(join(packageRoot, 'src', 'server', 'server.ts'), 'utf8');
    expect(serverSource).toContain("from 'node:http'");
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual(['@aws-sdk/client-s3', 'playwright', 'typescript']);
  });

  it('holds no credential for a database, vault, CSI or LLM gateway anywhere in the closure', () => {
    const credentialShaped = /(^|[-/])(pg|mysql|mongo|redis|oracle|mssql|vault|oidc|openid|passport|openai|anthropic|vertexai|langchain)([-/]|$)/u;
    const offenders = productionClosure().filter((name) => credentialShaped.test(name));
    expect(offenders).toEqual([]);
  });
});

describe('AC-22c — the configuration surface rejects what it does not enumerate', () => {
  const validEnv = (): Record<string, string> => ({
    [`${CONFIG_PREFIX}SERVICE_IDENTITY`]: 'inbound-stub-token',
    [`${CONFIG_PREFIX}CALLBACK_IDENTITY`]: 'outbound-stub-token',
    [`${CONFIG_PREFIX}CALLBACK_BASE_URL`]: 'https://api.internal.example',
  });

  it('accepts a minimal valid configuration', () => {
    const config = loadConfig(validEnv());
    expect(config.callbackBaseUrl).toBe('https://api.internal.example');
    expect(config.poolSize).toBe(1);
    expect(config.objectStoreProvider).toBe('filesystem');
    expect(
      loadConfig({ ...validEnv(), [`${CONFIG_PREFIX}OBJECT_STORE_PROVIDER`]: 'local' }).objectStoreProvider,
    ).toBe('local');
  });

  it('requires the complete Sonic S3 configuration and keeps credentials file-based', () => {
    expect(() =>
      loadConfig({ ...validEnv(), [`${CONFIG_PREFIX}OBJECT_STORE_PROVIDER`]: 's3' }),
    ).toThrow(ConfigurationError);

    const config = loadConfig({
      ...validEnv(),
      [`${CONFIG_PREFIX}OBJECT_STORE_PROVIDER`]: 's3',
      [`${CONFIG_PREFIX}OBJECT_STORE_ENDPOINT`]: 'https://sonic.internal.example',
      [`${CONFIG_PREFIX}OBJECT_STORE_REGION`]: 'us-east-1',
      [`${CONFIG_PREFIX}OBJECT_STORE_BUCKET`]: 'studio-evidence',
      [`${CONFIG_PREFIX}OBJECT_STORE_ACCESS_KEY_ID_FILE`]: '/mounted/accessKeyId',
      [`${CONFIG_PREFIX}OBJECT_STORE_SECRET_ACCESS_KEY_FILE`]: '/mounted/secretAccessKey',
    });
    expect(config.objectStoreProvider).toBe('s3');
    expect(config.objectStoreAccessKeyIdFile).toBe('/mounted/accessKeyId');
    expect(JSON.stringify(config)).not.toContain('writer-secret');
  });

  it.each([
    ['DATABASE_URL', 'postgres://user:pw@db.internal:5432/checks'],
    ['DB_PASSWORD', 'hunter2'],
    ['VAULT_ADDR', 'https://vault.internal'],
    ['VAULT_TOKEN', 's.abcdefg'],
    ['CSI_ENDPOINT', 'https://csi.internal'],
    ['LLM_GATEWAY_KEY', 'sk-not-for-this-process'],
    ['R2D2_ENDPOINT', 'https://r2d2.internal'],
    // The point of enumeration: a key nobody predicted is refused for the same reason.
    ['SOMETHING_NOBODY_PREDICTED', 'value'],
  ])('refuses to start when %s is configured', (suffix, value) => {
    const env = { ...validEnv(), [`${CONFIG_PREFIX}${suffix}`]: value };
    expect(() => loadConfig(env)).toThrow(ConfigurationError);
    try {
      loadConfig(env);
      expect.unreachable('loadConfig must throw for an unrecognised key.');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      const problems = (error as ConfigurationError).problems.join('\n');
      expect(problems).toContain(`${CONFIG_PREFIX}${suffix}`);
      // The problem names the key, never the value it carried.
      expect(problems).not.toContain(value);
    }
  });

  it('ignores variables outside the runner namespace', () => {
    // Rejecting PATH would be absurd; rejecting an unrecognised key *in the runner's own
    // namespace* is the signal worth failing on, because someone is trying to configure this
    // process.
    expect(() =>
      loadConfig({ ...validEnv(), PATH: '/usr/bin', DATABASE_URL: 'postgres://elsewhere' }),
    ).not.toThrow();
  });

  it('enumerates no key that names a database, vault, CSI or LLM destination', () => {
    const forbidden = /DATABASE|_DB_|VAULT|CSI|LLM|GATEWAY|R2D2|VERTEX|OPENAI/u;
    expect(ACCEPTED_KEYS.filter((key) => forbidden.test(key))).toEqual([]);
  });

  it('accepts no callback URL carrying userinfo or a query string (AC-3)', () => {
    for (const url of [
      'https://svc:secret@api.internal.example',
      'https://api.internal.example/?token=abc',
    ]) {
      expect(() =>
        loadConfig({ ...validEnv(), [`${CONFIG_PREFIX}CALLBACK_BASE_URL`]: url }),
      ).toThrow(ConfigurationError);
    }
  });

  it('requires both service identities and a callback destination', () => {
    for (const missing of ['SERVICE_IDENTITY', 'CALLBACK_IDENTITY', 'CALLBACK_BASE_URL']) {
      const env = Object.fromEntries(
        Object.entries(validEnv()).filter(([key]) => key !== `${CONFIG_PREFIX}${missing}`),
      );
      expect(() => loadConfig(env)).toThrow(ConfigurationError);
    }
  });

  it('rejects an unreadable numeric value rather than falling back to a default', () => {
    expect(() =>
      loadConfig({ ...validEnv(), [`${CONFIG_PREFIX}POOL_SIZE`]: 'many' }),
    ).toThrow(ConfigurationError);
    expect(() =>
      loadConfig({ ...validEnv(), [`${CONFIG_PREFIX}POOL_SIZE`]: '0' }),
    ).toThrow(ConfigurationError);
  });

  it('generates a stable instance id when the deployment does not name one (AC-7)', () => {
    const first = loadConfig(validEnv()).runnerInstanceId;
    expect(first).not.toBe('');
    expect(loadConfig({ ...validEnv(), [`${CONFIG_PREFIX}INSTANCE_ID`]: 'pod-7' }).runnerInstanceId).toBe(
      'pod-7',
    );
  });
});

/**
 * Story 10.32 AC-1 — the seek-origin calibration key (ADR-002 §26.3 item 3, §26.4(a)).
 *
 * The production symbol is `KEY_SPECS.SEEK_ORIGIN_CALIBRATION_MS`. Its load-bearing value is the
 * default: unset must read `0`, because this story sets no calibration. The rejection cases cover
 * the shared `parseInteger` (its `^\d+$` rule refuses a sign before `min` is consulted), so they
 * are recorded as covering the parser, not this row.
 */
describe('story 10.32 AC-1 — STUDIO_RUNNER_SEEK_ORIGIN_CALIBRATION_MS', () => {
  const KEY = `${CONFIG_PREFIX}SEEK_ORIGIN_CALIBRATION_MS`;
  const validEnv = (): Record<string, string> => ({
    [`${CONFIG_PREFIX}SERVICE_IDENTITY`]: 'inbound-stub-token',
    [`${CONFIG_PREFIX}CALLBACK_IDENTITY`]: 'outbound-stub-token',
    [`${CONFIG_PREFIX}CALLBACK_BASE_URL`]: 'https://api.internal.example',
  });

  it('is an enumerated key of the fail-closed namespace', () => {
    expect(ACCEPTED_KEYS).toContain(KEY);
  });

  it('reads 0 when the deployment does not set it', () => {
    expect(loadConfig(validEnv()).seekOriginCalibrationMs).toBe(0);
  });

  it('reads a configured non-negative integer', () => {
    expect(loadConfig({ ...validEnv(), [KEY]: '50' }).seekOriginCalibrationMs).toBe(50);
    expect(loadConfig({ ...validEnv(), [KEY]: '0' }).seekOriginCalibrationMs).toBe(0);
  });

  it.each(['-50', '-1', 'abc', '12.5'])(
    'refuses to start on %j rather than defaulting, and names the key',
    (raw) => {
      try {
        loadConfig({ ...validEnv(), [KEY]: raw });
        expect.unreachable(`loadConfig accepted ${raw}`);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        expect((error as ConfigurationError).problems.join('\n')).toContain(KEY);
      }
    },
  );
});
