/**
 * STUDIO-OBS-009 AC-1 — guided mode is a mode of the one runner process.
 *
 * `guidedMain.ts` (the standalone worker) is gone: its mounted JSON config, its `canEnumerateLaunchTree`
 * guard, its recording-scratch sweep, its shutdown and its listener now belong to `main.ts`, switched
 * by `STUDIO_RUNNER_GUIDED_ENABLED` (ruling A2, drop D1.0). The cases of the retired
 * `test/run/guidedMain.test.ts` are ported by name in the first `describe`; each keeps its title, and
 * the comment above it says what it asserts now.
 *
 * Everything here runs in the unit tier: no browser, no pid-1 container, no `ps` dependence (the
 * launch-tree guard is a seam). The wiring case at the end drives a real TLS client against the one
 * listener and a real claim and callback server.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import type { IncomingHttpHeaders } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isWindows, itPosixOnly } from '../helpers/platform.js';

import { domainAllowed, isAllowAll } from '../../src/allowedDomains.js';
import { resetRuntimeVersionsCache } from '../../src/compat/index.js';
import * as applicationModule from '../../src/server/application.js';
import { main, NAVIGATION_ALL_DOMAINS_WARNING } from '../../src/main.js';
import type { GuidedStartupSeams, MainResult } from '../../src/main.js';
import {
  ACCEPTED_KEYS,
  CONFIG_PREFIX,
  ConfigurationError,
  loadConfig,
  loadGuidedConfig,
  loadListenerConfig,
} from '../../src/server/config.js';
import { prepareRecordingScratch } from '../../src/run/recordingScratch.js';
import { canEnumerateLaunchTree } from '../../src/run/tree.js';
import { assignmentFor, guidedContext, ownershipSession } from '../helpers/guided.js';
import { RUNTIME_VERSIONS, SERVICE_TOKEN } from '../helpers/harness.js';
import { jwt, post, testFingerprint, testTls } from '../helpers/guidedTls.js';
import { createFakeBrowserLauncher } from '../helpers/runner.js';

const P = CONFIG_PREFIX;
const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const tlsFile = (name: string): string => fileURLToPath(new URL(`../fixtures/guided-tls/${name}.fixture`, import.meta.url));
const roots: string[] = [];
const scratchRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'guided-mode-'));
  roots.push(root);
  return root;
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  while (roots.length > 0) rmSync(roots.pop() ?? '', { recursive: true, force: true });
});

/** A pid that no process holds, found the way the sweep asks: `kill(pid, 0)` answers ESRCH. */
function unusedPid(): number {
  for (let pid = 2_147_000_000; pid > 2_146_999_900; pid -= 1) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return pid;
    }
  }
  throw new Error('no unused pid found');
}

/** The replay-only deployment: the listener keys are required even with guided mode off. */
function runnerEnv(root: string): Record<string, string> {
  return {
    [`${P}PORT`]: '0',
    [`${P}HOST`]: '127.0.0.1',
    [`${P}SERVICE_IDENTITY`]: SERVICE_TOKEN,
    [`${P}CALLBACK_IDENTITY`]: 'outbound',
    [`${P}CALLBACK_BASE_URL`]: 'http://api.internal.example:8080',
    [`${P}SCRATCH_DIR`]: join(root, 'scratch'),
    [`${P}OBJECT_STORE_DIR`]: join(root, 'objects'),
    [`${P}TLS_KEY_FILE`]: tlsFile('key'),
    [`${P}TLS_CERT_FILE`]: tlsFile('cert'),
    [`${P}TLS_CA_FILE`]: tlsFile('cert'),
    [`${P}CONTROLLER_CERTIFICATE_FINGERPRINT256`]: testFingerprint,
    // Allow-all is ON when unset (the default for now); these tests are about the list and the startup order.
    [`${P}ALLOW_ALL_DOMAINS`]: 'false',
  };
}

/** The same deployment with the switch on and the seven guided keys. */
function guidedEnv(root: string, callbackBaseUrl = 'https://127.0.0.1:9'): Record<string, string> {
  writeFileSync(join(root, 'token'), 'callback-token\n', 'utf8');
  return {
    ...runnerEnv(root),
    [`${P}GUIDED_ENABLED`]: 'true',
    [`${P}GUIDED_WORKER_ID`]: 'worker-one',
    [`${P}GUIDED_JOURNAL_DIR`]: join(root, 'journal'),
    [`${P}GUIDED_CONTROLLER_ISSUER`]: 'fixture-issuer',
    [`${P}GUIDED_CONTROLLER_SUBJECT`]: 'controller',
    [`${P}GUIDED_CONTROLLER_PUBLIC_KEY_FILE`]: tlsFile('cert'),
    [`${P}GUIDED_CALLBACK_BASE_URL`]: callbackBaseUrl,
    [`${P}GUIDED_CALLBACK_TOKEN_FILE`]: join(root, 'token'),
    [`${P}GUIDED_CAPACITY`]: '1',
  };
}

const GUIDED_KEYS = [
  'GUIDED_WORKER_ID',
  'GUIDED_JOURNAL_DIR',
  'GUIDED_CONTROLLER_ISSUER',
  'GUIDED_CONTROLLER_SUBJECT',
  'GUIDED_CONTROLLER_PUBLIC_KEY_FILE',
  'GUIDED_CALLBACK_BASE_URL',
  'GUIDED_CALLBACK_TOKEN_FILE',
  'GUIDED_CAPACITY',
] as const;

function problemsOf(load: () => unknown): string[] {
  try {
    load();
  } catch (error) {
    if (error instanceof ConfigurationError) return [...error.problems];
    throw error;
  }
  return [];
}

interface Started {
  readonly result: MainResult;
  readonly lines: string[];
  readonly exit: () => number | null;
  readonly handlers: Map<string, () => void>;
}

function versionsFile(root: string): string {
  const file = join(root, 'runtime-versions.json');
  writeFileSync(file, JSON.stringify(RUNTIME_VERSIONS), 'utf8');
  resetRuntimeVersionsCache();
  return file;
}

async function start(root: string, env: Record<string, string | undefined>, seams?: GuidedStartupSeams): Promise<Started> {
  const lines: string[] = [];
  const handlers = new Map<string, () => void>();
  let exit: number | null = null;
  const result = await main({
    env,
    onSignal: (signal, handler) => { handlers.set(signal, handler); },
    write: (line) => lines.push(line),
    setExitCode: (code) => { exit = code; },
    launcher: createFakeBrowserLauncher(),
    runtimeVersionsFile: versionsFile(root),
    guidedSeams: seams,
  });
  return { result, lines, exit: () => exit, handlers };
}

