/**
 * The live (SPK07_LIVE=1) blocks of SPK-07 workstream B, moved unchanged from test/evaluation/grounding-b-{arms,sanitizer,echo,visual,synth}.test.ts
 * so that no file outside the fixtures tier launches Chromium (confinement AC-25). The gate is unchanged: they run only with SPK07_LIVE=1.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { domHash as supportDomHash, importLib, leaks, live, sha256, type Arm, type Browser, type Cdp, type CdpModule, type Observed, type Page, type PerceiveModule, type Perceived, type RequestsModule, type S3Module, type SynthModule, type SynthResult, type VisualModule } from '../evaluation/grounding-b-support.js';
import { launch, openPage } from './spike-live/support.js';

// ---- moved from test/evaluation/grounding-b-arms.test.ts ----
(function armsSuite() {
/**
 * SPK-07 workstream B: arms S3 and S4 end to end WITHOUT a model call (SPK07_LIVE=1, Chromium, HN login for the real-page case).
 * Replies are scripted; the point is observe -> buildRequest -> interpret: ref identity, locator synthesis, the pre-registered
 * intent gate in gateCodes, the request shape (contract, schema, image part) and the admission figures.
 */

describe.skipIf(!live)('arms S3 and S4 (SPK07_LIVE=1)', () => {
  let browser: Browser; let s3: Arm; let s4: Arm; let s3Lib: S3Module; let requests: RequestsModule; let cdpLib: CdpModule;
  beforeAll(async () => {
    browser = await launch();
    s3Lib = await importLib<S3Module>('arms/S3.mjs'); s3 = s3Lib; s4 = await importLib<Arm>('arms/S4.mjs');
    requests = await importLib<RequestsModule>('requests.mjs'); cdpLib = await importLib<CdpModule>('cdp.mjs');
  }, 60000);
  afterAll(async () => { await browser.close(); });

  const task = { id: 'hn-login', steps: [{ text: 'Type "spk07user" in the username field of the Login form', operation: { kind: 'fill' } }] };
  const step = task.steps[0] as object;
  const cursorFor = (targetIntent: string) => {
    const session = requests.makeSession(task);
    const reference = requests.sourceReferenceCandidates(session.manifest.sourceSteps)[0];
    const obligation = { obligationId: randomUUID(), stepId: session.sourceSteps[0]?.stepId, occurrence: 0, operationKind: 'fill', targetIntent, scopeIntent: null, referenceIndex: 0, needId: null, predicate: null };
    return { cursor: { session, plan: { sourceReferences: [reference], needs: [], obligations: [obligation] }, stepIndex: 0, done: 0 }, obligationId: obligation.obligationId };
  };
  const fill = (observed: Observed, sourceInputId?: string) => ({ kind: 'fill', value: { kind: 'authoredLiteral', sourceInputId: sourceInputId ?? observed.internal.inputs?.[0]?.inputId } });
  const action = (obligationId: string, target: object, operation: object) => ({ schemaVersion: 3, kind: 'NEXT_ACTION', requestId: 'r', status: 'ACTION', obligationId, action: { target, operation }, question: null });

  const open = async (arm: Arm): Promise<{ page: Page; observed: Observed; cdp: Awaited<ReturnType<CdpModule['session']>> }> => {
    const page = await openPage(browser, { url: 'https://news.ycombinator.com/login' });
    const cdp = await cdpLib.session(page);
    return { page, cdp, observed: await arm.observe({ page, cdp, task, step }) };
  };

  for (const arm of ['S3', 'S4'] as const) {
    it(`${arm}: observe, request shape and admission figures`, async () => {
      const impl = arm === 'S3' ? s3 : s4;
      const { page, observed } = await open(impl);
      const { cursor } = cursorFor('username');
      const body = impl.buildRequest({ task, step, obligations: cursor, observed });
      const envelope = JSON.parse(body.contents[0]?.parts[0]?.text ?? '{}') as { kind: string; context: Record<string, unknown> };
      expect(envelope.kind).toBe('NEXT_ACTION');
      expect(envelope.context.observation).toBe(observed.payload);
      expect(JSON.stringify(envelope.context)).not.toMatch(/"locator"/u);
      const contracts = s3Lib.contracts();
      expect(body.systemInstruction.parts[0]?.text).toBe(arm === 'S3' ? contracts.s3 : contracts.s4);
      expect(body.generationConfig.responseJsonSchema).toEqual(contracts.schema);
      const parts = body.contents[0]?.parts ?? [];
      if (arm === 'S3') { expect(parts.length).toBe(1); expect(observed.images).toBeUndefined(); }
      else {
        expect(parts.length).toBe(2);
        expect(parts[1]?.inlineData?.mimeType).toBe('image/png');
        expect(Buffer.from(parts[1]?.inlineData?.data ?? '', 'base64').subarray(0, 4).toString('hex')).toBe('89504e47');
        expect(observed.meta.imageMasks).toBeGreaterThanOrEqual(4);
      }
      const meta = observed.meta;
      expect(meta).toMatchObject({ emptied: false, gatewayInputAdmitted: true, translationInputAdmitted: true, admittedUnderProductionLimits: true });
      expect(Number(meta.wireBytes) + 2048).toBe(meta.translationInputBytes);
      expect(Number(meta.wireBytes)).toBeGreaterThan(Number(meta.bytes));
      expect(Object.keys(observed.idMap).length).toBeGreaterThanOrEqual(5);
      expect(typeof (observed as unknown as { dispose(): Promise<void> }).dispose).toBe('function');
      await page.context().close();
    }, 90000);
  }

  it('S3 interprets an ACTION: ref -> backendNodeId -> verified typed locator, intent gate clean', async () => {
    const { page, cdp, observed } = await open(s3);
    const { cursor, obligationId } = cursorFor('username');
    s3.buildRequest({ task, step, obligations: cursor, observed });
    const refs = [...observed.internal.perceived.byRef.values()].filter(node => node.role === 'textbox');
    const first = refs[0]; const second = refs[1];
    const out = await s3.interpret({ page, cdp, reply: action(obligationId, { kind: 'node', ref: first?.ref }, fill(observed)), observed, task, step });
    expect(out).toMatchObject({ status: 'ACTION', pickedId: first?.ref, pickedBackendNodeId: observed.idMap[first?.ref ?? ''], executable: true, gateCodes: [] });
    expect(out.locator).not.toBeNull();
    const publicIds = await cdpLib.locatorIds(page, cdp, page.locator(out.selector ?? ''));
    expect(publicIds).toEqual([out.pickedBackendNodeId]);
    const other = await s3.interpret({ page, cdp, reply: action(obligationId, { kind: 'node', ref: second?.ref }, fill(observed)), observed, task, step });
    expect(other.selector).not.toBe(out.selector);
    expect(other.pickedBackendNodeId).not.toBe(out.pickedBackendNodeId);
    await page.context().close();
  }, 90000);

  it('applies the intent gate and the ref checks', async () => {
    const { page, cdp, observed } = await open(s3);
    const { cursor, obligationId } = cursorFor('password');
    s3.buildRequest({ task, step, obligations: cursor, observed });
    const textbox = [...observed.internal.perceived.byRef.values()].find(node => node.role === 'textbox');
    const mismatch = await s3.interpret({ page, cdp, reply: action(obligationId, { kind: 'node', ref: textbox?.ref }, fill(observed)), observed, task, step });
    expect(mismatch.status).toBe('ACTION');
    expect(mismatch.gateCodes).toContain('INTENT_MISMATCH');
    const unknown = await s3.interpret({ page, cdp, reply: action(obligationId, { kind: 'node', ref: 'e9999' }, fill(observed)), observed, task, step });
    expect(unknown).toMatchObject({ status: 'INVALID', gateCodes: ['REF_UNKNOWN'], pickedBackendNodeId: null });
    const legacy = await s3.interpret({ page, cdp, reply: action(obligationId, { locator: { kind: 'role', role: 'button', name: 'login', exact: true } }, fill(observed)), observed, task, step });
    expect(legacy.gateCodes).toContain('NON_NODE_TARGET');
    const wrongObligation = await s3.interpret({ page, cdp, reply: action(randomUUID(), { kind: 'node', ref: textbox?.ref }, fill(observed)), observed, task, step });
    expect(wrongObligation.gateCodes).toEqual(expect.arrayContaining(['OBLIGATION_UNKNOWN', 'INTENT_MISSING']));
    const garbage = await s3.interpret({ page, cdp, reply: null, observed, task, step });
    expect(garbage).toMatchObject({ status: 'INVALID', gateCodes: ['REPLY_UNPARSEABLE'] });
    const clarify = await s3.interpret({ page, cdp, reply: { schemaVersion: 3, kind: 'NEXT_ACTION', requestId: 'r', status: 'CLARIFICATION', obligationId: null, action: null, question: { reason: 'AMBIGUOUS_TARGET', choices: [{ choiceId: 'a', safeLabel: 'a', meaning: { obligationId, ref: textbox?.ref, bindingId: null } }, { choiceId: 'b', safeLabel: 'b', meaning: { obligationId, ref: 'e9999', bindingId: null } }] } }, observed, task, step });
    expect(clarify).toMatchObject({ status: 'CLARIFICATION' });
    expect(clarify.gateCodes).toContain('CHOICE_REF_UNKNOWN');
    await page.context().close();
  }, 90000);

  it('the gate refuses another operation, a value that is not the bound literal, and another predicate, with the registered codes', async () => {
    const { page, cdp, observed } = await open(s3);
    const { cursor, obligationId } = cursorFor('username');
    s3.buildRequest({ task, step, obligations: cursor, observed });
    const textbox = [...observed.internal.perceived.byRef.values()].find(node => node.role === 'textbox');
    const target = { kind: 'node', ref: textbox?.ref };
    const wrongOperation = await s3.interpret({ page, cdp, reply: action(obligationId, target, { kind: 'click' }), observed, task, step });
    expect(wrongOperation.status).toBe('ACTION');
    expect(wrongOperation.gateCodes).toContain('OPERATION_MISMATCH');
    const wrongValue = await s3.interpret({ page, cdp, reply: action(obligationId, target, fill(observed, randomUUID())), observed, task, step });
    expect(wrongValue.gateCodes).toEqual(['VALUE_MISMATCH']);
    const noValue = await s3.interpret({ page, cdp, reply: action(obligationId, target, { kind: 'fill', value: { kind: 'authoredLiteral', sourceInputId: 'invented' } }), observed, task, step });
    expect(noValue.gateCodes).toEqual(['VALUE_MISMATCH']);
    // An assert obligation: the predicate must equal the obligation's.
    const session = requests.makeSession(task);
    const assertCursor = { session, plan: { sourceReferences: [], needs: [], obligations: [{ obligationId: 'ob-assert', stepId: session.sourceSteps[0]?.stepId, occurrence: 0, operationKind: 'assert', targetIntent: 'username', scopeIntent: null, referenceIndex: null, needId: null, predicate: 'visible' }] }, stepIndex: 0, done: 0 };
    s3.buildRequest({ task, step, obligations: assertCursor, observed });
    const wrongPredicate = await s3.interpret({ page, cdp, reply: action('ob-assert', target, { kind: 'assert', predicate: 'containsText', expected: null }), observed, task, step });
    expect(wrongPredicate.gateCodes).toEqual(['PREDICATE_MISMATCH']);
    const rightPredicate = await s3.interpret({ page, cdp, reply: action('ob-assert', target, { kind: 'assert', predicate: 'visible', expected: null }), observed, task, step });
    expect(rightPredicate.gateCodes).toEqual([]);
    await page.context().close();
  }, 90000);

  it('refuses a fill whose target role cannot take text with OPERATION_TARGET_MISMATCH, and admits a textbox', async () => {
    const { page, cdp, observed } = await open(s3);
    const { cursor, obligationId } = cursorFor('username');
    s3.buildRequest({ task, step, obligations: cursor, observed });
    const nodes = [...observed.internal.perceived.byRef.values()];
    const textbox = nodes.find(node => node.role === 'textbox');
    const button = nodes.find(node => node.role === 'button');
    const onTextbox = await s3.interpret({ page, cdp, reply: action(obligationId, { kind: 'node', ref: textbox?.ref }, fill(observed)), observed, task, step });
    expect(onTextbox.gateCodes).not.toContain('OPERATION_TARGET_MISMATCH');
    const onButton = await s3.interpret({ page, cdp, reply: action(obligationId, { kind: 'node', ref: button?.ref }, fill(observed)), observed, task, step });
    expect(onButton.status).toBe('ACTION');
    expect(onButton.gateCodes).toContain('OPERATION_TARGET_MISMATCH');
    await page.context().close();
  }, 90000);

  it('keeps the intent gate pure: refusals and passes follow the registered rule', () => {
    expect(s3Lib.intentGate('username', { rawName: '', near: 'username:', ownText: '' })).toBeNull();
    expect(s3Lib.intentGate('Login form username', { rawName: '', near: 'username:', ownText: '' })).toBe('INTENT_MISMATCH');
  });
});
})();

