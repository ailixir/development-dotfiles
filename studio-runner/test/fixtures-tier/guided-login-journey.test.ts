import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
/**
 * W48 (STUDIO-OBS-009/010 real-stack 431): a Username + Password login form, driven through the real GuidedRuntime and
 * real Chromium exactly as the controller's prepare -> dispatch path drives it.
 *
 * The defect these cases guard: a password input that is labelled (wrapping `<label>` or `<label for>`) used to count as a
 * competitor of unknown name for EVERY `textbox` role hint and EVERY `label` hint on the page, because its label was
 * "not an eligible source" (a password's label is never exported). `matches()` then refused the Username field's own
 * exported hints with TARGET_CHANGED, the controller retried the same proposal until the model budget was spent, and the
 * 6-step journey never got past step 2. The password's name is now computed LOCALLY (never exported) so it can be compared
 * with the hint; a password field whose own label collides with the hint is still refused.
 *
 * The pages below are the byte-identical HTML of the real-stack target (`target431-core/helpers.mjs` `loginPage`) and of
 * the earlier-proven password-only control (`visual118-target-core/helpers.mjs`), served with the target's CSP.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchGuidedBrowser } from '../../src/run/browser.js';
import { GuidedRuntime } from '../../src/guided/runtime.js';
import { hash, identity } from '../../src/guided/contracts.js';
import type { Action, BridgeBootstrap, BridgeObservation, BridgePreparation, ExecutionEvidence } from '../../src/guided/types.js';
import { dispatch, guidedContext, proposal } from '../helpers/guided.js';

const CSP = "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";
const page = (content: string): string => '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Synthetic visual106</title></head><body><main><p>Synthetic test data</p>' + content + '</main></body></html>';
/** target431-core/helpers.mjs loginPage (Username + Password, both wrapped by their label). */
const LOGIN_USER_PASS = page('<h1>Synthetic visual106 login</h1><form method="post" action="/login"><label>Username<input name="username" type="text" autocomplete="off" required></label><label>Password<input name="password" type="password" autocomplete="off" required></label><button type="submit">Sign in</button></form>');
/** visual118-target-core/helpers.mjs loginPage: the earlier-proven password-only control. */
const LOGIN_PASS_ONLY = page('<h1>Synthetic visual106 login</h1><form method="post" action="/login"><label>Password<input name="password" type="password" autocomplete="off" required></label><button type="submit">Sign in</button></form>');
const LOGIN_FOR_LABELS = page('<h1>Login</h1><form method="post" action="/login"><label for="u">Username</label><input id="u" name="username" type="text"><label for="p">Password</label><input id="p" name="password" type="password"><button type="submit">Sign in</button></form>');
const LOGIN_PASSWORD_FIRST = page('<h1>Login</h1><form method="post" action="/login"><label>Password<input name="password" type="password"></label><label>Username<input name="username" type="text"></label><button type="submit">Sign in</button></form>');
/** The password's own label equals the Username hint: still not provably unique, so still refused. */
const LOGIN_COLLIDING = page('<h1>Login</h1><form method="post" action="/login"><label>Username<input name="username" type="text"></label><label>Username<input name="password" type="password"></label><button type="submit">Sign in</button></form>');
/** A non-sensitive password label ("Zebra phrase" matches no sensitive pattern), so its text can be searched for on the wire. */
const PHRASE_WRAP = page('<h1>Login</h1><form method="post" action="/login"><label>Username<input name="username" type="text"></label><label>Zebra phrase<input name="password" type="password"></label><button type="submit">Sign in</button></form>');
const PHRASE_FOR = page('<h1>Login</h1><form method="post" action="/login"><label for="u">Username</label><input id="u" name="username" type="text"><label for="p">Zebra phrase</label><input id="p" name="password" type="password"><button type="submit">Sign in</button></form>');
/** A text input that tries to borrow the password's label through aria-labelledby. */
const ALIAS = page('<h1>Login</h1><form method="post" action="/login"><label>Username<input name="username" type="text"></label><label id="lp" for="p">Zebra phrase</label><input id="p" name="password" type="password"><input name="alias" type="text" aria-labelledby="lp"><button type="submit">Sign in</button></form>');