/** Seams that never touch a browser, a `ps` or the real build identity. */
function seams(overrides: Partial<GuidedStartupSeams> = {}): GuidedStartupSeams {
  return {
    assertBuild: () => undefined,
    launchTree: () => true,
    launch: () => Promise.reject(new Error('no browser in this tier')),
    ...overrides,
  };
}

async function stop(started: Started): Promise<void> {
  await started.result.application?.drain();
}

describe('guided worker mounted configuration', () => {
  // Was: the closed JSON key set parsed from a mounted file. Now: the closed environment key set.
  it('accepts the closed trusted key set', () => {
    const root = scratchRoot();
    const env = guidedEnv(root);
    expect(loadGuidedConfig(env)).toEqual({
      enabled: true,
      workerId: 'worker-one',
      journalDirectory: join(root, 'journal'),
      controllerIssuer: 'fixture-issuer',
      controllerSubject: 'controller',
      controllerPublicKeyFile: tlsFile('cert'),
      callbackBaseUrl: 'https://127.0.0.1:9',
      callbackTokenFile: join(root, 'token'),
      capacity: 1,
    });
    // The listener half of the old file (host, port, TLS files, controller fingerprint) is the runner's own keys.
    expect(loadListenerConfig(env)).toEqual({
      tlsKeyFile: tlsFile('key'),
      tlsCertFile: tlsFile('cert'),
      tlsCaFile: tlsFile('cert'),
      controllerCertificateFingerprint256: testFingerprint,
    });
    expect(loadConfig({ ...env, [`${P}PORT`]: '65535' }).port).toBe(65535);
    expect(loadGuidedConfig({ ...env, [`${P}GUIDED_WORKER_ID`]: 'w'.repeat(256) }).enabled).toBe(true);
  });

  // Was: unknown keys, non-object documents, a missing worker identity and invalid ports.
  it('refuses unknown keys, non-object documents, a missing worker identity and invalid ports', () => {
    const root = scratchRoot();
    const env = guidedEnv(root);
    // An unenumerated guided key is refused by name, never ignored.
    expect(problemsOf(() => loadGuidedConfig({ ...env, [`${P}GUIDED_DEBUG`]: 'true' })).join('\n')).toContain(`${P}GUIDED_DEBUG`);
    expect(problemsOf(() => loadConfig({ ...env, [`${P}GUIDED_KNOWN_SECRETS`]: '[]' })).join('\n')).toContain(`${P}GUIDED_KNOWN_SECRETS`);
    // A missing or oversized worker identity.
    const withoutWorker = Object.fromEntries(Object.entries(env).filter(([key]) => key !== `${P}GUIDED_WORKER_ID`));
    expect(problemsOf(() => loadGuidedConfig(withoutWorker))).toEqual([`${P}GUIDED_WORKER_ID is required when ${P}GUIDED_ENABLED is true.`]);
    expect(problemsOf(() => loadGuidedConfig({ ...env, [`${P}GUIDED_WORKER_ID`]: 'w'.repeat(257) }))).toEqual([`${P}GUIDED_WORKER_ID must be at most 256 characters.`]);
    // Invalid ports (the old file's port is the runner's PORT key).
    for (const port of ['-1', '65536', '1.5', '8443x', 'eighty']) {
      expect(problemsOf(() => loadConfig({ ...env, [`${P}PORT`]: port })).join('\n'), port).toContain(`${P}PORT`);
    }
    // A mounted configuration file is not a thing any more: the document keys are not accepted as keys.
    for (const retired of ['WORKER_ID', 'JOURNAL_DIRECTORY', 'CONTROLLER_PUBLIC_KEY', 'CALLBACK_TOKEN']) {
      expect(problemsOf(() => loadConfig({ ...env, [`${P}${retired}`]: 'x' })).join('\n'), retired).toContain(`${P}${retired}`);
    }
  });

  // Was: a mounted `applicationPolicy` is refused in any form.
  it('STUDIO-OBS-014 AC-1: refuses a mounted applicationPolicy in any form', () => {
    const env = guidedEnv(scratchRoot());
    for (const value of ['{"policyRuleId":"structural","allowStructuralDiscovery":true}', 'null', '{}', 'false', '']) {
      for (const key of ['GUIDED_APPLICATION_POLICY', 'APPLICATION_POLICY']) {
        const problems = problemsOf(() => loadGuidedConfig({ ...env, [`${P}${key}`]: value || ' ' }));
        // The empty and blank forms count as not provided, exactly as every other key; the others are refused by name.
        if (value !== '') expect(problems.join('\n'), `${key}=${value}`).toContain(`${P}${key}`);
      }
    }
    const loaded = loadGuidedConfig(env);
    expect(Object.keys(loaded)).not.toContain('applicationPolicy');
  });

  // Was: a mounted `rules` key is refused in any form (ar-mounted-rules oracle 1).
  it('STUDIO-OBS-014 AC-1: refuses a mounted rules key in any form (ar-mounted-rules oracle 1)', () => {
    const env = guidedEnv(scratchRoot());
    const read = '[{"testId":"source","name":"Business reference","policyRuleId":"reference-read","classification":"permittedBusinessData"}]';
    for (const value of [read, '[]', 'null', '{}', 'false']) {
      for (const key of ['GUIDED_RULES', 'RULES']) {
        expect(problemsOf(() => loadGuidedConfig({ ...env, [`${P}${key}`]: value })).join('\n'), `${key}=${value}`).toContain(`${P}${key}`);
      }
    }
    expect(Object.keys(loadGuidedConfig(env))).not.toContain('rules');
  });

  // Was: a document that is not JSON. There is no document now; a path key holding one is refused.
  it('refuses a document that is not JSON', () => {
    const env = guidedEnv(scratchRoot());
    for (const key of ['GUIDED_JOURNAL_DIR', 'GUIDED_CONTROLLER_PUBLIC_KEY_FILE', 'GUIDED_CALLBACK_TOKEN_FILE']) {
      const problems = problemsOf(() => loadGuidedConfig({ ...env, [`${P}${key}`]: '{"workerId":' }));
      expect(problems, key).toEqual([`${P}${key} must be an absolute path.`]);
    }
  });

  // Was: source order (guard before the config file is read). Now it is behaviour: the guard decides
  // before the files, the sweep and the listener, and PID-1 a is the same `canEnumerateLaunchTree`.
  it('REL-001/D4: refuses to start where the process table cannot be listed, before it reads any config', async () => {
    const root = scratchRoot();
    const sweep = vi.fn(prepareRecordingScratch);
    const created = vi.spyOn(applicationModule, 'createApplication');
    const env = { ...guidedEnv(root), [`${P}TLS_KEY_FILE`]: '/nonexistent/key.pem' };
    const started = await start(root, env, seams({ launchTree: () => false, sweep }));
    expect(started.result).toEqual({ started: false });
    // One value-free line, the closed reason, and nothing about the unreadable key that comes later.
    expect(started.lines).toEqual(['CONFIGURATION_DENIED LAUNCH_TREE']);
    expect(started.exit()).toBe(78);
    expect(sweep).not.toHaveBeenCalled();
    expect(created).not.toHaveBeenCalled();
    expect(started.handlers.size).toBe(0);
  });

  // Was: the entry point uses the one mounted-config gate. Now: `loadGuidedConfig` is the one gate.
  it('is the only mounted-config gate the worker entry point uses', () => {
    const entry = readFileSync(join(packageRoot, 'src', 'main.ts'), 'utf8');
    expect(entry).toContain('loadGuidedConfig(options.env)');
    expect(entry).not.toContain('JSON.parse');
    expect(entry).not.toContain('applicationPolicy');
    expect(entry).not.toMatch(/\brules\b/u);
    expect(entry).toContain("import { canEnumerateLaunchTree } from './run/tree.js'");
  });
});

