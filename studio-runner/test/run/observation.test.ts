import { afterEach, describe, expect, it, vi } from 'vitest';
import { installObservationCollector } from '../../src/run/observationCollector.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { canonicalObservation, exportObservation, observationOptions } from '../../src/run/observationSanitizer.js';
import type { Observation, ObservationConfig, ObservationReadGrant } from '../../src/run/observationTypes.js';

const config: ObservationConfig = { sessionId: 'session', scopeHash: 'a'.repeat(64), approvedOrigins: ['http://127.0.0.1:4173'], rules: [], knownSecrets: [] };
describe('trusted observation policy and canonical export', () => {
  it('accepts only lowering bounded limits and rejects malformed strings/origins/rules', () => {
    expect(observationOptions(config).limits).toEqual({ nodes: 500, depth: 8, bytes: 32768, milliseconds: 50 });
    expect(observationOptions(config).workLimits).toEqual({ elements: 4096, depth: 64 });
    expect(() => observationOptions({ ...config, workLimits: { elements: 4097 } })).toThrow();
    expect(() => observationOptions({ ...config, workLimits: { depth: 65 } })).toThrow();
    for (const limits of [{ nodes: 501 }, { depth: 9 }, { bytes: 32769 }, { milliseconds: 51 }, { nodes: 0 }, { depth: -1 }, { milliseconds: NaN }]) expect(() => observationOptions({ ...config, limits })).toThrow();
    expect(() => observationOptions({ ...config, sessionId: '\ud800' })).toThrow('INVALID_UNICODE');
    expect(() => observationOptions({ ...config, approvedOrigins: ['https://example.com/path'] })).toThrow();
    expect(() => observationOptions({ ...config, rules: [{ testId: 'x', name: 'Name', classification: 'nonsecretApproved', policyRuleId: 'p' }] })).toThrow();
    expect(() => observationOptions({ ...config, rules: [{ testId: 'x', name: 'Name', accessibleName: 'Other', classification: 'nonsecretApproved', policyRuleId: 'p' }] })).toThrow();
  });
  it('exports immutable canonical bytes and hashes compatible with the frozen corpus', () => {
    const fixtures = JSON.parse(readFileSync(new URL('../../../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json', import.meta.url), 'utf8')) as { documents: { observedPage: Observation }; canonicalVector: { json: string; sha256: string } };
    expect(canonicalObservation({ b: 2, a: 'é' })).toBe(fixtures.canonicalVector.json);
    expect(createHash('sha256').update(canonicalObservation({ b: 2, a: 'é' })).digest('hex')).toBe(fixtures.canonicalVector.sha256);
    const observation = fixtures.documents.observedPage;
    const result = exportObservation(observation, 32768);
    expect(result.bytes).toBe(Buffer.byteLength(result.json));
    expect(result.observationHash).toBe(createHash('sha256').update(result.json).digest('hex'));
    expect(Object.isFrozen(result.observation.nodes)).toBe(true);
    expect(() => exportObservation(observation, result.bytes - 1)).toThrow('BUDGET_EXCEEDED');
    expect(canonicalObservation({ z: 'é😀', a: 1 })).toBe('{"a":1,"z":"é😀"}');
    expect(() => canonicalObservation({ a: '\udc00' })).toThrow('INVALID_UNICODE');
    expect(() => canonicalObservation(1.5)).toThrow('INVALID_CONTRACT');
  });
});

// Structural DOM stand-in: the unit tier stays browser-free; Chromium proves the actual DOM below.
class FixtureElement {
  readonly children: FixtureElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly click = vi.fn();
  childNodes: { length: number; item(index: number): { nodeType: number; nodeValue: string } } = { length: 0, item: () => ({ nodeType: 3, nodeValue: '' }) };
  shadowRoot = null;
  nodeType = 1;
  isConnected = true;
  parentElement: FixtureElement | null = null;
  previousElementSibling: FixtureElement | null = null;
  constructor(readonly tagName: string, name = '') {
    if (name) this.childNodes = { length: 1, item: () => ({ nodeType: 3, nodeValue: name }) };
  }
  get firstChild() { return this.childNodes.length ? {...this.childNodes.item(0),nextSibling:null,firstChild:null} : null; }
  getRootNode() { return {}; }
  matches() { return false; }
  getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 }; }
  get lastElementChild() { return this.children.at(-1) ?? null; }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  hasAttribute(name: string) { return this.attributes.has(name); }
  append(child: FixtureElement) { child.parentElement = this; child.previousElementSibling = this.lastElementChild; this.children.push(child); }
}
class FixtureInput extends FixtureElement { value = ''; type = 'text'; checked = false; list = null; }
class FixtureTextarea extends FixtureInput {}
class FixtureSelect extends FixtureInput {}
class FixtureLabel extends FixtureElement { control: FixtureInput | null = null; }

