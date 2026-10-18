import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ProfileSafetyFixture,ProfileFixtureError,profilePidRows,probeOwnedProfilePid,performLiveProfileRedirect,profileDiagnosticCode} from './helpers/profileSafetyFixture.js';
import type {OwnedContext,PidSession,PidState,ProfileFixturePorts,ProfileFixtureFailure,ProfileRedirectSteps} from './helpers/profileSafetyFixture.js';

function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error?:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
async function throwsUndefined():Promise<void>{
 await Promise.resolve();
 // eslint-disable-next-line @typescript-eslint/only-throw-error -- Adversarial primary-presence regression must retain thrown undefined.
 throw undefined;
}
async function flush(){for(let n=0;n<40;n++)await Promise.resolve();}
const rows=(...ids:number[])=>({processInfo:ids.map((id,i)=>({id,type:i===0?'browser':'renderer',cpuTime:123}))});
interface Handle {close:()=>Promise<void>}
function rig(mode:'contextClose'|'terminate'='contextClose'){
 const context={token:'owned'},log:string[]=[];let connected=true,closing=false,closeEvent:()=>void=()=>undefined,disconnected:()=>void=()=>undefined,wrapped:()=>Promise<void>=()=>Promise.reject(Error('NO_WRAPPER'));
 const detach=vi.fn(()=>Promise.resolve()),session=vi.fn(()=>Promise.resolve<PidSession>({send:()=>Promise.resolve(rows(101,102)),detach}));
 const emit=()=>{closeEvent();connected=false;disconnected();};
 const rawClose=vi.fn(()=>{log.push('raw-fulfillment');emit();return Promise.resolve();});
 const owned={value:context,rawClose,installClose:vi.fn((f:()=>Promise<void>)=>{wrapped=f;}),connected:()=>connected,closing:()=>closing,hasPage:():boolean=>true,onClose:vi.fn<OwnedContext<typeof context>['onClose']>((f:()=>void)=>{closeEvent=f;return vi.fn();}),onDisconnected:vi.fn<OwnedContext<typeof context>['onDisconnected']>((f:()=>void)=>{disconnected=f;return vi.fn();}),session,fallbackBrowserClose:vi.fn(()=>{emit();return Promise.resolve();})} satisfies OwnedContext<typeof context>;
 const expected=Object.assign(Error('CONTEXT_LOST'),{kind:'expected-failure',close:()=>wrapped()}),success:Handle={close:()=>wrapped()};
 const ports={bind:vi.fn(()=>owned),attack:vi.fn(()=>Promise.resolve()),closeOutcome:vi.fn<ProfileFixturePorts<typeof context,Handle>['closeOutcome']>(async outcome=>{if(outcome.returned)await outcome.value?.close();else if(outcome.error===expected)await expected.close();}),probe:vi.fn((pid:number):PidState=>{void pid;log.push('probe');return'DEAD';}),release:vi.fn(),remove:vi.fn(()=>Promise.resolve()),persist:vi.fn(()=>Promise.resolve()),productionTeardown:mode} satisfies ProfileFixturePorts<typeof context,Handle>;
 const helper=new ProfileSafetyFixture<typeof context,Handle>(ports);let handed:typeof context|undefined;
 function run(result:'failure'|'success'|'unrelated'='failure',body?:()=>Promise<void>){
  const promise=helper.run(async()=>{handed=await helper.handoff(context);if(result==='failure')throw expected;if(result==='unrelated')throw Error('UNRELATED');return success;},async outcome=>{if(body){await body();return;}expect(outcome.returned).toBe(false);expect(outcome.error).toBe(expected);await helper.productionClose(()=>expected.close());});
  const outcome=promise.then(value=>({value,error:undefined}),(error:unknown)=>({value:undefined,error:error as ProfileFixtureFailure}));return{promise,outcome};
 }
 return{context,owned,ports,helper,rawClose,session,detach,expected,success,log,emit,run,handed:()=>handed,setConnected:(value:boolean)=>{connected=value;},setClosing:(value:boolean)=>{closing=value;},wrapped:()=>wrapped()};
}
beforeEach(()=>{vi.useFakeTimers();});afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
async function finish<T>(promise:Promise<T>):Promise<T>{await flush();await vi.runAllTimersAsync();return promise;}