describe('AC-1 — one entry point, one image, one process', () => {
  it('has no second entry point: guidedMain, guidedConfig, guidedShutdown and the start:guided script are gone', () => {
    for (const gone of ['guidedMain.ts', 'guidedConfig.ts', 'guidedShutdown.ts']) {
      expect(existsSync(join(packageRoot, 'src', 'run', gone)), gone).toBe(false);
    }
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(manifest.scripts.start).toBe('node dist/main.js');
    expect(Object.values(manifest.scripts).filter((command) => /\bnode dist\/(?!main\.js|probe\.js)/u.test(command))).toEqual([]);
    expect(Object.keys(manifest.scripts)).not.toContain('start:guided');
  });

  it('constructs no plaintext HTTP server anywhere in src', () => {
    const offenders: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (path.endsWith('.ts')) {
          const text = readFileSync(path, 'utf8');
          if (/import\s*\{[^}]*\bcreateServer\b[^}]*\}\s*from\s*'node:http'/u.test(text) || /\bhttp\.createServer\b/u.test(text)) offenders.push(relative(packageRoot, path));
        }
      }
    };
    walk(join(packageRoot, 'src'));
    // There is no other listener in the package: the egress proxy is gone, so the browser connects directly.
    expect(offenders).toEqual([]);
  });

  it('accepts 59 keys: the 46 of the replay runner (the allowed-domains and allow-all keys among them), the four listener keys and the nine guided keys', () => {
    expect(ACCEPTED_KEYS).toHaveLength(59);
    const added = [
      'TLS_KEY_FILE', 'TLS_CERT_FILE', 'TLS_CA_FILE', 'CONTROLLER_CERTIFICATE_FINGERPRINT256',
      'GUIDED_ENABLED', ...GUIDED_KEYS,
    ].map((suffix) => `${P}${suffix}`);
    for (const key of added) expect(ACCEPTED_KEYS, key).toContain(key);
    expect(ACCEPTED_KEYS.filter((key) => key.startsWith(`${P}GUIDED_`)).sort()).toEqual([`${P}GUIDED_ENABLED`, ...GUIDED_KEYS.map((key) => `${P}${key}`)].sort());
  });

  it('has a bounded guided capacity key and no policy-hash key (ruling A2.4): the policy is context-bound', () => {
    expect(ACCEPTED_KEYS.filter((key) => /CAPACITY|RULES|POLICY_HASH|GUIDED_POLICY/u.test(key))).toEqual([`${P}GUIDED_CAPACITY`]);
    const env = guidedEnv(scratchRoot());
    for (const [value, accepted] of [['1', true], ['3', true], ['8', true], ['0', false], ['9', false], ['-1', false], ['two', false], ['', false]] as const) {
      const attempt = (): unknown => loadGuidedConfig({ ...env, [`${P}GUIDED_CAPACITY`]: value });
      if (accepted) expect(attempt(), value).toMatchObject({ enabled: true, capacity: Number(value) });
      else expect(attempt, value).toThrow(ConfigurationError);
    }
    for (const key of ['GUIDED_POLICY_HASH', 'GUIDED_POLICY', 'CAPACITY']) {
      expect(problemsOf(() => loadGuidedConfig({ ...env, [`${P}${key}`]: '1' })).join('\n'), key).toContain(`${P}${key}`);
    }
  });
});

