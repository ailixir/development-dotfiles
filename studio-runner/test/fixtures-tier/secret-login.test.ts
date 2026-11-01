import { stepOp } from '../helpers/stepCode.js';
import { TEST_CHILD, gotoPage, guidedChildLauncher } from './helpers/guidedLaunch.js';
import type { Launch } from './helpers/guidedLaunch.js';
import { childPage } from './helpers/childPage.js';
import type { ChildPage } from './helpers/childPage.js';
import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
// eslint-disable-next-line no-restricted-imports -- Actual controlled Chromium oracle.
import type { Page } from 'playwright';
import { createHash,randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it,vi } from 'vitest';
import { mkdtemp, mkdir, lstat, readFile, readdir, rm, writeFile,realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { playwrightBrowserFactory, launchGuidedBrowser } from '../../src/run/browser.js';
import { prepareBrowserProfile } from '../../src/run/scratchLayout.js';
import type { BrowserHandle } from '../../src/run/browserFactory.js';
import type { ObservationSession, PasswordTarget } from '../../src/run/observationTypes.js';
import { startSecretLoginFixture } from '../fixtures/secret-login/server.js';
import { createObservedReplayAdapter } from '../../src/run/observedReplayAdapter.js';
import { executeObservedReplay } from '../../src/executor/observedReplay.js';
import type { StepFinishedEvent, StepStartedEvent } from '../../src/executor/stepReporter.js';
import type { Execute3, Scope } from '../../src/executor/observedOperations.js';
import { hashObserved, OBSERVED_PROFILE } from '../../src/validator/observedReferencePolicy.js';
import { createRedactor } from '../../src/executor/redaction.js';
import { loginRequiredSignature } from '../../src/run/loginRequired.js';
import {GuidedRuntime} from '../../src/guided/runtime.js';
import {guidedContext,proposal,dispatch} from '../helpers/guided.js';
import {hash,identity,validate} from '../../src/guided/contracts.js';
import {parseWireJson} from '../../src/guided/json.js';
import type {BridgeBootstrap,BridgeObservation,BridgeOrdinaryOutcome as BridgeOutcome} from '../../src/guided/types.js';
import {publicationFixture as publication} from '../helpers/publicationFixture.js';

const CANARY = 'obs007-Chromium-canary-4f19';
let fixture: Awaited<ReturnType<typeof startSecretLoginFixture>>, scratch: string, browser: BrowserHandle, page: Page, declaredAliasOrigin: string;
const sessions: ObservationSession[] = [];
beforeAll(async () => {
  fixture = await startSecretLoginFixture(CANARY); scratch = await mkdtemp(join(tmpdir(), 'secret-login-oracle-'));
  prepareBrowserProfile(scratch);
  const alias = new URL(fixture.origin); alias.hostname = '127.0.0.1'; declaredAliasOrigin = alias.origin;
  browser = await playwrightBrowserFactory.launch({ allowedDomains: TEST_DOMAINS, browser: 'chromium', scratchPath: scratch,observedScope:{...publication.job.binding.scope as Scope,initialContext:{kind:'initialBlank'}}, viewport: {width: 800, height: 600}, recording: {width: 800, height: 600} });
  page = browser.page as unknown as Page;
});
afterEach(async () => { for (const session of sessions.splice(0)) await session.dispose(); fixture.reset(); await page.goto('about:blank'); });
afterAll(async () => { await browser.dispose(); await fixture.close(); await rm(scratch, {recursive: true, force: true}); });
async function observed(path: string) {
  await page.goto(fixture.origin + path);
  const session = browser.createObservationSession?.({sessionId: 'controlled-login', scopeHash: 'a'.repeat(64), allowedDomains: TEST_DOMAINS, knownSecrets: []});
  if (!session) throw new Error('OBSERVATION_SESSION'); sessions.push(session);
  const observation = (await session.observe()).observation;
  const target: PasswordTarget = {kind: 'passwordControl', documentId: observation.documentId, generation: observation.generation};
  return {session, observation, target};
}
describe('isolated-world password control production boundary', () => {
  it.each([['/login', 1], ['/two-passwords', 2], ['/no-password', 0], ['/shadow-login', 1]] as const)('counts %s without exporting any password node', async (path, count) => {
    const h = await observed(path); expect(h.observation.coverage.passwordControls).toBe(count);
    expect(/passwordControl[^\n]*\[e\d+\]/u.test(h.observation.outline)).toBe(false);
    if (count === 1) { await h.session.preparePassword?.(h.target, fixture.origin); await h.session.fillPassword?.(h.target, fixture.origin, [fixture.origin], CANARY); expect(await page.locator('input[type=password]').inputValue()).toBe(CANARY); }
    else await expect(h.session.preparePassword?.(h.target, fixture.origin)).rejects.toThrow(count === 0 ? 'PASSWORD_TARGET_ABSENT' : 'PASSWORD_TARGET_AMBIGUOUS');
  });
  it.each(['swap', 'reattach', 'type'] as const)('refuses a pinned %s mutation without typing', async mode => {
    const h = await observed('/spa-swap'); await h.session.preparePassword?.(h.target, fixture.origin);
    await page.evaluate(mode => { if (mode === 'type') document.querySelector('input[type=password]')?.setAttribute('type', 'text'); else (window as unknown as Record<string, () => void>)[mode]?.(); }, mode);
    await expect(h.session.fillPassword?.(h.target, fixture.origin, [fixture.origin], CANARY)).rejects.toThrow('TARGET_CHANGED');
    expect(await page.locator('input[name=password]').inputValue()).toBe('');
  });
  it.each(['/trap', '/cross-origin-form'] as const)('refuses %s before a value is typed', async path => {
    const h = await observed(path); await h.session.preparePassword?.(h.target, fixture.origin);
    await expect(h.session.fillPassword?.(h.target, fixture.origin, [fixture.origin], CANARY)).rejects.toThrow(path === '/trap' ? 'TARGET_CHANGED' : 'PASSWORD_FORM_ACTION_NOT_ALLOWED');
    expect(await page.locator('input').last().inputValue()).toBe('');
  });
  it('permits inert focus styling while retaining the same unique password input', async () => {
    const h=await observed('/login');await page.locator('input[type=password]').evaluate(element=>{element.setAttribute('onfocus',"this.classList.add('focused')");});
    const o=(await h.session.observe()).observation;const target:PasswordTarget={kind:'passwordControl',documentId:o.documentId,generation:o.generation};await h.session.preparePassword?.(target,fixture.origin);await h.session.fillPassword?.(target,fixture.origin,[fixture.origin],CANARY);expect(await page.locator('input[type=password]').inputValue()).toBe(CANARY);
  });
  it('requires both allowed and approved origin and scrubs later echoes', async () => {
    const h = await observed('/login'); await h.session.preparePassword?.(h.target, fixture.origin);
    await expect(h.session.fillPassword?.(h.target, fixture.origin, [], CANARY)).rejects.toThrow('POLICY_DENIED');
    expect(await page.locator('input[type=password]').inputValue()).toBe('');
    await h.session.fillPassword?.(h.target, fixture.origin, [fixture.origin], CANARY);
    await page.locator('button').click(); await page.goto(fixture.origin + '/echo');
    const export_ = await h.session.observe(); expect(export_.json).not.toContain(CANARY);
    expect(Object.values(export_.observation.facts).filter(fact => fact.text?.includes(CANARY) === true || fact.name.includes(CANARY))).toEqual([]);
  });
  it.each(['nonempty-allowed-exclusion', 'approved-exclusion', 'formless-declared-navigation'] as const)('refuses the native origin boundary at its first guard: %s', async mode => {
    expect(declaredAliasOrigin === fixture.origin).toBe(false);
    await page.goto(fixture.origin + (mode === 'formless-declared-navigation' ? '/no-password' : '/login'));
    if (mode === 'formless-declared-navigation') await page.setContent('<input name="password" type="password">');
    // The whitelist is by host: 'approved-exclusion' lists a host that is not the page's; the alias origin (127.0.0.1) is never on it.
    const domains = mode === 'approved-exclusion' ? ['example.com'] : TEST_DOMAINS;
    const session = browser.createObservationSession?.({sessionId: 'controlled-origin', scopeHash: 'a'.repeat(64), allowedDomains: domains, knownSecrets: []});
    if (!session) throw new Error('OBSERVATION_SESSION'); sessions.push(session);
    if (mode === 'approved-exclusion') {
      // Actual collection refuses before a password observation/target/pin exists: the page's host is not on the whitelist, so after the
      // return window (the page never comes back) nothing is observed. The in-page SCOPE_DENIED guard stays behind it for a page that
      // leaves the list between the check and the collection (observation.test.ts).
      await expect(session.observe()).rejects.toMatchObject({message: 'ORIGIN_NOT_ALLOWED', host: 'localhost'});
    } else {
      const observation = (await session.observe()).observation;
      expect(observation.coverage.passwordControls).toBe(1);
      expect(/passwordControl[^\n]*\[e\d+\]/u.test(observation.outline)).toBe(false);
      const target: PasswordTarget = {kind: 'passwordControl', documentId: observation.documentId, generation: observation.generation};
      await session.preparePassword?.(target, fixture.origin);
      if (mode === 'nonempty-allowed-exclusion') {
        await expect(session.fillPassword?.(target, fixture.origin, [declaredAliasOrigin], CANARY)).rejects.toMatchObject({message: 'POLICY_DENIED', noEffect: true});
      } else {
        expect(await page.locator('input').evaluateAll(elements => elements.every(element => (element as HTMLInputElement).form === null))).toBe(true);
        const response = await page.goto(declaredAliasOrigin + '/no-password');
        expect(response?.status()).toBe(200); expect(page.url()).toBe(declaredAliasOrigin + '/no-password');
        expect(await page.evaluate(() => location.origin)).toBe(declaredAliasOrigin);
        await expect(session.fillPassword?.(target, fixture.origin, [fixture.origin, declaredAliasOrigin], CANARY)).rejects.toMatchObject({message: 'TARGET_CHANGED', noEffect: true});
      }
    }
    expect(await page.locator('input').count()).toBeGreaterThan(0);
    expect(await page.locator('input').evaluateAll(elements => elements.every(element => (element as HTMLInputElement).value === ''))).toBe(true);
    expect(fixture.receipts().length).toBe(0);
  });
  it.each(['shadow-plus-light', 'offscreen', 'iframe', 'closed-shadow'] as const)('counts adversarial %s candidates identically at prepare', async mode => {
    const h = await observed('/no-password');
    await page.setContent(mode === 'iframe' ? '<iframe srcdoc="<input type=password>"></iframe>' : mode === 'closed-shadow' ? '<div id="host"></div>' : '<input type="password"><div id="host"></div>');
    if (mode === 'shadow-plus-light' || mode === 'closed-shadow') await page.evaluate(mode => { const host = document.querySelector('#host'); if (host) host.attachShadow({mode: mode === 'closed-shadow' ? 'closed' : 'open'}).innerHTML = '<input type=password>'; }, mode);
    if (mode === 'offscreen') await page.evaluate(() => { const input = document.createElement('input'); input.type = 'password'; input.style.position = 'absolute'; input.style.left = '-1000px'; document.body.append(input); });
    const observation = (await h.session.observe()).observation;
    const target: PasswordTarget = {kind: 'passwordControl', documentId: observation.documentId, generation: observation.generation};
    const count = mode === 'iframe' || mode === 'closed-shadow' ? 0 : 2;
    expect(observation.coverage.passwordControls).toBe(count);
    await expect(h.session.preparePassword?.(target, fixture.origin)).rejects.toThrow(count ? 'PASSWORD_TARGET_AMBIGUOUS' : 'PASSWORD_TARGET_ABSENT');
  });
});

async function scan(directory: string): Promise<string[]> {
  const hits: string[] = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) hits.push(...await scan(path));
    else if (entry.isFile()) { try { const bytes = await readFile(path); if ([Buffer.from(CANARY), Buffer.from(CANARY, 'utf16le'), Buffer.from(Buffer.from(CANARY).toString('base64'))].some(value => bytes.includes(value))) hits.push(path); } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
  }
  }
  return hits;
}
it('scans recorded and guided persistent profiles before close and cleanup', async () => {
  const h = await observed('/login'); await h.session.preparePassword?.(h.target, fixture.origin); await h.session.fillPassword?.(h.target, fixture.origin, [fixture.origin], CANARY); await page.locator('button').click();
  expect(fixture.receipts()[0]?.accepted).toBe(true); expect(await scan(scratch)).toEqual([]);
  const guided = await launchGuidedBrowser({sessionId: 'guided-profile', scopeHash: 'b'.repeat(64), allowedDomains: TEST_DOMAINS, knownSecrets: []}, 'guided-context', () => undefined);
  try { await gotoPage(guided, fixture.origin + '/login'); const o = (await guided.observations.observe()).observation; const target: PasswordTarget = {kind: 'passwordControl', documentId: o.documentId, generation: o.generation}; await guided.observations.preparePassword?.(target, fixture.origin); await guided.observations.fillPassword?.(target, fixture.origin, [fixture.origin], CANARY); if (!guided.scratchDirectory) throw new Error('PROFILE'); const recordedPreferences=browser.preferenceEvidence, guidedPreferences=guided.preferenceEvidence;if(!recordedPreferences||!guidedPreferences)throw new Error('EFFECTIVE_PREFERENCES');const expectedPreferences={credentialsEnableService:false,autofillProfileEnabled:false,autofillCreditCardEnabled:false,restoreOnStartup:5};expect(recordedPreferences.channel).toBe('chromium');expect(guidedPreferences.channel).toBe('chromium');expect(recordedPreferences.effective).toEqual(expectedPreferences);expect(guidedPreferences.effective).toEqual(expectedPreferences);expect(recordedPreferences.activeProfilePath).toBe(await realpath(join(scratch,'browser-profile','Default')));expect(guidedPreferences.activeProfilePath).toBe(await realpath(join(guided.scratchDirectory,'browser-profile','Default')));const verifiedPreferences=[recordedPreferences,guidedPreferences].every(p=>p.effective.credentialsEnableService===false&&p.effective.autofillProfileEnabled===false&&p.effective.autofillCreditCardEnabled===false&&p.effective.restoreOnStartup===5);expect(verifiedPreferences).toBe(true); await (present(guided.handle).page as unknown as Page).locator('button').click(); expect(fixture.receipts()).toHaveLength(2); expect(fixture.receipts()[1]?.accepted).toBe(true); expect(await scan(guided.scratchDirectory)).toEqual([]); await writeFile(evidencePath('STUDIO-OBS-007/runner-chromium-profile.json'), JSON.stringify({chromiumVersion: page.context().browser()?.version(), observedProfile: join(scratch, 'browser-profile'), guidedProfile: join(guided.scratchDirectory, 'browser-profile'), preCloseCanaryHits: 0, verifiedPreferences, channel:'chromium',effectivePreferences:{recorded:recordedPreferences,guided:guidedPreferences}, preparedPreferencesPath: 'browser-profile/Default/Preferences', effectivePreferenceVerification: 'Four supported keys asserted from actual production startup probe; historical obsolete key remains explicitly superseded', residual: 'Transient Chromium files can rotate while the browser is live; only ENOENT is skipped. Heap strings, browser caches and operator dumps remain operational residuals; video masking is the manual OBS-009 gate.'}, null, 2)+'\n'); }
  finally { await guided.observations.dispose(); await guided.close(); }
});

