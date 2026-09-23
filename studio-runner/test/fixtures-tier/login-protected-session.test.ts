import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createChildBrowserLauncher } from '../../src/run/launcher.js';
import { createFsScratchStore } from '../../src/server/scratch.js';
import { createHarness, SERVICE_TOKEN } from '../helpers/harness.js';
import { post, validJob } from '../helpers/runner.js';
import { CHILD_MODULE_PATH } from './globalSetup.js';
import { untilMs } from './realRunner.js';

const SECRET_CANARY = 'secret-canary-10-41-never-retain'; // gitleaks:allow — synthetic test value
let server: Server;
let baseUrl = '';
/** How many times the form was submitted, so a refused fill can be shown to have sent nothing. */
let loginPosts = 0;

beforeAll(async () => {
  server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (path === '/login' && request.method === 'GET') {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(`<form method="post" action="/login"><label>Username<input aria-label="Username" name="user"></label><label>Password<input aria-label="Password" name="password" type="password"></label><button>Sign in</button></form>`);
      return;
    }
    if (path === '/login' && request.method === 'POST') {
      loginPosts += 1;
      response.writeHead(302, { location: '/home', 'set-cookie': 'session=authenticated; HttpOnly; SameSite=Strict' });
      response.end();
      return;
    }
    if ((path === '/home' || path === '/protected') && request.headers.cookie !== 'session=authenticated') {
      response.writeHead(302, { location: '/login' });
      response.end();
      return;
    }
    response.setHeader('content-type', 'text/html; charset=utf-8');
    if (path === '/home') {
      response.end(`<h1>Authenticated home</h1><a href="/protected">Protected reports</a>`);
    } else if (path === '/protected') {
      response.end(`<h1>Protected reports</h1>`);
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === 'object' && address !== null ? String(address.port) : '0'}`;
});

afterAll(async () => new Promise<void>((resolve) => { server.close(() => { resolve(); }); }));


/**
 * The login job. `secretOrigins` defaults to the fixture server's own origin — the one the password
 * is typed on — so the canonical run proves the binding admits the right origin. `null` omits the
 * field entirely.
 */
function boundaryJob(
  secretOrigins: Record<string, string[]> | null = { LOGIN_PASSWORD: [baseUrl] },
): Record<string, unknown> {
  const source = [
    'Navigate to login', 'Enter the authorized username', 'Enter the authorized password',
    'Submit and verify authenticated home', 'Navigate to protected reports', 'Verify protected reports',
  ];
  // The username and password steps select their references through structured context, not
  // through <var>/<secret> tokens; the structural policy is what authorizes them (ADR-SC-003).
  const none = { variables: [], secrets: [] };
  const selects = [none, { variables: ['LOGIN_USER'], secrets: [] }, { variables: [], secrets: ['LOGIN_PASSWORD'] }, none, none, none];
  const code = [
    `await page.goto('${baseUrl}/login');`,
    `await page.getByLabel('Username', { exact: true }).fill(vars.get('LOGIN_USER'));`,
    `await page.getByLabel('Password', { exact: true }).fill(vars.secret('LOGIN_PASSWORD'));`,
    `await page.getByText('Sign in', { exact: true }).click();\nawait expect(page.getByText('Authenticated home', { exact: true })).toBeVisible();`,
    `await page.getByText('Protected reports', { exact: true }).click();`,
    `await expect(page.getByText('Protected reports', { exact: true })).toBeVisible();`,
  ];
  return validJob({
    source,
    artifact: { version: 1, steps: source.map((originalText, stepIndex) => ({ stepIndex, originalText, code: code[stepIndex] })) },
    referencePolicy: { version: 2, steps: selects.map((refs, stepIndex) => ({ stepIndex, required: refs, allowed: refs })) },
    references: { variables: ['LOGIN_USER'], secrets: ['LOGIN_PASSWORD'] },
    resolvedVars: { LOGIN_USER: 'alice' },
    resolvedSecrets: { LOGIN_PASSWORD: SECRET_CANARY },
    ...(secretOrigins === null ? {} : { secretOrigins }),
  });
}

function realLauncher() {
  return createChildBrowserLauncher({
    recording: { width: 1280, height: 720 }, stepTimeoutMs: 15_000,
    launchTimeoutMs: 45_000, maxFailureMessageLength: 400,
    seekOriginCalibrationMs: 0,
    childModulePath: CHILD_MODULE_PATH, stopTimeoutMs: 5_000,
  });
}

/** Runs one job through the real runner and returns the FINAL report and everything retained. */
async function runJob(job: Record<string, unknown>): Promise<{
  final: Record<string, unknown> | undefined;
  retained: string;
  loginPosts: number;
}> {
  const scratchRoot = mkdtempSync(join(tmpdir(), 'studio-runner-boundary-'));
  const harness = createHarness({ launcher: realLauncher(), scratch: createFsScratchStore(scratchRoot) });
  const postsBefore = loginPosts;
  try {
    await harness.start();
    const response = await post(harness.port, '/v1/runs', JSON.stringify(job), SERVICE_TOKEN);
    expect(response.status).toBe(202);
    await untilMs(() => harness.app.coordinator.inFlight === 0, 60_000);
    const final = harness.http.reportRequests.map((item) => JSON.parse(item.body) as Record<string, unknown>).at(-1);
    return {
      final,
      retained: [JSON.stringify(final), ...harness.sink.lines, response.body].join('\n'),
      loginPosts: loginPosts - postsBefore,
    };
  } finally {
    await harness.stop();
    rmSync(scratchRoot, { recursive: true, force: true });
  }
}

describe('secret origin binding on real Chromium', () => {
  it('refuses to type the secret on an origin it is not bound to', async () => {
    // Same server, different origin: `localhost` is not `127.0.0.1` to the browser.
    const other = baseUrl.replace('127.0.0.1', 'localhost');
    const { final, retained, loginPosts: posts } = await runJob(boundaryJob({ LOGIN_PASSWORD: [other] }));
    expect(final?.outcome, JSON.stringify(final)).toMatchObject({
      result: 'ERROR',
      errorCode: 'SECRET_ORIGIN_NOT_ALLOWED',
    });
    const steps = final?.steps as { status: string; failure?: string | null }[] | undefined;
    expect(steps?.map((step) => step.status)).toEqual(['PASS', 'PASS', 'FAIL', 'SKIPPED', 'SKIPPED', 'SKIPPED']);
    expect(steps?.[2]?.failure).toMatch(/^SECRET_ORIGIN_NOT_ALLOWED: Secret "LOGIN_PASSWORD"/u);
    // The form was never submitted, and the value appears nowhere.
    expect(posts).toBe(0);
    expect(retained).not.toContain(SECRET_CANARY);
  }, 120_000);

  it('refuses a secret with no declared origins', async () => {
    const { final, loginPosts: posts } = await runJob(boundaryJob(null));
    expect(final?.outcome, JSON.stringify(final)).toMatchObject({
      result: 'ERROR',
      errorCode: 'SECRET_ORIGIN_NOT_ALLOWED',
    });
    expect(posts).toBe(0);
  }, 120_000);
});

describe('canonical login and protected page through POST /v1/runs', () => {
  it('authorizes context-selected references, preserves the authenticated session and retains no secret', async () => {
    const scratchRoot = mkdtempSync(join(tmpdir(), 'studio-runner-boundary-'));
    const launcher = createChildBrowserLauncher({
      recording: { width: 1280, height: 720 }, stepTimeoutMs: 15_000,
      launchTimeoutMs: 45_000, maxFailureMessageLength: 400,
      seekOriginCalibrationMs: 0,
      childModulePath: CHILD_MODULE_PATH, stopTimeoutMs: 5_000,
    });
    const harness = createHarness({ launcher, scratch: createFsScratchStore(scratchRoot) });
    try {
      await harness.start();
      const response = await post(harness.port, '/v1/runs', JSON.stringify(boundaryJob()), SERVICE_TOKEN);
      expect(response.status).toBe(202);
      await untilMs(() => harness.app.coordinator.inFlight === 0, 60_000);
      const final = harness.http.reportRequests.map((item) => JSON.parse(item.body) as Record<string, unknown>).at(-1);
      expect(final?.outcome, JSON.stringify(final)).toMatchObject({ result: 'PASSED' });
      expect((final?.steps as { status: string }[] | undefined)?.map((step) => step.status))
        .toEqual(['PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS']);
      const retained = [JSON.stringify(final), ...harness.sink.lines, response.body];
      const walk = (directory: string): void => {
        for (const name of readdirSync(directory)) {
          const path = join(directory, name);
          if (statSync(path).isDirectory()) walk(path);
          else retained.push(readFileSync(path).toString('binary'));
        }
      };
      walk(scratchRoot);
      expect(retained.join('\n')).not.toContain(SECRET_CANARY);
      expect(harness.http.admissionRequests).toHaveLength(1);
    } finally {
      await harness.stop();
      rmSync(scratchRoot, { recursive: true, force: true });
    }
  }, 120_000);
});
