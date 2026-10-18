// eslint-disable-next-line no-restricted-imports -- Actual controlled Chromium oracle.
import type { Page } from 'playwright';
import { createHash,randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it,vi } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile,realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { playwrightBrowserFactory, launchGuidedBrowser } from '../../src/run/browser.js';
import { prepareBrowserProfile } from '../../src/run/scratchLayout.js';
import type { BrowserHandle } from '../../src/run/browserFactory.js';
import type { ObservationSession, PasswordTarget } from '../../src/run/observationTypes.js';
import { startSecretLoginFixture } from '../fixtures/secret-login/server.js';
import { createObservedReplayAdapter } from '../../src/run/observedReplayAdapter.js';
import { executeObservedReplay } from '../../src/executor/observedReplay.js';
import type { StepFinishedEvent, StepStartedEvent } from '../../src/executor/stepReporter.js';
import type { Execute3, Scope, TrustedPolicy } from '../../src/executor/observedOperations.js';
import { hashObserved, OBSERVED_PROFILE } from '../../src/validator/observedReferencePolicy.js';
import { createRedactor } from '../../src/executor/redaction.js';
import { loginRequiredSignature } from '../../src/run/loginRequired.js';
import {GuidedRuntime} from '../../src/guided/runtime.js';
import {guidedContext,proposal,dispatch,withContextPolicy} from '../helpers/guided.js';
import {hash,identity,validate} from '../../src/guided/contracts.js';
import type {BridgeBootstrap,BridgeObservation,BridgeOrdinaryOutcome as BridgeOutcome} from '../../src/guided/types.js';
import {publicationFixture as publication} from '../helpers/publicationFixture.js';