it('refuses an actual browser launch without the prewritten Preferences file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'missing-preferences-'));
  try { await expect(playwrightBrowserFactory.launch({allowedDomains: TEST_DOMAINS, browser: 'chromium', scratchPath: directory, viewport: {width: 800, height: 600}, recording: {width: 800, height: 600}})).rejects.toThrow('PROFILE_PREFERENCES_REQUIRED'); }
  finally { await rm(directory, {recursive: true, force: true}); }
});

it('measures raw Playwright fill error text before the production redactor', async () => {
  await page.goto(fixture.origin + '/slow'); await page.locator('input[type=password]').evaluate(element => { (element as HTMLInputElement).readOnly = true; });
  let raw = ''; try { await page.locator('input[type=password]').fill(CANARY, {timeout: 50}); } catch (error) { raw = error instanceof Error ? error.message : ''; }
  expect(raw).toContain(CANARY);
  const redactor = createRedactor([CANARY]); const safe = redactor.redact(raw); expect(safe).toContain('[REDACTED]'); expect(safe).not.toContain(CANARY);
});

it.each(['native-guard','injected-released-value'] as const)('measures actual GuidedRuntime %s failure and its diagnostic sinks in Chromium',async mode=>{
  const directory=await mkdtemp(join(tmpdir(),'guided-secret-diagnostics-'));
  const context=guidedContext(fixture.origin);const destination=context.authoredInputs.inputs[0];if(!destination||!('value' in destination))throw new Error('DESTINATION');destination.value=fixture.origin+(mode==='native-guard'?'/trap':'/login');
  context.authoredInputs.inputs.push({inputId:'input-pass',sourceStepId:'fill',kind:'secretRef',secretId:'PASS',provenance:{referenceKind:'configuration',configurationRevision:context.configurationRevision,stepId:'fill',referenceId:'reference-pass',referenceName:'PASS',kind:'secretRef'}});
  context.authoredInputsHash=hash(context.authoredInputs);
  const messages:{route:string;body:unknown}[]=[],stderr:string[]=[],raw:string[]=[];let nativeGuardClose:CapturedPrivateClose|undefined,validDuplicate:ReturnType<typeof dispatch>|undefined;
  const childLaunch=guidedChildLauncher({childModulePath:mode==='native-guard'?TEST_CHILD.probe:TEST_CHILD.fillThrows});
  const diagnosticLaunch:Launch=mode==='native-guard'?async(...args)=>{const original=await childLaunch(...args);nativeGuardClose=capturePrivateClose(original,await childPage());return nativeGuardClose.browser;}:childLaunch;
  const runtime=new GuidedRuntime(context,{workerId:context.workerId,allowedDomains: TEST_DOMAINS, journalDirectory:directory,launch:diagnosticLaunch,callback:(route,body)=>{messages.push({route,body});return Promise.resolve();},diagnosticStderr:text=>{stderr.push(text);},onRawFailure:error=>{raw.push(error instanceof Error?error.message:'');}});
  try{
    await runtime.start();const bootstrap=messages.find(message=>message.route==='bootstrap-evidence')?.body as BridgeBootstrap;
    const navigation=proposal(context,bootstrap.executionEvidence,'nav',stepOp('await page.goto(inputs["input-nav"]);', { uses: [{ kind: 'input', id: 'input-nav' }] }));
    const preparation=await runtime.prepare({...identity(context),proposal:navigation,requestDigest:hash(navigation),expiresAt:new Date(Date.now()+10000).toISOString()});await runtime.dispatch(dispatch(context,navigation,preparation));
    const observation=(messages.filter(message=>message.route==='observations').at(-1)?.body as BridgeObservation).observation;
    const evidence={kind:'observedDocument' as const,sessionId:context.sessionId,contextId:context.contextId,documentId:observation.documentId,generation:observation.generation,origin:fixture.origin,observationHash:hash(observation)};
    const fill=proposal(context,evidence,'fill',stepOp('await page.locator(\'input[type="password"]\').fill(secrets["PASS"]);',{uses:[{kind:'secret',id:'PASS'}]}));
    const prepared=await runtime.prepare({...identity(context),proposal:fill,requestDigest:hash(fill),expiresAt:new Date(Date.now()+10000).toISOString()});
    const request={...dispatch(context,fill,prepared),secrets:[{secretId:'PASS',value:CANARY,versionId:'oracle-version',allowedOrigins:[fixture.origin]}]};
    {validDuplicate=structuredClone(request);expect(()=>validate('bridge',validDuplicate,'dispatch')).not.toThrow();expect(hash(validDuplicate)).toBe(hash(request));}
    const outcome=await runtime.dispatch(request);expect(outcome.ledger.dispatchCount).toBe(1);expect(outcome.ledger.state).toBe(mode==='native-guard'?'FAILED':'UNKNOWN_OUTCOME');{expect(outcome.ledger.outcomeCode).toBe(mode==='native-guard'?'TARGET_CHANGED':'ACK_LOST');expect(runtime.accepting).toBe(false);expect(messages.some(m=>(m.body as {kind?:string}).kind==='prefixDrift')).toBe(false);const callbackCount=messages.length,rawFailureCount=raw.length,journalPath=join(directory,hash(context.sessionId)+'.journal'),journalBefore=await readFile(journalPath);try{await expect(runtime.dispatch(present(validDuplicate))).rejects.toThrow('CONTEXT_LOST');}finally{delete (validDuplicate as {secrets?:unknown}).secrets;}expect(messages).toHaveLength(callbackCount);expect(raw).toHaveLength(rawFailureCount);expect((await readFile(journalPath)).equals(journalBefore)).toBe(true);expect((validDuplicate as {secrets?:unknown}|undefined)?.secrets===undefined).toBe(true);if(mode==='native-guard'){assertPrivateClose(nativeGuardClose);expect(present(nativeGuardClose).facts.emptyInputs).toBe(true);}}expect(()=>validate('bridge',outcome,'outcome')).not.toThrow();
    // The injected hook throws the released value (plain, URL-encoded, base64 and a 4 KB tail) from inside the step: it too surfaces only as a closed code.
    // A step's own failure surfaces only as a closed code: no raw error text reaches the runtime, the callback, stderr or a diagnostic file.
    expect(raw).toEqual([]);expect(outcome.errorMessage).toBeUndefined();expect(request).not.toHaveProperty('secret');expect(stderr).toEqual([]);
    const files=await readdir(directory),journal=files.find(file=>file.endsWith('.journal'));if(!journal)throw new Error('DIAGNOSTIC_SINKS');expect(files.filter(file=>file.endsWith('.diagnostic.jsonl'))).toEqual([]);
    const authoritative=await readFile(join(directory,journal),'utf8');
    const callback=messages.filter(message=>message.route==='outcomes').at(-1)?.body as BridgeOutcome;expect(callback.errorMessage).toBeUndefined();expect(callback.ledger.outcomeCode).toBe(mode==='native-guard'?'TARGET_CHANGED':'ACK_LOST');
    for(const sink of [JSON.stringify(messages),stderr.join(''),authoritative])for(const value of [CANARY,encodeURIComponent(CANARY),Buffer.from(CANARY).toString('base64')])expect(sink).not.toContain(value);
    const rows=nativeJournal(authoritative),fences=rows.filter(row=>row.kind==='fence'&&row.event.admissionId===outcome.ledger.admission.admissionId);expect(fences).toEqual([invoking(context,outcome.ledger)]);expect(rows.filter(row=>row.kind==='consumed'&&row.digest===consumption(context,outcome.ledger).digest)).toHaveLength(1);
    expect(authoritative).not.toContain('errorMessage');expect(fixture.receipts()).toEqual([]);
  }finally{if(validDuplicate)delete (validDuplicate as {secrets?:unknown}).secrets;await runtime.stop('CANCELLED');await rm(directory,{recursive:true,force:true});}
});