describe('the switch and the cross-field rules', () => {
  it('defaults the switch to false, and a disabled runner holds no guided material', () => {
    const env = runnerEnv(scratchRoot());
    expect(loadGuidedConfig(env)).toEqual({ enabled: false });
    expect(loadGuidedConfig({ ...env, [`${P}GUIDED_ENABLED`]: 'false' })).toEqual({ enabled: false });
    expect(loadGuidedConfig({ ...env, [`${P}GUIDED_ENABLED`]: ' TRUE ', ...Object.fromEntries(GUIDED_KEYS.map((key) => [`${P}${key}`, guidedEnv(scratchRoot())[`${P}${key}`] ?? ''])) }).enabled).toBe(true);
    expect(problemsOf(() => loadGuidedConfig({ ...env, [`${P}GUIDED_ENABLED`]: 'maybe' })).join('\n')).toContain(`${P}GUIDED_ENABLED must be true or false`);
  });

  it('refuses every guided key present while the switch is off (no half configuration), naming the key and never the value', () => {
    const env = guidedEnv(scratchRoot());
    for (const absent of [undefined, 'false']) {
      for (const key of GUIDED_KEYS) {
        const half: Record<string, string> = { ...runnerEnv(scratchRoot()), [`${P}${key}`]: env[`${P}${key}`] ?? '', ...(absent === undefined ? {} : { [`${P}GUIDED_ENABLED`]: absent }) };
        const problems = problemsOf(() => loadGuidedConfig(half));
        expect(problems, `${key}/${String(absent)}`).toHaveLength(1);
        expect(problems[0]).toContain(`${P}${key}`);
        expect(problems[0]).not.toContain(half[`${P}${key}`] ?? 'unreachable');
      }
    }
    // A blank guided key counts as not provided, like every other key.
    expect(loadGuidedConfig({ ...runnerEnv(scratchRoot()), [`${P}GUIDED_WORKER_ID`]: '  ' })).toEqual({ enabled: false });
  });

  it('requires every guided key when the switch is on, one problem per missing key', () => {
    const env = guidedEnv(scratchRoot());
    for (const key of GUIDED_KEYS) {
      const missing = Object.fromEntries(Object.entries(env).filter(([name]) => name !== `${P}${key}`));
      expect(problemsOf(() => loadGuidedConfig(missing)), key).toEqual([`${P}${key} is required when ${P}GUIDED_ENABLED is true.`]);
    }
    const none = Object.fromEntries(Object.entries(env).filter(([name]) => !name.startsWith(`${P}GUIDED_`) || name.endsWith('_ENABLED')));
    expect(problemsOf(() => loadGuidedConfig(none))).toHaveLength(GUIDED_KEYS.length);
  });

  it('keeps the guided callback URL its own https-only key, checked at startup and never derived from the replay callback URL', () => {
    const env = guidedEnv(scratchRoot());
    for (const url of ['http://controller.internal', 'https://u:p@controller.internal', 'https://controller.internal/?t=1', 'https://controller.internal/#x', 'controller.internal', 'ftp://controller.internal']) {
      const problems = problemsOf(() => loadGuidedConfig({ ...env, [`${P}GUIDED_CALLBACK_BASE_URL`]: url }));
      expect(problems, url).toEqual([`${P}GUIDED_CALLBACK_BASE_URL must be an absolute https URL with no userinfo, query or fragment.`]);
      expect(problems.join('\n')).not.toContain('controller.internal');
    }
    // The replay callback stays plaintext-capable and independent (A3 does not extend to callbacks).
    expect(env[`${P}CALLBACK_BASE_URL`]).toMatch(/^http:/u);
    expect(loadGuidedConfig(env)).toMatchObject({ callbackBaseUrl: 'https://127.0.0.1:9' });
    expect(loadConfig(env).callbackBaseUrl).toBe('http://api.internal.example:8080');
    const withoutGuidedUrl = Object.fromEntries(Object.entries(env).filter(([name]) => name !== `${P}GUIDED_CALLBACK_BASE_URL`));
    expect(problemsOf(() => loadGuidedConfig(withoutGuidedUrl))).toHaveLength(1);
  });

  it('keeps the journal disjoint from SCRATCH_DIR and OBJECT_STORE_DIR (scratch is cleared at every start)', () => {
    const root = scratchRoot();
    const env = guidedEnv(root);
    for (const journal of [join(root, 'scratch'), join(root, 'scratch', 'journal'), join(root, 'objects'), join(root, 'objects', 'journal'), root, '/']) {
      const problems = problemsOf(() => loadGuidedConfig({ ...env, [`${P}GUIDED_JOURNAL_DIR`]: journal }));
      expect(problems.length, journal).toBeGreaterThan(0);
      expect(problems.join('\n')).toContain('must be disjoint');
      expect(problems.join('\n')).not.toContain(root);
    }
    expect(loadGuidedConfig({ ...env, [`${P}GUIDED_JOURNAL_DIR`]: join(root, 'journal-sibling') }).enabled).toBe(true);
  });

  it('repeats the disjointness test after realpath, so a symlinked journal cannot hide inside scratch', async () => {
    const root = scratchRoot();
    mkdirSync(join(root, 'scratch'), { recursive: true });
    // A directory link: a junction on win32, where a symlink needs admin or Developer Mode (`type` is ignored on posix).
    symlinkSync(join(root, 'scratch'), join(root, 'alias'), isWindows ? 'junction' : 'dir');
    const env = { ...guidedEnv(root), [`${P}GUIDED_JOURNAL_DIR`]: join(root, 'alias', 'journal') };
    // Lexically disjoint, really inside scratch.
    expect(loadGuidedConfig(env).enabled).toBe(true);
    const sweep = vi.fn(prepareRecordingScratch);
    const started = await start(root, env, seams({ sweep }));
    expect(started.result.started).toBe(false);
    expect(started.exit()).toBe(78);
    expect(started.lines).toEqual([`configuration rejected: ${P}GUIDED_JOURNAL_DIR must be disjoint from ${P}SCRATCH_DIR; scratch is deleted on restart.`]);
    expect(sweep).not.toHaveBeenCalled();
  });
});

describe('the listener keys are required in every deployment, guided or not', () => {
  it('refuses a runner without any one of the four, naming the key', async () => {
    const root = scratchRoot();
    for (const suffix of ['TLS_KEY_FILE', 'TLS_CERT_FILE', 'TLS_CA_FILE', 'CONTROLLER_CERTIFICATE_FINGERPRINT256']) {
      const env = Object.fromEntries(Object.entries(runnerEnv(root)).filter(([name]) => name !== `${P}${suffix}`));
      expect(problemsOf(() => loadListenerConfig(env)), suffix).toEqual([`${P}${suffix} is required and was not provided.`]);
      const started = await start(root, env);
      expect(started.result, suffix).toEqual({ started: false });
      expect(started.exit()).toBe(78);
      expect(started.lines).toContain(`configuration rejected: ${P}${suffix} is required and was not provided.`);
      expect(started.handlers.size).toBe(0);
    }
    // loadConfig itself is unchanged: the replay-only configuration tests keep their minimal environment.
    expect(loadConfig({ [`${P}SERVICE_IDENTITY`]: 'a', [`${P}CALLBACK_IDENTITY`]: 'b', [`${P}CALLBACK_BASE_URL`]: 'https://x.test' }).port).toBe(8080);
  });

  it('accepts the fingerprint only in the form Node prints it, with no normalisation', () => {
    const env = runnerEnv(scratchRoot());
    const form = (value: string): string[] => problemsOf(() => loadListenerConfig({ ...env, [`${P}CONTROLLER_CERTIFICATE_FINGERPRINT256`]: value }));
    expect(form(testFingerprint)).toEqual([]);
    const bad = [
      testFingerprint.toLowerCase(), testFingerprint.replaceAll(':', ''), testFingerprint.slice(0, -3), `${testFingerprint}:AA`,
      ` ${testFingerprint}`.replace(' ', 'X'), testFingerprint.replace(/^../u, 'ZZ'), `sha256 ${testFingerprint}`,
    ];
    for (const value of bad) {
      const problems = form(value);
      expect(problems, value).toHaveLength(1);
      expect(problems[0]).toContain(`${P}CONTROLLER_CERTIFICATE_FINGERPRINT256`);
      expect(problems[0]).not.toContain(value);
    }
  });

  it('requires absolute TLS paths', () => {
    const env = runnerEnv(scratchRoot());
    for (const suffix of ['TLS_KEY_FILE', 'TLS_CERT_FILE', 'TLS_CA_FILE']) {
      expect(problemsOf(() => loadListenerConfig({ ...env, [`${P}${suffix}`]: 'relative/path.pem' })), suffix).toEqual([`${P}${suffix} must be an absolute path.`]);
    }
  });
});

