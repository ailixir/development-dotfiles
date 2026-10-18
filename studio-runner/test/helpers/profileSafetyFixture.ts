/**
 * Test-only live-redirect ownership. PID waiting is fixture scheduling, never production timing proof.
 *
 * Two oracles say which production call confirms the browser closed. `contextClose` (default; a started session) requires exactly
 * one real `context.close()`. `terminate` (a launch that fails after context acquisition, pre-F-merge ruling item 1 / F-R2-1)
 * requires zero real `context.close()` requests and every owned PID gone at the first probe: that path takes the hard teardown.
 */
export type ProductionTeardown='contextClose'|'terminate';
export type PidState='DEAD'|'LIVE'|'UNKNOWN';
type Phase='SETUP'|'OUTCOME'|'CONTEXT'|'FALLBACK'|'SESSIONS'|'LISTENERS'|'RELEASE'|'REMOVE'|'DIAGNOSTICS';
export interface PidSession {send:()=>Promise<unknown>;detach:()=>Promise<void>}
export interface ProfileRedirectSteps {capture:()=>Promise<void>;rename:()=>Promise<void>;canary:()=>Promise<void>;symlink:()=>Promise<void>;verify:()=>Promise<void>}
/** Shared by the actual live fixture and fault controls: the destination never exists before rename. */
export async function performLiveProfileRedirect(steps:ProfileRedirectSteps):Promise<void>{await steps.capture();await steps.rename();await steps.canary();await steps.symlink();await steps.verify();}
export interface OwnedContext<C> {
 value:C;rawClose:()=>Promise<void>;installClose:(close:()=>Promise<void>)=>void;
 connected:()=>boolean;closing:()=>boolean;hasPage:()=>boolean;
 onClose:(listener:()=>void)=>(()=>void);onDisconnected:(listener:()=>void)=>(()=>void);
 session:()=>Promise<PidSession>;fallbackBrowserClose:()=>Promise<void>;
}
export interface Outcome<T>{returned:boolean;value:T|undefined;thrownPresent:boolean;error:unknown}
export interface ProfileFixturePorts<C,T> {
 bind:(context:C)=>OwnedContext<C>;
 attack:()=>Promise<void>;
 closeOutcome:(outcome:Outcome<T>)=>Promise<void>;
 probe:(pid:number)=>PidState;
 release:()=>void;
 remove:()=>Promise<void>;
 persist:(facts:ProfileFixtureFacts)=>Promise<void>;
 /** Which production call confirms closure. Defaults to `contextClose`. */
 productionTeardown?:ProductionTeardown;
}
export interface ProfileFixtureFacts {
 acquired:boolean;handedOff:boolean;attackComplete:boolean;setupFailed:boolean;primaryPresent:boolean;launchReturned:boolean;launchThrew:boolean;
 productionRealCloseRequests:number;rawCloseRequests:number;rawCloseRequestedMs:number|null;rawCloseFulfilled:boolean;rawCloseFulfilledMs:number|null;
 contextCloseEvent:boolean;browserDisconnectedEvent:boolean;firstPidProbeMs:number|null;firstPidState:PidState|'INVALID'|'NOT_OBSERVED';
 initialSnapshotValid:boolean;precloseSnapshotValid:boolean;ownedPidCount:number;safeToRemove:boolean;
 productionTeardown:ProductionTeardown;fallbackRequested:boolean;fallbackFulfilled:boolean;rootRemoved:boolean;primaryCode:string;secondaryPhases:Phase[];secondaryCodes:{phase:Phase;code:string}[];
}
export class ProfileFixtureError extends Error{constructor(readonly code:string){super(code);}}
const diagnosticCodes=new Set(['ENOTEMPTY','EEXIST','ENOENT','EPERM','EACCES','EBUSY','EMFILE','ENFILE','PID_CAPTURE','PID_CAPTURE_LATE','PID_CAPTURE_DEADLINE','ATTACK_CONTEXT','ATTACK_PROFILE','ATTACK_DIRECTORY','ATTACK_BROWSER','ATTACK_SYMLINK','CONTEXT_UNOWNED','ATTACK_INCOMPLETE','FIRST_CLOSE_OBSERVATION','PRODUCTION_CLOSE_REQUIRED','TEARDOWN_UNCONFIRMED','CLEANUP_CAPABILITY','CONTEXT_LOST','GRACEFUL_CLOSE_ON_FAILED_LAUNCH','TERMINATE_UNCONFIRMED','PRODUCTION_TERMINATE_REQUIRED']);
/** Never exports arbitrary error messages, codes or properties. Unknown SDK errors remain opaque. */
export function profileDiagnosticCode(value:unknown):string{
 try{
  if(!value||typeof value!=='object')return'UNEXPECTED';
  const codeDescriptor=Object.getOwnPropertyDescriptor(value,'code'),messageDescriptor=Object.getOwnPropertyDescriptor(value,'message'),nameDescriptor=Object.getOwnPropertyDescriptor(value,'name');
  // Reject accessors without invoking them, including on our internal Error subclass.
  for(const descriptor of [codeDescriptor,messageDescriptor,nameDescriptor])if(descriptor&&!('value'in descriptor))return'UNEXPECTED';
  const code:unknown=codeDescriptor?.value,message:unknown=messageDescriptor?.value,name:unknown=nameDescriptor?.value;
  if(typeof code==='string'&&diagnosticCodes.has(code))return code;
  if(value instanceof AggregateError)return'CLEANUP_MULTIPLE';
  if(value instanceof Error){if(name==='AssertionError')return'ASSERTION';if(typeof message==='string'&&diagnosticCodes.has(message))return message;}
 }catch{/* A proxy descriptor trap cannot replace the original error or export its content. */}
 return'UNEXPECTED';
}
export class ProfileFixtureFailure extends Error {
 constructor(readonly primaryPresent:boolean,readonly primary:unknown,readonly secondary:readonly {phase:Phase;error:unknown}[],readonly facts:ProfileFixtureFacts){super('PROFILE_FIXTURE_FAILED');}
 // Installed Vitest serializeValue honors Error.toJSON; keep original errors in memory only.
 toJSON(){return{code:'PROFILE_FIXTURE_FAILED',primaryPresent:this.primaryPresent,secondaryPhases:this.secondary.map(e=>e.phase),facts:this.facts};}
}
const fixed=(code:string):ProfileFixtureError=>new ProfileFixtureError(code);
export function probeOwnedProfilePid(pid:number):PidState {
 try{process.kill(pid,0);return'LIVE';}catch(error){return(error as NodeJS.ErrnoException).code==='ESRCH'?'DEAD':'UNKNOWN';}
}
/** Strict bounded public-browser snapshot; never accepts an empty/foreign/malformed process table. */
export function profilePidRows(value:unknown):Map<number,string>{
 if(!value||typeof value!=='object'||!('processInfo'in value)||!Array.isArray(value.processInfo)||value.processInfo.length<1||value.processInfo.length>1024)throw fixed('PID_CAPTURE');
 const result=new Map<number,string>();let browser=false;
 for(const item of value.processInfo as unknown[]){
  if(!item||typeof item!=='object'||!('id'in item)||!('type'in item)||typeof item.id!=='number'||!Number.isSafeInteger(item.id)||item.id<1||typeof item.type!=='string'||!item.type)throw fixed('PID_CAPTURE');
  if(item.type==='browser')browser=true;
  result.set(item.id,['browser','renderer','GPU','utility'].includes(item.type)?item.type:'other');
 }
 if(!browser||result.size>1024)throw fixed('PID_CAPTURE');return result;
}

