import { describe,it,expect,vi,afterEach } from 'vitest';
import { dispatchNativeInput } from '../../src/run/nativeInput.js';
import type { NativeInputPort, MouseInput, KeyInput } from '../../src/run/nativeInput.js';
import { GUIDED_CLOSE_GRACE_MS, GUIDED_START_RESERVE_MS, guidedCloseStages } from '../../src/run/guidedBrowser.js';
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

/**
 * KL-015-D5 rule D5-1 (W1.5 ruling part 1 section 2.2): one two-stage close. A graceful `context.close()` raced against
 * `GUIDED_CLOSE_GRACE_MS`, then, always, the hard teardown of this launch. `launchGuidedBrowser` is built from this helper,
 * so the clock arithmetic is proven here with fake timers and the kill is proven in the fixtures tier.
 */
describe('KL-015-D5 the two-stage guided close',()=>{
  afterEach(()=>{vi.useRealTimers();});
  const settled=(promise:Promise<unknown>)=>{const flag={done:false,rejected:false};void promise.then(()=>{flag.done=true;},()=>{flag.done=true;flag.rejected=true;});return flag;};
  it('fixes the grace at 3 s and keeps the worst-case stop reply (grace + terminate + 10 s callback) inside the backend 15 s',()=>{
    expect(GUIDED_CLOSE_GRACE_MS).toBe(3_000);
    const terminateBoundMs=1_500,callbackBoundMs=10_000;
    expect(GUIDED_CLOSE_GRACE_MS+terminateBoundMs+callbackBoundMs).toBe(14_500);
    expect(GUIDED_CLOSE_GRACE_MS+terminateBoundMs+callbackBoundMs).toBeLessThan(15_000);
    // The grace is also well below the runner socket timeout (30 s) and inside the start reserve it must never exceed.
    expect(GUIDED_CLOSE_GRACE_MS).toBeLessThanOrEqual(GUIDED_START_RESERVE_MS);
  });
  it('U1 a graceful close that never settles: terminate runs exactly once at the grace, close waits for it, and it is not orderly',async()=>{
    vi.useFakeTimers();let release:()=>void=()=>undefined;
    const graceful=vi.fn(()=>new Promise<void>(()=>undefined));const hard=vi.fn(()=>new Promise<void>(resolve=>{release=resolve;}));const closing=vi.fn();
    const stages=guidedCloseStages({graceful,hard,onClosing:closing});
    const closed=stages.close();const flag=settled(closed);
    expect(graceful).toHaveBeenCalledOnce();expect(hard).not.toHaveBeenCalled();expect(closing).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(GUIDED_CLOSE_GRACE_MS-1);expect(hard).not.toHaveBeenCalled();expect(flag.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);expect(hard).toHaveBeenCalledOnce();expect(flag.done).toBe(false);
    // The reply waits for the confirmed teardown: nothing is sent before terminate settles.
    await vi.advanceTimersByTimeAsync(5_000);expect(flag.done).toBe(false);
    release();await closed;expect(flag.rejected).toBe(false);
    expect(hard).toHaveBeenCalledOnce();expect(stages.orderlyClosed()).toBe(false);
  });
  it('U2 a graceful close that resolves at 100 ms: terminate still runs as the postcondition, and the close is orderly',async()=>{
    vi.useFakeTimers();
    const graceful=vi.fn(()=>new Promise<void>(resolve=>{setTimeout(resolve,100);}));const hard=vi.fn(()=>Promise.resolve());
    const stages=guidedCloseStages({graceful,hard});const closed=stages.close();
    await vi.advanceTimersByTimeAsync(99);expect(hard).not.toHaveBeenCalled();expect(stages.orderlyClosed()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);await closed;
    expect(hard).toHaveBeenCalledOnce();expect(stages.orderlyClosed()).toBe(true);
    // A grace timer must not be left armed after the close settled.
    expect(vi.getTimerCount()).toBe(0);
  });
  it('swallows the settled outcome of a graceful close that rejects, still terminates, and is not orderly',async()=>{
    const hard=vi.fn(()=>Promise.resolve());const stages=guidedCloseStages({graceful:()=>Promise.reject(new Error('private detail')),hard});
    await expect(stages.close()).resolves.toBeUndefined();expect(hard).toHaveBeenCalledOnce();expect(stages.orderlyClosed()).toBe(false);
  });
  it('U3 a terminate that rejects (a survivor, or an unreadable process table) rejects the close, and a repeat returns the same rejection without a second teardown',async()=>{
    const hard=vi.fn(()=>Promise.reject(new Error('CONTEXT_LOST')));const stages=guidedCloseStages({graceful:()=>Promise.resolve(),hard});
    const first=stages.close();await expect(first).rejects.toThrow('CONTEXT_LOST');
    const second=stages.close();expect(second).toBe(first);await expect(second).rejects.toThrow('CONTEXT_LOST');
    await expect(stages.terminate()).rejects.toThrow('CONTEXT_LOST');expect(hard).toHaveBeenCalledOnce();expect(stages.orderlyClosed()).toBe(true);
  });
  it('U4/U5 terminate on its own is the whole story for a start that failed: no graceful stage, one teardown, shared with a later close',async()=>{
    const graceful=vi.fn(()=>Promise.resolve());const hard=vi.fn(()=>Promise.resolve());const closing=vi.fn();
    const stages=guidedCloseStages({graceful,hard,onClosing:closing});
    await stages.terminate();expect(closing).toHaveBeenCalled();expect(graceful).not.toHaveBeenCalled();expect(hard).toHaveBeenCalledOnce();expect(stages.orderlyClosed()).toBe(false);
    expect(stages.terminate()).toBe(stages.terminate());
    // A close that arrives afterwards shares the one teardown and never reports an orderly close of a killed browser.
    await stages.close();expect(hard).toHaveBeenCalledOnce();expect(stages.orderlyClosed()).toBe(false);
  });
  it('does not let a graceful close that resolves after the grace turn a terminated close into an orderly one',async()=>{
    vi.useFakeTimers();let late:()=>void=()=>undefined;
    const stages=guidedCloseStages({graceful:()=>new Promise<void>(resolve=>{late=resolve;}),hard:()=>Promise.resolve()});
    const closed=stages.close();await vi.advanceTimersByTimeAsync(GUIDED_CLOSE_GRACE_MS);await closed;late();await vi.advanceTimersByTimeAsync(0);
    expect(stages.orderlyClosed()).toBe(false);
  });
});
