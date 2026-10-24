import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext } from '@playwright/test';
import type { RecordedRequest } from './mswProxy';

/**
 * Self-test of the Playwright harness (STUDIO-OBS-008, P5). It asserts the harness, not the product:
 * no service worker anywhere, a request the mocks do not cover answers 502, the app reaches its data
 * through `apiClient` and the proxy sees it, and the WebM route honours byte ranges. It runs in the
 * `msw` project only (the file name has no `-real-backend` suffix).
 */

const here = dirname(fileURLToPath(import.meta.url));
const WEBM = readFileSync(resolve(here, 'fixtures/studio-run.webm'));
const appPort = Number(process.env.CHECKS_E2E_APP_PORT ?? 4177);
const apiPort = Number(process.env.CHECKS_E2E_API_PORT ?? 4178);
const APP = `http://127.0.0.1:${appPort}`;
const PROXY = `http://127.0.0.1:${apiPort}`;

async function recorded(request: APIRequestContext, path: string): Promise<RecordedRequest[]> {
  const response = await request.get(`${PROXY}/__test/requests`, { params: { path } });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { requests: RecordedRequest[] }).requests;
}

/** An execution whose recording the mock serves, found through the API rather than hard-coded. */
async function availableExecutionId(request: APIRequestContext): Promise<string> {
  const response = await request.get(`${PROXY}/api/v1/studio/executions`, { params: { size: '100' } });
  expect(response.status()).toBe(200);
  const page = (await response.json()) as {
    data: Array<{ executionId: string; video: { status: string } }>;
  };
  const found = page.data.find((execution) => execution.video.status === 'AVAILABLE');
  expect(found, 'the default scenario holds an execution with an AVAILABLE recording').toBeDefined();
  return found!.executionId;
}

test.beforeEach(async ({ request }) => {
  const reset = await request.post(`${PROXY}/__test/scenario`, { data: { name: 'default' } });
  expect(reset.status()).toBe(200);
});

test('the fixture is a WebM and the scenario control refuses unknown names', async ({ request }) => {
  expect(Array.from(WEBM.subarray(0, 4))).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
  expect(WEBM.length).toBeGreaterThan(1_000);

  const unknown = await request.post(`${PROXY}/__test/scenario`, { data: { name: 'no-such-scenario' } });
  expect(unknown.status()).toBe(400);
  expect(((await unknown.json()) as { error: string }).error).toBe('UNKNOWN_SCENARIO');
});

test('zero service workers: none registered, none controlling, no worker script served', async ({
  page,
  context,
}) => {
  await page.goto('/checks/all');
  await expect.poll(async () => (await recorded(page.request, '/api/v1/studio/tests')).length).toBeGreaterThan(0);

  const registrations = await page.evaluate(async () => {
    const all = await navigator.serviceWorker.getRegistrations();
    return {
      count: all.length,
      controlled: navigator.serviceWorker.controller !== null,
    };
  });
  expect(registrations).toEqual({ count: 0, controlled: false });
  expect(context.serviceWorkers()).toHaveLength(0);

  const worker = await page.request.get(`${APP}/mockServiceWorker.js`);
  expect(worker.headers()['content-type'] ?? '').not.toMatch(/javascript/);
});

test('an unhandled API request answers 502 and is recorded as unhandled', async ({ request }) => {
  const direct = await request.get(`${PROXY}/api/v1/__e2e__/not-mocked`);
  expect(direct.status()).toBe(502);
  expect(((await direct.json()) as { error: string }).error).toBe('E2E_UNHANDLED_REQUEST');

  // The same through the app's own origin, as the browser would ask: Vite's proxy passes the 502 on.
  const viaApp = await request.get(`${APP}/api/v1/__e2e__/not-mocked-either`);
  expect(viaApp.status()).toBe(502);

  const seen = await recorded(request, '/api/v1/__e2e__/');
  expect(seen.map((item) => [item.path, item.handled, item.status])).toEqual([
    ['/api/v1/__e2e__/not-mocked', false, 502],
    ['/api/v1/__e2e__/not-mocked-either', false, 502],
  ]);
});

test('the page reaches its data through apiClient and the proxy answers it from the handlers', async ({
  page,
  request,
}) => {
  await page.goto('/checks/all');
  await expect
    .poll(async () => (await recorded(request, '/api/v1/studio/tests')).filter((item) => item.handled).length)
    .toBeGreaterThan(0);

  const listed = (await recorded(request, '/api/v1/studio/tests')).find((item) => item.method === 'GET');
  expect(listed).toMatchObject({ handled: true, status: 200 });

  // The first test the mock lists is rendered by the page: the data came through, not just the request.
  const response = await request.get(`${PROXY}/api/v1/studio/tests`, { params: { size: '1' } });
  const first = ((await response.json()) as { data: Array<{ name: string }> }).data[0];
  await expect(page.getByText(first.name).first()).toBeVisible();
});

test('a WebM range request answers 206 with the fixture bytes, directly and through the app origin', async ({
  page,
  request,
}) => {
  const id = await availableExecutionId(request);
  const route = `/api/v1/studio/executions/${id}/video`;

  for (const origin of [PROXY, APP]) {
    const whole = await request.get(`${origin}${route}`);
    expect(whole.status()).toBe(200);
    expect(whole.headers()['content-type']).toBe('video/webm');
    expect(whole.headers()['accept-ranges']).toBe('bytes');
    expect(Buffer.from(await whole.body()).equals(WEBM)).toBe(true);

    const window = await request.get(`${origin}${route}`, { headers: { Range: 'bytes=0-9' } });
    expect(window.status()).toBe(206);
    expect(window.headers()['content-range']).toBe(`bytes 0-9/${WEBM.length}`);
    expect(Buffer.from(await window.body()).equals(WEBM.subarray(0, 10))).toBe(true);

    const beyond = await request.get(`${origin}${route}`, {
      headers: { Range: `bytes=${WEBM.length}-` },
    });
    expect(beyond.status()).toBe(416);
  }

  const ranged = (await recorded(request, route)).filter((item) => item.range !== null);
  expect(ranged.map((item) => [item.range, item.status])).toEqual([
    ['bytes=0-9', 206],
    [`bytes=${WEBM.length}-`, 416],
    ['bytes=0-9', 206],
    [`bytes=${WEBM.length}-`, 416],
  ]);

  // A real <video> in Chromium loads it, which issues the browser's own range requests.
  await page.goto('/checks/all');
  const duration = await page.evaluate(
    (src) =>
      new Promise<number>((resolveDuration, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => resolveDuration(video.duration);
        video.onerror = () => reject(new Error('the recording did not load'));
        video.src = src;
      }),
    route,
  );
  expect(duration).toBeGreaterThan(1);
});