export class ProfileSafetyFixture<C,T> {
 readonly facts:ProfileFixtureFacts={acquired:false,handedOff:false,attackComplete:false,setupFailed:false,primaryPresent:false,launchReturned:false,launchThrew:false,productionRealCloseRequests:0,rawCloseRequests:0,rawCloseRequestedMs:null,rawCloseFulfilled:false,rawCloseFulfilledMs:null,contextCloseEvent:false,browserDisconnectedEvent:false,firstPidProbeMs:null,firstPidState:'NOT_OBSERVED',initialSnapshotValid:false,precloseSnapshotValid:false,ownedPidCount:0,safeToRemove:false,productionTeardown:'contextClose',fallbackRequested:false,fallbackFulfilled:false,rootRemoved:false,primaryCode:'NONE',secondaryPhases:[],secondaryCodes:[]};
 private actual:C|undefined;private owned:OwnedContext<C>|undefined;
 private setupPresent=false;private setupError:unknown;private productionCall=false;private bodyStarted=false;
 private closePromise:Promise<void>|undefined;private readonly pids=new Map<number,string>();
 private readonly listeners:(()=>void)[]=[];private readonly sessions=new Map<PidSession,Promise<void>|undefined>();
 private readonly captures=new Set<Promise<void>>();private captureFailed=false;
 constructor(private readonly ports:ProfileFixturePorts<C,T>){this.facts.productionTeardown=ports.productionTeardown??'contextClose';}
 private get terminateMode():boolean{return this.facts.productionTeardown==='terminate';}
 private detach(session:PidSession):Promise<void>{let task=this.sessions.get(session);if(!task){task=Promise.resolve().then(()=>session.detach());this.sessions.set(session,task);void task.catch(()=>undefined);}return task;}
 private async snapshot():Promise<void>{
  if(!this.owned)throw fixed('PID_CAPTURE');const owned=this.owned,deadline=Date.now()+5000;let expired=false,timer:ReturnType<typeof setTimeout>|undefined;
  const tooLate=():boolean=>expired||Date.now()>=deadline;
  const task=(async()=>{
   const session=await owned.session();this.sessions.set(session,undefined);
   try{
    if(tooLate())throw fixed('PID_CAPTURE_LATE');
    const rows=profilePidRows(await session.send());if(tooLate())throw fixed('PID_CAPTURE_LATE');
    const combined=new Map([...this.pids,...rows]);if(combined.size>1024)throw fixed('PID_CAPTURE');
    this.pids.clear();for(const [pid,type]of combined)this.pids.set(pid,type);this.facts.ownedPidCount=this.pids.size;
   }finally{await this.detach(session);}
  })();
  this.captures.add(task);void task.catch(()=>undefined);
  try{await Promise.race([task,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{expired=true;reject(fixed('PID_CAPTURE_DEADLINE'));},5000);})]);}
  catch(error){this.captureFailed=true;throw error;}
  finally{if(timer)clearTimeout(timer);}
 }
 /** All post-acquisition failures are recorded; the SAME actual context always reaches production. */
 async handoff(context:C):Promise<C>{
  this.actual=context;this.facts.acquired=true;
  try{
   const owned=this.ports.bind(context);if(owned.value!==this.actual)throw fixed('CONTEXT_UNOWNED');this.owned=owned;
   owned.installClose(()=>this.close());
   this.listeners.push(owned.onClose(()=>{this.facts.contextCloseEvent=true;}));
   this.listeners.push(owned.onDisconnected(()=>{this.facts.browserDisconnectedEvent=true;}));
   if(!owned.hasPage()||!owned.connected()||owned.closing())throw fixed('ATTACK_CONTEXT');
   await this.snapshot();this.facts.initialSnapshotValid=true;
   if(!owned.connected()||owned.closing())throw fixed('ATTACK_CONTEXT');
   await this.ports.attack();
   if(!owned.connected()||owned.closing())throw fixed('ATTACK_CONTEXT');
   // The launcher's catch runs its teardown before the body sees the outcome, so the second snapshot must exist before production acts.
   if(this.terminateMode){await this.snapshot();this.facts.precloseSnapshotValid=true;if(!owned.connected()||owned.closing())throw fixed('ATTACK_CONTEXT');}
   this.facts.attackComplete=true;
  }catch(error){this.setupPresent=true;this.setupError=error;this.facts.setupFailed=true;}
  this.facts.handedOff=true;return context;
 }
 assertAttack():void{if(this.setupPresent)throw this.setupError;if(!this.facts.attackComplete)throw fixed('ATTACK_INCOMPLETE');}
 async productionClose(action:()=>Promise<void>):Promise<void>{this.productionCall=true;try{await action();}finally{this.productionCall=false;}}
 /**
  * `terminate` mode only: called by the body right after the launcher rejected, whose hard teardown has already settled. Records the first
  * probe once; credit needs every owned PID DEAD and the browser disconnected. Any raw close during production is red first.
  */
 observeProductionTeardown():void{
  if(!this.terminateMode||!this.owned)throw fixed('CONTEXT_UNOWNED');
  if(this.facts.productionRealCloseRequests>0)throw fixed('GRACEFUL_CLOSE_ON_FAILED_LAUNCH');
  this.facts.firstPidProbeMs=Date.now();const first=this.state();this.facts.firstPidState=first;
  this.facts.safeToRemove=first==='DEAD'&&!this.owned.connected()&&this.facts.browserDisconnectedEvent;
  if(!this.facts.safeToRemove)throw fixed('TERMINATE_UNCONFIRMED');
 }
 private state():PidState {
  if(!this.facts.initialSnapshotValid||!this.facts.precloseSnapshotValid||this.captureFailed||this.pids.size<1)return'UNKNOWN';
  let state:PidState='DEAD';for(const pid of this.pids.keys()){let probe:PidState;try{probe=this.ports.probe(pid);}catch{probe='UNKNOWN';}if(probe==='UNKNOWN')state='UNKNOWN';else if(probe==='LIVE'&&state==='DEAD')state='LIVE';}return state;
 }
 private closeEvents():boolean{return!!this.owned&&!this.owned.connected()&&this.facts.contextCloseEvent&&this.facts.browserDisconnectedEvent;}
 private async cleanupPoll(deadline:number):Promise<boolean>{
  for(;;){if(this.state()==='DEAD')return true;const remaining=deadline-Date.now();if(remaining<=0)return false;await new Promise<void>(resolve=>setTimeout(resolve,Math.min(50,remaining)));}
 }
 /** Memoizes one raw SDK close; a first LIVE/UNKNOWN observation remains red after cleanup polling. */
 close():Promise<void>{
  // `terminate` mode: every wrapper call before the body starts is the launcher's own close, i.e. a production close.
  this.closePromise??=this.closeOnce(this.productionCall||(this.terminateMode&&!this.bodyStarted));void this.closePromise.catch(()=>undefined);return this.closePromise;
 }
 private async closeOnce(production:boolean):Promise<void>{
  const owned=this.owned;if(!owned)throw fixed('CONTEXT_UNOWNED');let captureError=false,rawErrorPresent=false,rawError:unknown;
  try{await this.snapshot();this.facts.precloseSnapshotValid=true;}catch{captureError=true;}
  this.facts.rawCloseRequests++;if(production)this.facts.productionRealCloseRequests++;
  this.facts.rawCloseRequestedMs=Date.now();
  try{await owned.rawClose();this.facts.rawCloseFulfilled=true;this.facts.rawCloseFulfilledMs=Date.now();}catch(error){rawErrorPresent=true;rawError=error;}
  const deadline=Date.now()+5000;
  // The first observation is recorded once. In `terminate` mode it belongs to observeProductionTeardown alone, never to a cleanup close.
  const first=this.state();
  if(!this.terminateMode){this.facts.firstPidProbeMs=Date.now();this.facts.firstPidState=captureError||this.captureFailed?'INVALID':first;}
  const firstGood=first==='DEAD'&&this.closeEvents()&&this.facts.rawCloseFulfilled&&!captureError&&!this.captureFailed;
  const gone=first==='DEAD'||await this.cleanupPoll(deadline);
  this.facts.safeToRemove=gone&&this.closeEvents()&&this.facts.rawCloseFulfilled&&!this.captureFailed;
  if(rawErrorPresent)throw rawError;
  if(!firstGood)throw fixed('FIRST_CLOSE_OBSERVATION');
 }
 /** Retains success OR failure capability before assertions, then preserves primary and ordered cleanup errors. */
 async run(launch:()=>Promise<T>,body:(outcome:Outcome<T>)=>Promise<void>):Promise<ProfileFixtureFacts>{
  const outcome:Outcome<T>={returned:false,value:undefined,thrownPresent:false,error:undefined};let primaryPresent=false,primary:unknown;
  const secondary:{phase:Phase;error:unknown}[]=[];
  const stage=async(phase:Phase,action:()=>void|Promise<void>):Promise<void>=>{try{await action();}catch(error){secondary.push({phase,error});this.facts.secondaryPhases.push(phase);this.facts.secondaryCodes.push({phase,code:profileDiagnosticCode(error)});}};
  try{
   try{outcome.value=await launch();outcome.returned=true;}catch(error){outcome.thrownPresent=true;outcome.error=error;}
   this.facts.launchReturned=outcome.returned;this.facts.launchThrew=outcome.thrownPresent;
   this.bodyStarted=true;this.assertAttack();await body(outcome);
   if(this.terminateMode){
    if(this.facts.productionRealCloseRequests>0)throw fixed('GRACEFUL_CLOSE_ON_FAILED_LAUNCH');
    if(this.facts.firstPidState!=='DEAD'||!this.facts.safeToRemove)throw fixed('PRODUCTION_TERMINATE_REQUIRED');
   }else if(this.facts.productionRealCloseRequests!==1||!this.facts.rawCloseFulfilled||this.facts.firstPidState!=='DEAD'||!this.facts.safeToRemove)throw fixed('PRODUCTION_CLOSE_REQUIRED');
  }catch(error){primaryPresent=true;primary=error;}
  if(!this.facts.safeToRemove){
   await stage('OUTCOME',()=>this.ports.closeOutcome(outcome));
   if(this.facts.acquired)await stage('CONTEXT',()=>this.close());
   if(this.owned?.connected())await stage('FALLBACK',async()=>{const owned=this.owned;if(!owned)throw fixed('CONTEXT_UNOWNED');this.facts.fallbackRequested=true;await owned.fallbackBrowserClose();this.facts.fallbackFulfilled=true;});
   if(this.facts.fallbackFulfilled&&this.closeEvents()&&this.state()==='DEAD')this.facts.safeToRemove=true;
  }
  // Detach known sessions first to unblock pending capture. Late session creation is joined too.
  const join=async(tasks:Iterable<Promise<void>>):Promise<void>=>{const failures:unknown[]=[];for(const result of await Promise.allSettled(tasks))if(result.status==='rejected')failures.push(result.reason);if(failures.length)throw new AggregateError(failures,'SESSION_CLEANUP');};
  await stage('SESSIONS',()=>join([...this.sessions.keys()].map(s=>this.detach(s))));
  await stage('SESSIONS',()=>join(this.captures));
  await stage('LISTENERS',()=>{const errors:unknown[]=[];for(const off of this.listeners){try{off();}catch(error){errors.push(error);}}if(errors.length)throw new AggregateError(errors,'LISTENER_CLEANUP');});
  if(this.facts.safeToRemove){await stage('RELEASE',()=>{this.ports.release();});await stage('REMOVE',async()=>{await this.ports.remove();this.facts.rootRemoved=true;});}
  else await stage('REMOVE',()=>{throw fixed('TEARDOWN_UNCONFIRMED');});
  this.facts.primaryPresent=primaryPresent;
  this.facts.primaryCode=primaryPresent?profileDiagnosticCode(primary):'NONE';
  await stage('DIAGNOSTICS',()=>this.ports.persist(this.result()));
  if(primaryPresent||secondary.length)throw new ProfileFixtureFailure(primaryPresent,primary,secondary,this.result());
  return this.result();
 }
 result():ProfileFixtureFacts{return{...this.facts,secondaryPhases:[...this.facts.secondaryPhases],secondaryCodes:this.facts.secondaryCodes.map(value=>({...value}))};}
}