const USER_VALUE = 'studio-local-user';
const PASS_VALUE = 'Z9y8X7w6V5u4T3s2R1q0P9o8';

const resources: (() => Promise<void>)[] = [];
afterEach(async () => { for (const clean of resources.reverse()) await clean(); resources.length = 0; });

async function serve(login: string): Promise<{ origin: string; posts: string[] }> {
  const posts: string[] = [];
  const server = createServer((req, res) => {
    const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': CSP };
    if (req.method === 'POST') {
      let text = '';
      req.on('data', (chunk: Buffer) => { text += chunk.toString(); });
      req.on('end', () => { posts.push(text); res.writeHead(303, { ...headers, location: '/done' }); res.end(); });
      return;
    }
    res.writeHead(200, headers); res.end(req.url === '/done' ? page('<h1>Done</h1>') : login);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('PORT');
  resources.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => { resolve(); })); });
  return { origin: `http://localhost:${String(address.port)}`, posts };
}

async function harness(login: string, withUser: boolean) {
  const fixture = await serve(login);
  const directory = await mkdtemp(join(tmpdir(), 'guided-login-')); resources.push(() => rm(directory, { recursive: true, force: true }));
  const context = guidedContext(fixture.origin);
  context.sourceStepIds = withUser ? ['open', 'user', 'pass', 'signin'] : ['open', 'pass', 'signin'];
  context.allocations = [];
  context.authoredInputs.inputs = [
    { inputId: 'input-open', sourceStepId: 'open', kind: 'destination', value: `${fixture.origin}/login`, intendedSlot: 'navigate.destination', provenance: { referenceKind: 'sourceSpan', sourceRevision: context.sourceRevision, stepId: 'open', startUtf16: 0, endUtf16: 12, kind: 'destination', intendedSlot: 'navigate.destination' } },
    ...(withUser ? [{ inputId: 'input-user', sourceStepId: 'user', kind: 'nonsecretText' as const, value: USER_VALUE, intendedSlot: 'fill.value' as const, provenance: { referenceKind: 'configuration' as const, configurationRevision: context.configurationRevision, stepId: 'user', referenceId: 'var-user', kind: 'nonsecretText' as const, intendedSlot: 'fill.value' as const } }] : []),
    { inputId: 'input-pass', sourceStepId: 'pass', kind: 'secretRef', intendedSlot: 'fill.value', secretId: 'PASS', provenance: { referenceKind: 'configuration', configurationRevision: context.configurationRevision, stepId: 'pass', referenceId: 'reference-pass', referenceName: 'PASS', kind: 'secretRef', intendedSlot: 'fill.value' } },
  ];
  context.authoredInputsHash = hash(context.authoredInputs);
  const messages: { route: string; body: unknown }[] = [];
  const runtime = new GuidedRuntime(context, { workerId: context.workerId, allowedDomains: TEST_DOMAINS, journalDirectory: directory, launch: launchGuidedBrowser, callback: (route, body) => { messages.push({ route, body }); return Promise.resolve(); } });
  resources.push(() => runtime.stop('CANCELLED')); await runtime.start();
  let evidence = (messages[0]?.body as BridgeBootstrap).executionEvidence as ExecutionEvidence;
  const observation = (): BridgeObservation['observation'] | undefined => (messages.filter(m => m.route === 'observations').at(-1)?.body as BridgeObservation | undefined)?.observation;
  /** The controller's path: prepare, then dispatch. A refusal at either step is returned, never swallowed. */
  const act = async (step: string, operation: Action['operation'], target?: Action['target'], secret?: string): Promise<{ state: string; refusal: string | null }> => {
    const p = proposal(context, evidence, step, operation, target);
    let preparation: BridgePreparation;
    try { preparation = await runtime.prepare({ pressInheritance: null, ...identity(context), proposal: p, requestDigest: hash(p), expiresAt: new Date(Date.now() + 20_000).toISOString() }); }
    catch (error) { return { state: 'PREPARE_REFUSED', refusal: (error as Error).message }; }
    const request = dispatch(context, p, preparation);
    const frame = secret === undefined ? request : { ...request, secret: { secretId: 'PASS', value: secret, versionId: 'fixture-version', allowedOrigins: [fixture.origin] } };
    let state: string;
    try { state = (await runtime.dispatch(frame)).ledger.state; } catch (error) { return { state: 'DISPATCH_REFUSED', refusal: (error as Error).message }; }
    const seen = observation();
    if (seen) evidence = { kind: 'observedDocument', sessionId: context.sessionId, contextId: context.contextId, documentId: seen.documentId, generation: seen.generation, origin: seen.origin, observationHash: hash(seen) };
    return { state, refusal: null };
  };
  /** The target a correct model builds: the ref of the node the outline shows (the runner derives the locator at prepare). */
  const target = (name: string, _hintKind: 'role' | 'label' = 'role', role?: string): Action['target'] => {
    void _hintKind; // the hint kinds of the old protocol: a ref is the only target now
    const seen = observation();
    const found = seen && Object.entries(seen.facts).find(([, fact]) => fact.name === name && (role === undefined || fact.role === role));
    if (!seen || !found) throw new Error(`NODE_UNAVAILABLE:${name}`);
    return { kind: 'node', ref: found[0], documentId: seen.documentId, generation: seen.generation };
  };
  const open = (): Promise<{ state: string; refusal: string | null }> => act('open', { kind: 'navigate', destinationInputId: 'input-open' });
  const fillUser = (hintKind: 'role' | 'label'): Promise<{ state: string; refusal: string | null }> => act('user', { kind: 'fill', value: { kind: 'authoredLiteral', sourceInputId: 'input-user' } }, target('Username', hintKind, 'textbox'));
  const fillPassword = (): Promise<{ state: string; refusal: string | null }> => act('pass', { kind: 'fill', value: { kind: 'secretRef', sourceInputId: 'input-pass' } }, { kind: 'passwordControl', documentId: evidence.documentId, generation: evidence.generation }, PASS_VALUE);
  const signIn = (): Promise<{ state: string; refusal: string | null }> => act('signin', { kind: 'click' }, target('Sign in', 'role'));
  /** A secretRef fill aimed at a (non-password) textbox ref of the outline: the password step's own input, the target the model must not use. */
  const secretFillAt = (name: string): Promise<{ state: string; refusal: string | null }> => act('pass', { kind: 'fill', value: { kind: 'secretRef', sourceInputId: 'input-pass' } }, target(name, 'role', 'textbox'), PASS_VALUE);
  return { open, fillUser, fillPassword, signIn, secretFillAt, fixture, observation, messages };
}

