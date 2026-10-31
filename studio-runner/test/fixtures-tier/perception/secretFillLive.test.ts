/**
 * SC008-E8 AC7 (runner-level learn-and-replay fixture, AC-S3 subset): E1's runStep with the E8 secret hook, the production password
 * transport (createPasswordControl) and the production page-state program (installPageState, installed per restamp as observe() does)
 * on a real Chromium page and a loopback login server. The canary secret may reach the server only as the one allowed form post.
 *
 * The password port is built over the page-state program directly rather than over the observation session: the session's observe() is
 * being rewritten by SC008-E6 and is not available in the worktree at the time of E8. The in-page program, the origin and form-action
 * checks and the transport are the production ones. Nothing here reaches a network host other than the loopback server.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vitest';

// eslint-disable-next-line no-restricted-imports -- Real Chromium for the perception tier; the production import stays in src/run/browser.ts only.
import type { Browser, BrowserContext, JSHandle, Page } from 'playwright';
import { expect as pwExpect } from 'playwright/test';

import { TEST_DOMAINS } from '../../helpers/allowedDomains.js';
import type { InvocationControl } from '../../../src/executor/observedReplay.js';
import { hashObserved, ObservedRefusal, type ObservedErrorCode } from '../../../src/validator/observedReferencePolicy.js';
import { createPasswordControl, type PasswordWorldResult, type PasswordWorldState } from '../../../src/run/passwordControl.js';
import { installPageState } from '../../../src/run/pageStateInPage.js';
import { createSecretHook, createSecrets } from '../../../src/run/secretStep.js';
import { SecretUseEvidence } from '../../../src/run/secretUse.js';
import { runStep, type StepResult } from '../../../src/run/stepCode.js';

import { guardDist, launchChromium } from './harness.js';

guardDist();

const CANARY = 'live-canary-7Hq2Zr';
const html = (body: string): string => `<!doctype html><html><head><title>Login</title></head><body>${body}</body></html>`;
const FORM = (action: string): string => html(`<form method="post" action="${action}">
  <label>User <input id="u" name="u" type="text"></label>
  <label>Password <input id="pw" name="p" type="password"></label>
  <button type="button" onclick="document.getElementById('pw').type='text'">Show</button>
  <button type="submit">Sign in</button></form>`);
const FRAME = html('<label>Password <input id="pw" type="password"></label><iframe srcdoc="&lt;input id=ip type=password&gt;"></iframe>');
const TWO = html('<label>One <input id="a" type="password"></label><label>Two <input id="b" type="password"></label>');

interface Served { readonly origin: string; close(): Promise<void> }
async function serve(routes: Record<string, string | ((request: IncomingMessage, response: ServerResponse) => void)>): Promise<Served> {
  const server: Server = createServer((request, response) => {
    const route = routes[new URL(request.url ?? '/', 'http://localhost').pathname];
    if (route === undefined) { response.writeHead(404); response.end(); return; }
    if (typeof route === 'string') { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(route); return; }
    route(request, response);
  });
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve); });
  return {
    origin: `http://localhost:${String((server.address() as AddressInfo).port)}`,
    close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => { resolve(); }); }),
  };
}

class Control implements InvocationControl {
  phase: InvocationControl['phase'] = 'PREPARING';
  readonly deadlineMs = Date.now() + 120_000;
  readonly signal = new AbortController().signal;
  failure: ObservedErrorCode | null = null;
  remainingMs(): number { return Math.max(0, this.deadlineMs - Date.now()); }
  check(): void { if (this.failure !== null) throw new ObservedRefusal(this.failure); }
  beginInvocation(): void { this.check(); this.phase = 'INVOKING'; }
  poison(): void { this.phase = 'POISONED'; }
}

let browser: Browser;
let server: Served;
let other: Served;
const bodies: string[] = [];
const bodyOf = (request: IncomingMessage): Promise<string> => new Promise(resolve => {
  const chunks: Buffer[] = [];
  request.on('data', (chunk: Buffer) => chunks.push(chunk));
  request.on('end', () => { resolve(Buffer.concat(chunks).toString()); });
});

beforeAll(async () => {
  browser = await launchChromium();
  other = await serve({ '/post': html('<p>other</p>') });
  server = await serve({
    '/login': FORM('/post'),
    '/offform': FORM(`${other.origin.replace('localhost', '127.0.0.1')}/post`),
    '/two': TWO,
    '/frame': FRAME,
    '/post': (request, response) => {
      void bodyOf(request).then(body => {
        bodies.push(body);
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(html('<p id="welcome">welcome</p>'));
      });
    },
  });
});
afterAll(async () => { await browser.close(); await server.close(); await other.close(); });

interface Run {
  page: Page;
  evidence: SecretUseEvidence;
  requests: string[];
  epoch: { value: number };
  step(code: string, over?: { untilFence?: boolean }): Promise<StepResult>;
}
const contexts: BrowserContext[] = [];
afterEach(async () => { bodies.length = 0; for (const each of contexts.splice(0)) await each.close(); });

async function start(path: string): Promise<Run> {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  await page.goto(`${server.origin}${path}`);
  const requests: string[] = [];
  page.on('request', request => { requests.push(`${request.url()} ${request.postData() ?? ''}`); });
  const epoch = { value: 0 };
  page.on('domcontentloaded', () => { epoch.value += 1; });

  // The restamp: a fresh page-state program on the current document, as observe() installs one per call.
  let program: JSHandle | null = null;
  const state: PasswordWorldState = { closed: false, busy: false, generation: 0, observedNavigation: 0, navigation: 0, documentId: 'doc', available: true };
  const restamp = async (): Promise<void> => {
    await program?.evaluate((p: { dispose(): void }) => { p.dispose(); }).catch(() => undefined);
    // The program is sent as source and called in the page with its options, the way the runner sends it over CDP.
    const factory = await page.evaluateHandle(`(${installPageState.toString()})`);
    program = await factory.evaluateHandle((install, options) => (install as (o: { allowedDomains: string[] }) => unknown)(options), { allowedDomains: [...TEST_DOMAINS] });
    await factory.dispose();
    state.generation += 1;
    state.navigation = epoch.value;
    state.observedNavigation = epoch.value;
    await program.evaluate((p: { stamp(d: string, g: number, r: number): void; revision(): number }, g) => { p.stamp('doc', g, p.revision()); }, state.generation);
  };
  const password = createPasswordControl({
    current: () => ({ ...state, navigation: epoch.value }),
    async call(method, values): Promise<PasswordWorldResult> {
      if (program === null) throw new Error('no page-state program installed');
      try {
        const value = await program.evaluate((p, a) => (p as unknown as Record<string, (...args: unknown[]) => unknown>)[`${a.method}Result`]?.(...a.values), { method, values: [...values] });
        return { result: { value } };
      } catch (error) {
        return { result: {}, exceptionDetails: { exception: { description: String(error) } } };
      }
    },
  }, () => undefined, () => Promise.resolve());

  const evidence = new SecretUseEvidence(['pw']);
  const control = new Control();
  const hook = createSecretHook({
    resolve: id => (id === 'pw' ? { value: CANARY, allowedOrigins: [server.origin] } : undefined),
    password,
    passwordTarget: async () => { await restamp(); return { target: { kind: 'passwordControl', documentId: 'doc', generation: state.generation }, origin: server.origin }; },
    documentEpoch: () => epoch.value,
    control: () => control,
    evidence,
  });
  const secrets = createSecrets(['pw']);
  return {
    page, evidence, requests, epoch,
    step: (code, over = {}) => {
      control.phase = 'PREPARING';
      return runStep({ stepId: 's', code, sourceHash: hashObserved(code) }, {
        page, context, expect: pwExpect, inputs: {}, secrets, vars: {}, control, allowedDomains: TEST_DOMAINS, beforeCall: hook.beforeCall, ...over,
      });
    },
  };
}

const pwValue = (run: Run): Promise<string> => run.page.locator('#pw').inputValue();
const leaked = (run: Run): number => [...run.requests, ...bodies].filter(text => text.includes(CANARY) || text.includes(encodeURIComponent(CANARY))).length;

describe('the secret fill through runStep on a real page', () => {
  const FILL_BOTH = "await page.locator('#u').fill('alice'); await page.locator('#pw').fill(secrets['pw']);";

  it('fills after an earlier fill in the same step, and the canary reaches the server only in the one form post', async () => {
    const run = await start('/login');
    const result = await run.step(FILL_BOTH);
    expect(result.ok).toBe(true);
    expect(result.fenceCrossed).toBe(true);
    expect(result.effects).toEqual([{ method: 'fill', completed: true }, { method: 'fill', completed: true }]);
    expect(await pwValue(run)).toBe(CANARY); // the write happened in the page ...
    expect(leaked(run)).toBe(0); // ... and nothing was sent yet
    expect(JSON.stringify(result)).not.toContain(CANARY);
    expect(run.evidence.snapshot()).toEqual({ pw: 'USED' });

    const submit = await run.step("await page.getByRole('button', { name: 'Sign in' }).click();");
    expect(submit.ok).toBe(true);
    await run.page.waitForSelector('#welcome');
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toContain(`p=${CANARY}`);
    expect(run.requests.filter(text => text.includes(CANARY))).toHaveLength(1);
  });

  it('a secret-only step in until-fence mode stops at the secret fill: nothing sent, nothing written, no window left armed', async () => {
    const run = await start('/login');
    const result = await run.step("await page.locator('#pw').fill(secrets['pw']);", { untilFence: true });
    expect(result).toMatchObject({ ok: true, fenceReached: true, effects: [] });
    expect(await pwValue(run)).toBe('');
    expect(leaked(run)).toBe(0);
    expect(run.evidence.snapshot()).toEqual({ pw: 'NOT_USED' });
    expect((await run.step("vars.v = await page.evaluate(() => 1);")).ok).toBe(true);
  });

  it('refuses read-back of the value after the secret fill, and the evaluate family, with the canary in no result', async () => {
    const run = await start('/login');
    expect((await run.step(FILL_BOTH)).ok).toBe(true);
    const probes: [string, string][] = [
      ['ariaSnapshot', "vars.v = await page.locator('#pw').ariaSnapshot();"],
      ['getProperty', "vars.v = await (await (await page.locator('#pw').elementHandle()).getProperty('value')).jsonValue();"],
      ['inputValue', "vars.v = await page.locator('#pw').inputValue();"],
      ['inputValue after the show toggle', "await page.getByRole('button', { name: 'Show' }).click(); vars.v = await page.locator('#pw').inputValue();"],
      ['getAttribute', "vars.v = await page.locator('#pw').getAttribute('value');"],
      ['toHaveValue', "await expect(page.locator('#pw')).toHaveValue('x', { timeout: 300 });"],
    ];
    for (const [name, code] of probes) {
      const result = await run.step(code);
      expect(result.closedCode, name).toBe('PASSWORD_CONTROL_READ_REFUSED');
      expect(JSON.stringify(result), name).not.toContain(CANARY);
    }
    const evaluated = await run.step("vars.v = await page.evaluate(() => document.querySelector('#pw').value);");
    expect(evaluated.closedCode).toBe('POLICY_REFUSED');
    expect(JSON.stringify(evaluated)).not.toContain(CANARY);
  });

  it('refuses a read issued while the fill is in flight', async () => {
    const run = await start('/login');
    const result = await run.step("const filling = page.locator('#pw').fill(secrets['pw']); const read = page.locator('#pw').inputValue(); await Promise.all([filling, read]);");
    expect(result.closedCode).toBe('PASSWORD_CONTROL_READ_REFUSED');
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });

  it('allows evaluate again after the main document changes', async () => {
    const run = await start('/login');
    expect((await run.step(FILL_BOTH)).ok).toBe(true);
    expect((await run.step("await page.getByRole('button', { name: 'Sign in' }).click(); await page.waitForSelector('#welcome');")).ok).toBe(true);
    expect(run.epoch.value).toBeGreaterThan(0);
    const after = await run.step("vars.v = await page.evaluate(() => 1);");
    expect(after.ok).toBe(true);
    expect(after.vars.v).toBe(1);
  });

  it('refuses a form that posts off the allowed origins, two password controls and a text field; the canary reaches no request', async () => {
    const off = await start('/offform');
    const offResult = await off.step(FILL_BOTH);
    expect(offResult.closedCode).toBe('POLICY_REFUSED');
    expect(offResult.fenceCrossed).toBe(true); // refused inside the trusted fill: post-fence in the tally, effect not completed
    expect(offResult.effects.at(-1)?.completed).toBe(false);
    expect(await pwValue(off)).toBe('');
    expect(off.evidence.snapshot()).toEqual({ pw: 'REFUSED' });
    expect(leaked(off)).toBe(0);

    const two = await start('/two');
    const twoResult = await two.step("await page.locator('#a').fill(secrets['pw']);");
    expect(twoResult).toMatchObject({ closedCode: 'POLICY_REFUSED', fenceCrossed: false, effects: [] });
    expect(leaked(two)).toBe(0);

    const text = await start('/login');
    const textResult = await text.step("await page.locator('#u').fill(secrets['pw']);");
    expect(textResult).toMatchObject({ closedCode: 'POLICY_REFUSED', fenceCrossed: false, effects: [] });
    expect(await text.page.locator('#u').inputValue()).toBe('');
    expect(leaked(text)).toBe(0);
  });

  it('refuses a secret fill whose locator resolves inside a frame, though the page also has a top-level password control', async () => {
    const run = await start('/frame');
    const result = await run.step("await page.frameLocator('iframe').locator('#ip').fill(secrets['pw']);");
    expect(result).toMatchObject({ closedCode: 'POLICY_REFUSED', fenceCrossed: false, effects: [] });
    expect(await pwValue(run)).toBe('');
    expect(await run.page.frameLocator('iframe').locator('#ip').inputValue()).toBe('');
    expect(leaked(run)).toBe(0);
    expect(run.evidence.snapshot()).toEqual({ pw: 'REFUSED' });
    // the same page, the top-level control: accepted
    expect((await run.step("await page.locator('#pw').fill(secrets['pw']);")).ok).toBe(true);
  });

  it('refuses type and evaluate with a handle before any effect', async () => {
    const run = await start('/login');
    for (const code of ["await page.locator('#u').type(secrets['pw']);", "await page.evaluate(v => v, secrets['pw']);", "await page.locator('#pw').pressSequentially(secrets['pw']);"]) {
      const result = await run.step(code);
      expect(result).toMatchObject({ closedCode: 'POLICY_REFUSED', fenceCrossed: false, effects: [] });
    }
    expect(await pwValue(run)).toBe('');
    expect(leaked(run)).toBe(0);
  });

  it('catches an authored literal written into a password input (the post-fill check on a nonsecret fill)', async () => {
    const run = await start('/login');
    const result = await run.step("await page.locator('#pw').fill('LITERAL-5531');");
    expect(result.closedCode).toBe('OUTCOME_UNKNOWN');
    expect(JSON.stringify(result)).not.toContain('LITERAL-5531');
  });

  it('runs the same frozen code string twice (learn then replay shape) with the same result', async () => {
    const results: StepResult[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const run = await start('/login');
      results.push(await run.step(FILL_BOTH));
      expect(await pwValue(run)).toBe(CANARY);
    }
    const shape = (result: StepResult | undefined): unknown => result && { ok: result.ok, fenceCrossed: result.fenceCrossed, effects: result.effects };
    expect(shape(results[1])).toEqual(shape(results[0]));
    expect(results[0]?.ok).toBe(true);
  });
});