describe('startup order and the closed refusals (rulings Q2, A2.5)', () => {
  it('refuses the debug environment with CONFIGURATION_DENIED DEBUG_ENV, exit 78, before the build check', async () => {
    for (const name of ['DEBUG', 'PWDEBUG', 'NODE_DEBUG', 'NODE_OPTIONS']) {
      const root = scratchRoot();
      const assertBuild = vi.fn();
      const launchTree = vi.fn(() => true);
      const started = await start(root, { ...guidedEnv(root), [name]: '--inspect=canary-value' }, seams({ assertBuild, launchTree }));
      expect(started.result, name).toEqual({ started: false });
      expect(started.lines).toEqual(['CONFIGURATION_DENIED DEBUG_ENV']);
      expect(started.exit()).toBe(78);
      expect(assertBuild).not.toHaveBeenCalled();
      expect(launchTree).not.toHaveBeenCalled();
    }
    // An empty value is not set, as everywhere else in this process.
    const root = scratchRoot();
    const started = await start(root, { ...guidedEnv(root), NODE_OPTIONS: '' }, seams());
    expect(started.result.started).toBe(true);
    await stop(started);
  });

  it('checks the debug environment and the launch tree only when guided mode is on', async () => {
    const root = scratchRoot();
    const launchTree = vi.fn(() => false);
    const started = await start(root, { ...runnerEnv(root), NODE_OPTIONS: '--max-old-space-size=1024' }, seams({ launchTree }));
    expect(started.result.started).toBe(true);
    expect(started.lines).toEqual([]);
    expect(launchTree).not.toHaveBeenCalled();
    await stop(started);
  });

  it('runs the guards in the ruled order: build identity, launch tree, files, sweep, then the application', async () => {
    const root = scratchRoot();
    const order: string[] = [];
    vi.spyOn(applicationModule, 'createApplication').mockImplementation(() => {
      order.push('application');
      throw new Error('stop here');
    });
    const started = await start(root, guidedEnv(root), seams({
      assertBuild: () => { order.push('build'); },
      launchTree: () => { order.push('tree'); return true; },
      sweep: (options) => { order.push('sweep'); return prepareRecordingScratch({ ...options, evidenceRoot: root }); },
    }));
    expect(order).toEqual(['build', 'tree', 'sweep', 'application']);
    // The stand-in failure is a failure after configuration was accepted: one closed line, exit 1.
    expect(started.lines).toEqual(['RUNNER_START_FAILED']);
    expect(started.exit()).toBe(1);
  });

  it('a build identity mismatch is GUIDED_WORKER_UNAVAILABLE, exit 1, before the launch tree and the sweep', async () => {
    const root = scratchRoot();
    const launchTree = vi.fn(() => true);
    const sweep = vi.fn(prepareRecordingScratch);
    const started = await start(root, guidedEnv(root), seams({ assertBuild: () => { throw new Error('PROFILE_MISMATCH /private/path'); }, launchTree, sweep }));
    expect(started.lines).toEqual(['GUIDED_WORKER_UNAVAILABLE']);
    expect(started.exit()).toBe(1);
    expect(launchTree).not.toHaveBeenCalled();
    expect(sweep).not.toHaveBeenCalled();
  });

  it('refuses a launch tree that cannot be enumerated with exit 78 and the closed reason LAUNCH_TREE, before the sweep and the listener', async () => {
    const root = scratchRoot();
    const sweep = vi.fn(prepareRecordingScratch);
    const created = vi.spyOn(applicationModule, 'createApplication');
    const started = await start(root, guidedEnv(root), seams({ launchTree: () => false, sweep }));
    expect(started.result).toEqual({ started: false });
    expect(started.lines).toEqual(['CONFIGURATION_DENIED LAUNCH_TREE']);
    expect(started.exit()).toBe(78);
    expect(sweep).not.toHaveBeenCalled();
    expect(created).not.toHaveBeenCalled();
    expect(existsSync(join(root, 'journal'))).toBe(false);
  });

  it('the default launch-tree guard is canEnumerateLaunchTree itself, which refuses pid 1 (PID-1 a)', () => {
    // Not a seam: the production default. Under vitest this process has pid > 1, so the real guard is
    // consulted with the real `ps`; what is asserted is which function decides, and that pid 1 is false.
    expect(canEnumerateLaunchTree(1)).toBe(false);
    expect(canEnumerateLaunchTree(0)).toBe(false);
    const source = readFileSync(join(packageRoot, 'src', 'main.ts'), 'utf8');
    expect(source).toContain('(seams.launchTree ?? canEnumerateLaunchTree)()');
    // Never guarded by a pid exception: nothing in main.ts mentions or relaxes pid 1.
    expect(source).not.toMatch(/process\.pid\s*(?:===?|!==?|<=?|>=?)/u);
  });

  it('a failed sweep is GUIDED_WORKER_UNAVAILABLE, exit 1, and nothing listens', async () => {
    const root = scratchRoot();
    const created = vi.spyOn(applicationModule, 'createApplication');
    const started = await start(root, guidedEnv(root), seams({ sweep: () => Promise.reject(new Error('RECORDING_SCRATCH_UNAVAILABLE /private/path')) }));
    expect(started.result).toEqual({ started: false });
    expect(started.lines).toEqual(['GUIDED_WORKER_UNAVAILABLE']);
    expect(started.exit()).toBe(1);
    expect(created).not.toHaveBeenCalled();
    expect(started.handlers.size).toBe(0);
  });

  it('refuses unreadable, empty and non-PEM listener files with one value-free line each, exit 78', async () => {
    const root = scratchRoot();
    const empty = join(root, 'empty.pem');
    const text = join(root, 'text.pem');
    writeFileSync(empty, '');
    writeFileSync(text, 'this is not pem');
    const cases: [string, string, string][] = [
      ['TLS_KEY_FILE', join(root, 'missing.pem'), 'could not be read'],
      ['TLS_CERT_FILE', empty, 'is empty'],
      ['TLS_CA_FILE', text, 'is not PEM'],
      ['TLS_KEY_FILE', tlsFile('cert'), 'not a usable PEM private key'],
      ['TLS_CERT_FILE', tlsFile('key'), 'not a PEM certificate'],
    ];
    for (const [suffix, file, reason] of cases) {
      const started = await start(root, { ...runnerEnv(root), [`${P}${suffix}`]: file });
      expect(started.result, `${suffix} ${reason}`).toEqual({ started: false });
      expect(started.exit()).toBe(78);
      expect(started.lines.join('\n')).toContain(`configuration rejected: ${P}${suffix}`);
      expect(started.lines.join('\n')).toContain(reason);
      expect(started.lines.join('\n')).not.toContain(root);
    }
  });

  it('refuses a controller public key that is not RSA or is below 2048 bits, with the key file never echoed', async () => {
    const root = scratchRoot();
    const note = join(root, 'public.pem');
    writeFileSync(note, 'not a key');
    const started = await start(root, { ...guidedEnv(root), [`${P}GUIDED_CONTROLLER_PUBLIC_KEY_FILE`]: note }, seams());
    expect(started.result).toEqual({ started: false });
    expect(started.exit()).toBe(78);
    expect(started.lines).toEqual([`configuration rejected: ${P}GUIDED_CONTROLLER_PUBLIC_KEY_FILE could not be read as a PEM public key.`]);
  });

  it('reports every configuration problem at once, once each', async () => {
    const root = scratchRoot();
    const started = await start(root, { ...runnerEnv(root), [`${P}DATABASE_URL`]: 'postgres://canary', [`${P}GUIDED_WORKER_ID`]: 'w' });
    expect(started.exit()).toBe(78);
    // (The unknown-key line lists every accepted key, so count the lines that open with the key.)
    expect(started.lines.filter((line) => line.startsWith(`configuration rejected: ${P}DATABASE_URL`))).toHaveLength(1);
    expect(started.lines.filter((line) => line.startsWith(`configuration rejected: ${P}GUIDED_WORKER_ID`))).toHaveLength(1);
    expect(started.lines.join('\n')).not.toContain('postgres://canary');
  });
});