describe('postlaunch fixture ownership and error-preserving cleanup',()=>{
 it.each(['capture','rename','canary','symlink','verify'] as const)('actual attack sequencing stops at %s failure, hands off and never credits partial attack',async failed=>{
  const r=rig(),order:string[]=[],names=['capture','rename','canary','symlink','verify'] as const;
  const action=(stage:typeof names[number])=>async()=>{await Promise.resolve();order.push(stage);if(stage===failed)throw Error(stage);};
  const steps:ProfileRedirectSteps={capture:action('capture'),rename:action('rename'),canary:action('canary'),symlink:action('symlink'),verify:action('verify')};
  r.ports.attack.mockImplementation(()=>performLiveProfileRedirect(steps));const o=await finish(r.run().outcome);expect(order).toEqual(names.slice(0,names.indexOf(failed)+1));expect(r.handed()).toBe(r.context);expect(o.error?.facts.attackComplete).toBe(false);expect(r.rawClose).toHaveBeenCalledTimes(1);
 });
 it('complete attack hands the identical context to production and requires its own close before removal',async()=>{
  const r=rig(),work=r.run();const result=await finish(work.promise);expect(r.handed()).toBe(r.context);expect(result).toMatchObject({productionTeardown:'contextClose',attackComplete:true,productionRealCloseRequests:1,rawCloseRequests:1,rawCloseFulfilled:true,firstPidState:'DEAD',safeToRemove:true,rootRemoved:true});expect(r.rawClose).toHaveBeenCalledTimes(1);expect(r.log.indexOf('raw-fulfillment')).toBeLessThan(r.log.indexOf('probe'));expect(r.ports.remove).toHaveBeenCalledTimes(1);expect(r.ports.closeOutcome).not.toHaveBeenCalled();expect(r.detach).toHaveBeenCalledTimes(2);expect(vi.getTimerCount()).toBe(0);
 });
 it.each(['rename','canary-after-rename','symlink','identity','canary-write-undefined'] as const)('%s failure still hands back same context and cannot credit expected refusal',async stage=>{
  const r=rig(),error=stage==='canary-write-undefined'?undefined:Error(stage);r.ports.attack.mockRejectedValue(error);const work=r.run();const o=await finish(work.outcome);expect(r.handed()).toBe(r.context);expect(o.error?.primaryPresent).toBe(true);expect(o.error?.primary).toBe(error);expect(o.error?.facts).toMatchObject({setupFailed:true,handedOff:true,attackComplete:false,productionRealCloseRequests:0,rawCloseRequests:1,rootRemoved:true});
 });
 it.each(['rename','canary','symlink'])('partial %s plus returned success stays red and closes actual success handle',async stage=>{
  const r=rig();r.ports.attack.mockRejectedValue(Error(stage));const work=r.run('success');const o=await finish(work.outcome);expect(r.handed()).toBe(r.context);expect(o.error?.primaryPresent).toBe(true);expect(r.ports.closeOutcome).toHaveBeenCalledWith(expect.objectContaining({returned:true,value:r.success}));expect(r.rawClose).toHaveBeenCalledTimes(1);
 });
 it('unexpected success is retained and closed while original refusal assertion stays primary',async()=>{
  const r=rig(),work=r.run('success');const o=await finish(work.outcome);expect(o.error?.primaryPresent).toBe(true);expect(r.ports.closeOutcome).toHaveBeenCalled();expect(r.rawClose).toHaveBeenCalledTimes(1);expect(o.error?.facts.productionRealCloseRequests).toBe(0);
 });
 it('unrelated error is never accepted as expected refusal or used as a foreign cleanup capability',async()=>{
  const r=rig(),work=r.run('unrelated');const o=await finish(work.outcome);expect(o.error?.primaryPresent).toBe(true);expect(r.rawClose).toHaveBeenCalledTimes(1);expect(o.error?.facts.productionRealCloseRequests).toBe(0);
 });
 it.each(['missing-browser','missing-page','closing'])('%s after acquisition is recorded and same-context handoff survives',async kind=>{
  const r=rig();if(kind==='missing-browser')r.setConnected(false);else if(kind==='missing-page')r.owned.hasPage=()=>false;else r.setClosing(true);const o=await finish(r.run().outcome);expect(r.handed()).toBe(r.context);expect(o.error?.facts.setupFailed).toBe(true);expect(o.error?.facts.safeToRemove).toBe(false);expect(r.ports.remove).not.toHaveBeenCalled();expect(r.rawClose).toHaveBeenCalledTimes(1);
 });
 it('foreign adapter cannot be closed/released/removed as owned',async()=>{
  const r=rig(),foreignClose=vi.fn(()=>Promise.resolve());r.ports.bind.mockReturnValue({...r.owned,value:{token:'foreign'},rawClose:foreignClose});const o=await finish(r.run().outcome);expect(o.error?.primaryPresent).toBe(true);expect(foreignClose).not.toHaveBeenCalled();expect(r.rawClose).not.toHaveBeenCalled();expect(r.ports.release).not.toHaveBeenCalled();expect(r.ports.remove).not.toHaveBeenCalled();
 });
 it('pending raw SDK close cannot permit profile/root removal',async()=>{
  const r=rig(),close=deferred<undefined>();r.rawClose.mockImplementation(async()=>{await close.promise;r.emit();});const work=r.run();await flush();expect(r.rawClose).toHaveBeenCalledTimes(1);expect(r.ports.probe).not.toHaveBeenCalled();expect(r.ports.remove).not.toHaveBeenCalled();close.resolve(undefined);await work.promise;expect(r.ports.remove).toHaveBeenCalledTimes(1);
 });
 it('disconnected event alone and context-closing boolean do not replace actual SDK fulfillment',async()=>{
  const r=rig(),close=deferred<undefined>();r.rawClose.mockImplementation(async()=>{r.emit();r.setClosing(true);await close.promise;});const work=r.run();await flush();expect(r.helper.facts.rawCloseFulfilled).toBe(false);expect(r.ports.remove).not.toHaveBeenCalled();close.resolve(undefined);await work.promise;
 });
 it.each(['missing-context-event','missing-disconnected-event'])('%s stays red after raw close fulfillment',async kind=>{
  const r=rig();if(kind==='missing-context-event')r.owned.onClose.mockImplementation(()=>()=>undefined);else r.owned.onDisconnected.mockImplementation(()=>()=>undefined);const o=await finish(r.run().outcome);expect(o.error?.facts.rawCloseFulfilled).toBe(true);expect(o.error?.facts.safeToRemove).toBe(false);expect(r.ports.remove).not.toHaveBeenCalled();
 });
 it.each(['LIVE','UNKNOWN'] as const)('first %s permanently fails even when later probe confirms disappearance',async first=>{
  const r=rig();r.ports.probe.mockReturnValueOnce(first);const o=await finish(r.run().outcome);expect(o.error?.primaryPresent).toBe(true);expect(o.error?.facts).toMatchObject({firstPidState:first,rawCloseFulfilled:true,safeToRemove:true,rootRemoved:true,productionRealCloseRequests:1});expect(o.error?.facts.firstPidProbeMs).toBe(o.error?.facts.rawCloseFulfilledMs);expect(r.rawClose).toHaveBeenCalledTimes(1);
 });
 it('unknown probe exception cannot be credited dead; later cleanup success stays red',async()=>{
  const r=rig();r.ports.probe.mockImplementationOnce(()=>{throw Error('EPERM');});const o=await finish(r.run().outcome);expect(o.error?.facts.firstPidState).toBe('UNKNOWN');expect(o.error?.primaryPresent).toBe(true);
 });
 it('live/reused PID persisting through absolute5s cleanup deadline preserves root',async()=>{
  const r=rig();r.ports.probe.mockReturnValue('LIVE');const start=Date.now(),work=r.run();await flush();expect(vi.getTimerCount()).toBe(1);await vi.advanceTimersByTimeAsync(5000);const o=await work.outcome;expect(Date.now()-start).toBe(5000);expect(o.error?.facts.safeToRemove).toBe(false);expect(r.ports.remove).not.toHaveBeenCalled();expect(r.rawClose).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
 });
 it('cleanup condition polling returns early with one <=50ms timer but keeps first-red result',async()=>{
  const r=rig(),start=Date.now();r.ports.probe.mockImplementation(()=>Date.now()-start<120?'LIVE':'DEAD');const work=r.run();await flush();expect(vi.getTimerCount()).toBe(1);await vi.advanceTimersByTimeAsync(150);const o=await work.outcome;expect(o.error?.facts).toMatchObject({firstPidState:'LIVE',safeToRemove:true,rootRemoved:true});expect(Date.now()-start).toBe(150);expect(vi.getTimerCount()).toBe(0);
 });
 it('initial/preclose union retains all observed owned IDs',async()=>{
  const r=rig();r.session.mockResolvedValueOnce({send:()=>Promise.resolve(rows(101,201)),detach:r.detach}).mockResolvedValueOnce({send:()=>Promise.resolve(rows(101,301)),detach:r.detach});await finish(r.run().promise);expect(new Set(r.ports.probe.mock.calls.map(c=>c[0]))).toEqual(new Set([101,201,301]));expect(r.helper.facts.ownedPidCount).toBe(3);
 });
 it('saved close is memoized through repeated cleanup invocation; no extra snapshot or deadline',async()=>{
  const r=rig();await finish(r.run().promise);await r.wrapped();await r.helper.close();expect(r.rawClose).toHaveBeenCalledTimes(1);expect(r.session).toHaveBeenCalledTimes(2);
 });
 it('fixture fallback cannot supply missing production-close proof',async()=>{
  const r=rig(),o=await finish(r.run('failure',()=>Promise.resolve()).outcome);expect(o.error?.primaryPresent).toBe(true);expect(o.error?.facts).toMatchObject({productionRealCloseRequests:0,rawCloseRequests:1,rootRemoved:true});
 });
 it('close rejection retains original error, attempts only owned browser fallback, and remains red',async()=>{
  const r=rig(),failure=Error('RAW_CLOSE');r.rawClose.mockRejectedValue(failure);const o=await finish(r.run().outcome);expect(o.error?.primary).toBe(failure);expect(r.owned.fallbackBrowserClose).toHaveBeenCalledTimes(1);expect(o.error?.facts).toMatchObject({fallbackFulfilled:true,safeToRemove:true,rootRemoved:true,rawCloseFulfilled:false});expect(r.rawClose).toHaveBeenCalledTimes(1);
 });
 it('fallback rejection retains root and ordered cleanup errors',async()=>{
  const r=rig();r.rawClose.mockRejectedValue(Error('RAW'));r.owned.fallbackBrowserClose.mockRejectedValue(Error('FALLBACK'));const o=await finish(r.run().outcome);expect(o.error?.secondary.map(e=>e.phase)).toEqual(['OUTCOME','CONTEXT','FALLBACK','REMOVE']);expect(r.ports.remove).not.toHaveBeenCalled();
 });
 it('body error and rm failure preserve primary and secondary without replacement',async()=>{
  const r=rig(),bodyError=Error('CANARY_CHANGED'),rmError=Error('ENOTEMPTY');r.ports.remove.mockRejectedValue(rmError);const work=r.run('failure',async()=>{await r.helper.productionClose(()=>r.expected.close());throw bodyError;});const o=await finish(work.outcome);expect(o.error?.primary).toBe(bodyError);expect(o.error?.secondary).toEqual([{phase:'REMOVE',error:rmError}]);expect(r.ports.persist).toHaveBeenCalled();
 });
 it('successful body plus cleanup failure is still red and diagnostics do not mask it',async()=>{
  const r=rig(),rmError=Error('ENOTEMPTY'),diagnosticError=Error('DIAGNOSTICS');r.ports.remove.mockRejectedValue(rmError);r.ports.persist.mockRejectedValue(diagnosticError);const o=await finish(r.run().outcome);expect(o.error?.primaryPresent).toBe(false);expect(o.error?.secondary).toEqual([{phase:'REMOVE',error:rmError},{phase:'DIAGNOSTICS',error:diagnosticError}]);
 });
 it('retains original errors in memory but serializes only fixed facts for the installed reporter',async()=>{
  const r=rig(),privateError=Error('private-browser-profile-content');r.ports.attack.mockRejectedValue(privateError);const o=await finish(r.run().outcome);expect(o.error?.primary).toBe(privateError);expect(JSON.stringify(o.error)).not.toContain('private-browser-profile-content');expect(JSON.stringify(o.error)).toContain('PROFILE_FIXTURE_FAILED');
 });
 it('diagnostics preserve whitelisted primary/secondary codes while omitting private messages/properties',async()=>{
  const r=rig(),primary=Object.assign(Error('private-browser-content'),{code:'EEXIST',privateText:'private-browser-content'}),cleanup=Object.assign(Error('private-filesystem-content'),{code:'ENOTEMPTY'});r.ports.attack.mockRejectedValue(primary);r.ports.remove.mockRejectedValue(cleanup);const o=await finish(r.run().outcome);expect(o.error?.primary).toBe(primary);expect(o.error?.secondary.some(e=>e.error===cleanup)).toBe(true);expect(o.error?.facts.primaryCode).toBe('EEXIST');expect(o.error?.facts.secondaryCodes).toContainEqual({phase:'REMOVE',code:'ENOTEMPTY'});const text=JSON.stringify(o.error);expect(text).not.toContain('private-browser-content');expect(text).not.toContain('private-filesystem-content');expect(text).toContain('EEXIST');expect(text).toContain('ENOTEMPTY');
 });
 it('unknown diagnostic codes/messages and throwing accessors become fixed UNEXPECTED',()=>{
  expect(profileDiagnosticCode(Object.assign(Error('private'),{code:'private'}))).toBe('UNEXPECTED');expect(profileDiagnosticCode({get code(){throw Error('private');}})).toBe('UNEXPECTED');expect(profileDiagnosticCode(undefined)).toBe('UNEXPECTED');
 });
 it.each(['generic-code','message','internal-code','internal-message','name'] as const)('rejects changing %s accessor without reading it and never persists its private value',async branch=>{
  const r=rig(),error=branch.startsWith('internal')?new ProfileFixtureError('ATTACK_CONTEXT'):Error('private-unexported-original'),property=branch.endsWith('code')?'code':branch==='name'?'name':'message';let reads=0;
  Object.defineProperty(error,property,{configurable:true,get:()=>{reads++;return reads<=(branch==='generic-code'?2:1)?'ENOENT':'private-stateful-accessor-content';}});
  r.ports.attack.mockRejectedValue(error);r.ports.remove.mockRejectedValue(error);const o=await finish(r.run().outcome);expect(o.error?.primary).toBe(error);expect(o.error?.facts.primaryCode).toBe('UNEXPECTED');expect(o.error?.facts.secondaryCodes).toContainEqual({phase:'REMOVE',code:'UNEXPECTED'});expect(profileDiagnosticCode(error)).toBe('UNEXPECTED');expect(reads).toBe(0);const serialized=JSON.stringify(o.error);expect(serialized).not.toContain('private-stateful-accessor-content');expect(serialized).not.toContain('private-unexported-original');expect(reads).toBe(0);
 });
 it('accepts stable own data primitives and ignores inherited accessors without invoking them',()=>{
  expect(profileDiagnosticCode(new ProfileFixtureError('ATTACK_CONTEXT'))).toBe('ATTACK_CONTEXT');expect(profileDiagnosticCode(Error('CONTEXT_LOST'))).toBe('CONTEXT_LOST');expect(profileDiagnosticCode(Object.assign(Error('private'),{name:'AssertionError'}))).toBe('ASSERTION');
  let reads=0;const inherited=Object.create({get code(){reads++;return'ENOENT';}}) as object;expect(profileDiagnosticCode(inherited)).toBe('UNEXPECTED');expect(reads).toBe(0);
 });
 it('release/listener cleanup errors stay ordered and remaining safe remove/persist stages run',async()=>{
  const r=rig();const register=r.owned.onClose.getMockImplementation();if(!register)throw Error('REGISTER');r.owned.onClose.mockImplementation(listener=>{const off=register(listener);return()=>{off();throw Error('LISTENER');};});r.ports.release.mockImplementation(()=>{throw Error('RELEASE');});const o=await finish(r.run().outcome);expect(o.error?.secondary.map(e=>e.phase)).toEqual(['LISTENERS','RELEASE']);expect(r.ports.remove).toHaveBeenCalled();expect(r.ports.persist).toHaveBeenCalled();
 });
 it.each(['CANARY_CHANGED','CANARY_MISSING','OUTSIDE_IDENTITY'])('%s stays primary after safe cleanup',async code=>{
  const r=rig(),failure=Error(code);const o=await finish(r.run('failure',async()=>{await r.helper.productionClose(()=>r.expected.close());throw failure;}).outcome);expect(o.error?.primary).toBe(failure);expect(o.error?.facts.rootRemoved).toBe(true);
 });
 it('thrown undefined body is preserved with explicit presence',async()=>{
  const r=rig(),o=await finish(r.run('failure',throwsUndefined).outcome);expect(o.error?.primaryPresent).toBe(true);expect(o.error?.primary).toBeUndefined();
 });
});