it('uses structural login signature only; a passing registration assertion remains passing', async () => {
  const h = await observed('/registration'); expect(loginRequiredSignature(h.observation)).toBe(true);
  expect(page.url()).toBe(fixture.origin + '/registration');
});

it('settles a protected redirect on the reached login document instead of timing out', async () => {
  const guided=await launchGuidedBrowser({sessionId:'protected-redirect',scopeHash:'d'.repeat(64),allowedDomains: TEST_DOMAINS,knownSecrets:[]},'redirect-context',()=>undefined);
  try {await gotoPage(guided, fixture.origin+'/reports');const reached=(await guided.observations.observe()).observation;expect(reached.coverage.passwordControls).toBe(1);expect(loginRequiredSignature(reached)).toBe(true);expect((present(guided.handle).page as unknown as Page).url()).toBe(fixture.origin+'/login');}
  finally {await guided.observations.dispose();await guided.close();}
});

// These are real adapter/executor oracles, separate from learned/publication/Core proof.
// A missing target on a login document is annotated LOGIN_REQUIRED; the annotation never changes the failure into anything else.
// Neither path injects an adapter refusal or changes production error taxonomy.
async function runLoginRequiredOracle(mode: 'no-login' | 'wrong-password' | 'registration', collision: boolean): Promise<void> {
  const caseFixture = await startSecretLoginFixture(CANARY, {reportsRoleCollision:collision});
  const directory = await mkdtemp(join(tmpdir(), 'secret-login-required-'));
  prepareBrowserProfile(directory);
  const scope: Scope = {...publication.job.binding.scope as Scope, initialContext:{kind:'initialBlank'}};
  
  const handle = await playwrightBrowserFactory.launch({allowedDomains: TEST_DOMAINS, browser:'chromium', scratchPath:directory, observedScope:scope, viewport:{width:800,height:600}, recording:{width:800,height:600}});
  const stepId = (index: number) => '00000000-0000-4000-8000-' + String(201 + index).padStart(12, '0');
  const wrong = mode === 'wrong-password', registration = mode === 'registration';
  const targetIndex = wrong ? 3 : 1;
  const inputs: Execute3['inputs'][number][] = [{inputId:'nav', stepId:stepId(0), kind:'destination', value:caseFixture.origin + (registration ? '/registration' : wrong ? '/login' : '/reports')}];
  const steps: Execute3['steps'][number][] = [{stepIndex:0, stepId:stepId(0), operations:[{coordinate:{stepId:stepId(0), ordinal:0}, guardId:'g0', operation:stepOp('await page.goto(inputs["nav"]);', { uses: [{ kind: 'input', id: 'nav' }] })}]}];
  const guards: Execute3['guards'][number][] = [{guardId:'g0', origin:null}];
  if (wrong) {
    inputs.push({inputId:'pass', stepId:stepId(1), kind:'secretRef', referenceName:'PASS'});
    steps.push({stepIndex:1, stepId:stepId(1), operations:[{coordinate:{stepId:stepId(1), ordinal:0}, guardId:'g1', operation:stepOp('await page.locator(\'input[type="password"]\').fill(secrets["PASS"]);', { uses: [{ kind: 'secret', id: 'PASS' }] })}]}, {stepIndex:2, stepId:stepId(2), operations:[{coordinate:{stepId:stepId(2), ordinal:0}, guardId:'g2', operation:stepOp('await page.getByRole("button", { name: "Sign in", exact: true }).click();')}]});
    guards.push({guardId:'g1', origin:caseFixture.origin}, {guardId:'g2', origin:caseFixture.origin});
  }
  if (registration) {
    inputs.push({inputId:'registration', stepId:stepId(targetIndex), kind:'nonsecretText', value:caseFixture.origin + '/registration'});
    steps.push({stepIndex:targetIndex, stepId:stepId(targetIndex), operations:[{coordinate:{stepId:stepId(targetIndex), ordinal:0}, guardId:'g1', operation:stepOp('await expect(page).toHaveURL(inputs["registration"]);', { uses: [{ kind: 'input', id: 'registration' }] })}]});
    guards.push({guardId:'g1', origin:caseFixture.origin});
  } else {
    steps.push({stepIndex:targetIndex, stepId:stepId(targetIndex), operations:[{coordinate:{stepId:stepId(targetIndex), ordinal:0}, guardId:'g' + String(targetIndex), operation:stepOp('await page.getByRole("link", { name: "Reports", exact: true }).click();')}]});
    guards.push({guardId:'g' + String(targetIndex), origin:caseFixture.origin});
    const after = targetIndex + 1;
    inputs.push({inputId:'after', stepId:stepId(after), kind:'nonsecretText', value:caseFixture.origin + '/reports'});
    steps.push({stepIndex:after, stepId:stepId(after), operations:[{coordinate:{stepId:stepId(after), ordinal:0}, guardId:'g' + String(after), operation:stepOp('await expect(page).toHaveURL(inputs["after"]);', { uses: [{ kind: 'input', id: 'after' }] })}]});
    guards.push({guardId:'g' + String(after), origin:caseFixture.origin});
  }
  const message: Execute3 = {...publication.execute as Execute3, profileHash:hashObserved(OBSERVED_PROFILE), stepTimeoutMs:5000, inputs, steps, guards, bindings:[], transfers:[], secrets:wrong ? {PASS:CANARY + '-wrong'} : {}, secretOrigins:wrong ? {PASS:[caseFixture.origin]} : {}};
  const started: StepStartedEvent[] = [], finished: StepFinishedEvent[] = [];
  const adapter = createObservedReplayAdapter(handle, scope, TEST_DOMAINS, 'login-required-' + mode, () => undefined);
  try {
    const result = await executeObservedReplay(message, adapter, scope, TEST_DOMAINS, {now:()=>performance.now()}, {stepStarted(event){started.push(event);}, stepFinished(event){finished.push(event);}}, new AbortController().signal);
    const actualPage = handle.page as unknown as Page;
    expect(actualPage.url()).toBe(caseFixture.origin + (registration ? '/registration' : '/login'));
    expect(caseFixture.receipts()).toHaveLength(wrong ? 1 : 0);
    if (wrong) {
      expect(caseFixture.receipts()[0]).toMatchObject({accepted:false, password:CANARY + '-wrong'});
      expect(finished[1]).toMatchObject({stepIndex:1, status:'PASS', failure:null});
      expect(result.secretUse).toEqual({PASS:'USED'});
    } else expect(result.secretUse).toEqual({});
    if (registration) {
      expect(result).toMatchObject({ok:true, errorCode:null});
      expect(result.detail).toBeUndefined();
      expect(finished.map(event=>event.status)).toEqual(['PASS','PASS']);
    } else {
      expect(adapter.loginRequired?.()).toBe(true);
      // A failed step on a document that carries the structural login signature is annotated LOGIN_REQUIRED whether or not the role
      // collision fixture is on: the annotation reads the document, not the target.
      expect(result).toMatchObject({ok:false, errorCode:'LOGIN_REQUIRED', detail:{stepId:stepId(targetIndex), loginStepsPresent:wrong}});
      expect(finished[targetIndex]).toMatchObject({status:'FAIL', failure:'LOGIN_REQUIRED', detail:{stepId:stepId(targetIndex), loginStepsPresent:wrong}});
      expect(finished[targetIndex + 1]).toMatchObject({status:'SKIPPED', startedAtMs:null, finishedAtMs:null, durationMs:null, failure:null});
      expect(started.map(event=>event.stepIndex)).toEqual(Array.from({length:targetIndex + 1}, (_, index)=>index));
    }
    for (const value of [CANARY, encodeURIComponent(CANARY), Buffer.from(CANARY).toString('base64')]) expect(JSON.stringify({result,started,finished})).not.toContain(value);
    const profileCanaryHits = await scan(directory); expect(profileCanaryHits).toEqual([]);
    const video = await handle.close(); expect(video).toMatch(/\.webm$/u);
    if (!video) throw new Error('VIDEO'); const native = await readFile(video); expect(native.byteLength).toBeGreaterThan(8);
    await writeFile(evidencePath('STUDIO-OBS-007/runner-login-collision-candidate/oracle-' + mode + '-' + (collision ? 'collision' : 'default') + '.json'), JSON.stringify({mode, reportsRoleCollision:collision, actualAdapter:true, actualChromium:true, reachedUrl:actualPage.url(), result, started, finished, receiptCount:caseFixture.receipts().length, rejectedReceiptCount:caseFixture.receipts().filter(receipt=>!receipt.accepted).length, profileCanaryHits, nativeVideo:{path:video, bytes:native.byteLength, sha256:createHash('sha256').update(native).digest('hex')}, learnedPublishedCoreProof:false}, null, 2) + '\n');
  } finally {await adapter.dispose(); await handle.dispose(); await caseFixture.close(); await rm(directory, {recursive:true, force:true});}
}

