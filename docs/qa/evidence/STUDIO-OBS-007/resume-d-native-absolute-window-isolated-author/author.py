from pathlib import Path
import hashlib,json,difflib
out=Path('docs/qa/evidence/STUDIO-OBS-007/resume-d-native-absolute-window-isolated-author')
paths=['studio-runner/src/server/runCoordinator.ts','studio-runner/test/server/observedReplayAdmission.test.ts','studio-runner/test/fixtures-tier/observed-secret-control.test.ts']
base={p:Path(p).read_text() for p in paths};s=base.copy();changes={p:[] for p in paths};h=lambda x:hashlib.sha256(x.encode()).hexdigest()
def change(p,a,b):
 assert s[p].count(a)==1,(p,a[:80],s[p].count(a));s[p]=s[p].replace(a,b);changes[p].append({'before':a,'after':b})
r,u,n=paths
change(r,'''      let deadlineTimer: unknown = null;
      const sent = options.http.send({''','''      let deadlineTimer: unknown = null;
      const windowEnd = secretBearing ? nextPoll + 1000 : null;
      const requestBudget = windowEnd === null ? options.reportTimeoutMs : Math.min(1000, windowEnd - options.now());
      if (secretBearing && !(requestBudget > 0)) { requestStop(executionId, control, 'control'); return; }
      const sent = options.http.send({''')
change(r,'        timeoutMs: secretBearing ? 1000 : options.reportTimeoutMs,','        timeoutMs: requestBudget,')
change(r,'''      const outcome = await (secretBearing ? Promise.race([request, new Promise<HttpOutcome>(resolve => { deadlineTimer = timers.set(() => { resolve({kind: 'timeout'}); }, 1000); })]) : request);''','''      const timerBudget = windowEnd === null ? null : Math.min(1000, windowEnd - options.now());
      if (timerBudget !== null && !(timerBudget > 0)) { requestStop(executionId, control, 'control'); return; }
      const outcome = await (timerBudget !== null ? Promise.race([request, new Promise<HttpOutcome>(resolve => { deadlineTimer = timers.set(() => { resolve({kind: 'timeout'}); }, timerBudget); })]) : request);''')
change(r,'''      if (isStopped()) return;
      if (secretBearing && !(outcome.kind === 'response' ''','''      if (isStopped()) return;
      if (windowEnd !== null && options.now() >= windowEnd) { requestStop(executionId, control, 'control'); return; }
      if (secretBearing && !(outcome.kind === 'response' ''')