const OK = { state: 'SUCCEEDED', refusal: null };

describe('guided login journey on a Username + Password form (real Chromium)', () => {
  for (const [label, html] of [['wrapping labels (target431 page)', LOGIN_USER_PASS], ['label for=', LOGIN_FOR_LABELS], ['password field first', LOGIN_PASSWORD_FIRST]] as const) {
    for (const hintKind of ['role', 'label'] as const) {
      it(`fills Username by its exported ${hintKind} hint, fills the secret Password and signs in: ${label}`, async () => {
        const h = await harness(html, true);
        expect(await h.open()).toEqual(OK);
        expect(await h.fillUser(hintKind)).toEqual(OK);
        expect(await h.fillPassword()).toEqual(OK);
        expect(await h.signIn()).toEqual(OK);
        await expect.poll(() => h.fixture.posts.length).toBe(1);
        const form = new URLSearchParams(h.fixture.posts[0]);
        expect(form.get('username')).toBe(USER_VALUE);
        expect(form.get('password')).toBe(PASS_VALUE);
      });
    }
  }

  it('control: the password-only login (visual118) still fills the secret and signs in', async () => {
    const h = await harness(LOGIN_PASS_ONLY, false);
    expect(await h.open()).toEqual(OK);
    expect(await h.fillPassword()).toEqual(OK);
    expect(await h.signIn()).toEqual(OK);
    await expect.poll(() => h.fixture.posts.length).toBe(1);
    expect(new URLSearchParams(h.fixture.posts[0]).get('password')).toBe(PASS_VALUE);
  });

  it('stays fail-closed: a password field whose own label equals the Username hint makes that hint ambiguous', async () => {
    // ADR-SC-007 (ruling Q16 b): hints are gone, so nothing is ambiguous any more. What the old case protected stays: the Username fill reaches the
    // Username textbox (the one ref), the password input has no ref and stays untouched, and naming the password field's label never writes into it.
    const h = await harness(LOGIN_COLLIDING, true);
    expect(await h.open()).toEqual(OK);
    expect(await h.fillUser('role')).toEqual(OK);
    // The password field's label is also "Username": a secret fill that names it as its target hits the Username textbox ref, is refused, and types nothing.
    const named = await h.secretFillAt('Username');
    expect(named.state).toMatch(/_REFUSED$/u);
    expect(h.observation()?.outline).not.toMatch(/passwordControl[^\n]*\[e\d+\]/u);
    expect(Object.values(h.observation()?.facts ?? {}).filter(fact => fact.name === 'Username').map(fact => fact.role)).toEqual(['textbox']);
    expect(h.fixture.posts).toEqual([]);
    expect(await h.signIn()).toEqual(OK);
    await expect.poll(() => h.fixture.posts.length).toBe(1);
    const form = new URLSearchParams(h.fixture.posts[0]);
    expect(form.get('username')).toBe(USER_VALUE);
    expect(form.get('password')).toBe('');
  });
});

