import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {installPageState} from '../../src/run/pageStateInPage.js';
import {PrivateInventory} from '../../src/run/privateInventory.js';

// Supplementary deterministic guard tests. Real Chromium covers the same cases in secret-login.test.ts.
class ElementStub {
  readonly attributes = new Map<string,string>(); children: ElementStub[] = []; parentElement: ElementStub|null = null;
  isConnected=true; shadowRoot=null; nodeType=1; childNodes={length:0,item:()=>null}; firstChild=null;
  constructor(readonly tagName: string) {}
  getRootNode(): unknown {return document;}
  hasAttribute(name:string):boolean{return this.attributes.has(name);}
  getAttribute(name:string):string|null{return this.attributes.get(name)??null;}
  getBoundingClientRect(){return {x:0,y:0,left:0,top:0,right:20,bottom:20,width:20,height:20};}
  matches(selector:string):boolean{return selector===':disabled'&&this.hasAttribute('disabled');}
  get lastElementChild(){return this.children.at(-1)??null;}
  append(child:ElementStub):void{child.parentElement=this;this.children.push(child);}
}
class InputStub extends ElementStub {
  type='password'; value=''; checked=false; list=null; readOnly=false; disabled=false;
  form:{action:string}|null=null; onFocus:()=>void=()=>undefined; events:string[]=[];
  constructor(){super('INPUT');}
  override matches(selector:string):boolean{return selector===':disabled'&&this.disabled;}
  focus():void{(document as unknown as {activeElement:unknown}).activeElement=this;this.onFocus();}
  dispatchEvent(event:Event):boolean{this.events.push(event.type);return true;}
}
afterEach(()=>{vi.unstubAllGlobals();});
function setup(count=1){
  const root=new ElementStub('HTML'),inputs=Array.from({length:count},()=>new InputStub());for(const input of inputs)root.append(input);
  const listeners=new Map<string,((event:Event)=>void)[]>();let mutation=false;
  vi.stubGlobal('document',{documentElement:root,activeElement:null,addEventListener(name:string,listener:(event:Event)=>void){listeners.set(name,[...(listeners.get(name)??[]),listener]);},removeEventListener:vi.fn()});
  vi.stubGlobal('location',{origin:'https://login.example.test',hostname:'login.example.test',href:'https://login.example.test/login'});
  vi.stubGlobal('Element',ElementStub);vi.stubGlobal('HTMLElement',ElementStub);vi.stubGlobal('HTMLInputElement',InputStub);
  for(const name of ['HTMLTextAreaElement','HTMLSelectElement','HTMLLabelElement','HTMLAnchorElement','HTMLButtonElement','ShadowRoot'])vi.stubGlobal(name,class extends ElementStub{});
  vi.stubGlobal('getComputedStyle',()=>({display:'block',visibility:'visible',content:'none',pointerEvents:'auto',overflowX:'visible',overflowY:'visible'}));
  vi.stubGlobal('MutationObserver',class {observe(){return;}disconnect(){return;}takeRecords(){const entries=mutation?[{type:'attributes'}]:[];mutation=false;return entries;}});
  const collector=installPageState({allowedDomains: TEST_DOMAINS}),inventory=new PrivateInventory();
  collector.stamp('document',1,collector.revision());
  const observation={coverage:{passwordControls:collector.passwordCount()},nodes:Object.keys(collector).filter(name=>/^(collect|observe|nodes)$/u.test(name))};
  const target={kind:'passwordControl' as const,documentId:'document',generation:1};
  return {collector,inventory,target,inputs,root,observation,mutate:()=>{mutation=true;},emit:(name:string,event:Event)=>{for(const listener of listeners.get(name)??[])listener(event);}};
}
describe('password pin policy and lifecycle',()=>{
  it('returns exact private prewrite facts but never tags an exception after a value write',()=>{
    const h=setup(),input=h.inputs[0];if(!input)throw new Error('INPUT');expect(h.collector.preparePasswordResult(h.target,'https://login.example.test')).toEqual({kind:'passwordPrepared'});
    expect(h.collector.fillPasswordResult(h.target,'https://login.example.test',[],'NEVER')).toEqual({kind:'passwordPrewriteRefusal',code:'POLICY_DENIED'});expect(input.value).toBe('');
    input.dispatchEvent=()=>{throw new Error('native error mentions TARGET_CHANGED after write');};expect(()=>h.collector.fillPasswordResult(h.target,'https://login.example.test',['https://login.example.test'],'WRITTEN')).toThrow('native error mentions');expect(input.value).toBe('WRITTEN');
  });
  it('fills the exact pinned input only after withholding its bytes',()=>{
    const h=setup();expect(h.observation.coverage.passwordControls).toBe(1);expect(h.observation.nodes).toEqual([]);h.collector.preparePassword(h.target,'https://login.example.test');h.inventory.withhold(['CANARY']);h.collector.fillPassword(h.target,'https://login.example.test',['https://login.example.test'],'CANARY');expect(h.inputs[0]?.value).toBe('CANARY');expect(h.inputs[0]?.events).toEqual(['input','change']);expect(h.inventory.snapshot()).toContainEqual(['CANARY',true]);
    expect(()=>{ h.collector.fillPassword(h.target,'https://login.example.test',['https://login.example.test'],'SECOND'); }).toThrow('TARGET_CHANGED');h.collector.dispose();h.inventory.dispose();expect(()=>h.inventory.snapshot()).toThrow('CONTEXT_LOST');
  });
  it.each([0,2])('refuses %i candidates without pinning or typing',count=>{const h=setup(count);expect(()=>{ h.collector.preparePassword(h.target,'https://login.example.test'); }).toThrow(count?'PASSWORD_TARGET_AMBIGUOUS':'PASSWORD_TARGET_ABSENT');expect(h.inputs.every(input=>input.value==='')).toBe(true);});
  it.each(['mutation','detach','replace','type','origin','generation','focus'] as const)('refuses a %s change after prepare',change=>{
    const h=setup(),input=h.inputs[0];if(!input)throw new Error('INPUT');h.collector.preparePassword(h.target,'https://login.example.test');
    if(change==='mutation')h.mutate();if(change==='detach')input.isConnected=false;if(change==='replace')h.root.children=[new InputStub()];if(change==='type')input.type='text';if(change==='origin')vi.stubGlobal('location',{origin:'https://other.example.test',hostname:'other.example.test',href:'https://other.example.test/login'});if(change==='generation')h.target.generation=2;if(change==='focus')input.onFocus=()=>{input.type='text';};
    expect(()=>{ h.collector.fillPassword(h.target,'https://login.example.test',['https://login.example.test'],'NEVER'); }).toThrow('TARGET_CHANGED');expect(input.value).toBe('');
  });
  it.each(['http://other.example.test/login','javascript:alert(1)'])('refuses form action %s',action=>{const h=setup(),input=h.inputs[0];if(!input)throw new Error('INPUT');input.form={action};h.collector.preparePassword(h.target,'https://login.example.test');expect(()=>{ h.collector.fillPassword(h.target,'https://login.example.test',['https://login.example.test'],'NEVER'); }).toThrow('PASSWORD_FORM_ACTION_NOT_ALLOWED');expect(input.value).toBe('');});
  it('requires approved and secret origin authority and fails after disposal',()=>{const h=setup();h.collector.preparePassword(h.target,'https://login.example.test');expect(()=>{ h.collector.fillPassword(h.target,'https://login.example.test',[],'NEVER'); }).toThrow('POLICY_DENIED');h.collector.dispose();expect(()=>{ h.collector.preparePassword(h.target,'https://login.example.test'); }).toThrow('TARGET_CHANGED');});
  it('observes prevented native navigation without inventing a second action',()=>{const h=setup();const allowed=new Event('submit',{cancelable:true});h.emit('submit',allowed);expect(h.collector.navigationProceed()).toBe(true);allowed.preventDefault();expect(h.collector.navigationProceed()).toBe(false);});
});
