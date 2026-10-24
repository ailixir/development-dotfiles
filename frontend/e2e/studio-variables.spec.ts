import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import type { TestDetailDto, TestPage, TestUpdateRequest } from '../src/types/studio/studioTypes';
import type { RecordedRequest } from './mswProxy';

/** Synthetic Node-MSW proof only. Never Run, learn, replay or provision a secret. */
test.describe.configure({ mode: 'serial', retries: 0 });
test.use({ trace: 'off', screenshot: 'off', video: 'off', serviceWorkers: 'block' });

// Listed default fixture also used by studio-guided.spec.ts, never the unlisted legacy111 draft.
const ID = 'd0000000-0000-4000-8000-000000000003';
const DRAFT = `/api/v1/studio/tests/${ID}`;
const APP = 'http://127.0.0.1:19477';
const PROXY = 'http://127.0.0.1:19478';
const COLLISION = 'A variable name conflicts with a secret reference. Rename it or select the matching secret.';
const DUPLICATE = 'Variable names must be unique. Rename or remove the duplicate.';
const MASK = 'video,iframe,canvas,input,textarea,select,option,output,meter,progress,button[value],[value],[data-value],[aria-valuenow],[aria-valuetext],[contenteditable],[role="textbox"],[role="searchbox"],[role="combobox"],[role="spinbutton"],[role="slider"],[role="listbox"],[role="option"]';
const LABELS = new Set(['desktop-blocked', 'desktop-corrected', 'mobile-blocked', 'mobile-corrected']);
const FONT_LINKS = new Set([
  'https://fonts.googleapis.com/icon?family=Material+Icons',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
]);
type Rect = { x: number; y: number; width: number; height: number };
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** Verify every in-viewport pixel of each requested mask before writing any PNG. */
function verifyMask(png: Buffer, rects: Rect[], viewport: { width: number; height: number }) {
  expect(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
  let width = 0, height = 0, channels = 0, ended = false;
  const idats: Buffer[] = [];
  for (let offset = 8; offset + 12 <= png.length;) {
    const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
    expect(offset + length + 12).toBeLessThanOrEqual(png.length);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0;
      expect([data[8], data[10], data[11], data[12]]).toEqual([8, 0, 0, 0]);
      expect(channels).toBeGreaterThan(0);
      expect(width * height).toBeLessThanOrEqual(12_000_000);
    } else if (type === 'IDAT') idats.push(data);
    else if (type === 'IEND') { ended = true; break; }
    offset += length + 12;
  }
  expect(ended).toBe(true);
  expect({ width, height }).toEqual(viewport);
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idats), { maxOutputLength: (stride + 1) * height });
  const pixels = Buffer.alloc(stride * height);
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c);
    return x <= y && x <= z ? a : y <= z ? b : c;
  };
  try {
    expect(raw.length).toBe((stride + 1) * height);
    for (let y = 0; y < height; y++) {
      const filter = raw[y * (stride + 1)];
      expect(filter).toBeLessThanOrEqual(4);
      for (let x = 0; x < stride; x++) {
        const a = x >= channels ? pixels[y * stride + x - channels] : 0;
        const b = y ? pixels[(y - 1) * stride + x] : 0;
        const c = y && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
        const adjust = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : paeth(a, b, c);
        pixels[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + adjust) & 255;
      }
    }
    let masksVerified = 0, pixelsVerified = 0;
    for (const rect of rects) {
      expect([rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)).toBe(true);
      const left = Math.max(0, Math.ceil(rect.x)), top = Math.max(0, Math.ceil(rect.y));
      const right = Math.min(width, Math.floor(rect.x + rect.width)), bottom = Math.min(height, Math.floor(rect.y + rect.height));
      if (left >= right || top >= bottom) continue;
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
        const i = y * stride + x * channels;
        if (pixels[i] !== 230 || pixels[i + 1] !== 0 || pixels[i + 2] !== 230 || (channels === 4 && pixels[i + 3] !== 255)) {
          throw new Error('SYNTHETIC_MASK_PIXEL_VERIFICATION_FAILED');
        }
        pixelsVerified++;
      }
      masksVerified++;
    }
    expect(masksVerified).toBeGreaterThan(0);
    expect(pixelsVerified).toBeGreaterThan(0);
    return { masksVerified, pixelsVerified };
  } finally { raw.fill(0); pixels.fill(0); }
}

