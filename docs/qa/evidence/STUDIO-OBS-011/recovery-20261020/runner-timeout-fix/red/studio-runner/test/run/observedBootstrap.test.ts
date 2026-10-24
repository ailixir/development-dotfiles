import {afterEach,expect,it,vi} from 'vitest';
import {BootstrapPageGuard,boundedStartup} from '../../src/run/observedBootstrap.js';
afterEach(()=>{vi.useRealTimers();});
it('authorizes only the exact returned app page after startup removal, with no pending blind window',()=>{
  const startup={},app={},closed:object[]=[];const guard=new BootstrapPageGuard<object>(p=>closed.push(p));expect(guard.inspectStartup([startup])).toBe(startup);guard.opened(startup);guard.startupRemoved([]);guard.beginApp();guard.opened(app);guard.appReturned(app,[app]);expect(guard.ready(app,[app])).toBe(true);guard.opened(app);expect(closed).toEqual([]);
});
it.each(['early','empty','creation','wrong-return','later','already-closed'] as const)('permanently latches %s unexpected page and delivers a late subscription',phase=>{
  const start={},app={},other={},closed:object[]=[];const g=new BootstrapPageGuard<object>(p=>closed.push(p));
  if(phase==='early'){g.opened(other);expect(()=>g.inspectStartup([start])).toThrow('TARGET_DRIFT');}
  else{g.inspectStartup([start]);if(phase==='already-closed'){g.opened(other);expect(()=>{g.startupRemoved([]);}).toThrow();}
    else{g.startupRemoved([]);if(phase==='empty')g.opened(other);else{g.beginApp();g.opened(app);if(phase==='creation')g.opened(other);else if(phase==='wrong-return')expect(()=>{g.appReturned(other,[other]);}).toThrow();else{g.appReturned(app,[app]);g.opened(other);}}}}
  expect(()=>{g.check();}).toThrow('TARGET_DRIFT');const notified=vi.fn();g.subscribe(notified);expect(notified).toHaveBeenCalledOnce();expect(g.ready(app,[app])).toBe(false);expect(closed.length).toBeGreaterThan(0);
});
it.each([{pages:[]},{pages:[{},{}]}])('refuses non-sole startup set %j',({pages})=>{const g=new BootstrapPageGuard<object>(()=>undefined);expect(()=>g.inspectStartup(pages)).toThrow('TARGET_DRIFT');});
it('refuses an undeleted startup page or unissued app creation',()=>{const page={},g=new BootstrapPageGuard<object>(()=>undefined);g.inspectStartup([page]);expect(()=>{g.beginApp();}).toThrow();expect(()=>{g.startupRemoved([page]);}).toThrow();});
it('does not extend the absolute deadline across sequential startup work',async()=>{vi.useFakeTimers();const end=Date.now()+20;await expect(boundedStartup(()=>Promise.resolve('first'),end)).resolves.toBe('first');const pending=boundedStartup(()=>new Promise<string>(()=>undefined),end);const caught=pending.catch((e:unknown)=>e instanceof Error?e.message:'bad');await vi.advanceTimersByTimeAsync(20);expect(await caught).toBe('TIMEOUT');await expect(boundedStartup(()=>Promise.resolve('late'),end)).rejects.toThrow('TIMEOUT');});
it('rejects abort, asynchronous failure and expiry after late work without accepting a page',async()=>{const controller=new AbortController();controller.abort();await expect(boundedStartup(()=>Promise.resolve('no'),Date.now()+50,controller.signal)).rejects.toThrow('CANCELLED');await expect(boundedStartup(()=>Promise.reject(new Error('probe failed')),Date.now()+50)).rejects.toThrow('probe failed');
  const next=new AbortController();let done:(value:string)=>void=()=>undefined;const wait=boundedStartup(()=>new Promise<string>(r=>{done=r;}),Date.now()+50,next.signal);await Promise.resolve();const rejected=wait.catch((e:unknown)=>e instanceof Error?e.message:'bad');next.abort();expect(await rejected).toBe('CANCELLED');done('late');
});

it('keeps a strictly earlier operation cap final even when work completes before the absolute deadline', async () => {
  let complete: (value: string) => void = () => undefined;
  let observed: Promise<unknown> | undefined;
  vi.useFakeTimers();
  try {
    const deadline = Date.now() + 60_000;
    let accepted = false;
    const pending = boundedStartup(() => new Promise<string>(resolve => { complete = resolve; }), deadline, undefined, 30_000);
    observed = pending.then(value => { accepted = true; return value; }, (error: unknown) => error);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(30_000);
    const capError = await observed;
    expect(capError).toBeInstanceOf(Error);
    expect(capError).toMatchObject({ message: 'TIMEOUT' });
    expect(accepted).toBe(false);
    complete('late but before the whole deadline');
    await Promise.resolve();
    expect(await observed).toBe(capError);
    expect(accepted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    complete('unit cleanup');
    try { if (observed !== undefined) await observed; }
    finally { vi.useRealTimers(); }
  }
});

it('preserves a rejected Error("TIMEOUT") identity and own-property shape', async () => {
  vi.useFakeTimers();
  try {
    const ordinary = new Error('TIMEOUT');
    const originalKeys = Reflect.ownKeys(ordinary);
    const received = await boundedStartup(() => Promise.reject(ordinary), Date.now() + 50)
      .then(() => undefined, (error: unknown) => error);
    expect(received).toBe(ordinary);
    expect(Reflect.ownKeys(ordinary)).toEqual(originalKeys);
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});