change(n,'    expect(controls.every(c=>c.timeoutMs===1000)).toBe(true);','    expect(controls.every(c=>typeof c.timeoutMs===\'number\'&&Number.isFinite(c.timeoutMs)&&c.timeoutMs>0&&c.timeoutMs<=1000)).toBe(true);')
# Unit-local controlled artifact helper is copied exactly from existing native fixture, without importing its test module.
original=base[n];start=original.index('function controlledJob(');end=original.index('\nit.each(modes)',start)
helper=original[start:end].strip().replace('function controlledJob(', 'function controlWindowJob(').replace('corpus.job','fixture.job').replace('corpus.trustedPolicy','fixture.trustedPolicy').replace('stepId(', 'controlWindowStepId(').replace('CANARY','CONTROL_WINDOW_CANARY')
imports="""import {createFakeScheduler} from '../helpers/scheduler.js';
import {until} from '../helpers/harness.js';
import type {ObservedJob,Artifact3,Scope,BuildIdentity} from '../../src/executor/observedOperations.js';
import {OBSERVED_PROFILE} from '../../src/validator/observedReferencePolicy.js';
"""
unit="""
const CONTROL_WINDOW_CANARY='control-window-unit-only';
const controlWindowStepId=(index:number)=>'00000000-0000-4000-8000-'+String(301+index).padStart(12,'0');
"""+helper+"""

it.each(['late-tick','expired-tick','late-valid-response'] as const)('keeps a secret control read inside its original absolute window: %s',async mode=>{
  const controlClock=createFakeScheduler();let lateness=0;
  const {job:secretJob,policy}=controlWindowJob('https://unit-control.test',currentBuild as BuildIdentity);
  const requests:{timeoutMs:number;started:number}[]=[];
  const reports:Record<string,unknown>[]=[];
  let launches=0,aborts=0,releaseLaunch:()=>void=()=>undefined,resolveControl:(outcome:HttpOutcome)=>void=()=>undefined;
  const neverBody=new Promise<HttpOutcome>(resolve=>{resolveControl=resolve;});
  const app=createApplication(loadConfig({STUDIO_RUNNER_SERVICE_IDENTITY:'service',STUDIO_RUNNER_CALLBACK_IDENTITY:'callback',STUDIO_RUNNER_CALLBACK_BASE_URL:'https://backend.test'}),{
    runtimeVersions:{},scratch:createFakeScratchStore(),logSink:createRecordingLogSink(),
    now:()=>controlClock.now()+lateness,controlTimers:controlClock,
    launcher:{launch(request){launches++;return new Promise<never>((_resolve,reject)=>{
      releaseLaunch=()=>{reject(new ObservedPreReadyFailure('CONTEXT_LOST',{path:null,bytes:null,error:null,state:'UNAVAILABLE',partial:false}));};
      request.signal?.addEventListener('abort',()=>{aborts++;releaseLaunch();},{once:true});
    });}},
    observed:{build:currentBuild as BuildIdentity,policies:[policy],validationEnabled:true,replayEnabled:true},
    http:{send(request):Promise<HttpOutcome>{
      if(request.method==='GET'){
        requests.push({timeoutMs:request.timeoutMs,started:controlClock.now()+lateness});
        if(mode==='late-tick')lateness+=5; // Original send setup consumes policy time, not extra tolerance.
        return neverBody;
      }
      const body=JSON.parse(request.body) as Record<string,unknown>;
      if(request.url.endsWith('/observed-admission')){
        const now=Date.now();return Promise.resolve({kind:'response',status:200,body:JSON.stringify({schemaVersion:3,kind:'observed',admissionId:body.admissionId,request:body,admittedAt:new Date(now).toISOString(),startDeadlineAt:new Date(now+15000).toISOString(),runDeadlineAt:new Date(now+30000).toISOString()})});
      }
      reports.push(body);return Promise.resolve({kind:'response',status:200,body:'{}'});
    }},
  });
  try{
    expect(await required(app.coordinator.submitObserved?.bind(app.coordinator))(secretJob)).toEqual({status:202,code:'ADMITTED'});
    await until(()=>launches===1);expect(controlClock.pending()).toEqual([1000]);
    lateness=mode==='late-tick'?37:mode==='expired-tick'?1000:0;
    controlClock.advance(1000);
    if(mode==='late-tick'){
      expect(requests).toEqual([{timeoutMs:963,started:1037}]);
      expect(controlClock.scheduled.at(-1)).toEqual({atMs:1000,delayMs:958});
      expect(controlClock.now()+lateness+958).toBe(2000);
      controlClock.advance(958);
    }else if(mode==='expired-tick'){
      expect(requests).toEqual([]);expect(controlClock.scheduled).toHaveLength(1);
    }else{
      expect(requests).toEqual([{timeoutMs:1000,started:1000}]);
      expect(controlClock.pending()).toEqual([1000]);
      controlClock.skip(1000); // The existing timeout callback is deliberately not dispatched yet.
      resolveControl({kind:'response',status:200,body:JSON.stringify({executionId:secretJob.binding.executionId,cancelRequested:false,revoked:false})});
    }
    await until(()=>aborts===1);expect(await app.coordinator.awaitInFlight(1000)).toBe(true);
    expect(launches).toBe(1);expect(aborts).toBe(1);expect(app.pool.inUse).toBe(0);
    expect(controlClock.pending()).toEqual([]);expect(requests).toHaveLength(mode==='expired-tick'?0:1);
    expect(reports.some(body=>body.kind==='FINAL')).toBe(true);
    expect(reports.filter(body=>body.kind==='FINAL')).toHaveLength(1);
  }finally{
    releaseLaunch();resolveControl({kind:'timeout'});expect(await app.coordinator.awaitInFlight(1000)).toBe(true);
  }
});
"""
change(u,base[u],imports+base[u]+unit)
for p in paths:
 for side,content in [('before',base[p]),('candidate',s[p])]:
  dest=out/side/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(content)
 inverse=s[p]
 for c in reversed(changes[p]):assert inverse.count(c['after'])==1;inverse=inverse.replace(c['after'],c['before'])
 assert inverse==base[p]
 patch=''.join(difflib.unified_diff(base[p].splitlines(True),s[p].splitlines(True),fromfile='before/'+p,tofile='candidate/'+p));(out/(Path(p).name+'.patch')).write_text(patch)
(out/'inverse-transformations.json').write_text(json.dumps(changes,indent=2)+'\n')
print(json.dumps({p:h(s[p]) for p in paths}))