afterEach(() => { vi.unstubAllGlobals(); });
it('enforces policy and visited-element ceilings with a structural DOM, without starting a browser', () => {
  const root = new FixtureElement('HTML');
  const button = new FixtureElement('BUTTON', 'Continue'); button.attributes.set('data-testid', 'go'); root.append(button);
  const field = new FixtureInput('INPUT'); field.value = 'private'; root.append(field);
  vi.stubGlobal('document', { documentElement: root, addEventListener: vi.fn(), removeEventListener: vi.fn(), elementFromPoint: () => button });
  vi.stubGlobal('location', { origin: config.approvedOrigins[0], href: 'http://127.0.0.1:4173/start', assign: vi.fn() });
  vi.stubGlobal('HTMLElement', FixtureElement);
  vi.stubGlobal('getComputedStyle', () => ({ display: 'block', visibility: 'visible' }));
  vi.stubGlobal('MutationObserver', class { observe = vi.fn(); takeRecords() { return []; } disconnect = vi.fn(); });
  vi.stubGlobal('Element', FixtureElement);
  vi.stubGlobal('ShadowRoot', class { readonly host = null; });
  vi.stubGlobal('HTMLInputElement', FixtureInput); vi.stubGlobal('HTMLTextAreaElement', FixtureTextarea);
  vi.stubGlobal('HTMLSelectElement', FixtureSelect); vi.stubGlobal('HTMLLabelElement', FixtureLabel);
  const policy = { ...config, rules: [{ testId: 'go', name: 'Continue', accessibleName: 'Continue', policyRuleId: 'p', classification: 'structuralOnly' as const }] };
  const collector = installObservationCollector(observationOptions(policy));
  const observed = collector.collect({ documentId: 'doc', generation: 1, observedAt: '2026-10-08T00:00:00.000Z' });
  expect(observed.nodes.map(node => node.name)).toEqual(['Continue']);
  const node = observed.nodes[0]; if (!node) throw new Error('missing node');
  expect(collector.matches(node, { kind: 'testId', value: 'go', exact: true })).toBe(true);
  expect(collector.pageMatches(node, config.approvedOrigins[0] ?? '')).toBe(true);
  expect(collector.assertPage(node, config.approvedOrigins[0] ?? '', 'url', 'http://127.0.0.1:4173/start')).toBe(true);
  expect(() => collector.assertPage({ ...node, generation: 2 }, config.approvedOrigins[0] ?? '', 'title', 'wrong')).toThrow('TARGET_CHANGED');
  const action = { target: { ...node, locator: { kind: 'testId' as const, value: 'go', exact: true as const } }, operation: { kind: 'click' as const }, origin: config.approvedOrigins[0] ?? '', resolvedValue: null, maxValueBytes: 4096 };
  expect(collector.validateInvocation(action)).toBe(true);
  expect(collector.nativeTarget(action)).toBe(button);
  vi.stubGlobal('HTMLAnchorElement', class extends FixtureElement {});
  vi.stubGlobal('HTMLButtonElement', class extends FixtureElement {});
  expect(collector.navigationExpected(action)).toBe(false);
  expect(collector.nativePoint(action)).toEqual({ x: 5, y: 5, alreadyChecked: false });
  vi.stubGlobal('innerWidth',100); vi.stubGlobal('innerHeight',100);
  expect(collector.nativeState(action)).toEqual({alreadyChecked:false,requiresReveal:false});
  vi.stubGlobal('innerHeight',1);expect(collector.nativeState(action).requiresReveal).toBe(true);
  expect(collector.acceptReveal(action,button as unknown as Element)).toBe(true);expect(collector.acceptReveal(action,new FixtureElement('BUTTON','Continue') as unknown as Element)).toBe(false);
  vi.stubGlobal('innerHeight',100);
  expect(() => collector.invoke(action)).toThrow('NATIVE_INPUT_REQUIRED');
  expect(() => collector.invoke({ ...action, origin: 'https://different.test' })).toThrow('TARGET_CHANGED');
  expect(() => { collector.navigate(node, config.approvedOrigins[0] ?? '', 'https://different.test'); }).toThrow('TARGET_CHANGED');
  collector.navigate(node, config.approvedOrigins[0] ?? '', 'http://127.0.0.1:4173/next');
  collector.withhold(['never-export']);
  field.value = 'mutated';
  expect(collector.matches(node, { kind: 'testId', value: 'go', exact: true })).toBe(false);
  const boundedCollector = installObservationCollector(observationOptions({ ...policy, workLimits: { elements: 1 } }));
  expect(boundedCollector.collect({ documentId: 'doc', generation: 2, observedAt: '2026-10-08T00:00:00.000Z' }).coverage.reason).toBe('budget');
  const secretCollector = installObservationCollector(observationOptions({ ...policy, knownSecrets: ['Continue'] }));
  expect(secretCollector.collect({ documentId: 'doc', generation: 3, observedAt: '2026-10-08T00:00:00.000Z' }).nodes).toEqual([]);
  field.type = 'checkbox'; field.value = 'on';
  const provenance = installObservationCollector(observationOptions(policy));
  expect(provenance.collect({ documentId: 'doc', generation: 4, observedAt: '2026-10-08T00:00:00.000Z' }).nodes.map(item => item.name)).toEqual(['Continue']);
  field.attributes.set('value', 'on');
  expect(provenance.collect({ documentId: 'doc', generation: 5, observedAt: '2026-10-08T00:00:00.000Z' }).nodes).toEqual([]);
  field.attributes.delete('value');
  const strict = installObservationCollector(observationOptions({ ...policy, knownSecrets: ['on'] }));
  expect(strict.collect({ documentId: 'doc', generation: 6, observedAt: '2026-10-08T00:00:00.000Z' }).nodes).toEqual([]);
  field.type = 'submit'; field.value = 'Continue';
  expect(provenance.collect({ documentId: 'doc', generation: 7, observedAt: '2026-10-08T00:00:00.000Z' }).nodes).toEqual([]); // Earlier strict input value 'on' remains private.
  const freshCaption = installObservationCollector(observationOptions(policy));
  expect(freshCaption.collect({ documentId: 'doc', generation: 7, observedAt: '2026-10-08T00:00:00.000Z' }).nodes.map(item => item.name)).toEqual(['Continue']);
  freshCaption.dispose();
  provenance.dispose(); strict.dispose();
  const privateRegion = new FixtureElement('SECTION','PRIVATE REGION');privateRegion.attributes.set('data-sensitive','');
  root.append(privateRegion);const explicitPrivate=installObservationCollector(observationOptions(policy));explicitPrivate.collect({documentId:'private',generation:1,observedAt:'2026-10-08T00:00:00Z'});
  expect(explicitPrivate.privateInventory()).toContainEqual(['PRIVATE REGION',true]);explicitPrivate.dispose();expect(()=>explicitPrivate.privateInventory()).toThrow('CONTEXT_LOST');expect(()=>{ explicitPrivate.withhold(['late']); }).toThrow('CONTEXT_LOST');
  const toggleRoot=new FixtureElement('HTML');const toggle=new FixtureInput('INPUT');toggle.type='checkbox';toggle.value='on';toggle.attributes.set('data-testid','go');toggle.attributes.set('aria-label','Continue');toggleRoot.append(toggle);
  vi.stubGlobal('document',{documentElement:toggleRoot,addEventListener:vi.fn(),removeEventListener:vi.fn()});
  const toggles=installObservationCollector(observationOptions(policy));const targetNode=toggles.collect({documentId:'toggle',generation:1,observedAt:'2026-10-08T00:00:00Z'}).nodes[0];if(!targetNode)throw new Error('NODE');
  const toggleAction={...action,target:{...targetNode,locator:{kind:'testId' as const,value:'go',exact:true as const}},operation:{kind:'check' as const}};
  expect(toggles.nativeTarget(toggleAction)).toBe(toggle);expect(toggles.confirmToggle(toggleAction,toggle as unknown as Element)).toBe(false);
  toggle.checked=true;expect(toggles.confirmToggle(toggleAction,toggle as unknown as Element)).toBe(true);
  toggle.type='radio';expect(toggles.confirmToggle(toggleAction,toggle as unknown as Element)).toBe(false);toggle.type='checkbox';toggle.isConnected=false;expect(toggles.confirmToggle(toggleAction,toggle as unknown as Element)).toBe(false);toggles.dispose();
  vi.stubGlobal('document',{documentElement:root,addEventListener:vi.fn(),removeEventListener:vi.fn()});
  let clock = 0;
  vi.stubGlobal('performance', { now: () => clock++ });
  const timed = installObservationCollector(observationOptions({ ...policy, limits: { milliseconds: 1 } }));
  expect(timed.collect({ documentId: 'doc', generation: 4, observedAt: '2026-10-08T00:00:00.000Z' }).coverage.reason).toBe('budget');
  collector.dispose(); boundedCollector.dispose(); secretCollector.dispose(); timed.dispose();
});