describe('RUNNER-SCRATCH — the recording-scratch sweep is part of the one start', () => {
  it('hands the sweep the worker identity and the journal directory, and the application the result', async () => {
    const root = scratchRoot();
    const calls: unknown[] = [];
    const created = vi.spyOn(applicationModule, 'createApplication');
    const started = await start(root, guidedEnv(root), seams({
      sweep: async (options) => {
        calls.push({ workerId: options.workerId, journalDirectory: options.journalDirectory, evidenceRoot: options.evidenceRoot });
        const swept = await prepareRecordingScratch({ ...options, evidenceRoot: root });
        calls.push(swept);
        return swept;
      },
    }));
    expect(started.result.started).toBe(true);
    expect(calls[0]).toEqual({ workerId: 'worker-one', journalDirectory: join(root, 'journal'), evidenceRoot: undefined });
    expect(created.mock.calls[0]?.[1].guided?.recordingScratch).toBe(calls[1]);
    await stop(started);
  });

  itPosixOnly('the dead owner is a real unused pid probed with kill(pid, 0) against the posix recording-scratch ownership (uid, mode bits); the win32 sweep has its own host tests', 'reclaims the residue of a SIGKILLed worker before it can be assigned a session, and keeps a live one', async () => {
    const root = scratchRoot();
    vi.stubEnv('TMPDIR', root);
    const env = guidedEnv(root);
    const options = { workerId: 'worker-one', journalDirectory: join(root, 'journal') };
    // A worker that died with a recording on disk: its incarnation, its marker, its WebM scratch.
    const dead = await prepareRecordingScratch(options);
    const deadRecording = await dead.allocate();
    writeFileSync(join(deadRecording, 'video.webm'), 'residue');
    // A second worker of the same scope that is alive (this process).
    const live = await prepareRecordingScratch(options);
    const liveRecording = await live.allocate();
    writeFileSync(join(liveRecording, 'video.webm'), 'in use');
    // Make the first owner definitively dead: a pid no process holds (the sweep asks `kill(pid, 0)`).
    const marker = join(dirname(deadRecording), 'owner.json');
    const body = JSON.parse(readFileSync(marker, 'utf8')) as { pid: number };
    writeFileSync(marker, JSON.stringify({ ...body, pid: unusedPid() }));
    expect(existsSync(deadRecording)).toBe(true);

    // The folded start: the default sweep, no seam.
    const started = await start(root, env, { assertBuild: () => undefined, launchTree: () => true, launch: () => Promise.reject(new Error('no browser')) });
    try {
      expect(started.result.started).toBe(true);
      expect(existsSync(deadRecording)).toBe(false);
      expect(existsSync(dirname(deadRecording))).toBe(false);
      expect(readFileSync(join(liveRecording, 'video.webm'), 'utf8')).toBe('in use');
    } finally {
      await stop(started);
      await dead.close();
      await live.close();
    }
  });
});

/** One HTTPS call to the one listener, presenting the test controller certificate unless told not to. */
function call(
  port: number,
  method: string,
  path: string,
  options: { authorization?: string; body?: string; headers?: Record<string, string>; certificate?: boolean } = {},
): Promise<{ status: number; headers: IncomingHttpHeaders; body: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(options.body ?? '');
    const req = request(
      { hostname: '127.0.0.1', port, path, method, ca: testTls.ca, ...(options.certificate === false ? {} : { key: testTls.key, cert: testTls.cert }),
        headers: { ...(options.authorization === undefined ? {} : { authorization: options.authorization }), 'content-type': 'application/json', 'content-length': String(payload.length), ...options.headers } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text === '' ? null : JSON.parse(text) as unknown });
        });
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