describe('bounded public-browser process capture and late resources',()=>{
 it.each([null,{}, {processInfo:[]},rows(0),rows(-1),rows(1.5),{processInfo:[{id:2,type:'renderer'}]}, {processInfo:[{id:1,type:'browser'},null]},rows(...Array.from({length:1025},(_,i)=>i+1))])('rejects invalid capture %#',value=>{expect(()=>profilePidRows(value)).toThrow('PID_CAPTURE');});
 it('retains only numeric IDs/fixed process enums and discards unexpected fields',()=>{const result=profilePidRows({processInfo:[{id:1,type:'browser',secret:'private'},{id:2,type:'unexpected-secret',cpuTime:3}]});expect([...result]).toEqual([[1,'browser'],[2,'other']]);});
 it('signal0 distinguishes ESRCH only; EPERM and other errors are unknown, live/reused is live',()=>{
  const kill=vi.spyOn(process,'kill');kill.mockImplementationOnce(()=>{throw Object.assign(Error(),{code:'ESRCH'});}).mockImplementationOnce(()=>{throw Object.assign(Error(),{code:'EPERM'});}).mockImplementationOnce(()=>{throw Error('UNKNOWN');}).mockReturnValueOnce(true);
  expect([probeOwnedProfilePid(1),probeOwnedProfilePid(2),probeOwnedProfilePid(3),probeOwnedProfilePid(4)]).toEqual(['DEAD','UNKNOWN','UNKNOWN','LIVE']);expect(kill.mock.calls.every(call=>call[1]===0)).toBe(true);
 });
 it('invalid initial capture hands context back, closes it, but never grants root deletion',async()=>{
  const r=rig();r.session.mockResolvedValueOnce({send:()=>Promise.resolve(rows()),detach:r.detach});const o=await finish(r.run().outcome);expect(r.handed()).toBe(r.context);expect(o.error?.facts.initialSnapshotValid).toBe(false);expect(r.ports.attack).not.toHaveBeenCalled();expect(r.rawClose).toHaveBeenCalledTimes(1);expect(r.ports.remove).not.toHaveBeenCalled();
 });
 it('preclose capture failure still invokes rawclose and invalidates first observation/removal',async()=>{
  const r=rig();r.session.mockResolvedValueOnce({send:()=>Promise.resolve(rows(101)),detach:r.detach}).mockResolvedValueOnce({send:()=>Promise.reject(Error('CAPTURE')),detach:r.detach});const o=await finish(r.run().outcome);expect(o.error?.facts).toMatchObject({firstPidState:'INVALID',precloseSnapshotValid:false,rawCloseFulfilled:true,safeToRemove:false});expect(r.rawClose).toHaveBeenCalledTimes(1);expect(r.ports.remove).not.toHaveBeenCalled();
 });
 it('union over1024 never loses earlier IDs to make a close pass',async()=>{
  const r=rig();r.session.mockResolvedValueOnce({send:()=>Promise.resolve(rows(...Array.from({length:600},(_,i)=>i+1))),detach:r.detach}).mockResolvedValueOnce({send:()=>Promise.resolve(rows(...Array.from({length:600},(_,i)=>i+601))),detach:r.detach});const o=await finish(r.run().outcome);expect(o.error?.facts.ownedPidCount).toBe(600);expect(o.error?.facts.precloseSnapshotValid).toBe(false);expect(r.ports.remove).not.toHaveBeenCalled();
 });
 it('capture deadline consumes late session creation and detaches it without sending',async()=>{
  const r=rig(),late=deferred<PidSession>(),lateDetach=vi.fn(()=>Promise.resolve()),lateSend=vi.fn(()=>Promise.resolve(rows(1)));r.session.mockImplementationOnce(()=>late.promise);const work=r.run();await flush();await vi.advanceTimersByTimeAsync(5000);await flush();expect(r.handed()).toBe(r.context);late.resolve({send:lateSend,detach:lateDetach});const o=await finish(work.outcome);expect(lateSend).not.toHaveBeenCalled();expect(lateDetach).toHaveBeenCalledTimes(1);expect(o.error?.facts.setupFailed).toBe(true);expect(r.ports.remove).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
 });
 it('late rejected capture is consumed; session and listeners dispose and root remains',async()=>{
  const r=rig(),late=deferred<unknown>(),off=vi.fn();r.owned.onClose.mockImplementation(()=>off);r.session.mockResolvedValueOnce({send:()=>late.promise,detach:r.detach});const work=r.run();await flush();await vi.advanceTimersByTimeAsync(5000);late.reject(Error('PRIVATE_CAPTURE'));const o=await finish(work.outcome);expect(o.error?.facts.setupFailed).toBe(true);expect(r.detach).toHaveBeenCalled();expect(off).toHaveBeenCalled();expect(r.ports.remove).not.toHaveBeenCalled();
 });
 it('session detach failure is red and rawclose still executes',async()=>{
  const r=rig();r.detach.mockRejectedValueOnce(Error('DETACH'));const o=await finish(r.run().outcome);expect(o.error?.facts.setupFailed).toBe(true);expect(r.rawClose).toHaveBeenCalledTimes(1);expect(o.error?.secondary.some(e=>e.phase==='SESSIONS')).toBe(true);expect(r.ports.remove).not.toHaveBeenCalled();
 });
});