async function capture(page: Page, label: string): Promise<void> {
  expect(LABELS.has(label)).toBe(true);
  const output = process.env.CHECKS_VARIABLES354_EVIDENCE_DIR;
  expect(output && path.isAbsolute(output)).toBe(true);
  const root = path.resolve(output!);
  expect(root.endsWith('/variables354-visual/images')).toBe(true);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const once = await open(path.join(root, `${label}.once`), 'wx', 0o600);
  await once.close();
  const url = new URL(page.url());
  expect(url.origin).toBe(APP);
  expect(url.pathname).toBe(`/checks/ui-tests/${ID}/studio`);
  const dialog = page.getByRole('dialog', { name: 'Variables', exact: true });
  await expect.poll(() => dialog.evaluate(node => {
    for (let current: Element | null = node; current; current = current.parentElement) {
      if (getComputedStyle(current).opacity !== '1') return false;
    }
    return node.isConnected;
  })).toBe(true);
  const rects = await page.locator(MASK).evaluateAll(nodes => nodes.map(node => {
    const r = node.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }).filter(r => r.width > 0 && r.height > 0));
  const viewport = page.viewportSize()!;
  const bytes = await page.screenshot({ fullPage: false, scale: 'css', animations: 'disabled', mask: [page.locator(MASK)], maskColor: '#e600e6' });
  try {
    const coverage = verifyMask(bytes, rects, viewport);
    const artifact = `${label}.safe-msw-ui.png`;
    await writeFile(path.join(root, artifact), bytes, { flag: 'wx', mode: 0o600 });
    const release = {
      schemaVersion: 1, source: 'CURRENT_SYNTHETIC_NODE_MSW_STUDIO', testId: ID,
      label, artifact, artifactSha256: hash(bytes), viewport, ...coverage,
      specSha256: hash(await readFile(path.resolve('e2e/studio-variables.spec.ts'))),
      sourcePagePath: url.pathname, sourceOrigin: url.origin,
      maskSelector: MASK, masksRequested: rects.length,
      safeToDisplayToModel: true, syntheticPublicFixturesOnly: true,
      valueControlsMaskedBeforeCapture: true, nativeVideoModelDisplay: false,
      nativeSourceFrame: null, privateInputsUsed: false, liveIntegrationClaim: false,
      knownGoogleFontLinksRemovedBeforeParse: true, renderingFonts: 'LOCAL_FONTS_OR_SYSTEM_FALLBACK',
    };
    await writeFile(path.join(root, `${label}.release.json`), `${JSON.stringify(release, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  } finally { bytes.fill(0); }
}

async function readDraft(request: APIRequestContext): Promise<TestDetailDto> {
  const response = await request.get(`${PROXY}${DRAFT}`);
  expect(response.status()).toBe(200);
  return response.json() as Promise<TestDetailDto>;
}

async function recorded(request: APIRequestContext): Promise<RecordedRequest[]> {
  const response = await request.get(`${PROXY}/__test/requests`, { params: { path: '/api/v1/studio/' } });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { requests: RecordedRequest[] }).requests;
}

for (const variant of [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, alias: 'LOGIN', firstName: 'LOGIN_PW', issue: COLLISION },
  { name: 'mobile', viewport: { width: 390, height: 844 }, alias: 'LOGIN_PW', firstName: ' LOGIN_PW ', issue: DUPLICATE },
] as const) {
  test.describe(`${variant.name} Variables manual-save preflight`, () => {
    test.use({ viewport: variant.viewport });
    test('blocked Save preserves the draft; correction writes it once and closes', async ({ page, context, request }, testInfo) => {
      expect(process.version).toBe('v24.20.0');
      expect(process.env.CHECKS_VARIABLES354_EXECUTION).toBe('authorized');
      expect(process.env.CHECKS_VARIABLES354_EXECUTION_NOTICE_SHA256).toMatch(/^[a-f0-9]{64}$/u);
      expect(process.env.CHECKS_E2E_APP_PORT).toBe('19477');
      expect(process.env.CHECKS_E2E_API_PORT).toBe('19478');
      expect(['1', 'true']).not.toContain(process.env.CHECKS_E2E_REAL_BACKEND);
      expect(testInfo.project.name).toBe('msw');
      expect(testInfo.retry).toBe(0);
      expect(testInfo.repeatEachIndex).toBe(0);
      const refused: string[] = [];
      let sanitizedNavigations = 0;
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        const prohibited = route.request().method() === 'POST' &&
          (/\/guided-sessions(?:\/|$)/u.test(url.pathname) || /\/(execute|secrets)$/u.test(url.pathname));
        if (url.origin !== APP || prohibited) {
          refused.push(`${route.request().method()} ${url.origin}${url.pathname}`);
          await route.abort('blockedbyclient');
        } else if (route.request().resourceType() === 'document' && url.pathname === `/checks/ui-tests/${ID}/studio`) {
          // Root-scoped test-only HTML projection: never fetch a Google font/preconnect origin.
          const response = await route.fetch({ maxRedirects: 0, timeout: 10_000 });
          expect(response.status()).toBe(200);
          expect(response.headers()['content-type']).toContain('text/html');
          let removed = 0;
          const html = (await response.text()).replace(/<link\b[^>]*>/giu, tag => {
            const href = /\bhref="([^"]+)"/u.exec(tag)?.[1];
            if (href && FONT_LINKS.has(href)) { removed++; return ''; }
            return tag;
          });
          expect(removed).toBe(FONT_LINKS.size);
          sanitizedNavigations++;
          await route.fulfill({ response, body: html });
        } else await route.continue();
      });
      expect((await request.post(`${PROXY}/__test/scenario`, { data: { name: 'default' } })).status()).toBe(200);
      const catalogResponse = await request.get(`${PROXY}/api/v1/studio/tests`);
      expect(catalogResponse.status()).toBe(200);
      const catalog = (await catalogResponse.json()) as TestPage;
      expect(catalog.data.some(row => row.id === ID && row.name === 'Password reset email')).toBe(true);
      const original = await readDraft(request);
      expect(original.id).toBe(ID);
      expect(original.readiness).toBe('UNLEARNED');
      // Existing public MSW authoring route, before the baseline: declarations only, no secret value/provisioning.
      const seedBody: TestUpdateRequest = {
        authoringSchemaVersion: 2, name: original.name, description: original.description,
        csiId: original.csiId, environment: original.environment, steps: original.steps,
        ...(original.globalContext ? { globalContext: original.globalContext } : {}),
        variables: [
          { name: 'USER_ID', kind: 'plain', value: 'pilot-user' },
          { name: 'LOGIN_PW', kind: 'secretRef', secretId: 'LOGIN_PW' },
        ],
        configuration: original.configuration,
        sourceRevision: original.sourceRevision, configurationRevision: original.configurationRevision,
      };
      expect((await request.put(`${PROXY}${DRAFT}`, { data: seedBody })).status()).toBe(200);
      const seedCalls = (await recorded(request)).filter(r => r.method === 'PUT' && r.path === DRAFT);
      expect(seedCalls).toHaveLength(1);
      const before = await readDraft(request);
      expect(before.id).toBe(ID);
      expect(before.steps).toEqual(original.steps);
      expect(before.configuration).toEqual(original.configuration);
      expect(before.environment).toBe(original.environment);
      expect(before.variables).toEqual([
        { name: 'USER_ID', kind: 'plain', value: 'pilot-user' },
        { name: 'LOGIN_PW', kind: 'secretRef', secretId: 'LOGIN_PW' },
      ]);
      const evidenceRoot = path.dirname(process.env.CHECKS_VARIABLES354_EVIDENCE_DIR!);
      expect(evidenceRoot.endsWith('/variables354-visual')).toBe(true);
      await writeFile(path.join(evidenceRoot, `${variant.name}.fixture-seed.json`), `${JSON.stringify({
        source: 'EXISTING_DEFAULT_NODE_MSW_PUBLIC_AUTHORING_ROUTE', testId: ID,
        listedCatalogIdentity: true, seedPuts: seedCalls.length,
        beforeBaseline: true, stepsAndConfigurationPreserved: true, secretProvisioning: false,
        baselineSourceRevision: before.sourceRevision, baselineConfigurationRevision: before.configurationRevision,
      }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      expect((await request.delete(`${PROXY}/__test/requests`)).status()).toBe(200);
      const browserCatalog = page.waitForResponse(r => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/v1/studio/tests');
      const browserDetail = page.waitForResponse(r => r.request().method() === 'GET' && new URL(r.url()).pathname === DRAFT);
      await page.goto(`${APP}/checks/ui-tests/${ID}/studio`);
      await expect(page).toHaveURL(`${APP}/checks/ui-tests/${ID}/studio`);
      const loadedCatalog = (await (await browserCatalog).json()) as TestPage;
      expect(loadedCatalog.data.some(row => row.id === ID && row.name === before.name)).toBe(true);
      expect(await (await browserDetail).json()).toEqual(before);
      await expect(page.getByRole('heading', { level: 1, name: before.name, exact: true })).toBeVisible();
      for (const [index, step] of before.steps.entries()) {
        const editor = page.getByRole('textbox', { name: `Step ${index + 1}`, exact: true });
        await expect(editor).toHaveValue(step.text);
        await expect(editor).toHaveAttribute('data-step-id', step.id);
      }
      const firstStep = page.getByRole('textbox', { name: 'Step 1', exact: true, includeHidden: true });
      await expect(firstStep).toHaveValue(before.steps[0].text);
      const edited = 'Open the synthetic Variables review page';
      const pending = 'Check the synthetic confirmation heading';
      await firstStep.fill(edited);
      const add = page.getByRole('textbox', { name: 'Add a test step', exact: true, includeHidden: true });
      await add.fill(pending);
      const environment = page.getByRole('combobox', { name: /^Environment(?:\s|$)/u, includeHidden: true });
      await environment.click();
      await page.getByRole('option', { name: 'Staging', exact: true }).click();
      await page.getByRole('button', { name: 'Variables', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Variables', exact: true });
      const firstName = dialog.getByRole('textbox', { name: 'Variable 1 name', exact: true });
      const secondName = dialog.getByRole('textbox', { name: 'Variable 2 name', exact: true });
      await firstName.fill(variant.firstName);
      await secondName.fill(variant.alias);
      const value = dialog.getByRole('textbox', { name: 'Variable 1 value', exact: true });
      await value.fill(' synthetic public value ');
      expect((await request.delete(`${PROXY}/__test/requests`)).status()).toBe(200);
      await dialog.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(dialog.getByText(variant.issue, { exact: true })).toBeVisible();
      expect((await recorded(request)).filter(r => r.method === 'PUT')).toHaveLength(0);
      expect(await readDraft(request)).toEqual(before);
      await expect(firstName).toHaveValue(variant.firstName);
      await expect(secondName).toHaveValue(variant.alias);
      await expect(value).toHaveValue(' synthetic public value ');
      await expect(dialog.getByRole('combobox', { name: /^Select secret(?:\s|$)/u })).toHaveText('LOGIN_PW');
      await expect(firstStep).toHaveValue(edited);
      await expect(add).toHaveValue(pending);
      await expect(page.getByRole('textbox', { name: `Step ${before.steps.length + 1}`, exact: true, includeHidden: true })).toHaveCount(0);
      await expect(environment).toHaveText('Staging');
      for (const name of ['Close', 'Save']) {
        const box = await dialog.getByRole('button', { name, exact: true }).boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(variant.viewport.width);
      }
      await capture(page, `${variant.name}-blocked`);

      await firstName.fill('USER_ID');
      await expect(dialog.getByText(variant.issue, { exact: true })).toHaveCount(0);
      const savedResponse = page.waitForResponse(r => r.request().method() === 'PUT' && new URL(r.url()).pathname === DRAFT);
      await dialog.getByRole('button', { name: 'Save', exact: true }).click();
      const response = await savedResponse;
      expect(response.status()).toBe(200);
      const body = response.request().postDataJSON() as TestUpdateRequest;
      expect(body).toMatchObject({
        authoringSchemaVersion: 2, name: before.name, description: before.description ?? null,
        csiId: before.csiId, environment: 'Staging', sourceRevision: before.sourceRevision,
        configurationRevision: before.configurationRevision,
        variables: [
          { name: 'USER_ID', kind: 'plain', value: ' synthetic public value ' },
          { name: variant.alias, kind: 'secretRef', secretId: 'LOGIN_PW' },
        ],
        configuration: { ...before.configuration, browser: 'chromium', timeoutSeconds: 30 },
      });
      expect(body.globalContext).toEqual(before.globalContext);
      expect(body.steps).toHaveLength(before.steps.length + 1);
      expect(body.steps.slice(0, before.steps.length)).toEqual(before.steps.map((step, i) => i === 0 ? { ...step, text: edited } : step));
      expect(body.steps.at(-1)?.text).toBe(pending);
      expect(body.steps.at(-1)?.id).toMatch(/^[a-f0-9-]{36}$/u);
      await expect(dialog).toHaveCount(0);
      await expect(page.getByTestId('studio-save-state')).toHaveText('Saved');
      await expect(add).toHaveValue('');
      const saved = await readDraft(request);
      expect(saved.steps).toEqual(body.steps.map(step => ({
        ...step,
        context: {
          entries: step.context?.entries ?? [],
          evidenceReferences: step.context?.evidenceReferences ?? [],
        },
      })));
      expect(saved.variables).toEqual(body.variables);
      expect(saved.environment).toBe('Staging');
      expect((await recorded(request)).filter(r => r.method === 'PUT' && r.path === DRAFT)).toHaveLength(1);
      await page.reload();
      await expect(firstStep).toHaveValue(edited);
      await expect(page.getByRole('textbox', { name: `Step ${before.steps.length + 1}`, exact: true })).toHaveValue(pending);
      await page.getByRole('button', { name: 'Variables', exact: true }).click();
      await expect(firstName).toHaveValue('USER_ID');
      await expect(secondName).toHaveValue(variant.alias);
      await expect(value).toHaveValue(' synthetic public value ');
      await expect(dialog.getByText(COLLISION, { exact: true })).toHaveCount(0);
      await expect(dialog.getByText(DUPLICATE, { exact: true })).toHaveCount(0);
      await capture(page, `${variant.name}-corrected`);
      const calls = await recorded(request);
      expect(calls.filter(r => r.method === 'PUT' && r.path === DRAFT)).toHaveLength(1);
      expect(calls.filter(r => !r.handled)).toEqual([]);
      expect(calls.filter(r => r.method === 'POST')).toEqual([]);
      expect(refused).toEqual([]);
      expect(sanitizedNavigations).toBe(2);
    });
  });
}