// ---- moved from test/evaluation/grounding-b-sanitizer.test.ts ----
(function sanitizerSuite() {
const domHash = supportDomHash;
/**
 * SPK-07 workstream B: the perception sanitizer on real pages (SPK07_LIVE=1: Chromium, and the network for the HN login test).
 * Playwright's raw AI snapshot leaks typed values, so every control value channel is exercised with a unique canary and the
 * outline, the node tree and the meta are scanned for it.
 */

const EDGE = `<!doctype html><title>edge</title><body>
<label>Name <input id="prefilled" value="CANARY_ATTR"></label>
<label>Notes <textarea>CANARY_TA</textarea></label>
<div contenteditable="true" aria-label="Editor">CANARY_CE <b>CANARY_CE2</b></div>
<div contenteditable="true" style="pointer-events:none;position:absolute;top:0;left:0;width:1px;height:1px;overflow:hidden">CANARY_NOREF</div>
<div role="slider" tabindex="0" aria-label="Volume" aria-valuenow="3" aria-valuetext="CANARY_VT">CANARY_SL</div>
<label>Currency <select><option>Alpha</option><option selected>CANARY_SEL</option><option>Gamma</option></select></label>
<div data-sensitive><span>CANARY_SENS</span><button>Reveal</button></div>
<p>Hello CANARY_PRIV user</p><p>fullwidth ＣＡＮＡＲＹ＿ＦＷ here</p><p>kept canary_case lower</p>
<a href="/u/CANARY_PRIV_URL?q=1">Profile</a><a href="/next?token=abcdefghijklmnopqrstuvwxyz0123">Next page</a>
<iframe srcdoc="<p>CANARY_FRAME</p>" title="frame"></iframe><canvas width="50" height="20"></canvas>
<input type="search" value="CANARY_SEARCH" aria-label="Search">
<input type="range" value="7" aria-label="Range"><input type="number" value="424242" aria-label="Quantity">
<input type="password" value="CANARY_PW" aria-label="Secret">
<button>Save changes</button></body>`;
const VALUE_CANARIES = ['CANARY_ATTR', 'CANARY_TA', 'CANARY_CE', 'CANARY_CE2', 'CANARY_NOREF', 'CANARY_VT', 'CANARY_SL', 'CANARY_SEL', 'CANARY_SENS', 'CANARY_FRAME', 'CANARY_SEARCH', '424242', 'CANARY_PW'];
const PRIVATE = ['CANARY_PRIV', 'CANARY_FW', 'CANARY_CASE'];


describe.skipIf(!live)('sanitizer on live pages (SPK07_LIVE=1)', () => {
  let browser: Browser; let perceive: PerceiveModule; let cdpLib: CdpModule;
  beforeAll(async () => { browser = await launch(); perceive = await importLib<PerceiveModule>('perceive.mjs'); cdpLib = await importLib<CdpModule>('cdp.mjs'); }, 60000);
  afterAll(async () => { await browser.close(); });

  it('strips every control value channel on a synthetic edge page and never mutates the page', async () => {
    const page = await openPage(browser, { html: EDGE });
    const cdp = await cdpLib.session(page);
    const before = await domHash(cdp);
    const perceived = await perceive.perceive({ page, cdp, privateValues: PRIVATE, stepText: 'Click Save changes' });
    expect(await domHash(cdp)).toBe(before);
    const everything = `${perceived.outline}\n${JSON.stringify(perceived.nodes)}\n${JSON.stringify(perceived.meta)}\n${JSON.stringify(perceived.idMap)}`;
    expect(leaks(everything, [...VALUE_CANARIES, 'CANARY_PRIV', 'CANARY_FW', 'CANARY_PRIV_URL'])).toEqual([]);
    expect(everything).not.toContain('CANARY_CASE'); // the private value itself (upper case) is nowhere either
    // Structural lines survive: the controls are named, valueless and targetable.
    for (const expected of ['textbox "Name"', 'textbox "Notes"', 'combobox "Currency"', 'option "Alpha"', 'option "Gamma"', 'button "Save changes"', 'searchbox "Search"', 'slider "Volume"', 'spinbutton "Quantity"']) expect(perceived.outline, expected).toContain(expected);
    expect(perceived.outline).toContain('{editable}');
    expect(perceived.outline).toContain('- withheld {sensitive}');
    expect(perceived.outline).toContain('iframe {unsupported surface}');
    expect(perceived.outline).toContain('canvas {unsupported surface}');
    expect(perceived.outline).toContain('- passwordControl');
    expect(perceived.outline).not.toContain('Reveal'); // inside the withheld [data-sensitive] subtree
    // Private values are matched case-insensitively now: the lower-case echo of CANARY_CASE is withheld too, other text stays.
    expect(perceived.outline).not.toContain('canary_case');
    expect(perceived.outline).toContain('button "Save changes"');
    // The long opaque query value is hidden, the short path is kept.
    expect(perceived.outline).toContain('{url="/next?token=…"}');
    expect(perceived.meta.passwordControls).toBe(1);
    expect(Number(perceived.meta.withheldPrivate)).toBeGreaterThanOrEqual(4);
    await page.context().close();
  }, 60000);

  it('withholds a node whose name, text, placeholder or url carries a private value, in NFKC form too', async () => {
    const page = await openPage(browser, { html: '<body><button>Hello SPK_NAME</button><a href="/x/SPK_URL">Go</a><input placeholder="SPK_PH" aria-label="Field"><p>ＳＰＫ＿ＮＦＫＣ text</p><p>ok text</p></body>' });
    const perceived = await perceive.perceive({ page, privateValues: ['SPK_NAME', 'SPK_URL', 'SPK_PH', 'SPK_NFKC'] });
    expect(leaks(perceived.outline, ['SPK_NAME', 'SPK_URL', 'SPK_PH', 'SPK_NFKC'])).toEqual([]);
    expect(leaks(JSON.stringify(perceived.nodes), ['SPK_NAME', 'SPK_URL', 'SPK_PH', 'SPK_NFKC'])).toEqual([]);
    // S3 v2: a ref-bearing node whose name / placeholder is private stays as a valueless, targetable line; a url-only hit keeps the node without the url.
    expect(perceived.outline).toMatch(/- button \[e\d+\] \{value withheld\}/u);
    expect(perceived.outline).toMatch(/- textbox \[e\d+\] \{value withheld\}/u);
    expect(perceived.outline).toMatch(/- link "Go" \[e\d+\]\s*$/mu);
    expect(perceived.outline).not.toContain('url=');
    expect(perceived.outline).not.toContain('Hello');
    expect(perceived.outline).not.toContain('Field');
    expect(perceived.outline).toContain('ok text');
    for (const line of perceived.outline.split('\n').filter(l => l.includes('{value withheld}'))) expect(line).toMatch(/^\s*- [a-z]+ \[e\d+\] \{value withheld\}( \{(near|in)=[^}]*\})*$/u);
    const withheldRefs = [...perceived.outline.matchAll(/\[(e\d+)\] \{value withheld\}/gu)].map(m => String(m[1]));
    expect(withheldRefs.length).toBeGreaterThanOrEqual(2);
    for (const ref of withheldRefs) expect(perceived.idMap[ref], ref).toBeGreaterThan(0);
    expect(Number(perceived.meta.withheldKept)).toBeGreaterThanOrEqual(2);
    await page.context().close();
  }, 60000);

  it('S3 v2: table value cells stay targetable by ref (cell text is private), carry their row and column headers, and show no value', async () => {
    const html = `<body><table aria-label="Details"><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>
      <tr><th scope="row">Language</th><td>SPK_ENGLISH</td></tr><tr><th scope="row">Rights</th><td><span>SPK_RIGHTS text</span></td></tr><tr><th scope="row">Pages</th><td>312</td></tr></tbody></table></body>`;
    const page = await openPage(browser, { html });
    const cdp = await cdpLib.session(page);
    const perceived = await perceive.perceive({ page, cdp, privateValues: ['SPK_ENGLISH', 'SPK_RIGHTS'] });
    expect(leaks(`${perceived.outline}\n${JSON.stringify(perceived.nodes)}`, ['SPK_ENGLISH', 'SPK_RIGHTS'])).toEqual([]);
    const language = [...perceived.byRef.values()].find(n => n.role === 'cell' && n.withheld);
    expect(language).toBeDefined();
    expect(perceived.outline).toMatch(/- cell \[e\d+\] \{value withheld\}/u);
    expect(perceived.outline).toContain('rowheader "Language"');
    // The production collector's inventory also carries the table's other business text, so every value cell is withheld and still targetable.
    expect(perceived.outline).not.toContain('312');
    expect([...perceived.byRef.values()].filter(n => n.role === 'cell' && n.withheld).length).toBe(3);
    expect(language?.headers).toEqual(expect.arrayContaining(['Value']));
    for (const [ref, node] of perceived.byRef) if (node.withheld && node.role === 'cell') expect(perceived.idMap[ref], ref).toBeGreaterThan(0);
    const headersByCell = [...perceived.byRef.values()].filter(n => n.role === 'cell' && n.withheld).map(n => n.headers?.join('|'));
    expect(headersByCell).toEqual(expect.arrayContaining(['Language|Value', 'Rights|Value', 'Pages|Value']));
    await page.context().close();
  }, 60000);

  it('HN login: canaries typed into the username and the password field appear nowhere; the password is a valueless passwordControl', async () => {
    const page = await openPage(browser, { url: 'https://news.ycombinator.com/login' });
    const cdp = await cdpLib.session(page);
    const USER = 'CANARYUSER_7F3A91'; const PASS = 'CANARYPASS_C20E58';
    await page.locator('input[name="acct"]').first().fill(USER);
    await page.locator('input[name="pw"]').first().fill(PASS);
    // The raw snapshot of today leaks both (the reason the sanitizer exists): prove it on the same page state.
    const world = await importLib<{ isolatedWorld(c: unknown): Promise<number>; evaluateHandle(c: unknown, w: number, e: string): Promise<string>; call(c: unknown, o: string, f: string): Promise<string> }>('cdp.mjs');
    const engineLib = await importLib<{ engineExpression(): string }>('pwEngine.mjs');
    const contextId = await world.isolatedWorld(cdp);
    const engine = await world.evaluateHandle(cdp, contextId, engineLib.engineExpression());
    const raw = await world.call(cdp, engine, "function() { return this.ariaSnapshot(document.documentElement, { mode: 'ai' }); }");
    expect(leaks(raw, [USER, PASS]).sort()).toEqual([PASS, USER].sort());

    const perceived = await perceive.perceive({ page, cdp, stepText: 'Type "spk07user" in the username field of the Login form' });
    const everything = `${perceived.outline}\n${JSON.stringify(perceived.nodes)}\n${JSON.stringify(perceived.meta)}`;
    expect(leaks(everything, [USER, PASS, 'CANARYUSER', 'CANARYPASS'])).toEqual([]);
    expect((perceived.outline.match(/- passwordControl/gu) ?? []).length).toBe(2);
    expect(perceived.meta.passwordControls).toBe(2);
    // A password control is never a ref and never in the idMap.
    const passwordIds = await cdpLib.locatorIds(page, cdp, page.locator('input[type="password"]'));
    expect(passwordIds.length).toBe(2);
    for (const id of passwordIds) expect(Object.values(perceived.idMap)).not.toContain(id);
    for (const line of perceived.outline.split('\n').filter(l => l.includes('passwordControl'))) expect(line).not.toMatch(/\[e\d+\]/u);
    // The two username fields stay visible and named by their neighbour text.
    expect(perceived.outline.match(/textbox \[e\d+\] \{near="username:"\}/gu)?.length).toBe(2);
    await page.context().close();
  }, 90000);

  it('also holds for a search field prefilled from the URL and echoed in the page', async () => {
    const server: Server = createServer((request, response) => {
      const q = new URL(request.url ?? '/', 'http://x').searchParams.get('q') ?? '';
      response.setHeader('content-type', 'text/html');
      response.end(`<!doctype html><body><form><input name="q" value="${q}" aria-label="Query"><button>Search</button></form></body>`);
    });
    await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve); });
    try {
      const page = await openPage(browser, { url: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/?q=CANARY_URLQ` });
      const perceived = await perceive.perceive({ page });
      expect(leaks(perceived.outline, ['CANARY_URLQ'])).toEqual([]);
      expect(perceived.outline).toContain('textbox "Query"');
      await page.context().close();
    } finally { server.close(); }
  }, 60000);
});
})();

// ---- moved from test/evaluation/grounding-b-echo.test.ts ----
(function echoSuite() {
/**
 * SPK-07 workstream B: page content that ECHOES typed or URL-prefilled values (search suggestions, "Results for <q>" headings,
 * a case-changed or truncated red link, a dropdown inside a shadow root). The private inventory is derived from the live page
 * (production collector + page controls) and every outline node and every masked region is matched against it (NFKC, case-insensitive).
 * Needs Chromium: SPK07_LIVE=1.
 */

const fixture = (urlValue: string): string => `<!doctype html><title>echo</title>
<style>body{font:16px Georgia,serif;margin:12px} input,textarea{font:16px Georgia,serif;width:300px;display:block;margin:6px 0} #ed{border:1px solid #888;width:300px;height:24px;overflow:hidden}</style>
<h1>Echo fixture</h1>
<label for="q">Search</label><input id="q" type="search" autocomplete="off" value="${urlValue}">
<label for="p">Password</label><input id="p" type="password">
<div id="ed" contenteditable="true" role="textbox" aria-label="Editor"></div>
<ul id="sugg" role="listbox" aria-label="Suggestions"></ul>
<h2 id="res"></h2><a id="red" href="/missing">placeholder</a><div id="host"></div><button type="button">Search</button>
<script>
  const shadow = document.getElementById('host').attachShadow({ mode: 'open' });
  const render = v => {
    document.getElementById('sugg').innerHTML = v ? '<li role="option">' + v + ' - search suggestion</li>' : '';
    document.getElementById('res').textContent = v ? 'Results for ' + v.toUpperCase() : 'No query';
    document.getElementById('red').textContent = v ? 'Create the page "' + v.slice(0, 14) + '…"' : 'placeholder';
    shadow.innerHTML = v ? '<p>Site search for <em>' + v + '</em></p>' : '';
  };
  document.getElementById('q').addEventListener('input', e => render(e.target.value));
  render(document.getElementById('q').value);
</script>`;

const echoes = (text: string, canary: string): boolean => {
  const folded = text.toLowerCase(); const target = canary.toLowerCase();
  if (folded.includes(target)) return true;
  for (let i = 0; i + 12 <= target.length; i++) if (folded.includes(target.slice(i, i + 12))) return true;
  return false;
};

describe.skipIf(!live)('echoed values (SPK07_LIVE=1)', () => {
  let browser: Browser; let s3: Arm; let s4: Arm; let perceive: PerceiveModule; let cdpLib: CdpModule; let requests: RequestsModule;
  beforeAll(async () => {
    browser = await launch();
    s3 = await importLib<Arm>('arms/S3.mjs'); s4 = await importLib<Arm>('arms/S4.mjs');
    perceive = await importLib<PerceiveModule>('perceive.mjs'); cdpLib = await importLib<CdpModule>('cdp.mjs'); requests = await importLib<RequestsModule>('requests.mjs');
  }, 60000);
  afterAll(async () => { await browser.close(); });

  const task = { id: 'echo', steps: [{ text: 'Click the "Search" button', operation: { kind: 'click' } }] };
  const step = task.steps[0] as object;
  const typed = async (canary: string, prefill = ''): Promise<{ page: Page; cdp: Awaited<ReturnType<CdpModule['session']>> }> => {
    const page = await openPage(browser, { html: fixture(prefill) });
    if (!prefill) { await page.locator('#q').type(canary); await page.locator('#p').type(canary); await page.locator('#ed').type(canary); }
    const cdp = await cdpLib.session(page);
    return { page, cdp };
  };

  it('derives the inventory from the live page: typed, password, contenteditable and the production collector', async () => {
    const canary = 'cnryQ7M2KXH4VZ9LTD3FBN6W';
    const { page, cdp } = await typed(canary);
    const result = await perceive.privateInventoryFor(page, cdp);
    expect(result.production).toBe('ok');
    const values = result.inventory.map(([value]) => value);
    expect(values.filter(value => value === canary).length).toBe(1); // typed in three controls: one merged entry
    expect(result.inventory.find(([value]) => value === canary)?.[1]).toBe(true);
    await page.context().close();
  }, 60000);

  for (const [label, prefill] of [['typed into a search box', ''], ['prefilled from the URL', 'cnryURL5H8P2WQJ6ZRB3MNTX']] as const) {
    it(`S3 and S4 carry no echo of a value ${label} (case-changed, truncated, shadow-DOM and suggestion echoes included)`, async () => {
      const canary = prefill || 'cnryA4D9GKT7XE2VNW5QLZ8P';
      const { page, cdp } = await typed(canary, prefill);
      for (const arm of [s3, s4]) {
        const observed = await arm.observe({ page, cdp, task, step });
        const lines = observed.payload.split('\n');
        expect(lines.filter(line => echoes(line, canary)), `${arm.id} outline lines echoing the value`).toEqual([]);
        expect(JSON.stringify(observed.meta)).not.toMatch(/cnry/iu);
        expect(Number(observed.meta.withheldPrivate)).toBeGreaterThanOrEqual(3); // suggestion, heading, red link, shadow paragraph
        expect(observed.payload).toContain('button "Search"'); // unrelated structure survives
        const body = JSON.stringify(arm.buildRequest({ task, step, obligations: requests.stubCursor(task, step), observed }));
        expect(echoes(body.replace(/"data":"[A-Za-z0-9+/=]+"/gu, ''), canary)).toBe(false);
      }
      await page.context().close();
    }, 90000);
  }

  it('S4 masks every echo (blocks, not text extents), so renders with different typed glyphs are byte-identical', async () => {
    const images: string[] = [];
    for (const canary of ['cnryWWWWWWWWWWWWWWWWWWWW', 'cnryMMMMMMMMMMMMMMMMMMMM']) {
      const { page, cdp } = await typed(canary);
      const observed = await s4.observe({ page, cdp, task, step });
      images.push(observed.images?.[0]?.base64 ?? '');
      expect(Object.keys(observed.meta.maskReasons as Record<string, number>)).toContain('private-text');
      await page.context().close();
    }
    expect(images[0]).not.toBe('');
    expect(images[0]).toBe(images[1]);
  }, 90000);
});
})();

// ---- moved from test/evaluation/grounding-b-visual.test.ts ----
(function visualSuite() {
/**
 * SPK-07 workstream B, S4: the value-masked Set-of-Marks screenshot (SPK07_LIVE=1, Chromium). The mask test renders the same
 * page state twice with two DIFFERENT canary values typed into inputs, a textarea and a contenteditable (and different private
 * text) and requires the masked PNGs to be byte-identical, while the unmasked screenshots differ (so the test is not vacuous).
 */

/**
 * Playwright's own `animations: 'disabled'` leaves an empty `style=""` attribute on form controls and editable elements after
 * the first screenshot (verified: caret:'hide' alone and a screenshot with no options do not). It is semantically null, so the
 * no-mutation check compares the DOM with empty style attributes removed. Recorded as a deviation in the workstream report.
 */
const domHash = async (cdp: Cdp): Promise<string> => {
  const { result } = await cdp.send('Runtime.evaluate', { expression: "document.documentElement.outerHTML.replace(/ style=\"\"/g, '')", returnByValue: true });
  return sha256(result.value);
};

const page = (canary: string, privateText: string): string => `<!doctype html><title>mask</title>
<style>body{font:14px monospace;margin:12px} input,textarea,select{font:14px monospace;display:block;margin:6px 0;width:260px} .ce{border:1px solid #888;width:260px;height:20px;overflow:hidden;font:14px monospace;margin:6px 0}</style>
<label>Username <input id="u" aria-label="Username"></label>
<label>Password <input id="p" type="password" aria-label="Password"></label>
<label>Notes <textarea id="t" rows="2" aria-label="Notes"></textarea></label>
<div id="e" class="ce" contenteditable="true" aria-label="Editor"></div>
<div data-sensitive id="s" style="width:260px;height:20px;background:#eef">${canary}-sensitive</div>
<p id="pt">Account owner: <span>${privateText}</span></p>
<button id="b">Save</button>
<script>
  const typed = ${JSON.stringify(canary)};
  document.getElementById('u').value = typed; document.getElementById('p').value = typed;
  document.getElementById('t').value = typed; document.getElementById('e').textContent = typed;
</script>`;

describe.skipIf(!live)('masked Set-of-Marks screenshot (SPK07_LIVE=1)', () => {
  let browser: Browser; let perceiveLib: PerceiveModule; let visual: VisualModule; let cdpLib: CdpModule;
  beforeAll(async () => {
    browser = await launch();
    perceiveLib = await importLib<PerceiveModule>('perceive.mjs'); visual = await importLib<VisualModule>('visual.mjs'); cdpLib = await importLib<CdpModule>('cdp.mjs');
  }, 60000);
  afterAll(async () => { await browser.close(); });

  const render = async (canary: string, privateText: string, withMarks = true) => {
    const target = await openPage(browser, { html: page(canary, privateText) });
    const cdp = await cdpLib.session(target);
    const perceived = await perceiveLib.perceive({ page: target, cdp, privateValues: [privateText] });
    const before = await domHash(cdp);
    const raw = await target.screenshot({ animations: 'disabled', caret: 'hide' });
    const masked = await visual.maskedScreenshot({ page: target, perceived, privateValues: [privateText], marks: withMarks });
    const after = await domHash(cdp);
    await target.context().close();
    return { raw, masked, domUnchanged: before === after, perceived };
  };

  it('is pixel- and byte-identical for different typed values and different private text; the raw screenshots differ', async () => {
    const a = await render('ALPHA_CANARY_111', 'PRIVATE-AAAAAA');
    const b = await render('OMEGA_CANARY_999', 'PRIVATE-BBBBBB');
    expect(a.raw.equals(b.raw)).toBe(false); // sensitivity of the test itself: the values are visible without the mask
    expect(a.masked.base64).toBe(b.masked.base64);
    expect(sha256(Buffer.from(a.masked.base64, 'base64'))).toBe(sha256(Buffer.from(b.masked.base64, 'base64')));
    expect(Object.keys(a.masked.maskReasons).sort()).toEqual(['control', 'editable', 'password', 'private-text', 'sensitive']);
    expect(a.masked.maskReasons.password).toBe(1);
    expect(a.masked.masks).toBeGreaterThanOrEqual(6);
    expect(a.domUnchanged && b.domUnchanged).toBe(true);
  }, 90000);

  it('is deterministic across repeated renders of the same state', async () => {
    const a = await render('SAME_CANARY_555', 'PRIVATE-CCCCCC');
    const b = await render('SAME_CANARY_555', 'PRIVATE-CCCCCC');
    expect(a.masked.base64).toBe(b.masked.base64);
  }, 90000);

  it('returns a PNG with marks only on interactive refs of the outline, never inside the page', async () => {
    const a = await render('MARK_CANARY_777', 'PRIVATE-DDDDDD', true);
    const none = await render('MARK_CANARY_777', 'PRIVATE-DDDDDD', false);
    const png = Buffer.from(a.masked.base64, 'base64');
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(a.masked.width).toBe(1280);
    expect(a.masked.marks).toBe(4); // username, notes, editor, save (the password control has no ref, so it is not marked)
    expect(none.masked.marks).toBe(0);
    expect(a.masked.base64).not.toBe(none.masked.base64);
    const interactiveRefs = [...a.perceived.byRef.values()].filter(node => node.interactive).length;
    expect(a.masked.marks).toBeLessThanOrEqual(interactiveRefs);
    // The drawing happens in another page: the target page was left alone.
    expect(a.domUnchanged).toBe(true);
  }, 90000);

  it('never uses the screenshot mask option (it injects overlay elements into the page)', () => {
    const source = readFileSync(new URL('../../evaluation/grounding/lib/visual.mjs', import.meta.url), 'utf8');
    expect(source).not.toMatch(/screenshot\(\{[^}]*\bmask\b/u);
    expect(source).toContain("animations: 'disabled', caret: 'hide'");
    expect(source).toContain('about:blank');
  });
});
})();

// ---- moved from test/evaluation/grounding-b-synth.test.ts ----
(function synthSuite() {
/**
 * SPK-07 workstream B: locator synthesis on live pages (SPK07_LIVE=1). Every synthesized locator is re-resolved through the PUBLIC
 * Playwright API (page.locator(selector)) and must land on exactly the element the ref named (CDP backendNodeId identity).
 */

const DUPLICATES = `<!doctype html><title>dup</title><body>
<main>
  <article><h2>Alpha story</h2><p>First.</p><a href="/a">Read more</a></article>
  <article><h2>Beta story</h2><p>Second.</p><a href="/b">Read more</a></article>
  <section aria-label="Billing"><button>Edit</button></section>
  <section aria-label="Shipping"><button>Edit</button></section>
  <ul><li><button data-testid="del-1" data-bench-id="x1">Delete</button></li><li><button data-testid="del-2" data-bench-id="x2">Delete</button></li></ul>
  <div><span><button>Go</button></span><span><button>Go</button></span><span><button>Go</button></span></div>
  <form><input placeholder="Search docs" data-bench-id="x3"><input placeholder="Search blog" data-bench-id="x4"></form>
  <label>Email <input type="email" id="mail" data-bench-id="x5"></label>
</main></body>`;

describe.skipIf(!live)('locator synthesis (SPK07_LIVE=1)', () => {
  let browser: Browser; let perceive: PerceiveModule; let synth: SynthModule; let cdpLib: CdpModule;
  beforeAll(async () => { browser = await launch(); perceive = await importLib<PerceiveModule>('perceive.mjs'); synth = await importLib<SynthModule>('synth.mjs'); cdpLib = await importLib<CdpModule>('cdp.mjs'); }, 60000);
  afterAll(async () => { await browser.close(); });

  /** Resolve through the public API and compare identity with what the ref named. */
  const resolvesTo = async (page: Page, perceived: Perceived, ref: string, result: SynthResult): Promise<void> => {
    expect(result.selector, `no locator for ${ref}`).not.toBeNull();
    const ids = await cdpLib.locatorIds(page, perceived.handle.cdp as never, page.locator(result.selector ?? ''));
    expect(ids).toEqual([perceived.idMap[ref]]);
  };
  const find = (perceived: Perceived, predicate: (node: Perceived['nodes'][number]) => boolean) => [...perceived.byRef.values()].filter(predicate);

  it('HN login: both unlabeled username fields get distinct verified locators that resolve to exactly their own field', async () => {
    const page = await openPage(browser, { url: 'https://news.ycombinator.com/login' });
    const perceived = await perceive.perceive({ page });
    const fields = find(perceived, node => node.role === 'textbox');
    expect(fields.length).toBe(2);
    const results: SynthResult[] = [];
    for (const field of fields) {
      const result = await synth.synthesize({ handle: perceived.handle, perceived, ref: field.ref ?? '' });
      expect(result.locator, JSON.stringify(result)).not.toBeNull();
      expect(['filterHas', 'attribute', 'scoped']).toContain(result.tier);
      await resolvesTo(page, perceived, field.ref ?? '', result);
      results.push(result);
    }
    expect(new Set(results.map(result => result.selector)).size).toBe(2);
    // The engine's own generated selector is carried as a tagged alternative, never as the frozen locator.
    expect(results[0]?.generated?.selector).toBeTruthy();
    // Buttons and links on the same page take the highest tier.
    for (const node of find(perceived, n => n.role === 'button' || n.role === 'link')) {
      const result = await synth.synthesize({ handle: perceived.handle, perceived, ref: node.ref ?? '' });
      expect(result.tier).toBe('role');
      await resolvesTo(page, perceived, node.ref ?? '', result);
    }
    await page.context().close();
  }, 90000);

  it('duplicate names: every "Read more", "Edit" and "Delete" gets its own verified locator, with testId first where present', async () => {
    const page = await openPage(browser, { html: DUPLICATES });
    const perceived = await perceive.perceive({ page });
    const everything: SynthResult[] = [];
    for (const [ref, node] of perceived.byRef) {
      if (!node.interactive) continue;
      const result = await synth.synthesize({ handle: perceived.handle, perceived, ref });
      expect(result.locator, `${node.role ?? ''} ${node.rawName ?? ''} ${JSON.stringify(result)}`).not.toBeNull();
      await resolvesTo(page, perceived, ref, result);
      everything.push(result);
      if (node.rawName === 'Delete') expect(result.tier).toBe('testId');
      if (node.rawName === 'Read more') expect(['scoped', 'filterHas']).toContain(result.tier);
      if (node.rawName === 'Edit') expect(result.tier).toBe('scoped');
      if (node.rawName === 'Go') expect(result.tier).toBe('nth');
    }
    const byName = (name: string) => everything.filter((_, index) => [...perceived.byRef.values()].filter(n => n.interactive)[index]?.rawName === name);
    for (const name of ['Read more', 'Edit', 'Delete', 'Go']) { const selectors = byName(name).map(result => result.selector); expect(selectors.length).toBe(name === 'Go' ? 3 : 2); expect(new Set(selectors).size).toBe(selectors.length); }
    // A role+name locator that is not unique must not be chosen on its own.
    expect(everything.filter(result => result.selector === 'internal:role=link[name="Read more"s]').length).toBe(0);
    await page.context().close();
  }, 90000);

  it('unlabeled placeholder-only fields use the placeholder tier; labeled fields use role then label', async () => {
    const page = await openPage(browser, { html: DUPLICATES });
    const perceived = await perceive.perceive({ page });
    const search = find(perceived, node => node.role === 'textbox' && node.rawName !== 'Email');
    expect(search.length).toBe(2);
    for (const field of search) {
      const result = await synth.synthesize({ handle: perceived.handle, perceived, ref: field.ref ?? '' });
      expect(['role', 'placeholder']).toContain(result.tier);
      await resolvesTo(page, perceived, field.ref ?? '', result);
    }
    const email = find(perceived, node => node.rawName === 'Email')[0];
    const result = await synth.synthesize({ handle: perceived.handle, perceived, ref: email?.ref ?? '' });
    expect(result.tier).toBe('role');
    expect(result.alternatives.some(alternative => alternative.tier === 'label')).toBe(true);
    await page.context().close();
  }, 90000);

  it('never emits data-bench or any harness artifact, even when the page is full of data-bench attributes', async () => {
    const page = await openPage(browser, { html: DUPLICATES });
    const perceived = await perceive.perceive({ page });
    for (const [ref] of perceived.byRef) {
      const result = await synth.synthesize({ handle: perceived.handle, perceived, ref });
      const text = JSON.stringify([result.locator, result.selector, result.alternatives, result.generated]);
      expect(text).not.toMatch(/data-bench|__spk07|__pw/iu);
    }
    await page.context().close();
  }, 90000);

  it('does not put a private value into a locator', async () => {
    const page = await openPage(browser, { html: '<body><section aria-label="Account PRIVATE_ACC"><button>Pay</button></section><section aria-label="Other"><button>Pay</button></section></body>' });
    const perceived = await perceive.perceive({ page, privateValues: ['PRIVATE_ACC'] });
    const pays = find(perceived, node => node.rawName === 'Pay');
    expect(pays.length).toBe(2);
    for (const pay of pays) {
      const result = await synth.synthesize({ handle: perceived.handle, perceived, ref: pay.ref ?? '', privateValues: ['PRIVATE_ACC'] });
      expect(JSON.stringify(result)).not.toContain('PRIVATE_ACC');
    }
    await page.context().close();
  }, 60000);
});
})();