it.each(['control','text'] as const)('resolves positive region %s grants independently of per-control IDs and keeps inventory private',kind=>{
  const root=new FixtureElement('MAIN');root.attributes.set('aria-label','Operations');
  const source=kind==='control'?new FixtureInput('INPUT'):new FixtureElement('OUTPUT','private-value');if(source instanceof FixtureInput)source.value='private-value';source.attributes.set('aria-label','Source');root.append(source);
  const echo=new FixtureElement('BUTTON','private-value');root.append(echo);
  vi.stubGlobal('document',{documentElement:root,addEventListener:vi.fn(),removeEventListener:vi.fn()});vi.stubGlobal('location',{origin:config.approvedOrigins[0]});vi.stubGlobal('getComputedStyle',()=>({display:'block',visibility:'visible'}));
  vi.stubGlobal('MutationObserver',class{observe=vi.fn();takeRecords(){return [];}disconnect=vi.fn();});vi.stubGlobal('Element',FixtureElement);vi.stubGlobal('HTMLElement',FixtureElement);vi.stubGlobal('ShadowRoot',class{readonly host=null;});vi.stubGlobal('HTMLInputElement',FixtureInput);vi.stubGlobal('HTMLTextAreaElement',FixtureTextarea);vi.stubGlobal('HTMLSelectElement',FixtureSelect);vi.stubGlobal('HTMLLabelElement',FixtureLabel);
  const grant:ObservationReadGrant={policyRuleId:'regional',origin:config.approvedOrigins[0]??'',region:{kind:'role',role:'main',name:'Operations',exact:true},visibleText:{classification:'permittedBusinessData'},controlValue:{classification:'nonsecretApproved',types:['text']}};
  const policy:ObservationConfig={...config,applicationPolicy:{policyRuleId:'structure',allowStructuralDiscovery:true,readGrants:[grant]}};
  const collector=installObservationCollector(observationOptions(policy));const observed=collector.collect({documentId:'doc',generation:1,observedAt:'2026-10-08T00:00:00.000Z'});const node=observed.nodes.find(n=>n.name==='Source');if(!node?.locatorHints[0])throw new Error('SOURCE');
  expect(observed.nodes.map(n=>n.name)).not.toContain('private-value');expect(node.policyRuleId).toBe('regional');
  const operation=kind==='control'?{kind:'read' as const,bindingId:'local',recipe:{kind:'controlValue' as const,classification:'nonsecretApproved' as const,controlType:'text' as const,policyRuleId:'regional'}}:{kind:'read' as const,bindingId:'local',recipe:{kind:'visibleText' as const,classification:'permittedBusinessData' as const,policyRuleId:'regional'}};
  const invocation={target:{...node,locator:node.locatorHints[0]},operation,origin:grant.origin,resolvedValue:null,maxValueBytes:4096};expect(collector.validateInvocation(invocation)).toBe(true);expect(collector.invoke(invocation)).toEqual({value:'private-value'});
  const none=installObservationCollector(observationOptions({...policy,applicationPolicy:{policyRuleId:'structure',allowStructuralDiscovery:true}}));const noneObserved=none.collect({documentId:'doc',generation:1,observedAt:'2026-10-08T00:00:00.000Z'});expect(noneObserved.nodes.find(n=>n.name==='Source')?.classification).toBe('structuralOnly');expect(none.validateInvocation(invocation)).toBe(false);
  const duplicate=new FixtureElement('MAIN');duplicate.attributes.set('aria-label','Operations');root.append(duplicate);const ambiguous=installObservationCollector(observationOptions(policy));expect(ambiguous.collect({documentId:'doc',generation:1,observedAt:'2026-10-08T00:00:00.000Z'}).nodes.find(n=>n.name==='Source')?.classification).toBe('structuralOnly');
  collector.dispose();none.dispose();ambiguous.dispose();
});
it('rejects malformed or excessively broad trusted read grants before installing a collector',()=>{
  const valid={policyRuleId:'grant',origin:config.approvedOrigins[0],region:{kind:'application'},controlValue:{classification:'nonsecretApproved',types:['text']}};
  for(const grants of [[{...valid,controlValue:{classification:'nonsecretApproved',types:['password']}}],[{...valid,origin:'https://outside.test'}],[valid,valid],[{...valid,visibleText:{classification:'structuralOnly'}}],[{...valid,region:{kind:'role',role:'main',name:'Operations',exact:false}}],Array.from({length:33},(_,i)=>({...valid,policyRuleId:`g${String(i)}`}))]){
    const candidate={...config,applicationPolicy:{policyRuleId:'structural',allowStructuralDiscovery:true,readGrants:grants}} as unknown as ObservationConfig;expect(()=>observationOptions(candidate)).toThrow();
  }
});