// Pre-F-merge ruling item 1 (F-R2-1): a launch that fails after context acquisition takes the HARD teardown, never a graceful close.
describe('terminate oracle for a failed launch (no production context.close, every owned process gone at the first probe)',()=>{
 /** The launcher's catch has already run its teardown when the body starts, so `production` plays the launcher between handoff and rejection. */
 function failedLaunch(r:ReturnType<typeof rig>,production:()=>Promise<void>|void,body?:()=>Promise<void>){
  const promise=r.helper.run(async()=>{await r.helper.handoff(r.context);await production();throw r.expected;},async()=>{if(body){await body();return;}r.helper.observeProductionTeardown();});
  return promise.then(value=>({value,error:undefined}),(error:unknown)=>({value:undefined,error:error as ProfileFixtureFailure}));
 }
 it('credits a hard teardown that made no context.close, left every owned PID dead at the first probe and disconnected the browser',async()=>{
  const r=rig('terminate'),work=failedLaunch(r,()=>{r.emit();});const o=await finish(work);
  expect(o.error).toBeUndefined();expect(o.value).toMatchObject({productionTeardown:'terminate',productionRealCloseRequests:0,rawCloseRequests:0,rawCloseFulfilled:false,firstPidState:'DEAD',safeToRemove:true,rootRemoved:true,precloseSnapshotValid:true,ownedPidCount:2});
  expect(r.rawClose).not.toHaveBeenCalled();expect(r.ports.remove).toHaveBeenCalledTimes(1);expect(r.session).toHaveBeenCalledTimes(2);expect(r.ports.closeOutcome).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
 });
 it('a production context.close on the failed launch is red with GRACEFUL_CLOSE_ON_FAILED_LAUNCH even when the processes are gone',async()=>{
  const r=rig('terminate'),work=failedLaunch(r,()=>r.expected.close());const o=await finish(work);
  expect(o.error?.primaryPresent).toBe(true);expect(o.error?.facts).toMatchObject({productionTeardown:'terminate',productionRealCloseRequests:1,primaryCode:'GRACEFUL_CLOSE_ON_FAILED_LAUNCH'});
  expect(profileDiagnosticCode(o.error?.primary)).toBe('GRACEFUL_CLOSE_ON_FAILED_LAUNCH');
 });
 it('an owned PID that is LIVE at the first probe stays red TERMINATE_UNCONFIRMED even though a later poll finds it gone',async()=>{
  const r=rig('terminate');r.ports.probe.mockReturnValueOnce('LIVE');const o=await finish(failedLaunch(r,()=>{r.emit();}));
  expect(o.error?.primaryPresent).toBe(true);expect(o.error?.facts).toMatchObject({primaryCode:'TERMINATE_UNCONFIRMED',firstPidState:'LIVE',productionRealCloseRequests:0});
  expect(o.error?.facts.firstPidProbeMs).not.toBeNull();expect(r.ports.probe.mock.calls.length).toBeGreaterThan(2);
 });
 it('an UNKNOWN first probe and a browser that is still connected are red TERMINATE_UNCONFIRMED too',async()=>{
  const unknown=rig('terminate');unknown.ports.probe.mockReturnValueOnce('UNKNOWN');const a=await finish(failedLaunch(unknown,()=>{unknown.emit();}));
  expect(a.error?.facts).toMatchObject({primaryCode:'TERMINATE_UNCONFIRMED',firstPidState:'UNKNOWN'});
  const connected=rig('terminate');const b=await finish(failedLaunch(connected,()=>undefined));
  expect(b.error?.facts).toMatchObject({primaryCode:'TERMINATE_UNCONFIRMED',firstPidState:'DEAD'});
 });
 it('a body that never observes the production teardown cannot be credited: PRODUCTION_TERMINATE_REQUIRED',async()=>{
  const r=rig('terminate'),o=await finish(failedLaunch(r,()=>{r.emit();},()=>Promise.resolve()));
  expect(o.error?.facts).toMatchObject({primaryCode:'PRODUCTION_TERMINATE_REQUIRED',firstPidState:'NOT_OBSERVED',productionRealCloseRequests:0});
 });
 it('the fixture\'s own cleanup close after the body is not counted as a production close',async()=>{
  const r=rig('terminate');r.ports.probe.mockReturnValueOnce('LIVE');const o=await finish(failedLaunch(r,()=>{r.emit();}));
  expect(o.error?.facts.productionRealCloseRequests).toBe(0);expect(o.error?.facts.rawCloseRequests).toBe(1);
 });
});