describe('guided routes on the one listener', () => {
  /** A controller that answers the claim with the grant and every callback with 202, over the test CA. */
  async function controller(grantFor: (sessionId: string) => unknown) {
    const seen: string[] = [];
    const server = createHttpsServer({ ...testTls, requestCert: true, rejectUnauthorized: true }, (req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const url = req.url ?? '';
        seen.push(url.split('/').slice(-1)[0] ?? '');
        const claim = /\/guided-sessions\/([^/]+)\/claim$/u.exec(url);
        const grant = claim?.[1] === undefined ? undefined : grantFor(decodeURIComponent(claim[1]));
        res.writeHead(202, { 'content-type': 'application/json' });
        res.end(grant === undefined ? '' : JSON.stringify(grant));
      });
    });
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve); });
    return { port: (server.address() as AddressInfo).port, seen, close: () => new Promise<void>((resolve) => { server.close(() => { resolve(); }); server.closeAllConnections(); }) };
  }

  const grantOf = (context: ReturnType<typeof guidedContext>) => {
    const grant = ownershipSession(context);
    return { ...structuredClone(grant), owner: { ...grant.owner, leaseExpiresAt: new Date(Math.min(Date.now() + 30_000, Date.parse(grant.expiresAt))).toISOString() } };
  };

  it('serves replay, health, readiness and the guided bridge on one TLS port, and a held guided slot changes neither probe (D1-T3)', async () => {
    const root = scratchRoot();
    const first = guidedContext('https://example.test');
    const second = guidedContext('https://example.test');
    const grants = new Map([[first.sessionId, grantOf(first)], [second.sessionId, grantOf(second)]]);
    const server = await controller((sessionId) => grants.get(sessionId));
    const started = await start(root, guidedEnv(root, `https://127.0.0.1:${String(server.port)}`), seams());
    try {
      const port = started.result.port ?? 0;
      expect(port).toBeGreaterThan(0);
      const bearer = `Bearer ${SERVICE_TOKEN}`;

      // Before any session: ready, with exactly the four existing fields.
      const before = await call(port, 'GET', '/ready', { authorization: bearer });
      expect(before.status).toBe(200);
      expect(Object.keys(before.body as object).sort()).toEqual(['draining', 'inUse', 'ready', 'size']);

      // A guided assignment over the same port takes the one guided slot.
      const owned = await post(port, `/internal/v2/studio/guided-sessions/${first.sessionId}/assign`, assignmentFor(first), { fence: null, key: 'assign-1' });
      expect(owned.status).toBe(200);
      expect(owned.body).toMatchObject({ status: 'OWNED', ownerFence: 1 });
      expect(server.seen).toContain('claim');

      // The slot is held: a second session is refused CAPACITY ...
      const refused = await post(port, `/internal/v2/studio/guided-sessions/${second.sessionId}/assign`, assignmentFor(second), { fence: null, key: 'assign-2' });
      expect(refused.status).toBe(409);
      expect(refused.body).toEqual({ code: 'CAPACITY' });

      // ... and neither probe notices (ruling Q1): same status, same body shape, still no guided field.
      const ready = await call(port, 'GET', '/ready', { authorization: bearer });
      expect(ready.status).toBe(200);
      expect(Object.keys(ready.body as object).sort()).toEqual(['draining', 'inUse', 'ready', 'size']);
      expect(ready.body).toEqual(before.body);
      const health = await call(port, 'GET', '/health', { authorization: bearer });
      expect(health.status).toBe(200);
      expect(health.body).toEqual({ status: 'ok', draining: false });

      // The replay family is on the very same listener.
      const replay = await call(port, 'POST', '/v2/validate-observed', { authorization: bearer, body: '{}' });
      expect([400, 503]).toContain(replay.status);
      expect(replay.body).toHaveProperty('code');
    } finally {
      await stop(started);
      await server.close();
    }
  });

  it('answers a guided path with the replay 404 before any JWT work when guided mode is off, and never reaches the bridge', async () => {
    const root = scratchRoot();
    const started = await start(root, runnerEnv(root));
    try {
      const port = started.result.port ?? 0;
      const context = guidedContext('https://example.test');
      const path = `/internal/v2/studio/guided-sessions/${context.sessionId}/assign`;
      // A valid guided JWT, the service bearer, a garbage bearer and none: always 404 NOT_FOUND, never 401 AUTH_DENIED.
      for (const authorization of [`Bearer ${jwt()}`, `Bearer ${SERVICE_TOKEN}`, 'Bearer not.a.jwt', undefined]) {
        const reply = await call(port, 'POST', path, { ...(authorization === undefined ? {} : { authorization }), body: JSON.stringify(assignmentFor(context)) });
        expect(reply.status, String(authorization)).toBe(404);
        expect(reply.body).toEqual({ code: 'NOT_FOUND' });
      }
      // The pin still comes first: an unpinned (CA-trusted) peer is refused, not told the route is absent.
      expect(await call(port, 'POST', path, { certificate: false, authorization: `Bearer ${jwt()}` }).catch((error: unknown) => (error as Error).name)).not.toMatchObject({ status: 404 });
    } finally {
      await stop(started);
    }
  });

  it('a runner without guided mode serves nothing from the guided session store: no journal, no sweep, no scratch root', async () => {
    const root = scratchRoot();
    vi.stubEnv('TMPDIR', root);
    const started = await start(root, runnerEnv(root));
    try {
      expect(started.result.started).toBe(true);
      expect(readdirSync(root).filter((name) => name === 'journal' || name === '.checks-guided-recordings')).toEqual([]);
    } finally {
      await stop(started);
    }
  });
});

describe('startup is one value-free line per refusal', () => {
  it('writes no path, no variable value and no file content in any startup refusal', async () => {
    const root = scratchRoot();
    const canary = 'CANARY-5f0c2d';
    const secretFile = join(root, `${canary}.pem`);
    writeFileSync(secretFile, `-----BEGIN PRIVATE KEY-----\n${canary}\n-----END PRIVATE KEY-----\n`);
    const refusals: Started[] = [];
    refusals.push(await start(root, { ...runnerEnv(root), [`${P}TLS_KEY_FILE`]: secretFile }));
    refusals.push(await start(root, { ...runnerEnv(root), [`${P}TLS_CA_FILE`]: secretFile }));
    refusals.push(await start(root, { ...guidedEnv(root), [`${P}GUIDED_CONTROLLER_PUBLIC_KEY_FILE`]: secretFile }, seams()));
    refusals.push(await start(root, { ...guidedEnv(root), DEBUG: canary }, seams()));
    refusals.push(await start(root, { ...runnerEnv(root), [`${P}VAULT_ADDRESS`]: canary }));
    refusals.push(await start(root, guidedEnv(root), seams({ assertBuild: () => { throw new Error(canary); } })));
    refusals.push(await start(root, guidedEnv(root), seams({ launchTree: () => false })));
    refusals.push(await start(root, guidedEnv(root), seams({ sweep: () => Promise.reject(new Error(canary)) })));
    for (const refusal of refusals) {
      expect(refusal.result.started).toBe(false);
      expect(refusal.lines.length).toBeGreaterThan(0);
      for (const line of refusal.lines) {
        expect(line).not.toContain(canary);
        expect(line).not.toContain(root);
        expect(line).not.toContain('\n');
      }
    }
  });
});