describe('the password label is used locally and never exported', () => {
  // ADR-SC-007 D1 / ruling Q16 (a): the visible text of a label is exported, the secret never is. A password control gets no ref, the secret appears in no
  // message or observation, the label appears only as text (or as the name of a different, non-password control), and a secret fill aimed at a
  // non-password textbox is refused and types nothing.
  const refusedFill = async (h: Awaited<ReturnType<typeof harness>>, name: string): Promise<void> => {
    const refused = await h.secretFillAt(name);
    expect(refused.state).toMatch(/_REFUSED$/u);
    expect(refused.refusal).not.toBeNull();
  };
  for (const [label, html] of [['wrapping label', PHRASE_WRAP], ['label for=', PHRASE_FOR]] as const) {
    it(`no observation or outgoing message contains the password label text: ${label}`, async () => {
      const h = await harness(html, true);
      expect(await h.open()).toEqual(OK);
      expect(await h.fillUser('role')).toEqual(OK);
      await refusedFill(h, 'Username');
      expect(await h.fillPassword()).toEqual(OK);
      expect(JSON.stringify(h.messages)).not.toContain(PASS_VALUE);
      expect(JSON.stringify(h.observation())).not.toContain(PASS_VALUE);
      expect(h.observation()?.outline).not.toMatch(/passwordControl[^\n]*\[e\d+\]/u);
      expect(Object.values(h.observation()?.facts ?? {}).some(fact => fact.name === 'Zebra phrase')).toBe(false);
      expect(await h.signIn()).toEqual(OK);
      await expect.poll(() => h.fixture.posts.length).toBe(1);
      const form = new URLSearchParams(h.fixture.posts[0]);
      expect(form.get('username')).toBe(USER_VALUE);
      expect(form.get('password')).toBe(PASS_VALUE);
    });
  }

  it('a text input cannot borrow the password label through aria-labelledby: it stays withheld and the text is not exported', async () => {
    const h = await harness(ALIAS, true);
    expect(await h.open()).toEqual(OK);
    expect(JSON.stringify(h.observation())).not.toContain(PASS_VALUE);
    expect(JSON.stringify(h.messages)).not.toContain(PASS_VALUE);
    // The label is text, and the aliasing input is a different, non-password control that carries its accessible name.
    const named = Object.values(h.observation()?.facts ?? {}).filter(fact => fact.name === 'Zebra phrase');
    expect(named.map(fact => fact.role)).toEqual(['textbox']);
    expect(h.observation()?.outline).not.toMatch(/passwordControl[^\n]*\[e\d+\]/u);
    await refusedFill(h, 'Zebra phrase');
    expect(await h.fillUser('role')).toEqual(OK);
    expect(await h.signIn()).toEqual(OK);
    await expect.poll(() => h.fixture.posts.length).toBe(1);
    const form = new URLSearchParams(h.fixture.posts[0]);
    expect(form.get('alias')).toBe('');
    expect(form.get('password')).toBe('');
  });
});