const CANARY = 'obs007-Chromium-canary-4f19';
let fixture: Awaited<ReturnType<typeof startSecretLoginFixture>>, scratch: string, browser: BrowserHandle, page: Page, declaredAliasOrigin: string;
const sessions: ObservationSession[] = [];
beforeAll(async () => {
  fixture = await startSecretLoginFixture(CANARY); scratch = await mkdtemp(join(tmpdir(), 'secret-login-oracle-'));
  prepareBrowserProfile(scratch);
  const alias = new URL(fixture.origin); alias.hostname = 'localhost'; declaredAliasOrigin = alias.origin;
  browser = await playwrightBrowserFactory.launch({ browser: 'chromium', scratchPath: scratch,observedScope:{...publication.job.binding.scope as Scope,policyVersion:'observed-4-full-chromium-1',allowedOrigins:[fixture.origin,declaredAliasOrigin],initialContext:{kind:'initialBlank'}}, viewport: {width: 800, height: 600}, recording: {width: 800, height: 600} });
  page = browser.page as unknown as Page;
});
afterEach(async () => { for (const session of sessions.splice(0)) await session.dispose(); fixture.reset(); await page.goto('about:blank'); });
afterAll(async () => { await browser.dispose(); await fixture.close(); await rm(scratch, {recursive: true, force: true}); });
async function observed(path: string) {
  await page.goto(fixture.origin + path);
  const session = browser.createObservationSession?.({sessionId: 'controlled-login', scopeHash: 'a'.repeat(64), approvedOrigins: [fixture.origin], rules: [], knownSecrets: [], applicationPolicy: {policyRuleId: 'structural', allowStructuralDiscovery: true}});
  if (!session) throw new Error('OBSERVATION_SESSION'); sessions.push(session);
  const observation = (await session.observe()).observation;
  const target: PasswordTarget = {kind: 'passwordControl', documentId: observation.documentId, generation: observation.generation};
  return {session, observation, target};
}
describe('isolated-world password control production boundary', () => {
  it.each([['/login', 1], ['/two-passwords', 2], ['/no-password', 0], ['/shadow-login', 1]] as const)('counts %s without exporting any password node', async (path, count) => {
    const h = await observed(path); expect(h.observation.coverage.passwordControls).toBe(count);
    expect(h.observation.nodes.some(node => node.controlType === 'password')).toBe(false);
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
    expect(export_.observation.nodes).toEqual([]);
  });
  it.each(['nonempty-allowed-exclusion', 'approved-exclusion', 'formless-declared-navigation'] as const)('refuses the native origin boundary at its first guard: %s', async mode => {
    expect(declaredAliasOrigin === fixture.origin).toBe(false);
    await page.goto(fixture.origin + (mode === 'formless-declared-navigation' ? '/no-password' : '/login'));
    if (mode === 'formless-declared-navigation') await page.setContent('<input name="password" type="password">');
    const approvedOrigins = mode === 'approved-exclusion' ? [declaredAliasOrigin] : mode === 'formless-declared-navigation' ? [fixture.origin, declaredAliasOrigin] : [fixture.origin];
    const session = browser.createObservationSession?.({sessionId: 'controlled-origin', scopeHash: 'a'.repeat(64), approvedOrigins, rules: [], knownSecrets: [], applicationPolicy: {policyRuleId: 'structural', allowStructuralDiscovery: true}});
    if (!session) throw new Error('OBSERVATION_SESSION'); sessions.push(session);
    if (mode === 'approved-exclusion') {
      // Actual collection refuses before a password observation/target/pin exists.
      await expect(session.observe()).rejects.toMatchObject({message: 'SCOPE_DENIED'});
    } else {
      const observation = (await session.observe()).observation;
      expect(observation.coverage.passwordControls).toBe(1);
      expect(observation.nodes.some(node => node.controlType === 'password')).toBe(false);
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
  const guided = await launchGuidedBrowser({sessionId: 'guided-profile', scopeHash: 'b'.repeat(64), approvedOrigins: [fixture.origin], rules: [], knownSecrets: [], applicationPolicy: {policyRuleId: 'structural', allowStructuralDiscovery: true}}, 'guided-context', () => undefined);
  try { await guided.navigateBlank(fixture.origin + '/login'); const o = (await guided.observations.observe()).observation; const target: PasswordTarget = {kind: 'passwordControl', documentId: o.documentId, generation: o.generation}; await guided.observations.preparePassword?.(target, fixture.origin); await guided.observations.fillPassword?.(target, fixture.origin, [fixture.origin], CANARY); if (!guided.scratchDirectory) throw new Error('PROFILE'); const recordedPreferences=browser.preferenceEvidence, guidedPreferences=guided.preferenceEvidence;if(!recordedPreferences||!guidedPreferences)throw new Error('EFFECTIVE_PREFERENCES');const expectedPreferences={credentialsEnableService:false,autofillProfileEnabled:false,autofillCreditCardEnabled:false,restoreOnStartup:5};expect(recordedPreferences.channel).toBe('chromium');expect(guidedPreferences.channel).toBe('chromium');expect(recordedPreferences.effective).toEqual(expectedPreferences);expect(guidedPreferences.effective).toEqual(expectedPreferences);expect(recordedPreferences.activeProfilePath).toBe(await realpath(join(scratch,'browser-profile','Default')));expect(guidedPreferences.activeProfilePath).toBe(await realpath(join(guided.scratchDirectory,'browser-profile','Default')));const verifiedPreferences=[recordedPreferences,guidedPreferences].every(p=>p.effective.credentialsEnableService===false&&p.effective.autofillProfileEnabled===false&&p.effective.autofillCreditCardEnabled===false&&p.effective.restoreOnStartup===5);expect(verifiedPreferences).toBe(true); const reached = (await guided.observations.observe()).observation; const button = reached.nodes.find(node => node.role === 'button'); if (!button?.locatorHints[0]) throw new Error('SUBMIT'); await guided.observations.invoke?.({target: {...button, locator: button.locatorHints[0]}, operation: {kind: 'click'}, resolvedValue: null, origin: fixture.origin, maxValueBytes: 4096}); expect(fixture.receipts()).toHaveLength(2); expect(fixture.receipts()[1]?.accepted).toBe(true); expect(await scan(guided.scratchDirectory)).toEqual([]); await writeFile(resolve('../docs/qa/evidence/STUDIO-OBS-007/runner-chromium-profile.json'), JSON.stringify({chromiumVersion: page.context().browser()?.version(), observedProfile: join(scratch, 'browser-profile'), guidedProfile: join(guided.scratchDirectory, 'browser-profile'), preCloseCanaryHits: 0, verifiedPreferences, channel:'chromium',effectivePreferences:{recorded:recordedPreferences,guided:guidedPreferences}, preparedPreferencesPath: 'browser-profile/Default/Preferences', effectivePreferenceVerification: 'Four supported keys asserted from actual production startup probe; historical obsolete key remains explicitly superseded', residual: 'Transient Chromium files can rotate while the browser is live; only ENOENT is skipped. Heap strings, browser caches and operator dumps remain operational residuals; video masking is the manual OBS-009 gate.'}, null, 2)+'\n'); }
  finally { await guided.observations.dispose(); await guided.close(); }
});

it('refuses an actual browser launch without the prewritten Preferences file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'missing-preferences-'));
  try { await expect(playwrightBrowserFactory.launch({browser: 'chromium', scratchPath: directory, viewport: {width: 800, height: 600}, recording: {width: 800, height: 600}})).rejects.toThrow('PROFILE_PREFERENCES_REQUIRED'); }
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
  context.authoredInputs.inputs.push({inputId:'input-pass',sourceStepId:'fill',kind:'secretRef',intendedSlot:'fill.value',secretId:'PASS',provenance:{referenceKind:'configuration',configurationRevision:context.configurationRevision,stepId:'fill',referenceId:'reference-pass',referenceName:'PASS',kind:'secretRef',intendedSlot:'fill.value'}});
  context.authoredInputsHash=hash(context.authoredInputs);
  const messages:{route:string;body:unknown}[]=[],stderr:string[]=[],raw:string[]=[];
  const runtime=new GuidedRuntime(context,{workerId:context.workerId,journalDirectory:directory,applicationPolicy:{policyRuleId:'structural',allowStructuralDiscovery:true,readGrants:[]},launch:launchGuidedBrowser,callback:(route,body)=>{messages.push({route,body});return Promise.resolve();},diagnosticStderr:text=>{stderr.push(text);},onRawFailure:error=>{raw.push(error instanceof Error?error.message:'');},...(mode==='injected-released-value'?{beforeSecretFill:(value:string)=>{throw new Error(value+' '+encodeURIComponent(value)+' '+Buffer.from(value).toString('base64')+' '+ '🙂'.repeat(2000));}}:{})});
  try{
    await runtime.start();const bootstrap=messages.find(message=>message.route==='bootstrap-evidence')?.body as BridgeBootstrap;
    const navigation=proposal(context,bootstrap.executionEvidence,'nav',{kind:'navigate',destinationInputId:'input-nav'});
    const preparation=await runtime.prepare({...identity(context),proposal:navigation,requestDigest:hash(navigation),expiresAt:new Date(Date.now()+10000).toISOString()});await runtime.dispatch(dispatch(context,navigation,preparation));
    const observation=(messages.filter(message=>message.route==='observations').at(-1)?.body as BridgeObservation).observation;
    const evidence={kind:'observedDocument' as const,sessionId:context.sessionId,contextId:context.contextId,documentId:observation.documentId,generation:observation.generation,origin:fixture.origin,observationHash:hash(observation)};
    const fill=proposal(context,evidence,'fill',{kind:'fill',value:{kind:'secretRef',sourceInputId:'input-pass'}},{kind:'passwordControl',documentId:observation.documentId,generation:observation.generation});
    const prepared=await runtime.prepare({...identity(context),proposal:fill,requestDigest:hash(fill),expiresAt:new Date(Date.now()+10000).toISOString()});
    const request={...dispatch(context,fill,prepared),secret:{secretId:'PASS',value:CANARY,versionId:'oracle-version',allowedOrigins:[fixture.origin]}};
    const outcome=await runtime.dispatch(request);expect(outcome.ledger.dispatchCount).toBe(1);expect(outcome.ledger.state).toBe(mode==='native-guard'?'FAILED':'UNKNOWN_OUTCOME');expect(()=>validate('bridge',outcome,'outcome')).not.toThrow();
    expect(raw).toHaveLength(1);if(mode==='injected-released-value'){expect(raw[0]).toContain(CANARY);expect(outcome.errorMessage).toContain('[REDACTED]');}else{expect(raw[0]).toBe('TARGET_CHANGED');expect(outcome.errorMessage).toContain('TARGET_CHANGED');}
    expect(request).not.toHaveProperty('secret');expect(Buffer.byteLength(outcome.errorMessage??'')).toBeLessThanOrEqual(2048);expect(stderr).toHaveLength(1);
    const files=await readdir(directory),diagnostic=files.find(file=>file.endsWith('.diagnostic.jsonl')),journal=files.find(file=>file.endsWith('.journal'));if(!diagnostic||!journal)throw new Error('DIAGNOSTIC_SINKS');
    const persisted=await readFile(join(directory,diagnostic),'utf8'),authoritative=await readFile(join(directory,journal),'utf8');
    expect(JSON.parse(persisted.trim())).toEqual({sessionId:context.sessionId,contextId:context.contextId,admissionId:outcome.ledger.admission.admissionId,stepId:'fill',ordinal:0,errorMessage:outcome.errorMessage});
    const callback=messages.filter(message=>message.route==='outcomes').at(-1)?.body as BridgeOutcome;expect(callback.errorMessage).toBe(outcome.errorMessage);
    for(const sink of [JSON.stringify(messages),stderr.join(''),persisted,authoritative])for(const value of [CANARY,encodeURIComponent(CANARY),Buffer.from(CANARY).toString('base64')])expect(sink).not.toContain(value);
    expect(authoritative).not.toContain('errorMessage');expect(fixture.receipts()).toEqual([]);
    await writeFile(resolve('../docs/qa/evidence/STUDIO-OBS-007/runner-diagnostics-'+mode+'.json'),JSON.stringify({mode,actualChromium:true,productionGuidedRuntime:true,rawContainsReleasedCanary:raw[0]?.includes(CANARY),rawErrorObservedBeforeRedaction:true,diagnosticSinks:['callback.errorMessage','diagnosticJSONL','stderr'],redactionBeforeBounds:true,utf8Bytes:Buffer.byteLength(outcome.errorMessage??''),secretFrameDropped:true,authoritativeJournalUnchanged:true,joinedCorePostgres:false,nativeCanaryRequirement:mode==='native-guard'?'OPEN: native trusted collector refused with a code-only error; separate Playwright readonly probe cannot substitute':'injected-hook proof only'},null,2)+'\n');
  }finally{await runtime.stop('CANCELLED');await rm(directory,{recursive:true,force:true});}
});

it('uses structural login signature only; a passing registration assertion remains passing', async () => {
  const h = await observed('/registration'); expect(loginRequiredSignature(h.observation)).toBe(true);
  expect(await h.session.assertPage?.(h.observation, fixture.origin, 'url', fixture.origin + '/registration')).toBe(true);
});

it('settles a protected redirect on the reached login document instead of timing out', async () => {
  const guided=await launchGuidedBrowser({sessionId:'protected-redirect',scopeHash:'d'.repeat(64),approvedOrigins:[fixture.origin],rules:[],knownSecrets:[],applicationPolicy:{policyRuleId:'structural',allowStructuralDiscovery:true}},'redirect-context',()=>undefined);
  try {await guided.navigateBlank(fixture.origin+'/reports');const reached=(await guided.observations.observe()).observation;expect(reached.coverage.passwordControls).toBe(1);expect(loginRequiredSignature(reached)).toBe(true);expect(await guided.observations.assertPage?.(reached,fixture.origin,'url',fixture.origin+'/login')).toBe(true);}
  finally {await guided.observations.dispose();await guided.close();}
});

// These are real adapter/executor oracles, separate from learned/publication/Core proof.
// Default missing targets retain TIMEOUT; opt-in real wrong-role collisions produce drift.
// Neither path injects an adapter refusal or changes production error taxonomy.
async function runLoginRequiredOracle(mode: 'no-login' | 'wrong-password' | 'registration', collision: boolean): Promise<void> {
  const caseFixture = await startSecretLoginFixture(CANARY, {reportsRoleCollision:collision});
  const directory = await mkdtemp(join(tmpdir(), 'secret-login-required-'));
  prepareBrowserProfile(directory);
  const scope: Scope = {...publication.job.binding.scope as Scope, policyVersion:'observed-4-full-chromium-1', allowedOrigins:[caseFixture.origin], initialContext:{kind:'initialBlank'}};
  const policy: TrustedPolicy = {...publication.trustedPolicy as TrustedPolicy, policyVersion:'observed-4-full-chromium-1', allowedOrigins:[caseFixture.origin], rules:[], applicationPolicy:{policyRuleId:'structural', allowStructuralDiscovery:true, readGrants:[]}};
  const handle = await playwrightBrowserFactory.launch({browser:'chromium', scratchPath:directory, observedScope:scope, viewport:{width:800,height:600}, recording:{width:800,height:600}});
  const stepId = (index: number) => '00000000-0000-4000-8000-' + String(201 + index).padStart(12, '0');
  const wrong = mode === 'wrong-password', registration = mode === 'registration';
  const targetIndex = wrong ? 3 : 1;
  const inputs: Execute3['inputs'][number][] = [{inputId:'nav', stepId:stepId(0), kind:'destination', intendedSlot:'navigate.destination', value:caseFixture.origin + (registration ? '/registration' : wrong ? '/login' : '/reports')}];
  const steps: Execute3['steps'][number][] = [{stepIndex:0, stepId:stepId(0), operations:[{coordinate:{stepId:stepId(0), ordinal:0}, guardId:'g0', operation:{kind:'navigate', destinationInputId:'nav'}}]}];
  const guards: Execute3['guards'][number][] = [{guardId:'g0', origin:null, target:{kind:'initialBlank'}}];
  if (wrong) {
    inputs.push({inputId:'pass', stepId:stepId(1), kind:'secretRef', intendedSlot:'fill.value', referenceName:'PASS'});
    steps.push({stepIndex:1, stepId:stepId(1), operations:[{coordinate:{stepId:stepId(1), ordinal:0}, guardId:'g1', operation:{kind:'fill', value:{kind:'secretRef', sourceInputId:'pass'}}}]}, {stepIndex:2, stepId:stepId(2), operations:[{coordinate:{stepId:stepId(2), ordinal:0}, guardId:'g2', operation:{kind:'click'}}]});
    guards.push({guardId:'g1', origin:caseFixture.origin, target:{kind:'passwordControl'}}, {guardId:'g2', origin:caseFixture.origin, target:{kind:'element', locator:{kind:'role', role:'button', name:'Sign in', exact:true}, role:'button', elementType:'button', controlType:'none', classification:'structuralOnly', visible:true, actionable:true, readRuleId:null}});
  }
  if (registration) {
    inputs.push({inputId:'registration', stepId:stepId(targetIndex), kind:'nonsecretText', intendedSlot:'assert.expected', value:caseFixture.origin + '/registration'});
    steps.push({stepIndex:targetIndex, stepId:stepId(targetIndex), operations:[{coordinate:{stepId:stepId(targetIndex), ordinal:0}, guardId:'g1', operation:{kind:'assert', predicate:'url', expected:{kind:'authoredLiteral', sourceInputId:'registration'}}}]});
    guards.push({guardId:'g1', origin:caseFixture.origin, target:{kind:'page'}});
  } else {
    steps.push({stepIndex:targetIndex, stepId:stepId(targetIndex), operations:[{coordinate:{stepId:stepId(targetIndex), ordinal:0}, guardId:'g' + String(targetIndex), operation:{kind:'click'}}]});
    guards.push({guardId:'g' + String(targetIndex), origin:caseFixture.origin, target:{kind:'element', locator:{kind:'role', role:'link', name:'Reports', exact:true}, role:'link', elementType:'link', controlType:'none', classification:'structuralOnly', visible:true, actionable:true, readRuleId:null}});
    const after = targetIndex + 1;
    inputs.push({inputId:'after', stepId:stepId(after), kind:'nonsecretText', intendedSlot:'assert.expected', value:caseFixture.origin + '/reports'});
    steps.push({stepIndex:after, stepId:stepId(after), operations:[{coordinate:{stepId:stepId(after), ordinal:0}, guardId:'g' + String(after), operation:{kind:'assert', predicate:'url', expected:{kind:'authoredLiteral', sourceInputId:'after'}}}]});
    guards.push({guardId:'g' + String(after), origin:caseFixture.origin, target:{kind:'page'}});
  }
  const message: Execute3 = {...publication.execute as Execute3, profileHash:hashObserved(OBSERVED_PROFILE), stepTimeoutMs:5000, inputs, steps, guards, bindings:[], transfers:[], secrets:wrong ? {PASS:CANARY + '-wrong'} : {}, secretOrigins:wrong ? {PASS:[caseFixture.origin]} : {}};
  const started: StepStartedEvent[] = [], finished: StepFinishedEvent[] = [];
  const adapter = createObservedReplayAdapter(handle, scope, policy, 'login-required-' + mode, () => undefined);
  try {
    const result = await executeObservedReplay(message, adapter, scope, {now:()=>performance.now()}, {stepStarted(event){started.push(event);}, stepFinished(event){finished.push(event);}}, new AbortController().signal);
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
      if (collision) {
        expect(result).toMatchObject({ok:false, errorCode:'LOGIN_REQUIRED', detail:{stepId:stepId(targetIndex), loginStepsPresent:wrong}});
        expect(finished[targetIndex]).toMatchObject({status:'FAIL', failure:'LOGIN_REQUIRED', detail:{stepId:stepId(targetIndex), loginStepsPresent:wrong}});
      } else {
        expect(result).toMatchObject({ok:false, errorCode:'TIMEOUT'});
        expect(result.detail).toBeUndefined();
        expect(finished[targetIndex]).toMatchObject({status:'FAIL', failure:'TIMEOUT'});
        expect(finished[targetIndex]?.detail).toBeUndefined();
      }
      expect(finished[targetIndex + 1]).toMatchObject({status:'SKIPPED', startedAtMs:null, finishedAtMs:null, durationMs:null, failure:null});
      expect(started.map(event=>event.stepIndex)).toEqual(Array.from({length:targetIndex + 1}, (_, index)=>index));
    }
    for (const value of [CANARY, encodeURIComponent(CANARY), Buffer.from(CANARY).toString('base64')]) expect(JSON.stringify({result,started,finished})).not.toContain(value);
    const profileCanaryHits = await scan(directory); expect(profileCanaryHits).toEqual([]);
    const video = await handle.close(); expect(video).toMatch(/\.webm$/u);
    if (!video) throw new Error('VIDEO'); const native = await readFile(video); expect(native.byteLength).toBeGreaterThan(8);
    await writeFile(resolve('../docs/qa/evidence/STUDIO-OBS-007/runner-login-collision-candidate/oracle-' + mode + '-' + (collision ? 'collision' : 'default') + '.json'), JSON.stringify({mode, reportsRoleCollision:collision, actualAdapter:true, actualChromium:true, reachedUrl:actualPage.url(), result, started, finished, receiptCount:caseFixture.receipts().length, rejectedReceiptCount:caseFixture.receipts().filter(receipt=>!receipt.accepted).length, profileCanaryHits, nativeVideo:{path:video, bytes:native.byteLength, sha256:createHash('sha256').update(native).digest('hex')}, learnedPublishedCoreProof:false}, null, 2) + '\n');
  } finally {await adapter.dispose(); await handle.dispose(); await caseFixture.close(); await rm(directory, {recursive:true, force:true});}
}

it.each(['no-login', 'wrong-password', 'registration'] as const)('executes the actual replay LOGIN_REQUIRED oracle: %s', async mode => {
  await runLoginRequiredOracle(mode, mode !== 'registration');
});
it.each(['no-login', 'wrong-password'] as const)('retains actual missing-target TIMEOUT without LOGIN_REQUIRED: %s', async mode => {
  await runLoginRequiredOracle(mode, false);
});

it.each(['/two-passwords','/no-password'] as const)('replays the published password-only guard against %s and refuses before typing',async path=>{
  const directory=await mkdtemp(join(tmpdir(),'secret-replay-refusal-'));prepareBrowserProfile(directory);
  const scope:Scope={...publication.job.binding.scope as Scope,policyVersion:'observed-4-full-chromium-1',allowedOrigins:[fixture.origin],initialContext:{kind:'initialBlank'}};
  const policy:TrustedPolicy={...publication.trustedPolicy as TrustedPolicy,policyVersion:'observed-4-full-chromium-1',allowedOrigins:[fixture.origin],rules:[],applicationPolicy:{policyRuleId:'structural',allowStructuralDiscovery:true,readGrants:[]}};
  const handle=await playwrightBrowserFactory.launch({browser:'chromium',scratchPath:directory,observedScope:scope,viewport:{width:800,height:600},recording:{width:800,height:600}});
  const navId='00000000-0000-4000-8000-000000000101',passId='00000000-0000-4000-8000-000000000102';
  const message:Execute3={...publication.execute as Execute3,profileHash:hashObserved(OBSERVED_PROFILE),inputs:[{inputId:'nav',stepId:navId,kind:'destination',intendedSlot:'navigate.destination',value:fixture.origin+path},{inputId:'pass',stepId:passId,kind:'secretRef',intendedSlot:'fill.value',referenceName:'PASS'}],secrets:{PASS:CANARY},secretOrigins:{PASS:[fixture.origin]},bindings:[],transfers:[],steps:[{stepIndex:0,stepId:navId,operations:[{coordinate:{stepId:navId,ordinal:0},guardId:'g0',operation:{kind:'navigate',destinationInputId:'nav'}}]},{stepIndex:1,stepId:passId,operations:[{coordinate:{stepId:passId,ordinal:0},guardId:'g1',operation:{kind:'fill',value:{kind:'secretRef',sourceInputId:'pass'}}}]}],guards:[{guardId:'g0',origin:null,target:{kind:'initialBlank'}},{guardId:'g1',origin:fixture.origin,target:{kind:'passwordControl'}}]};
  try{const adapter=createObservedReplayAdapter(handle,scope,policy,'password-refusal',()=>undefined);const result=await executeObservedReplay(message,adapter,scope,{now:()=>performance.now()},{stepStarted(){return;},stepFinished(){return;}},new AbortController().signal);
    expect(result).toMatchObject({ok:false,errorCode:'POLICY_REFUSED',secretUse:{PASS:'REFUSED'}});const actualPage=handle.page as unknown as Page;expect(await actualPage.locator('input[type=password]').evaluateAll(elements=>elements.map(element=>(element as HTMLInputElement).value))).toEqual(path==='/two-passwords'?['','']:[]);expect(fixture.receipts()).toEqual([]);
  }finally{await handle.dispose();await rm(directory,{recursive:true,force:true});}
});

it('replays login twice without a model, records distinct receipts/video and uses rotated values', async () => {
  for (const [index, value] of [CANARY, CANARY + '-rotated'].entries()) {
    fixture.rotate(value);
    const directory = await mkdtemp(join(tmpdir(), 'secret-replay-')); prepareBrowserProfile(directory);
    const scope: Scope = {...publication.job.binding.scope as Scope, policyVersion:'observed-4-full-chromium-1',allowedOrigins: [fixture.origin], initialContext: {kind: 'initialBlank'}};
    const policy: TrustedPolicy = {...publication.trustedPolicy as TrustedPolicy,policyVersion:'observed-4-full-chromium-1', allowedOrigins: [fixture.origin], rules: [], applicationPolicy: {policyRuleId: 'structural', allowStructuralDiscovery: true, readGrants: []}};
    const handle = await playwrightBrowserFactory.launch({browser: 'chromium', scratchPath: directory, observedScope: scope, viewport: {width: 800, height: 600}, recording: {width: 800, height: 600}});
    const frame: Execute3 = {
      kind: 'execute', protocolVersion: 3, mode: 'observed', runId: publication.execute.runId, attemptId: publication.execute.attemptId, profileHash: hashObserved(OBSERVED_PROFILE), configurationHash: 'c'.repeat(64), waitStrategy: 'domcontentloaded', stepTimeoutMs: 5000,
      inputs: [{inputId: 'nav', stepId: '00000000-0000-4000-8000-000000000101', kind: 'destination', intendedSlot: 'navigate.destination', value: fixture.origin + '/login'}, {inputId: 'pass', stepId: '00000000-0000-4000-8000-000000000102', kind: 'secretRef', intendedSlot: 'fill.value', referenceName: 'PASS'}, {inputId: 'home', stepId: '00000000-0000-4000-8000-000000000104', kind: 'nonsecretText', intendedSlot: 'assert.expected', value: fixture.origin + '/home'}],
      secrets: {PASS: value, UNREACHED: 'never-typed'}, secretOrigins: {PASS: [fixture.origin]}, bindings: [], transfers: [],
      steps: [
        {stepIndex: 0, stepId: '00000000-0000-4000-8000-000000000101', operations: [{coordinate: {stepId: '00000000-0000-4000-8000-000000000101', ordinal: 0}, guardId: 'g0', operation: {kind: 'navigate', destinationInputId: 'nav'}}]},
        {stepIndex: 1, stepId: '00000000-0000-4000-8000-000000000102', operations: [{coordinate: {stepId: '00000000-0000-4000-8000-000000000102', ordinal: 0}, guardId: 'g1', operation: {kind: 'fill', value: {kind: 'secretRef', sourceInputId: 'pass'}}}]},
        {stepIndex: 2, stepId: '00000000-0000-4000-8000-000000000103', operations: [{coordinate: {stepId: '00000000-0000-4000-8000-000000000103', ordinal: 0}, guardId: 'g2', operation: {kind: 'click'}}]},
        {stepIndex: 3, stepId: '00000000-0000-4000-8000-000000000104', operations: [{coordinate: {stepId: '00000000-0000-4000-8000-000000000104', ordinal: 0}, guardId: 'g3', operation: {kind: 'assert', predicate: 'url', expected: {kind: 'authoredLiteral', sourceInputId: 'home'}}}]},
      ],
      guards: [{guardId: 'g0', origin: null, target: {kind: 'initialBlank'}}, {guardId: 'g1', origin: fixture.origin, target: {kind: 'passwordControl'}}, {guardId: 'g2', origin: fixture.origin, target: {kind: 'element', locator: {kind: 'role', role: 'button', name: 'Sign in', exact: true}, role: 'button', elementType: 'button', controlType: 'none', classification: 'structuralOnly', visible: true, actionable: true, readRuleId: null}}, {guardId: 'g3', origin: fixture.origin, target: {kind: 'page'}}],
    };
    const adapter = createObservedReplayAdapter(handle, scope, policy, `replay-${String(index)}`, () => undefined);
    try {
      const result = await executeObservedReplay(frame, adapter, scope, {now: () => performance.now()}, {stepStarted() { return; }, stepFinished() { return; }}, new AbortController().signal);
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
import type {BridgePrefixPrepare,ExecutionEvidence,PrefixAction} from '../../src/guided/types.js';
const secretPrefixIds=['00000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000803'] as const;
function present<T>(value:T|undefined|null):T {if(value===undefined||value===null)throw Error('MISSING_SECRET_NATIVE_FACT');return value;}
type SecretPrefixFault='valid'|'bad-origin'|'zero-password'|'two-passwords'|'focus-typeflip'|'oversize-frame'|'stopped-lease';
it.each(['valid','bad-origin','zero-password','two-passwords','focus-typeflip','oversize-frame','stopped-lease'] as const)('executes actual recorded password-only prefix guard: %s',async(fault:SecretPrefixFault)=>{
  fixture.rotate(CANARY);const directory=await mkdtemp(join(tmpdir(),'secret-prefix-native-'));
  const context=guidedContext(fixture.origin);context.sourceRevision='1';context.configurationRevision='1';context.sourceStepIds=[...secretPrefixIds];context.allocations=[];
  const path=fault==='zero-password'?'/no-password':fault==='two-passwords'?'/two-passwords':fault==='focus-typeflip'?'/trap':'/login';
  context.authoredInputs.sourceRevision='1';context.authoredInputs.configurationRevision='1';context.authoredInputs.inputs=[{inputId:'prefix-destination',sourceStepId:secretPrefixIds[0],kind:'destination',value:fixture.origin+path,intendedSlot:'navigate.destination',provenance:{referenceKind:'configuration',configurationRevision:'1',stepId:secretPrefixIds[0],referenceId:'prefix-url',kind:'destination',intendedSlot:'navigate.destination'}},{inputId:'prefix-password',sourceStepId:secretPrefixIds[1],kind:'secretRef',intendedSlot:'fill.value',secretId:'PASS',provenance:{referenceKind:'configuration',configurationRevision:'1',stepId:secretPrefixIds[1],referenceId:'password-reference',referenceName:'PASS',kind:'secretRef',intendedSlot:'fill.value'}}];context.authoredInputsHash=hash(context.authoredInputs);
  const nav={coordinate:{stepId:secretPrefixIds[0],ordinal:0},origin:null,locator:null,operation:{kind:'navigate' as const,destinationInputId:'prefix-destination'}},fill={coordinate:{stepId:secretPrefixIds[1],ordinal:0},origin:fixture.origin,locator:null,operation:{kind:'fill' as const,value:{kind:'secretRef' as const,sourceInputId:'prefix-password'}}};
  const actions:PrefixAction[]=[{...nav,operationHash:hash(nav),guard:{guardId:'g0',origin:null,target:{kind:'initialBlank'}}},{...fill,operationHash:hash(fill),guard:{guardId:'g1',origin:fixture.origin,target:{kind:'passwordControl'}}}];context.prefixProgram={schemaVersion:3,baseRevisionId:randomUUID(),baseRevisionDigest:hash(actions),sourceStepIds:secretPrefixIds.slice(0,2),actions};context.prefixProgramHash=hash(context.prefixProgram);
  const policy={policyRuleId:'secret-prefix-native',allowStructuralDiscovery:true,readGrants:[]};withContextPolicy(context,policy);
  const settings=loadEvidenceConfig({STUDIO_RUNNER_OBJECT_STORE_DIR:join(directory,'objects'),STUDIO_RUNNER_SCRATCH_DIR:join(directory,'scratch')}),configured=createConfiguredObjectStore(settings),evidenceRoot=join(directory,'evidence');await mkdir(evidenceRoot,{recursive:true});
  const recorder=createGuidedRecorder({store:configured.store,fileSystem:NODE_EVIDENCE_FILE_SYSTEM,bounds:evidenceBoundsFrom(settings),size:{width:settings.recordingWidth,height:settings.recordingHeight},calibrationOffsetMs:settings.seekOriginCalibrationMs,originSource:systemOriginSource,now:()=>performance.now(),sleep:ms=>new Promise(resolve=>{setTimeout(resolve,ms);}),evidenceRoot});
  const messages:{route:string;body:unknown}[]=[],stderr:string[]=[];let guided:GuidedBrowser|undefined,emptyBeforeClose:boolean|undefined;
  const launch=vi.fn(async(...args:Parameters<typeof launchGuidedBrowser>)=>{const original=await launchGuidedBrowser(...args),nativePage=present(original.handle).page as unknown as Page;guided={...original,close:async()=>{try{emptyBeforeClose=await nativePage.locator('input').evaluateAll(elements=>elements.every(element=>(element as HTMLInputElement).value===''));}finally{await original.close();}}};return guided;});
  const runtime=new GuidedRuntime(context,{workerId:context.workerId,journalDirectory:join(directory,'journal'),launch,applicationPolicy:policy,recorder,csiId:'CSI-123',diagnosticStderr:text=>{stderr.push(text);},callback:(route,body)=>{messages.push({route,body});return Promise.resolve();}});
  let fillAdmission:string|undefined,terminal:BridgeOutcome|undefined;const initialInputsHash=context.authoredInputsHash;
  const video=join(directory,'objects','studio','CSI-123','guided',context.sessionId+'.webm');
  await withObservedNativeEvidence(directory,`secret-${fault}`,async preserved=>{
    preserved.media('secret-prefix',video);preserved.check('secret-prefix','assertions','RUNNING');
    await runtime.start();const native=present(guided),handle=present(native.handle),observationSession=native.observations,nativePage=handle.page as unknown as Page;
    const prepare=(coordinate:PrefixAction['coordinate'],evidence:ExecutionEvidence)=>{const request={schemaVersion:3 as const,sessionId:context.sessionId,workerId:context.workerId,ownerFence:context.ownerFence,scopeHash:context.scopeHash,contextId:context.contextId,contextRevision:context.contextRevision,authoredInputsHash:context.authoredInputsHash,sourceRevision:context.sourceRevision,configurationRevision:context.configurationRevision,prefixProgramHash:present(context.prefixProgramHash),coordinate,evidenceHash:hash(evidence)};return {kind:'prefix' as const,request,requestDigest:hash(request)} satisfies BridgePrefixPrepare;};
    const navigation=await runtime.preparePrefix(prepare(nav.coordinate,(messages[0]?.body as BridgeBootstrap).executionEvidence));if(navigation.kind!=='PREPARED')throw Error('NATIVE_NAV_NOT_PREPARED');expect((await runtime.dispatch(dispatch(context,navigation.proposal,navigation.preparation))).ledger.state).toBe('SUCCEEDED');
    const observation=(messages.filter(m=>m.route==='observations').at(-1)?.body as BridgeObservation).observation,evidence:ExecutionEvidence={kind:'observedDocument',sessionId:context.sessionId,contextId:context.contextId,documentId:observation.documentId,generation:observation.generation,origin:observation.origin,observationHash:hash(observation)},request=prepare(fill.coordinate,evidence);
    expect(observation.nodes.some(n=>n.controlType==='password')).toBe(false);
    if(fault==='zero-password'||fault==='two-passwords'){
      expect(observation.coverage.passwordControls).toBe(fault==='zero-password'?0:2);
      await expect(runtime.preparePrefix(request)).rejects.toThrow(fault==='zero-password'?'PASSWORD_TARGET_ABSENT':'PASSWORD_TARGET_AMBIGUOUS');expect(runtime.accepting).toBe(false);
    }else{
      expect(observation.coverage.passwordControls).toBe(1);const prepared=await runtime.preparePrefix(request);if(prepared.kind!=='PREPARED')throw Error('PASSWORD_PREFIX_NOT_PREPARED');
      expect(prepared.proposal.executionEvidence).toEqual(evidence);expect(prepared.preparation.evidenceHash).toBe(hash(evidence));expect(prepared.preparation.authoredInputsHash).toBe(initialInputsHash);
      expect(await nativePage.locator('input[name=password]').inputValue()).toBe('');expect(launch).toHaveBeenCalledOnce();expect(present(guided).handle).toBe(handle);expect(present(guided).observations).toBe(observationSession);
      const message={...dispatch(context,prepared.proposal,prepared.preparation),secret:{secretId:'PASS',value:fault==='oversize-frame'?CANARY+'x'.repeat(4097):CANARY,versionId:'controlled-native-frame',allowedOrigins:[fault==='bad-origin'?declaredAliasOrigin:fixture.origin]}};fillAdmission=message.ledger.admission.admissionId;
      if(fault==='stopped-lease'){
        // Actual owning runtime lease stop, not a claim that a TestVault value was revoked.
        await runtime.stop('LEASE_LOST');await expect(runtime.dispatch(message)).rejects.toThrow('CONTEXT_LOST');
      }else if(fault==='oversize-frame'){
        await expect(runtime.dispatch(message)).rejects.toThrow('SCHEMA');expect(await nativePage.locator('input[name=password]').inputValue()).toBe('');
      }else{
        terminal=await runtime.dispatch(message);expect(()=>validate('bridge',terminal,'outcome')).not.toThrow();expect(message).not.toHaveProperty('secret');
        if(fault==='valid'){
          expect(terminal.ledger).toMatchObject({state:'SUCCEEDED',outcomeCode:'OK',contextRevision:1,authoredInputsHash:initialInputsHash});expect(await nativePage.locator('input[type=password]').inputValue()).toBe(CANARY);
          const next=structuredClone(context);next.contextRevision++;next.materializationRevision++;next.authoredInputs.inputs.push({inputId:'after-secret',sourceStepId:secretPrefixIds[2],kind:'nonsecretText',intendedSlot:'assert.expected',value:'new-prefix-suffix-input',provenance:{referenceKind:'configuration',configurationRevision:'1',stepId:secretPrefixIds[2],referenceId:'after-secret',kind:'nonsecretText',intendedSlot:'assert.expected'}});next.authoredInputsHash=hash(next.authoredInputs);
          const deliveryId=randomUUID(),ack=await runtime.update(next,deliveryId);expect(validate('bridge',ack,'ContextAcknowledgement')).toMatchObject({contextRevision:2,contextHash:hash(next),deliveryId});expect(await runtime.update(next,deliveryId)).toEqual(ack);
          expect(terminal.ledger.contextRevision).toBe(1);expect(terminal.ledger.authoredInputsHash).toBe(initialInputsHash);await expect(runtime.preparePrefix(request)).rejects.toThrow('IDENTITY_MISMATCH');
        }else{
          // The native isolated-world call has begun; even a trusted prewrite refusal must not
          // turn the durable INVOKING phase into a fake no-invocation receipt or permit retry.
          expect(terminal.ledger).toMatchObject({state:'UNKNOWN_OUTCOME',outcomeCode:fault==='bad-origin'?'POLICY_DENIED':'TARGET_CHANGED'});expect(runtime.accepting).toBe(false);
          expect(messages.some(m=>(m.body as {kind?:string}).kind==='prefixDrift')).toBe(false);await expect(runtime.dispatch(message)).rejects.toThrow();
        }
      }
      delete (message as {secret?:unknown}).secret;
    }
    expect(launch).toHaveBeenCalledOnce();expect(present(guided).handle).toBe(handle);expect(present(guided).observations).toBe(observationSession);expect(fixture.receipts()).toEqual([]);
    if(runtime.accepting&&fault!=='valid')expect(await nativePage.locator('input[name=password]').evaluateAll(elements=>elements.every(element=>(element as HTMLInputElement).value===''))).toBe(true);
    for(const sink of [JSON.stringify(messages),stderr.join('')])for(const value of [CANARY,encodeURIComponent(CANARY),Buffer.from(CANARY).toString('base64')])expect(sink).not.toContain(value);
    if(native.scratchDirectory)expect(await scan(native.scratchDirectory)).toEqual([]);
  },async preserved=>{try{await runtime.stop('CANCELLED');await runtime.recordingSettled;}finally{configured.close();preserved.recording('secret-prefix',messages.find(m=>m.route==='recording-evidence')?.body as RecordingEvidenceBody|undefined);preserved.outcome('secret-prefix',terminal?.ledger);}},()=>rm(directory,{recursive:true,force:true}),async preserved=>{
    const recording=messages.find(m=>m.route==='recording-evidence')?.body as RecordingEvidenceBody;expect(recording.state).toBe('STORED');expect(JSON.stringify(recording)).not.toContain(CANARY);expect(emptyBeforeClose).toBe(fault!=='valid');
    const journalName=present((await readdir(join(directory,'journal'))).find(name=>name.endsWith('.journal'))),journal=(await readFile(join(directory,'journal',journalName),'utf8')).trim().split('\n').map(line=>JSON.parse(line) as {admissionId?:string;state?:string});
    const fillFences=journal.filter(event=>fillAdmission!==undefined&&event.admissionId===fillAdmission&&event.state==='INVOKING');expect(fillFences).toHaveLength(fault==='valid'||fault==='bad-origin'||fault==='focus-typeflip'?1:0);
    const fillTiming=recording.timings.find(t=>t.admissionId===fillAdmission);
    if(fault==='valid'){expect(fillTiming?.endMs).not.toBeNull();expect(fillTiming).toBeDefined();}
    else if(fault==='bad-origin'||fault==='focus-typeflip'){expect(fillTiming).toBeDefined();expect(fillTiming?.endMs).toBeNull();}
    else expect(fillTiming).toBeUndefined();
    expect((await readFile(video)).byteLength).toBeGreaterThan(1024);expect(await scan(directory)).toEqual([]);
    // Only the unchanged password-only/empty-before-close/profile/message/media privacy
    // assertions above authorize export of this masked original. Failures keep it private.
    preserved.verifyMaskedSecretVideo();preserved.check('secret-prefix','assertions','PASSED');
  });
});