it.each(['no-login', 'wrong-password', 'registration'] as const)('executes the actual replay LOGIN_REQUIRED oracle: %s', async mode => {
  await runLoginRequiredOracle(mode, false);
});

it.each(['/two-passwords','/no-password'] as const)('replays the published password-only guard against %s and refuses before typing',async path=>{
  const directory=await mkdtemp(join(tmpdir(),'secret-replay-refusal-'));prepareBrowserProfile(directory);
  const scope:Scope={...publication.job.binding.scope as Scope,initialContext:{kind:'initialBlank'}};
  
  const handle=await playwrightBrowserFactory.launch({allowedDomains: TEST_DOMAINS, browser:'chromium',scratchPath:directory,observedScope:scope,viewport:{width:800,height:600},recording:{width:800,height:600}});
  const navId='00000000-0000-4000-8000-000000000101',passId='00000000-0000-4000-8000-000000000102';
  const message:Execute3={...publication.execute as Execute3,profileHash:hashObserved(OBSERVED_PROFILE),inputs:[{inputId:'nav',stepId:navId,kind:'destination',value:fixture.origin+path},{inputId:'pass',stepId:passId,kind:'secretRef',referenceName:'PASS'}],secrets:{PASS:CANARY},secretOrigins:{PASS:[fixture.origin]},bindings:[],transfers:[],steps:[{stepIndex:0,stepId:navId,operations:[{coordinate:{stepId:navId,ordinal:0},guardId:'g0',operation:stepOp('await page.goto(inputs["nav"]);', { uses: [{ kind: 'input', id: 'nav' }] })}]},{stepIndex:1,stepId:passId,operations:[{coordinate:{stepId:passId,ordinal:0},guardId:'g1',operation:stepOp('await page.locator(\'input[type="password"]\').fill(secrets["PASS"]);', { uses: [{ kind: 'secret', id: 'PASS' }] })}]}],guards:[{guardId:'g0',origin:null},{guardId:'g1',origin:fixture.origin}]};
  try{const adapter=createObservedReplayAdapter(handle, scope, TEST_DOMAINS,'password-refusal',()=>undefined);const result=await executeObservedReplay(message,adapter,scope, TEST_DOMAINS,{now:()=>performance.now()},{stepStarted(){return;},stepFinished(){return;}},new AbortController().signal);
    expect(result).toMatchObject({ok:false,errorCode:'TARGET_DRIFT',secretUse:{PASS:'REFUSED'}});const actualPage=handle.page as unknown as Page;expect(await actualPage.locator('input[type=password]').evaluateAll(elements=>elements.map(element=>(element as HTMLInputElement).value))).toEqual(path==='/two-passwords'?['','']:[]);expect(fixture.receipts()).toEqual([]);
  }finally{await handle.dispose();await rm(directory,{recursive:true,force:true});}
});

