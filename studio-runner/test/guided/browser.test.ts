import { describe,it,expect } from 'vitest';
import { dispatchNativeInput } from '../../src/run/nativeInput.js';
import type { NativeInputPort, MouseInput, KeyInput } from '../../src/run/nativeInput.js';
function adapter(fault:'none'|'guard'|'input'|'recheck'|'focus'|'reveal'='none',alreadyChecked=false,requiresReveal=false) {
  const calls:{kind:string;input?:MouseInput|KeyInput}[]=[];let checks=0;
  const port:NativeInputPort={
    inspect(){calls.push({kind:'inspect'});return Promise.resolve({alreadyChecked,requiresReveal});},
    revealAndValidate(){calls.push({kind:'reveal'});return fault==='reveal'?Promise.reject(new Error('private')):Promise.resolve();},
    focusAndValidate(){calls.push({kind:'focus'});return fault==='focus'?Promise.reject(new Error('private')):Promise.resolve();},
    point(){calls.push({kind:'guard'});checks++;return fault==='guard'||fault==='recheck'&&checks>1?Promise.reject(new Error('private')):Promise.resolve({x:20,y:30,alreadyChecked});},
    confirmToggle(){calls.push({kind:'postcondition'});return Promise.resolve();},
    mouse(input){calls.push({kind:'mouse',input});return fault==='input'?Promise.reject(new Error('private')):Promise.resolve();},
    key(input){calls.push({kind:'key',input});return fault==='input'?Promise.reject(new Error('private')):Promise.resolve();},
  };return{port,calls};
}
describe('native retained-target input sequencing without a browser dependency',()=>{
  it.each(['click','check','uncheck','hover'] as const)('dispatches %s once after a hit guard and rechecks between native pointer effects',async kind=>{
    const h=adapter();await dispatchNativeInput({kind},h.port);expect(h.calls.map(c=>c.kind)).toEqual(kind==='hover'?['inspect','guard','mouse']:['inspect','guard','mouse','guard','mouse','guard','mouse',...(kind==='check'||kind==='uncheck'?['postcondition']:[])]);const inputs=h.calls.filter(c=>c.kind==='mouse');expect(inputs[0]?.input).toMatchObject({type:'mouseMoved',x:20,y:30});
  });
  it.each(['Enter','Tab','Escape','ArrowDown','ArrowUp'] as const)('dispatches native %s after retained focus validation',async key=>{
    const h=adapter();await dispatchNativeInput({kind:'press',key},h.port);expect(h.calls.map(c=>c.kind)).toEqual(['inspect','focus','key','key']);expect(h.calls[2]?.input).toMatchObject({type:key==='Enter'?'keyDown':'rawKeyDown',key});expect(h.calls[3]?.input).toMatchObject({type:'keyUp',key});
  });
  it('distinguishes a pre-input refusal from lost input acknowledgement, focus theft and an overlay after move',async()=>{
    const refused=adapter('guard');await expect(dispatchNativeInput({kind:'click'},refused.port)).rejects.toThrow('TARGET_CHANGED');expect(refused.calls).toHaveLength(2);
    for(const fault of ['input','recheck','focus'] as const){const h=adapter(fault);await expect(dispatchNativeInput(fault==='focus'?{kind:'press',key:'Enter'}:{kind:'click'},h.port)).rejects.toThrow('UNKNOWN_OUTCOME');expect(h.calls.filter(c=>c.kind==='mouse'||c.kind==='key')).toHaveLength(fault==='focus'?0:1);}
    const noop=adapter('none',true);await dispatchNativeInput({kind:'check'},noop.port);expect(noop.calls.map(c=>c.kind)).toEqual(['inspect']);
  });
  it('performs one reveal before input, treats reveal failure as uncertain, and does not scroll satisfied checks',async()=>{
    const h=adapter('none',false,true);await dispatchNativeInput({kind:'click'},h.port);expect(h.calls.map(c=>c.kind)).toEqual(['inspect','reveal','guard','mouse','guard','mouse','guard','mouse']);
    const failed=adapter('reveal',false,true);await expect(dispatchNativeInput({kind:'hover'},failed.port)).rejects.toThrow('UNKNOWN_OUTCOME');expect(failed.calls.map(c=>c.kind)).toEqual(['inspect','reveal']);
    const noop=adapter('none',true,true);await dispatchNativeInput({kind:'check'},noop.port);expect(noop.calls.map(c=>c.kind)).toEqual(['inspect']);
  });

});
