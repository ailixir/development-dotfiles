// eslint-disable-next-line no-restricted-imports -- Real Chromium fixture types; production import remains browser.ts only.
import type { Page } from 'playwright';
import { beforeAll, afterAll, afterEach, describe, it, expect, vi } from 'vitest';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as sanitizer from '../../src/run/observationSanitizer.js';
import type { CollectorOptions } from '../../src/run/observationTypes.js';
import { playwrightBrowserFactory } from './preparedBrowser.js';
import type { BrowserHandle } from '../../src/run/browserFactory.js';
import type { ObservationSession, ObservationRule, GuidedInvocation, ObservationReadGrant } from '../../src/run/observationTypes.js';
import { startPageServer } from '../helpers/pageServer.js';
import type { PageServer } from '../helpers/pageServer.js';
let browser:BrowserHandle,page:Page,server:PageServer,scratch:string;
const sessions:ObservationSession[]=[];
beforeAll(async()=>{server=await startPageServer();scratch=await mkdtemp(join(tmpdir(),'guided-targets-'));browser=await playwrightBrowserFactory.launch({browser:'chromium',scratchPath:scratch,viewport:{width:800,height:600},recording:{width:800,height:600}});page=browser.page as unknown as Page;await page.goto(server.baseUrl);});
afterEach(async()=>{for(const session of sessions)await session.dispose();sessions.length=0;await page.goto(server.baseUrl);});
afterAll(async()=>{await browser.dispose();await server.close();await rm(scratch,{recursive:true,force:true});});
const rule:ObservationRule={testId:'field',name:'Approved field',accessibleName:'Approved field',policyRuleId:'read-field',classification:'nonsecretApproved'};
async function prepared(html:string,rules:ObservationRule[]=[rule],readGrants:ObservationReadGrant[]=[]) {
  await page.setContent(html);const session=browser.createObservationSession?.({sessionId:'private-session',scopeHash:'a'.repeat(64),approvedOrigins:[server.baseUrl],rules,knownSecrets:[],applicationPolicy:{policyRuleId:'structural',allowStructuralDiscovery:true,readGrants}});if(!session)throw new Error('SESSION');sessions.push(session);
  const observation=(await session.observe()).observation;const node=observation.nodes.find(n=>(n.elementType==='input'||n.elementType==='textarea'||n.name==='Read source'||n.name==='Approved field')&&n.locatorHints.length>0);if(!node?.locatorHints[0])throw new Error('NODE');
  const invocation:GuidedInvocation={target:{nodeId:node.nodeId,documentId:node.documentId,generation:node.generation,locator:node.locatorHints[0]},operation:{kind:'read',bindingId:'local',recipe:{kind:'controlValue',classification:'nonsecretApproved',controlType:'text',policyRuleId:'read-field'}},resolvedValue:null,origin:server.baseUrl,maxValueBytes:4096};
  return {session,invocation};
}
describe('retained isolated target at invocation',()=>{
  it('reads a positively classified field exactly without accepting runtime policy substitutions',async()=>{
    const h=await prepared('<input data-testid="field" aria-label="Approved field" value="  exact-é  ">');expect(await h.session.invoke?.(h.invocation)).toEqual({value:'  exact-é  '});
    const wrong={...h.invocation,operation:{kind:'read' as const,bindingId:'other',recipe:{kind:'controlValue' as const,classification:'nonsecretApproved' as const,controlType:'text' as const,policyRuleId:'invented'}}};await expect(h.session.invoke?.(wrong)).rejects.toThrow('TARGET_CHANGED');
  });
  it.each(['password','hidden','email'])('refuses a post-prepare type change to %s',async type=>{
    const h=await prepared('<input data-testid="field" aria-label="Approved field" value="private">');expect(await h.session.matches(h.invocation.target,h.invocation.target.locator)).toBe(true);await page.locator('input').evaluate((element,type)=>{element.setAttribute('type',type);},type);await expect(h.session.invoke?.(h.invocation)).rejects.toThrow(type === 'password' ? 'PASSWORD_CONTROL_READ_REFUSED' : 'TARGET_CHANGED');
  });
  it('refuses replacement by an indistinguishable node and never fills the replacement',async()=>{
    const h=await prepared('<input data-testid="field" aria-label="Approved field">');await page.locator('input').evaluate(element=>{element.replaceWith(element.cloneNode());});h.invocation.operation={kind:'fill',value:{kind:'authoredLiteral',sourceInputId:'source'}};h.invocation.resolvedValue='NEVER_FILL';await expect(h.session.invoke?.(h.invocation)).rejects.toThrow('TARGET_CHANGED');expect(await page.locator('input').inputValue()).toBe('');
  });
  it('rejects a hidden locator twin inserted after preparation',async()=>{
    const h=await prepared('<input data-testid="field" aria-label="Approved field">');await page.locator('body').evaluate(element=>{const twin=document.createElement('input');twin.setAttribute('data-testid','field');twin.hidden=true;element.appendChild(twin);});await expect(h.session.invoke?.(h.invocation)).rejects.toThrow('TARGET_CHANGED');
  });
  it('refuses a cross-origin/document race and disposed capture context',async()=>{
    const h=await prepared('<input data-testid="field" aria-label="Approved field" value="private">');await page.goto('about:blank');await expect(h.session.invoke?.(h.invocation)).rejects.toThrow('TARGET_CHANGED');await h.session.dispose();await expect(h.session.invoke?.(h.invocation)).rejects.toThrow('TARGET_CHANGED');
  });
  it.each([['empty',''],['whitespace','   '],['oversize','x'.repeat(4097)],['invalid Unicode','\ud800']])('refuses %s reads',async (_label,value='')=>{
    await page.setContent('<input data-testid="field" aria-label="Approved field">');await page.locator('input').evaluate((element,value)=>{(element as HTMLInputElement).value=value;},value);
    const session=browser.createObservationSession?.({sessionId:'private',scopeHash:'a'.repeat(64),approvedOrigins:[server.baseUrl],rules:[rule],knownSecrets:[]});if(!session)throw new Error('SESSION');sessions.push(session);
    if(value==='\ud800'){await expect(session.observe()).rejects.toThrow('INVALID_UNICODE');return;}
    const observation=(await session.observe()).observation;const node=observation.nodes.find(n=>n.elementType==='input');
    if(!node?.locatorHints[0]){expect(observation.nodes).toHaveLength(0);return;}
    await expect(session.invoke?.({target:{...node,locator:node.locatorHints[0]},operation:{kind:'read',bindingId:'value',recipe:{kind:'controlValue',classification:'nonsecretApproved',controlType:'text',policyRuleId:'read-field'}},origin:server.baseUrl,resolvedValue:null,maxValueBytes:4096})).rejects.toThrow();
  });
  it('checks lowered UTF-8 byte limit on the exact read',async()=>{
    const h=await prepared('<input data-testid="field" aria-label="Approved field" value="éé">');h.invocation.maxValueBytes=3;await expect(h.session.invoke?.(h.invocation)).rejects.toThrow('TARGET_CHANGED');
  });
  it('produces native CSS hover and trusted mouse click sequencing',async()=>{
    const h=await prepared('<style>button:hover{background-color:rgb(1,2,3)}</style><button data-testid="field" aria-label="Approved field" onclick="document.body.dataset.trusted=String(event.isTrusted)">Native button</button>');
    h.invocation.operation={kind:'hover'};await h.session.invoke?.(h.invocation);expect(await page.locator('button').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(1, 2, 3)');
    h.invocation.operation={kind:'click'};await h.session.invoke?.(h.invocation);expect(await page.locator('body').getAttribute('data-trusted')).toBe('true');
  });
  it('implements native Tab and prevented Enter default behavior',async()=>{
    const h=await prepared('<form onsubmit="event.preventDefault();document.body.dataset.submitted=String(event.isTrusted)"><input data-testid="field" aria-label="Approved field"><button>Submit</button></form>');
    h.invocation.operation={kind:'press',key:'Tab'};await h.session.invoke?.(h.invocation);expect(await page.locator('button').evaluate(e=>e===document.activeElement)).toBe(true);
    h.invocation.operation={kind:'press',key:'Enter'};await h.session.invoke?.(h.invocation);expect(await page.locator('body').getAttribute('data-submitted')).toBe('true');
  });
  it('implements native Arrow selection and trusted check/uncheck without duplicate no-op effects',async()=>{
    const h=await prepared('<textarea data-testid="field" aria-label="Approved field">first line\nsecond line</textarea>');
    await page.locator('textarea').evaluate(e=>{(e as HTMLTextAreaElement).setSelectionRange(0,0);});
    h.invocation.operation={kind:'press',key:'ArrowDown'};await h.session.invoke?.(h.invocation);expect(await page.locator('textarea').evaluate(e=>(e as HTMLTextAreaElement).selectionStart)).toBeGreaterThan(0);
    h.invocation.operation={kind:'press',key:'ArrowUp'};await h.session.invoke?.(h.invocation);expect(await page.locator('textarea').evaluate(e=>(e as HTMLTextAreaElement).selectionStart)).toBe(0);
    const check=await prepared('<input type="checkbox" data-testid="field" aria-label="Approved field" onchange="document.body.dataset.changed=String(event.isTrusted)">');
    check.invocation.operation={kind:'check'};await check.session.invoke?.(check.invocation);expect(await page.locator('input').isChecked()).toBe(true);expect(await page.locator('body').getAttribute('data-changed')).toBe('true');
    const observation=(await check.session.observe()).observation;const node=observation.nodes.find(n=>n.elementType==='input');if(!node?.locatorHints[0])throw new Error('NODE');check.invocation.target={...node,locator:node.locatorHints[0]};
    await check.session.invoke?.(check.invocation);check.invocation.operation={kind:'uncheck'};await check.session.invoke?.(check.invocation);expect(await page.locator('input').isChecked()).toBe(false);
  });
  it('allows native Escape to dismiss a modal dialog and respects prevented keyboard defaults',async()=>{
    const modal=await prepared('<dialog><input data-testid="field" aria-label="Approved field"></dialog><script>document.querySelector("dialog").showModal()</script>');modal.invocation.operation={kind:'press',key:'Escape'};await modal.session.invoke?.(modal.invocation);await expect.poll(()=>page.locator('dialog').evaluate(e=>(e as HTMLDialogElement).open)).toBe(false);
    const blocked=await prepared('<form onsubmit="document.body.dataset.submitted=1;event.preventDefault()"><input data-testid="field" aria-label="Approved field" onkeydown="event.preventDefault()"><button>Submit</button></form>');blocked.invocation.operation={kind:'press',key:'Enter'};await blocked.session.invoke?.(blocked.invocation);expect(await page.locator('body').getAttribute('data-submitted')).toBeNull();
  });
  it('stops uncertain after focus theft or a mouseover overlay and does not click a replacement',async()=>{
    const focus=await prepared('<input data-testid="field" aria-label="Approved field" onfocus="document.querySelector(\'button\').focus()"><button>Steal focus</button>');focus.invocation.operation={kind:'press',key:'Enter'};await expect(focus.session.invoke?.(focus.invocation)).rejects.toThrow('UNKNOWN_OUTCOME');
    const hover=await prepared('<button data-testid="field" aria-label="Approved field" onmouseover="this.outerHTML=\'<button onclick=&quot;document.body.dataset.clicked=1&quot;>Replacement</button>\'">First target</button>');hover.invocation.operation={kind:'click'};await expect(hover.session.invoke?.(hover.invocation)).rejects.toThrow('UNKNOWN_OUTCOME');expect(await page.locator('body').getAttribute('data-clicked')).toBeNull();
  });

  it('requires a positive region grant without treating generic discovery or application consent as a field override',async()=>{
    const grant:ObservationReadGrant={policyRuleId:'region-read',origin:server.baseUrl,region:{kind:'role',role:'main',name:'Operations',exact:true},visibleText:{classification:'permittedBusinessData'},controlValue:{classification:'nonsecretApproved',types:['text']}};
    const markup='<main aria-label="Operations"><input aria-label="Approved field" value="nonsecret"></main>';
    const none=await prepared(markup,[]);none.invocation.operation={kind:'read',bindingId:'local',recipe:{kind:'controlValue',classification:'nonsecretApproved',controlType:'text',policyRuleId:'region-read'}};expect(await none.session.validateInvocation?.(none.invocation)).toBe(false);
    const region=await prepared(markup,[],[grant]);region.invocation.operation=none.invocation.operation;expect(await region.session.invoke?.(region.invocation)).toEqual({value:'nonsecret'});
    const outside=await prepared('<main aria-label="Operations"><p>Scope</p></main><input aria-label="Approved field" value="nonsecret">',[],[grant]);outside.invocation.operation=none.invocation.operation;await expect(outside.session.invoke?.(outside.invocation)).rejects.toThrow('TARGET_CHANGED');
    const duplicates=await prepared(`${markup}<main aria-label="Operations"><p>Other region</p></main>`,[],[grant]);duplicates.invocation.operation=none.invocation.operation;await expect(duplicates.session.invoke?.(duplicates.invocation)).rejects.toThrow('TARGET_CHANGED');
    const veto=await prepared('<main aria-label="Operations"><input data-testid="field" aria-label="Approved field" value="nonsecret"></main>',[{...rule,classification:'structuralOnly'}],[grant]);veto.invocation.operation=none.invocation.operation;await expect(veto.session.invoke?.(veto.invocation)).rejects.toThrow('TARGET_CHANGED');
    const replaced=await prepared(markup,[],[grant]);replaced.invocation.operation=none.invocation.operation;await page.locator('main').evaluate(element=>{element.replaceWith(element.cloneNode(true));});await expect(replaced.session.invoke?.(replaced.invocation)).rejects.toThrow('TARGET_CHANGED');
  });
  it('rejects the entire region text source with hidden/sensitive/field descendants and private text echoes',async()=>{
    const grant:ObservationReadGrant={policyRuleId:'region-text',origin:server.baseUrl,region:{kind:'role',role:'main',name:'Operations',exact:true},visibleText:{classification:'permittedBusinessData'}};
    for(const descendant of ['<span hidden>private</span>','<span data-sensitive>private</span>','<input type="password" value="private">']){
      const h=await prepared(`<main aria-label="Operations"><output aria-label="Approved field">Public part${descendant}</output></main>`,[],[grant]);h.invocation.operation={kind:'read',bindingId:'local',recipe:{kind:'visibleText',classification:'permittedBusinessData',policyRuleId:'region-text'}};expect(await h.session.validateInvocation?.(h.invocation)).toBe(false);await expect(h.session.invoke?.(h.invocation)).rejects.toThrow('TARGET_CHANGED');
    }
    const h=await prepared('<main aria-label="Operations"><output aria-label="Approved field">REGION-PRIVATE-TEXT</output><button>REGION-PRIVATE-TEXT</button></main>',[],[grant]);const observed=await h.session.observe();expect(observed.json).not.toContain('REGION-PRIVATE-TEXT');
  });
  it('prefers a unique region over application grants and denies equal-priority overlaps',async()=>{
    const app:ObservationReadGrant={policyRuleId:'app-read',origin:server.baseUrl,region:{kind:'application'},controlValue:{classification:'nonsecretApproved',types:['text']}};
    const scoped:ObservationReadGrant={...app,policyRuleId:'region-read',region:{kind:'role',role:'main',name:'Operations',exact:true}};
    const html='<main aria-label="Operations"><input aria-label="Approved field" value="nonsecret"></main>';
    const h=await prepared(html,[],[app,scoped]);h.invocation.operation={kind:'read',bindingId:'local',recipe:{kind:'controlValue',classification:'nonsecretApproved',controlType:'text',policyRuleId:'region-read'}};expect(await h.session.invoke?.(h.invocation)).toEqual({value:'nonsecret'});
    const conflict=await prepared(html,[],[app,{...app,policyRuleId:'other-app-read'}]);conflict.invocation.operation=h.invocation.operation;await expect(conflict.session.invoke?.(conflict.invocation)).rejects.toThrow('TARGET_CHANGED');
    await expect(prepared('<main aria-label="Operations"><input type="password" aria-label="Approved field" value="private"></main>',[],[scoped])).rejects.toThrow('NODE');
    const changed=await prepared(html,[],[scoped]);changed.invocation.operation=h.invocation.operation;await page.locator('input').evaluate(e=>{ e.setAttribute('type','email'); });await expect(changed.session.invoke?.(changed.invocation)).rejects.toThrow('TARGET_CHANGED');
  });

  it('erases the private masking inventory and refuses late repopulation after disposal',async()=>{
    const original=sanitizer.observationOptions;const inventories:CollectorOptions[]=[];const spy=vi.spyOn(sanitizer,'observationOptions').mockImplementation(config=>{const options=original(config);inventories.push(options);return options;});
    try {
      const h=await prepared('<input data-testid="field" aria-label="Approved field" value="PRIVATE-CAPTURE-CANARY">');const result=await h.session.invoke?.(h.invocation);if(!result?.value)throw new Error('READ');await h.session.withhold?.([result.value]);expect(inventories.some(options=>options.knownSecrets.includes('PRIVATE-CAPTURE-CANARY'))).toBe(true);
      await h.session.dispose();expect(inventories.every(options=>options.knownSecrets.length===0)).toBe(true);await expect(h.session.withhold?.(['LATE-CANARY'])).rejects.toThrow('CONTEXT_LOST');expect(inventories.every(options=>options.knownSecrets.length===0)).toBe(true);await expect(h.session.invoke?.(h.invocation)).rejects.toThrow('TARGET_CHANGED');
    } finally {spy.mockRestore();}
  });

  it('permits benign focus styling but never writes after focus retypes, detaches or steals the pinned field',async()=>{
    const positive=await prepared('<style>.focused{border-color:blue}</style><input data-testid="field" aria-label="Approved field" onfocus="this.classList.add(\'focused\')">');positive.invocation.operation={kind:'fill',value:{kind:'authoredLiteral',sourceInputId:'input'}};positive.invocation.resolvedValue='EXPECTED-FILL';await positive.session.invoke?.(positive.invocation);expect(await page.locator('input').inputValue()).toBe('EXPECTED-FILL');
    for(const handler of ["this.type='password'","this.type='hidden'","this.readOnly=true","this.disabled=true","this.replaceWith(this.cloneNode())","document.querySelector('button').focus()"]){
      const h=await prepared(`<input data-testid="field" aria-label="Approved field" onfocus="${handler}"><button>Other control</button>`);h.invocation.operation={kind:'fill',value:{kind:'authoredLiteral',sourceInputId:'input'}};h.invocation.resolvedValue='MUST-NOT-WRITE';await expect(h.session.invoke?.(h.invocation)).rejects.toThrow('UNKNOWN_OUTCOME');expect(await page.locator('input').inputValue()).toBe('');
    }
  });

  it('asserts readonly/disabled nonsecret values without granting password/hidden access',async()=>{
    for(const attribute of ['readonly','disabled']){
      const h=await prepared(`<input data-testid="field" aria-label="Approved field" value="expected" ${attribute}>`);h.invocation.operation={kind:'assert',predicate:'hasValue',expected:{kind:'authoredLiteral',sourceInputId:'expected'}};h.invocation.resolvedValue='expected';expect(await h.session.invoke?.(h.invocation)).toEqual({assertionPassed:true});
    }
    for(const type of ['password','hidden']){
      const h=await prepared('<input data-testid="field" aria-label="Approved field" value="expected">');h.invocation.operation={kind:'assert',predicate:'hasValue',expected:{kind:'authoredLiteral',sourceInputId:'expected'}};h.invocation.resolvedValue='expected';await page.locator('input').evaluate((e,type)=>{e.setAttribute('type',type);},type);await expect(h.session.invoke?.(h.invocation)).rejects.toThrow(type === 'password' ? 'PASSWORD_CONTROL_READ_REFUSED' : 'TARGET_CHANGED');
    }
  });

  it.each(['click','hover','check','press'] as const)('reveals the retained below-fold target before native %s',async kind=>{
    const receipt="document.body.dataset.receipt=String(event.isTrusted)";
    const element=kind==='check'?`<input type="checkbox" aria-label="Approved field" onchange="${receipt}">`:kind==='press'?`<input aria-label="Approved field" onkeydown="${receipt}">`:`<button aria-label="Approved field" ${kind==='hover'?'onmouseover':'onclick'}="${receipt}">Perform action</button>`;
    const h=await prepared(`<div style="height:2200px"></div>${element}`,[]);await page.evaluate(()=>{ window.scrollTo(0,0); });h.invocation.operation=kind==='press'?{kind,key:'Enter'}:{kind};expect(await h.session.validateInvocation?.(h.invocation)).toBe(true);expect(await page.evaluate(()=>window.scrollY)).toBe(0);
    await h.session.invoke?.(h.invocation);expect(await page.evaluate(()=>window.scrollY)).toBeGreaterThan(0);expect(await page.locator('body').getAttribute('data-receipt')).toBe('true');
  });
  it('reveals an unchanged target inside nested scrolling containers without reacquiring it',async()=>{
    const h=await prepared('<section style="height:150px;width:500px;overflow:auto"><div style="height:1200px"></div><section style="height:100px;overflow:auto"><div style="height:900px"></div><button aria-label="Approved field" onclick="document.body.dataset.receipt=String(event.isTrusted)">Perform action</button></section></section>',[]);h.invocation.operation={kind:'click'};expect(await h.session.validateInvocation?.(h.invocation)).toBe(true);await h.session.invoke?.(h.invocation);expect(await page.locator('body').getAttribute('data-receipt')).toBe('true');expect(await page.locator('section').evaluateAll(elements=>elements.every(element=>element.scrollTop>0))).toBe(true);
  });
  it.each([['check',true],['uncheck',false]] as const)('does not scroll an already satisfied offscreen %s',async(kind,checked)=>{
    const h=await prepared(`<div style="height:2200px"></div><input type="checkbox" aria-label="Approved field" ${checked?'checked':''} onchange="document.body.dataset.changed=1">`,[]);await page.evaluate(()=>{ window.scrollTo(0,0); });h.invocation.operation={kind};expect(await h.session.validateInvocation?.(h.invocation)).toBe(true);await h.session.invoke?.(h.invocation);expect(await page.evaluate(()=>window.scrollY)).toBe(0);expect(await page.locator('body').getAttribute('data-changed')).toBeNull();
  });
  it('stops uncertain after a scroll handler replaces the retained target, without clicking the replacement',async()=>{
    const h=await prepared('<div style="height:2200px"></div><button aria-label="Approved field" onclick="document.body.dataset.clicked=1">Perform action</button><script>addEventListener("scroll",()=>{const button=document.querySelector("button");const replacement=button.cloneNode(true);replacement.setAttribute("data-replacement","true");button.replaceWith(replacement);},{once:true});</script>',[]);h.invocation.operation={kind:'click'};expect(await h.session.validateInvocation?.(h.invocation)).toBe(true);await expect(h.session.invoke?.(h.invocation)).rejects.toThrow('UNKNOWN_OUTCOME');expect(await page.locator('button').getAttribute('data-replacement')).toBe('true');expect(await page.locator('body').getAttribute('data-clicked')).toBeNull();
  });

});

describe('QA session privacy and native toggle postconditions',()=>{
  it.each(['password','text'])('withholds uncaptured %s bytes and aliases after removal and navigation',async type=>{
    const secret='QA_PRIOR_  private\u200b\n token';const alias='QA_PRIOR_ private token';
    const h=await prepared(`<input data-testid="field" aria-label="Approved field" type="text"><button>Continue</button>`);
    await page.locator('input').evaluate((e,args)=>{e.setAttribute('type',args.type);(e as HTMLInputElement).value=args.secret;},{secret,type});
    const first=await h.session.observe();expect(JSON.stringify(first)).not.toContain('QA_PRIOR_');
    await page.setContent(`<button>${alias}</button>`);const removed=await h.session.observe();expect(JSON.stringify(removed)).not.toContain('QA_PRIOR_');
    await page.goto(server.baseUrl+'/next');await page.setContent(`<button>${alias}</button>`);const navigated=await h.session.observe();expect(JSON.stringify(navigated)).not.toContain('QA_PRIOR_');
    await h.session.dispose();await expect(h.session.observe()).rejects.toThrow();await expect(h.session.withhold?.(['LATE_PRIVATE'])).rejects.toThrow();
  });
  it('retains authorized business source text after removal without requiring a capture',async()=>{
    const value='QA_UNCAPTURED_BUSINESS_7';
    const h=await prepared(`<main aria-label="Operations"><output role="status" aria-label="Read source">${value}</output></main>`,[],[{policyRuleId:'business',origin:server.baseUrl,region:{kind:'role',role:'main',name:'Operations',exact:true},visibleText:{classification:'permittedBusinessData'}}]);
    await page.goto(server.baseUrl+'/next');await page.setContent(`<button>${value}</button>`);expect(JSON.stringify(await h.session.observe())).not.toContain(value);
  });
  it('fails closed persistently on private inventory count/byte overflow instead of evicting earlier bytes',async()=>{
    for(const values of [Array.from({length:4097},(_,i)=>`secret-${String(i)}`),Array.from({length:260},(_,i)=>`${String(i)}-`+'x'.repeat(4096))]) {
      const h=await prepared('<input data-testid="field" aria-label="Approved field" value="EARLIER_SECRET">');
      await expect(h.session.withhold?.(values)).rejects.toThrow('CONTEXT_LOST');
      await page.goto(server.baseUrl+'/next');await page.setContent('<button>EARLIER_SECRET</button>');
      await expect(h.session.observe()).rejects.toThrow();await expect(h.session.withhold?.(['new'])).rejects.toThrow();
    }
  });
  it.each(['event.preventDefault()','this.checked=false','this.replaceWith(this.cloneNode())',"this.type='radio'"])('does not report a prevented/reverted/replaced checkbox as success: %s',async handler=>{
    const h=await prepared(`<input type="checkbox" data-testid="field" aria-label="Approved field" onclick="window.receipt=(window.receipt||0)+1;${handler}">`);
    h.invocation.operation={kind:'check'};await expect(h.session.invoke?.(h.invocation)).rejects.toThrow('UNKNOWN_OUTCOME');
    expect(await page.evaluate(()=>Reflect.get(window,'receipt') as unknown)).toBe(1);
  });
  it('refuses radio uncheck during preparation and before any native input while allowing radio check',async()=>{
    const h=await prepared('<input type="radio" checked data-testid="field" aria-label="Approved field" onclick="window.receipt=(window.receipt||0)+1">');
    h.invocation.operation={kind:'uncheck'};expect(await h.session.validateInvocation?.(h.invocation)).toBe(false);await expect(h.session.invoke?.(h.invocation)).rejects.toThrow('TARGET_CHANGED');
    expect(await page.locator('input').isChecked()).toBe(true);expect(await page.evaluate(()=>Reflect.get(window,'receipt') as unknown)).toBeUndefined();
    const unchecked=await prepared('<input type="radio" data-testid="field" aria-label="Approved field" onclick="window.receipt=(window.receipt||0)+1">');unchecked.invocation.operation={kind:'check'};await unchecked.session.invoke?.(unchecked.invocation);expect(await page.locator('input').isChecked()).toBe(true);expect(await page.evaluate(()=>Reflect.get(window,'receipt') as unknown)).toBe(1);
  });
});

it('poisons later observation after an unexpected collector error instead of forgetting prior inventory',async()=>{
  const h=await prepared('<input data-testid="field" aria-label="Approved field" value="PRIVATE_BEFORE_ERROR">');
  await page.locator('input').evaluate(e=>{(e as HTMLInputElement).value='\ud800';});
  await expect(h.session.observe()).rejects.toThrow('INVALID_UNICODE');
  await page.goto(server.baseUrl+'/next');await page.setContent('<button>PRIVATE_BEFORE_ERROR</button>');await expect(h.session.observe()).rejects.toThrow();
});

it('keeps explicit sensitive-region text private after the region is gone',async()=>{
  const h=await prepared('<section data-sensitive><span>PRIVATE_REGION_004</span></section><input data-testid="field" aria-label="Approved field">');
  await page.goto(server.baseUrl+'/next');await page.setContent('<button>PRIVATE_REGION_004</button>');expect(JSON.stringify(await h.session.observe())).not.toContain('PRIVATE_REGION_004');
});
