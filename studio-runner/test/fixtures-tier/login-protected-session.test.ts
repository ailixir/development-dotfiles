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
const STEP_IDS = [
  '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666',
] as const;
let server: Server;
let baseUrl = '';

beforeAll(async () => {
  server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (path === '/login' && request.method === 'GET') {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(`<form method="post" action="/login"><label>Username<input aria-label="Username" name="user"></label><label>Password<input aria-label="Password" name="password" type="password"></label><button>Sign in</button></form>`);
      return;
    }
    if (path === '/login' && request.method === 'POST') {
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

const literal = (value: string) => ({ kind: 'literal', value });
const label = (value: string) => ({ segments: [{ kind: 'getByLabel', text: literal(value), options: { exact: true } }] });
const text = (value: string) => ({ segments: [{ kind: 'getByText', text: literal(value), options: { exact: true } }] });

function boundaryJob(): Record<string, unknown> {
  const source = [
    'Navigate to login', 'Enter the authorized username', 'Enter the authorized password',
    'Submit and verify authenticated home', 'Navigate to protected reports', 'Verify protected reports',
  ];
  const operations = [
    [{ op: 'goto', url: literal(`${baseUrl}/login`) }],
    [{ op: 'fill', locator: label('Username'), value: { kind: 'variable', name: 'LOGIN_USER' } }],
    [{ op: 'fill', locator: label('Password'), value: { kind: 'secret', id: 'LOGIN_PASSWORD' } }],
    [{ op: 'click', locator: text('Sign in') }, { op: 'expectVisible', locator: text('Authenticated home') }],
    [{ op: 'click', locator: text('Protected reports') }],
    [{ op: 'expectVisible', locator: text('Protected reports') }],
  ];
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
    expectedIntent: { schemaVersion: 1, steps: operations.map((stepOperations, stepIndex) => ({ stepIndex, stepId: STEP_IDS[stepIndex], operations: stepOperations })) },
    references: { variables: ['LOGIN_USER'], secrets: ['LOGIN_PASSWORD'] },
    resolvedVars: { LOGIN_USER: 'alice' },
    resolvedSecrets: { LOGIN_PASSWORD: SECRET_CANARY },
  });
}

describe('canonical login and protected page through POST /v1/runs', () => {
  it('validates intent, preserves the authenticated session and retains no secret', async () => {
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