it('replays login twice without a model, records distinct receipts/video and uses rotated values', async () => {
  for (const [index, value] of [CANARY, CANARY + '-rotated'].entries()) {
    fixture.rotate(value);
    const directory = await mkdtemp(join(tmpdir(), 'secret-replay-')); prepareBrowserProfile(directory);
    const scope: Scope = {...publication.job.binding.scope as Scope, initialContext: {kind: 'initialBlank'}};
    
    const handle = await playwrightBrowserFactory.launch({allowedDomains: TEST_DOMAINS, browser: 'chromium', scratchPath: directory, observedScope: scope, viewport: {width: 800, height: 600}, recording: {width: 800, height: 600}});
    const frame: Execute3 = {
      kind: 'execute', protocolVersion: 3, mode: 'observed', runId: publication.execute.runId, attemptId: publication.execute.attemptId, profileHash: hashObserved(OBSERVED_PROFILE), configurationHash: 'c'.repeat(64), waitStrategy: 'domcontentloaded', stepTimeoutMs: 5000,
      inputs: [{inputId: 'nav', stepId: '00000000-0000-4000-8000-000000000101', kind: 'destination', value: fixture.origin + '/login'}, {inputId: 'pass', stepId: '00000000-0000-4000-8000-000000000102', kind: 'secretRef', referenceName: 'PASS'}, {inputId: 'home', stepId: '00000000-0000-4000-8000-000000000104', kind: 'nonsecretText', value: fixture.origin + '/home'}],
      secrets: {PASS: value, UNREACHED: 'never-typed'}, secretOrigins: {PASS: [fixture.origin]}, bindings: [], transfers: [],
      steps: [
        {stepIndex: 0, stepId: '00000000-0000-4000-8000-000000000101', operations: [{coordinate: {stepId: '00000000-0000-4000-8000-000000000101', ordinal: 0}, guardId: 'g0', operation: stepOp('await page.goto(inputs["nav"]);', { uses: [{ kind: 'input', id: 'nav' }] })}]},
        {stepIndex: 1, stepId: '00000000-0000-4000-8000-000000000102', operations: [{coordinate: {stepId: '00000000-0000-4000-8000-000000000102', ordinal: 0}, guardId: 'g1', operation: stepOp('await page.locator(\'input[type="password"]\').fill(secrets["PASS"]);', { uses: [{ kind: 'secret', id: 'PASS' }] })}]},
        {stepIndex: 2, stepId: '00000000-0000-4000-8000-000000000103', operations: [{coordinate: {stepId: '00000000-0000-4000-8000-000000000103', ordinal: 0}, guardId: 'g2', operation: stepOp('await page.getByRole("button", { name: "Sign in", exact: true }).click();')}]},
        {stepIndex: 3, stepId: '00000000-0000-4000-8000-000000000104', operations: [{coordinate: {stepId: '00000000-0000-4000-8000-000000000104', ordinal: 0}, guardId: 'g3', operation: stepOp('await expect(page).toHaveURL(inputs["home"]);', { uses: [{ kind: 'input', id: 'home' }] })}]},
      ],
      guards: [{guardId: 'g0', origin: null}, {guardId: 'g1', origin: fixture.origin}, {guardId: 'g2', origin: fixture.origin}, {guardId: 'g3', origin: fixture.origin}],
    };
    const adapter = createObservedReplayAdapter(handle, scope, TEST_DOMAINS, `replay-${String(index)}`, () => undefined);
    try {
      const result = await executeObservedReplay(frame, adapter, scope, TEST_DOMAINS, {now: () => performance.now()}, {stepStarted() { return; }, stepFinished() { return; }}, new AbortController().signal);
      expect(result).toMatchObject({ok: true, errorCode: null, secretUse: {PASS: 'USED', UNREACHED: 'NOT_USED'}});
      expect(fixture.receipts().at(-1)).toMatchObject({accepted: true, password: value});
      expect(await scan(directory)).toEqual([]);
      const video = await handle.close(); expect(video).toMatch(/\.webm$/u); if (!video) throw new Error('VIDEO'); expect((await readFile(video)).byteLength).toBeGreaterThan(8);
    } finally { await handle.dispose(); await rm(directory, {recursive: true, force: true}); }
  }
  const receipts = fixture.receipts(); expect(receipts).toHaveLength(2); expect(receipts[0]?.id).not.toBe(receipts[1]?.id);
  fixture.rotate(CANARY);
});