describe('the navigation whitelist and the guided capacity at startup', () => {
  it.each(['Example.com', 'a.com, b.com', 'a.com,', '*.a.com', '127.0.0.1', 'https://a.com', 'a.com:8443', 'a.com,www.a.com', 'a.com,a.com', ' '])(
    'refuses %j before anything listens (exit 78)',
    async (value) => {
      const root = scratchRoot();
      const started = await start(root, { ...runnerEnv(root), [`${P}ALLOWED_DOMAINS`]: value }, seams());
      expect(started.result.started).toBe(false);
      expect(started.exit()).toBe(78);
      expect(started.lines).toEqual([expect.stringMatching(new RegExp(`^configuration rejected: ${P}ALLOWED_DOMAINS is invalid: `, 'u'))]);
    },
  );

  it('refuses more than 32 entries', async () => {
    const root = scratchRoot();
    const started = await start(root, { ...runnerEnv(root), [`${P}ALLOWED_DOMAINS`]: Array.from({ length: 33 }, (_, i) => `d${String(i)}.example`).join(',') }, seams());
    expect(started.exit()).toBe(78);
  });

  it.each([undefined, ''])('treats %j as the empty list: the runner starts and denies every navigation', async (value) => {
    const root = scratchRoot();
    // Explicitly not allow-all (runnerEnv says so): this test is about the list.
    const env: Record<string, string | undefined> = { ...runnerEnv(root), ...(value === undefined ? {} : { [`${P}ALLOWED_DOMAINS`]: value }) };
    const started = await start(root, env, seams());
    expect(started.result.started).toBe(true);
    expect(started.result.application?.config.allowedDomains).toEqual([]);
    await stop(started);
  });

  describe('the allow-all option (STUDIO_RUNNER_ALLOW_ALL_DOMAINS)', () => {
    it.each(['TRUE', '1', 'yes', ' true', 'true ', 'maybe'])('refuses %j before anything listens (exit 78), without echoing it', async (value) => {
      const root = scratchRoot();
      const started = await start(root, { ...runnerEnv(root), [`${P}ALLOW_ALL_DOMAINS`]: value }, seams());
      expect(started.result.started).toBe(false);
      expect(started.exit()).toBe(78);
      expect(started.lines).toEqual([`configuration rejected: ${P}ALLOW_ALL_DOMAINS is invalid: must be true or false (or unset).`]);
    });

    it('still refuses an invalid list when the option is on (the option does not hide a typo)', async () => {
      const root = scratchRoot();
      const started = await start(root, { ...runnerEnv(root), [`${P}ALLOWED_DOMAINS`]: '*.a.com', [`${P}ALLOW_ALL_DOMAINS`]: 'true' }, seams());
      expect(started.exit()).toBe(78);
      expect(started.lines).toEqual([expect.stringMatching(new RegExp(`^configuration rejected: ${P}ALLOWED_DOMAINS is invalid: `, 'u'))]);
    });

    it('is off for false: the list stands and nothing is warned', async () => {
      const root = scratchRoot();
      const started = await start(root, { ...runnerEnv(root), [`${P}ALLOWED_DOMAINS`]: 'example.com', [`${P}ALLOW_ALL_DOMAINS`]: 'false' }, seams());
      expect(started.result.started).toBe(true);
      expect(started.result.application?.config.allowedDomains).toEqual(['example.com']);
      expect(started.lines.some((line) => line.includes('allow-all'))).toBe(false);
      await stop(started);
    });

    it.each([undefined, ''])('is ON for %j (the default for now): every host is allowed, the list is ignored, and one WARN line says so', async (value) => {
      const root = scratchRoot();
      const base = Object.fromEntries(Object.entries(runnerEnv(root)).filter(([key]) => key !== `${P}ALLOW_ALL_DOMAINS`));
      const env: Record<string, string | undefined> = { ...base, [`${P}ALLOWED_DOMAINS`]: 'example.com', ...(value === undefined ? {} : { [`${P}ALLOW_ALL_DOMAINS`]: value }) };
      const started = await start(root, env, seams());
      expect(started.result.started).toBe(true);
      const effective = started.result.application?.config.allowedDomains ?? [];
      expect(isAllowAll(effective)).toBe(true);
      expect(domainAllowed(effective, 'https://anything.example/')).toBe(true);
      expect(started.lines.filter((line) => line.includes('allow-all'))).toEqual([NAVIGATION_ALL_DOMAINS_WARNING]);
      await stop(started);
    });

    it.each(['', 'example.com'])('is on for true with the list %j: every host is allowed, the list is ignored, and one WARN line says so', async (list) => {
      const root = scratchRoot();
      const started = await start(root, { ...runnerEnv(root), [`${P}ALLOWED_DOMAINS`]: list, [`${P}ALLOW_ALL_DOMAINS`]: 'true' }, seams());
      expect(started.result.started).toBe(true);
      const effective = started.result.application?.config.allowedDomains ?? [];
      expect(isAllowAll(effective)).toBe(true);
      expect(domainAllowed(effective, 'https://anything.example/')).toBe(true);
      expect(started.lines.filter((line) => line.includes('allow-all'))).toEqual([NAVIGATION_ALL_DOMAINS_WARNING]);
      expect(NAVIGATION_ALL_DOMAINS_WARNING).toBe('WARN navigation allowed to all domains (allow-all-domains=true)');
      await stop(started);
    });
  });

  it('logs the list at startup and hands it to the launcher and the guided bridge', async () => {
    const root = scratchRoot();
    const lines: string[] = [];
    const write = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => { lines.push(String(chunk)); return true; });
    const created = vi.spyOn(applicationModule, 'createApplication');
    let started: Started | undefined;
    try {
      started = await start(root, { ...guidedEnv(root), [`${P}GUIDED_CAPACITY`]: '3', [`${P}ALLOWED_DOMAINS`]: 'localhost,example.com,practicetestautomation.com' }, seams());
    } finally { write.mockRestore(); }
    expect(started.result.started).toBe(true);
    const announced = lines.map((line) => JSON.parse(line) as Record<string, unknown>).find((line) => line.event === 'runner.started');
    expect(announced).toMatchObject({ allowedDomains: 'localhost,example.com,practicetestautomation.com', guided: true });
    expect(created.mock.calls[0]?.[0].allowedDomains).toEqual(['localhost', 'example.com', 'practicetestautomation.com']);
    expect(created.mock.calls[0]?.[1].guided?.capacity).toBe(3);
    await stop(started);
  });

  it('refuses a guided runner without a capacity (required when guided is on)', async () => {
    const root = scratchRoot();
    const withoutCapacity = Object.fromEntries(Object.entries(guidedEnv(root)).filter(([key]) => key !== `${P}GUIDED_CAPACITY`));
    const started = await start(root, withoutCapacity, seams());
    expect(started.exit()).toBe(78);
    expect(started.lines).toContain(`configuration rejected: ${P}GUIDED_CAPACITY is required when ${P}GUIDED_ENABLED is true.`);
  });
});