import type {AcquisitionRequest} from '../../src/run/observationTypes.js';
function acquisitionHarness(extra?:ObservationConfig['workLimits']){
  const root=new FixtureElement('MAIN');root.attributes.set('aria-label','Operations');
  let mutations:object[]=[];
  vi.stubGlobal('document',{documentElement:root,addEventListener:vi.fn(),removeEventListener:vi.fn()});vi.stubGlobal('location',{origin:config.approvedOrigins[0]});
  vi.stubGlobal('getComputedStyle',(element:FixtureElement)=>({display:element.hasAttribute('hidden')?'none':'block',visibility:'visible'}));
  vi.stubGlobal('MutationObserver',class{observe=vi.fn();disconnect=vi.fn();takeRecords(){const found=mutations;mutations=[];return found;}});
  vi.stubGlobal('Element',FixtureElement);vi.stubGlobal('HTMLElement',FixtureElement);vi.stubGlobal('ShadowRoot',class{readonly host=null;});vi.stubGlobal('HTMLInputElement',FixtureInput);vi.stubGlobal('HTMLTextAreaElement',FixtureTextarea);vi.stubGlobal('HTMLSelectElement',FixtureSelect);vi.stubGlobal('HTMLLabelElement',FixtureLabel);
  const policy={...config,applicationPolicy:{policyRuleId:'structural',allowStructuralDiscovery:true},...(extra?{workLimits:extra}:{})};
  const collector=installObservationCollector(observationOptions(policy));let generation=0;
  const collect=()=>collector.collect({documentId:'doc',generation:++generation,observedAt:'2026-10-09T00:00:00.000Z'});
  const request=():AcquisitionRequest=>({documentId:'doc',generation,origin:config.approvedOrigins[0]??'',locator:{kind:'role',role:'button',name:'Confirmation',exact:true},expected:{kind:'element',locator:{kind:'role',role:'button',name:'Confirmation',exact:true},role:'button',elementType:'button',controlType:'none',classification:'structuralOnly',visible:true,actionable:true,readRuleId:null},operation:{kind:'click'}});
  return {root,collector,collect,request,mutate:()=>{mutations=[{}];}};
}
describe('private exact acquisition classification',()=>{
  it('proves absence, then visibility-only pending, then an exported READY without changing public bytes',()=>{
    const h=acquisitionHarness();h.collect();expect(h.collector.acquire(h.request())).toEqual({kind:'ABSENT'});
    const button=new FixtureElement('BUTTON');button.attributes.set('aria-label','Confirmation');button.attributes.set('hidden','');h.root.append(button);
    const hidden=h.collect(),before=JSON.stringify(hidden);expect(hidden.nodes.some(n=>n.name==='Confirmation')).toBe(false);expect(h.collector.acquire(h.request())).toEqual({kind:'VISIBILITY_PENDING'});expect(JSON.stringify(hidden)).toBe(before);
    button.attributes.delete('hidden');expect(h.collector.acquire(h.request()).kind).toBe('REFUSED');const current=h.collect();const ready=h.collector.acquire(h.request());expect(ready.kind).toBe('READY');if(ready.kind!=='READY')throw Error('not ready');expect(current.nodes.some(n=>n.nodeId===ready.target.nodeId)).toBe(true);button.isConnected=false;expect(h.collector.matches(ready.target,h.request().locator)).toBe(false);h.collector.dispose();
  });
  it.each(['hidden-duplicate','sensitive-ancestor','sensitive-descendant','unresolved-name','disabled','wrong-type','wrong-origin','mutation','private-property','truncated'] as const)('refuses %s instead of silently waiting',mode=>{
    const h=acquisitionHarness(mode==='truncated'?{elements:1}:undefined);
    const button=new FixtureElement(mode==='wrong-type'?'DIV':'BUTTON');button.attributes.set('role','button');button.attributes.set('aria-label','Confirmation');h.root.append(button);
    if(mode==='hidden-duplicate'){const other=new FixtureElement('BUTTON');other.attributes.set('aria-label','Confirmation');other.attributes.set('hidden','');h.root.append(other);}
    if(mode==='sensitive-ancestor')h.root.attributes.set('data-sensitive','');
    if(mode==='sensitive-descendant'){const secret=new FixtureInput('INPUT');secret.type='password';secret.value='PRIVATE-SECRET';button.append(secret);}
    if(mode==='unresolved-name'){const unknown=new FixtureElement('BUTTON','not-exportable');unknown.attributes.set('aria-label','');unknown.attributes.set('hidden','');h.root.append(unknown);}
    if(mode==='disabled')button.attributes.set('disabled','');
    const field=new FixtureInput('INPUT');field.value='ORIGINAL-PRIVATE';h.root.append(field);
    const o=h.collect();expect(JSON.stringify(o)).not.toContain('PRIVATE-SECRET');const request=h.request();
    if(mode==='wrong-origin')request.origin='https://unapproved.test';if(mode==='mutation')h.mutate();if(mode==='private-property')field.value='DIFFERENT-PRIVATE';
    expect(h.collector.acquire(request).kind).toBe('REFUSED');h.collector.dispose();
  });
  it('will not certify a hidden read grant or permit a capture through the probe',()=>{
    const h=acquisitionHarness();const field=new FixtureInput('INPUT');field.attributes.set('aria-label','Reference');field.attributes.set('hidden','');field.value='PRIVATE-REFERENCE';h.root.append(field);h.collect();
    const request=h.request();request.locator={kind:'role',role:'textbox',name:'Reference',exact:true};request.expected={...request.expected,locator:request.locator,role:'textbox',elementType:'input',controlType:'text',classification:'nonsecretApproved',readRuleId:'missing'};request.operation={kind:'read',bindingId:'binding',recipe:{kind:'controlValue',controlType:'text',classification:'nonsecretApproved',policyRuleId:'missing'}};
    expect(h.collector.acquire(request)).toEqual({kind:'REFUSED',code:'READ_REFUSED'});expect(field.value).toBe('PRIVATE-REFERENCE');h.collector.dispose();
  });
});

it.each(['visible','hidden','missing'] as const)('certifies a label relation only from existing eligible cached metadata: %s',mode=>{
  const h=acquisitionHarness(),label=new FixtureElement('SPAN','Confirmation'),button=new FixtureElement('BUTTON');button.attributes.set('aria-labelledby','caption');button.getRootNode=()=>({getElementById:(id:string)=>mode==='missing'||id!=='caption'?null:label});h.root.append(label);h.root.append(button);if(mode==='hidden')label.attributes.set('hidden','');
  const observation=h.collect(),before=JSON.stringify(observation),result=h.collector.acquire(h.request());expect(result.kind).toBe(mode==='visible'?'READY':'REFUSED');expect(JSON.stringify(observation)).toBe(before);expect(before).not.toContain('caption');h.collector.dispose();
});