// R1 native prefix companions. Released frames and local admitted ledgers are fixture facts,
// not TestVault RELEASE/USAGE/JWT/PG authority. Backend B2 must run those original companions.
import {createGuidedRecorder} from '../../src/guided/evidence.js';
import {withObservedNativeEvidence} from '../helpers/observedNativeEvidence.js';
import type {RecordingEvidenceBody} from '../../src/guided/evidence.js';
import {createConfiguredObjectStore,evidenceBoundsFrom,NODE_EVIDENCE_FILE_SYSTEM} from '../../src/run/objectStoreFactory.js';
import {loadEvidenceConfig} from '../../src/server/config.js';
import {systemOriginSource} from '../../src/run/timeline.js';
import type {GuidedBrowser} from '../../src/run/guidedBrowser.js';
import type {BridgePrefixPrepare,ExecutionEvidence,PrefixAction,Ledger,BridgeNativeFenceEvent} from '../../src/guided/types.js';
import {evidencePath} from '../helpers/evidenceOut.js';
const secretPrefixIds=['00000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000803'] as const;
function present<T>(value:T|undefined|null):T {if(value===undefined||value===null)throw Error('MISSING_SECRET_NATIVE_FACT');return value;}
interface CapturedPrivateClose {browser:GuidedBrowser;facts:{attempts:number;reached:boolean;passed:boolean;failed:boolean;emptyInputs?:boolean;hits?:string[];error?:unknown}}
function capturePrivateClose(original:GuidedBrowser,probe:ChildPage,onEmpty?:(value:boolean)=>void):CapturedPrivateClose {
  const facts:CapturedPrivateClose['facts']={attempts:0,reached:false,passed:false,failed:false};let closing:Promise<void>|undefined;
  return {facts,browser:{...original,close:()=>{closing??=(async()=>{facts.attempts++;facts.reached=true;try{
    const root=present(original.scratchDirectory),info=await lstat(root);expect(info.isDirectory()&&!info.isSymbolicLink()).toBe(true);
    facts.emptyInputs=await probe.allEmpty('input');onEmpty?.(facts.emptyInputs);
    facts.hits=await scan(root);expect(facts.hits).toEqual([]);facts.passed=true;
  }catch(error){facts.failed=true;facts.error=error;throw error;}finally{await original.close();}})();return closing;}}};
}
function assertPrivateClose(captured:CapturedPrivateClose|undefined):void {
  const facts=present(captured).facts;expect(facts.attempts).toBe(1);expect(facts.reached).toBe(true);if(facts.failed)throw facts.error;expect(facts.passed).toBe(true);expect(facts.hits).toEqual([]);
}
type NativeJournalRow={kind:'consumed';digest:string}|{kind:'fence';event:BridgeNativeFenceEvent};
function nativeJournal(text:string):NativeJournalRow[] {
  if(!text.endsWith('\n')||Buffer.byteLength(text)>1048576)throw Error('INVALID_NATIVE_JOURNAL');
  const rows:NativeJournalRow[]=[],consumed=new Set<string>(),fenced=new Set<string>();
  for(const line of text.slice(0,-1).split('\n')){
    if(/^[0-9a-f]{64}$/u.test(line)){if(consumed.has(line))throw Error('DUPLICATE_NATIVE_CONSUMPTION');consumed.add(line);rows.push({kind:'consumed',digest:line});}
    else{const event=validate<BridgeNativeFenceEvent>('bridge',parseWireJson(Buffer.from(line)),'NativeFenceEvent');if(fenced.has(event.admissionId))throw Error('DUPLICATE_NATIVE_FENCE');fenced.add(event.admissionId);rows.push({kind:'fence',event});}
  }
  return rows;
}
function consumption(context:{sessionId:string;contextId:string;ownerFence:number},ledger:Ledger):Extract<NativeJournalRow,{kind:'consumed'}> {return {kind:'consumed',digest:hash({sessionId:context.sessionId,contextId:context.contextId,ownerFence:context.ownerFence,admissionId:ledger.admission.admissionId})};}
function invoking(context:{sessionId:string;contextId:string;ownerFence:number},ledger:Ledger):NativeJournalRow {return {kind:'fence',event:{schemaVersion:3,sessionId:context.sessionId,contextId:context.contextId,ownerFence:context.ownerFence,admissionId:ledger.admission.admissionId,operationHash:ledger.operationHash,state:'INVOKING',receiptHash:null}};}
type SecretPrefixFault='valid'|'bad-origin'|'zero-password'|'two-passwords'|'focus-typeflip'|'oversize-frame'|'stopped-lease';
it.each(['valid','bad-origin','zero-password','two-passwords','focus-typeflip','oversize-frame','stopped-lease'] as const)('executes actual recorded password-only prefix guard: %s',async(fault:SecretPrefixFault)=>{
  fixture.rotate(CANARY);const directory=await mkdtemp(join(tmpdir(),'secret-prefix-native-'));
  const context=guidedContext(fixture.origin);context.sourceRevision='1';context.configurationRevision='1';context.sourceStepIds=[...secretPrefixIds];context.allocations=[];
  const path=fault==='zero-password'?'/no-password':fault==='two-passwords'?'/two-passwords':fault==='focus-typeflip'?'/trap':'/login';
  context.authoredInputs.sourceRevision='1';context.authoredInputs.configurationRevision='1';context.authoredInputs.inputs=[{inputId:'prefix-destination',sourceStepId:secretPrefixIds[0],kind:'destination',value:fixture.origin+path,provenance:{referenceKind:'configuration',configurationRevision:'1',stepId:secretPrefixIds[0],referenceId:'prefix-url',kind:'destination'}},{inputId:'prefix-password',sourceStepId:secretPrefixIds[1],kind:'secretRef',secretId:'PASS',provenance:{referenceKind:'configuration',configurationRevision:'1',stepId:secretPrefixIds[1],referenceId:'password-reference',referenceName:'PASS',kind:'secretRef'}}];context.authoredInputsHash=hash(context.authoredInputs);
  const nav={coordinate:{stepId:secretPrefixIds[0],ordinal:0},origin:null,operation:stepOp('await page.goto(inputs["prefix-destination"]);',{uses:[{kind:'input',id:'prefix-destination'}]})},fill={coordinate:{stepId:secretPrefixIds[1],ordinal:0},origin:fixture.origin,operation:stepOp('await page.locator(\'input[type="password"]\').fill(secrets["PASS"]);',{uses:[{kind:'secret',id:'PASS'}]})};
  const actions:PrefixAction[]=[{...nav,operationHash:hash(nav),guard:{guardId:'g0',origin:null}},{...fill,operationHash:hash(fill),guard:{guardId:'g1',origin:fixture.origin}}];context.prefixProgram={schemaVersion:3,baseRevisionId:randomUUID(),baseRevisionDigest:hash(actions),sourceStepIds:secretPrefixIds.slice(0,2),actions};context.prefixProgramHash=hash(context.prefixProgram);
  const settings=loadEvidenceConfig({STUDIO_RUNNER_OBJECT_STORE_DIR:join(directory,'objects'),STUDIO_RUNNER_SCRATCH_DIR:join(directory,'scratch')}),configured=createConfiguredObjectStore(settings),evidenceRoot=join(directory,'evidence');await mkdir(evidenceRoot,{recursive:true});
  const recorder=createGuidedRecorder({store:configured.store,fileSystem:NODE_EVIDENCE_FILE_SYSTEM,bounds:evidenceBoundsFrom(settings),size:{width:settings.recordingWidth,height:settings.recordingHeight},calibrationOffsetMs:settings.seekOriginCalibrationMs,originSource:systemOriginSource,now:()=>performance.now(),sleep:ms=>new Promise(resolve=>{setTimeout(resolve,ms);}),evidenceRoot});
  const messages:{route:string;body:unknown}[]=[],stderr:string[]=[];let guided:GuidedBrowser|undefined,emptyBeforeClose:boolean|undefined,capturedClose:CapturedPrivateClose|undefined;
  const probingLaunch=guidedChildLauncher({childModulePath:TEST_CHILD.probe});let probe:ChildPage|undefined;
  const launch=vi.fn(async(...args:Parameters<Launch>)=>{const original=await probingLaunch(...args);probe=await childPage();capturedClose=capturePrivateClose(original,probe,empty=>{emptyBeforeClose=empty;});guided=capturedClose.browser;return guided;});
  const runtime=new GuidedRuntime(context,{workerId:context.workerId,allowedDomains: TEST_DOMAINS, journalDirectory:join(directory,'journal'),launch,recorder,csiId:'CSI-123',diagnosticStderr:text=>{stderr.push(text);},callback:(route,body)=>{messages.push({route,body});return Promise.resolve();}});
  let fillAdmission:string|undefined,terminal:BridgeOutcome|undefined,navigationLedger:Ledger|undefined,fillLedger:Ledger|undefined;const initialInputsHash=context.authoredInputsHash;
  const video=join(directory,'objects','studio','CSI-123','guided',context.sessionId+'.webm');
  await withObservedNativeEvidence(directory,`secret-${fault}`,async preserved=>{
    preserved.media('secret-prefix',video);preserved.check('secret-prefix','assertions','RUNNING');
    await runtime.start();const native=present(guided),observationSession=native.observations,nativePage=present(probe);
    const prepare=(coordinate:PrefixAction['coordinate'],evidence:ExecutionEvidence)=>{const request={schemaVersion:3 as const,sessionId:context.sessionId,workerId:context.workerId,ownerFence:context.ownerFence,scopeHash:context.scopeHash,contextId:context.contextId,contextRevision:context.contextRevision,authoredInputsHash:context.authoredInputsHash,sourceRevision:context.sourceRevision,configurationRevision:context.configurationRevision,prefixProgramHash:present(context.prefixProgramHash),coordinate,evidenceHash:hash(evidence)};return {kind:'prefix' as const,request,requestDigest:hash(request)} satisfies BridgePrefixPrepare;};
    const navigation=await runtime.preparePrefix(prepare(nav.coordinate,(messages[0]?.body as BridgeBootstrap).executionEvidence));const navigationRequest=dispatch(context,navigation.proposal,navigation.preparation);navigationLedger=navigationRequest.ledger;expect((await runtime.dispatch(navigationRequest)).ledger.state).toBe('SUCCEEDED');
    const observation=(messages.filter(m=>m.route==='observations').at(-1)?.body as BridgeObservation).observation,evidence:ExecutionEvidence={kind:'observedDocument',sessionId:context.sessionId,contextId:context.contextId,documentId:observation.documentId,generation:observation.generation,origin:observation.origin,observationHash:hash(observation)},request=prepare(fill.coordinate,evidence);
    expect(/passwordControl[^\n]*\[e\d+\]/u.test(observation.outline)).toBe(false);
    {
      expect(observation.coverage.passwordControls).toBe(fault==='zero-password'?0:fault==='two-passwords'?2:1);const prepared=await runtime.preparePrefix(request);
      expect(prepared.proposal.executionEvidence).toEqual(evidence);expect(prepared.preparation.evidenceHash).toBe(hash(evidence));expect(prepared.preparation.authoredInputsHash).toBe(initialInputsHash);
      if(fault!=='zero-password')expect(await nativePage.inputValue('input[name=password]')).toBe('');expect(launch).toHaveBeenCalledOnce();expect(present(guided).observations).toBe(observationSession);
      const message={...dispatch(context,prepared.proposal,prepared.preparation),secrets:[{secretId:'PASS',value:fault==='oversize-frame'?CANARY+'x'.repeat(4097):CANARY,versionId:'controlled-native-frame',allowedOrigins:[fault==='bad-origin'?declaredAliasOrigin:fixture.origin]}]};fillAdmission=message.ledger.admission.admissionId;fillLedger=message.ledger;
      if(fault==='stopped-lease'){
        // Actual owning runtime lease stop, not a claim that a TestVault value was revoked.
        await runtime.stop('LEASE_LOST');await expect(runtime.dispatch(message)).rejects.toThrow('CONTEXT_LOST');
      }else if(fault==='oversize-frame'){
        await expect(runtime.dispatch(message)).rejects.toThrow('SCHEMA');expect(await nativePage.inputValue('input[name=password]')).toBe('');
      }else{
        terminal=await runtime.dispatch(message);expect(()=>validate('bridge',terminal,'outcome')).not.toThrow();expect(message).not.toHaveProperty('secret');
        if(fault==='valid'){
          expect(terminal.ledger).toMatchObject({state:'SUCCEEDED',outcomeCode:'OK',contextRevision:1,authoredInputsHash:initialInputsHash});expect(await nativePage.inputValue('input[type=password]')).toBe(CANARY);
          const next=structuredClone(context);next.contextRevision++;next.materializationRevision++;next.authoredInputs.inputs.push({inputId:'after-secret',sourceStepId:secretPrefixIds[2],kind:'nonsecretText',value:'new-prefix-suffix-input',provenance:{referenceKind:'configuration',configurationRevision:'1',stepId:secretPrefixIds[2],referenceId:'after-secret',kind:'nonsecretText'}});next.authoredInputsHash=hash(next.authoredInputs);
          const deliveryId=randomUUID(),ack=await runtime.update(next,deliveryId);expect(validate('bridge',ack,'ContextAcknowledgement')).toMatchObject({contextRevision:2,contextHash:hash(next),deliveryId});expect(await runtime.update(next,deliveryId)).toEqual(ack);
          expect(terminal.ledger.contextRevision).toBe(1);expect(terminal.ledger.authoredInputsHash).toBe(initialInputsHash);await expect(runtime.preparePrefix(request)).rejects.toThrow('IDENTITY_MISMATCH');
        }else{
          // The native isolated-world call has begun; even a trusted prewrite refusal must not
          // turn the durable INVOKING phase into a fake no-invocation receipt or permit retry.
          expect(terminal.ledger).toMatchObject({state:'FAILED'});expect(runtime.accepting).toBe(fault==='two-passwords'||fault==='zero-password');
          // A password count other than one is refused before the fence: the prefix reports drift and the session stays open. Every other fault
          // crossed the native fence, so the session stops and nothing is reported as drift.
          const preFence=fault==='zero-password'||fault==='two-passwords';
          expect(messages.some(m=>(m.body as {kind?:string}).kind==='prefixDrift')).toBe(preFence);if(!preFence)await expect(runtime.dispatch(message)).rejects.toThrow();
        }
      }
      delete (message as {secrets?:unknown}).secrets;
    }
    expect(launch).toHaveBeenCalledOnce();expect(present(guided).observations).toBe(observationSession);expect(fixture.receipts()).toEqual([]);
    if(runtime.accepting&&fault!=='valid')expect(await nativePage.allEmpty('input[name=password]')).toBe(true);
    for(const sink of [JSON.stringify(messages),stderr.join('')])for(const value of [CANARY,encodeURIComponent(CANARY),Buffer.from(CANARY).toString('base64')])expect(sink).not.toContain(value);
  },async preserved=>{try{await runtime.stop('CANCELLED');await runtime.recordingSettled;}finally{configured.close();preserved.recording('secret-prefix',messages.find(m=>m.route==='recording-evidence')?.body as RecordingEvidenceBody|undefined);preserved.outcome('secret-prefix',terminal?.ledger);}},()=>rm(directory,{recursive:true,force:true}),async preserved=>{
    const recording=messages.find(m=>m.route==='recording-evidence')?.body as RecordingEvidenceBody;expect(recording.state).toBe('STORED');expect(JSON.stringify(recording)).not.toContain(CANARY);expect(emptyBeforeClose).toBe(fault!=='valid');assertPrivateClose(capturedClose);
    const journal=nativeJournal(await readFile(join(directory,'journal',hash(context.sessionId)+'.journal'),'utf8')),navLedger=present(navigationLedger),expected:NativeJournalRow[]=[{kind:'consumed',digest:hash({contextId:context.contextId,sessionId:context.sessionId})},consumption(context,navLedger),invoking(context,navLedger)];
    const preFenceRefusal=fault==='zero-password'||fault==='two-passwords';
    if(fault!=='oversize-frame'&&fault!=='stopped-lease'){const fill=present(fillLedger),fence=invoking(context,fill);expected.push(consumption(context,fill),preFenceRefusal&&fence.kind==='fence'?{kind:'fence',event:{...fence.event,state:'REFUSED_BEFORE_INVOCATION',receiptHash:expect.any(String) as unknown as string}}:fence);}
    expect(journal).toEqual(expected);
    const fillFences=journal.filter(row=>row.kind==='fence'&&fillAdmission!==undefined&&row.event.admissionId===fillAdmission&&row.event.state==='INVOKING');expect(fillFences).toHaveLength(fault!=='oversize-frame'&&fault!=='stopped-lease'&&!preFenceRefusal?1:0);
    const fillTiming=recording.timings.find(t=>t.admissionId===fillAdmission);
    if(fault==='valid'){expect(fillTiming?.endMs).not.toBeNull();expect(fillTiming).toBeDefined();}
    else if(fault!=='oversize-frame'&&fault!=='stopped-lease'&&!preFenceRefusal){expect(fillTiming).toBeDefined();expect(fillTiming?.endMs).toBeNull();}
    else expect(fillTiming).toBeUndefined();
    expect((await readFile(video)).byteLength).toBeGreaterThan(1024);expect(await scan(directory)).toEqual([]);
    // Only the unchanged password-only/empty-before-close/profile/message/media privacy
    // assertions above authorize export of this masked original. Failures keep it private.
    preserved.verifyMaskedSecretVideo();preserved.check('secret-prefix','assertions','PASSED');
  });
});
