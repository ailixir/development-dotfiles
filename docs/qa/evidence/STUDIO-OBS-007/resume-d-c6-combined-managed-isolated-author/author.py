from pathlib import Path
import hashlib,json,difflib,re
out=Path('docs/qa/evidence/STUDIO-OBS-007/resume-d-c6-combined-managed-isolated-author')
paths=['studio-runner/src/guided/runtime.ts','backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java','studio-runner/test/guided/runtime.test.ts']
expected=['75fc33b1cd1cbc59bcb746811caff879d7217b22de8b08b374eec173dacf271c','ea827f2296d515d9203c7a96cc0b47626528414bd76e0b360fdd271c80b48e90',None]
sha=lambda s:hashlib.sha256(s.encode()).hexdigest()
sources={p:(out/'before'/p).read_text() for p in paths}
for p,h in zip(paths,expected):
 if h:assert sha(sources[p])==h,(p,sha(sources[p]))
changes={p:[] for p in paths}
def change(p,old,new):
 assert sources[p].count(old)==1,(p,old[:120],sources[p].count(old))
 sources[p]=sources[p].replace(old,new);changes[p].append({'before':old,'after':new})
r=paths[0];p=paths[1];u=paths[2]
change(r,'  private closing: Promise<void> | null = null;','''  private closing: Promise<void> | null = null;
  private confirmBrowserLoss: (() => void) | null = null;
  // Fulfilled only by original launch-loss stop completion, never generic stop or early stopped state.
  private readonly browserLossConfirmation = new Promise<void>(resolve => { this.confirmBrowserLoss = resolve; });''')
change(r,'        await this.browser.observations.fillPassword(p.target, p.executionEvidence.origin, allowedOrigins, resolvedValue);','''        const nativeOperation = this.browser.observations.fillPassword(p.target, p.executionEvidence.origin, allowedOrigins, resolvedValue);
        // Both rejection handlers are installed immediately. A late losing SDK rejection cannot
        // re-enter this dispatch catch or publish another application outcome/diagnostic.
        await Promise.race([nativeOperation, this.browserLossConfirmation.then(() => { throw new Error('CONTEXT_LOST'); })]);''')
change(r,"    this.launching = this.options.launch(config, this.context.contextId, () => { void this.stop('CONTEXT_LOST').catch(() => undefined); });",'''    this.launching = this.options.launch(config, this.context.contextId, () => {
      const originalStop = this.stop('CONTEXT_LOST');
      // Same original launch loss/stop promise; rejection is never confirmation.
      void originalStop.then(() => { this.confirmBrowserLoss?.(); this.confirmBrowserLoss = null; }, () => undefined);
    });''')
# Fixture private epoch lifetime: retained raw state is never reset/deleted to manufacture settlement.
change(p,'        const revActive=new Map(),revGroups=new Set();','''        let revActive=new Map();const revGroups=new Set();
        let revLossLifetime=null;
        const revManagedLoss=()=>revLossSelected()&&revLossLifetime?.retired===true;''')
change(p,'          if(revLocalMode&&!revSealed){revFail();return;}','''          if(revLocalMode&&!revSealed&&!revManagedLoss()){revFail();return;}
          // The old map remains captured by its original pending callbacks; it is not erased.
          if(revManagedLoss())revActive=new Map();''')
change(p,'          if(mode.c6===3&&revProducer===1){revLossRuntime=null;revLossBusy=2;revLossRestoreAttempt=0;revLossRestoreRefusal=0;}','''          if(mode.c6===3&&revProducer===1){revLossRuntime=null;revLossBusy=2;revLossRestoreAttempt=0;revLossRestoreRefusal=0;
            revLossLifetime={mode,active:revActive,high:0,operations:0,callbacks:0,cleanupAuthorized:false,retired:false};}
          else revLossLifetime=null;''')
change(p,'                if(mode.c6&&revC6RetryRestore){','''                if(mode.c6===3&&revProducer===1&&revLossLifetime)revLossLifetime.cleanupAuthorized=true;
                if(mode.c6&&revC6RetryRestore){''')
change(p,'                    revSealing=true;revFs.unwatchFile(command);revWatching=false;revMaybeSeal();','''                    revSealing=true;revFs.unwatchFile(command);revWatching=false;
                    // Managed output closure is not normal raw-SDK settlement/sealing.
                    if(revManagedLoss())revPublish(mode,false);else revMaybeSeal();''')
change(p,'''                revC6HighPending++;let result;
                const settled=()=>{revC6HighPending--;revPublish(mode,revSealed);revMaybeSeal();};''','''                revC6HighPending++;let result;const lifetime=revLossSelected()?revLossLifetime:null;
                if(lifetime)lifetime.high++;
                const settled=()=>{
                  if(lifetime)lifetime.high--;
                  if(lifetime&&lifetime!==revLossLifetime)return;
                  revC6HighPending--;
                  if(lifetime?.retired)return; // Value-free observer retired, actual promise unchanged.
                  revPublish(mode,revSealed);revMaybeSeal();};''')
# Actual operations/callbacks: same originals and promises, selected-only counters in existing originalPending field.
anchor='''        const revCheck=RevOwnership.prototype.checkGrant;'''
new='''        // Selected kind3 observes actual managed promises without changing original results/errors.
        for(const name of ['dispatch','refreshObservation']){
          const original=RevRuntime.prototype[name];
          RevRuntime.prototype[name]=function(...args){
            const mode=revRuntimes.get(this),lifetime=mode?.c6===3?revLossLifetime:null;
            if(!lifetime)return Reflect.apply(original,this,args);
            lifetime.operations++;revOriginalPending++;let result;
            const done=()=>{lifetime.operations--;revOriginalPending--;revPublish(mode,revSealed);};
            try{result=Reflect.apply(original,this,args);}catch(error){done();throw error;}
            result.then(done,()=>{revFail();done();}).catch(()=>{revFail();});return result;
          };
        }
'''+anchor
change(p,anchor,new)
anchor="""                const hooks={onRawFailure(error){try{const text=error instanceof Error?error.message:'';"""
new='''                if(mode.c6===3){
                  const descriptor=Object.getOwnPropertyDescriptor(options,'callback'),original=options.callback;
                  const lifetime=revLossLifetime;
                  if(typeof original!=='function'||!descriptor||!lifetime)throw new Error('C6_CALLBACK');
                  const wrapped=function(...args){
                    lifetime.callbacks++;revOriginalPending++;let result;
                    const done=()=>{lifetime.callbacks--;revOriginalPending--;revPublish(mode,revSealed);};
                    try{result=Reflect.apply(original,this,args);}catch(error){done();throw error;}
                    result.then(done,()=>{revFail();done();}).catch(()=>{revFail();});return result;
                  };
                  if(!Reflect.defineProperty(options,'callback',{...descriptor,value:wrapped}))throw new Error('C6_CALLBACK');
                  group.methods.push(['callback',descriptor,wrapped]);
                }
'''+anchor
change(p,anchor,new)
# No dispatch await inside stop: authorizes retry only existing post-owner-cleanup seal request.
old='''                    while((runtime.busy||revActive.size||revC6HighPending||revC6CdpPending)&&performance.now()<deadline)
                      await new Promise(resolve=>setTimeout(resolve,10));
                    if(runtime.busy||revActive.size||revC6HighPending||revC6CdpPending){revLossRefuse(1);revFail();return false;}'''
new='''                    const lifetime=mode.c6===3?revLossLifetime:null;
                    if(lifetime&&(!lifetime.cleanupAuthorized||!closeSucceeded))return false;
                    const pending=()=>runtime.busy||revC6CdpPending||(lifetime?
                      lifetime.operations||lifetime.callbacks||revOriginalPending:revActive.size||revC6HighPending);
                    while(pending()&&performance.now()<deadline)
                      await new Promise(resolve=>setTimeout(resolve,10));
                    if(pending()||(lifetime&&runtime.active)){revLossRefuse(1);revFail();return false;}'''
change(p,old,new)
change(p,'''                    revC6Restored=true;
                    if(closeSucceeded&&!closedRecorded){closedRecorded=true;revEmit(mode,9,1);}''','''                    revC6Restored=true;
                    if(closeSucceeded&&!closedRecorded){closedRecorded=true;revEmit(mode,9,1);}
                    if(lifetime)lifetime.retired=true;''')
change(p,'''                result.then(()=>{closeSucceeded=true;return retry();},()=>{''','''                result.then(()=>{closeSucceeded=true;return mode.c6===3?true:retry();},()=>{''')
change(p,'''                result.then(()=>revC6RetryRestore?.(),()=>{revLossRefuse(5);revFail();return revC6RetryRestore?.();})''','''                result.then(()=>mode.c6===3?true:revC6RetryRestore?.(),()=>{revLossRefuse(5);revFail();return revC6RetryRestore?.();})''')
# Real raw-CDP observer retains original epoch map and retires output only, not original send.
change(p,'''              const ordinal=++revNativeOrdinal;revActive.set(ordinal,1);revEmit(holder.mode,2,ordinal,1);
              const settled=fulfilled=>{if(!revActive.delete(ordinal))revFail();revEmit(holder.mode,3,ordinal,1,0,fulfilled);};''','''              const ordinal=++revNativeOrdinal,active=revActive,lifetime=revLossSelected()?revLossLifetime:null;
              active.set(ordinal,1);revEmit(holder.mode,2,ordinal,1);
              const settled=fulfilled=>{
                const removed=active.delete(ordinal);
                if(lifetime?.retired)return; // Exact actual settlement remains private; no late observer output.
                if(!removed)revFail();revEmit(holder.mode,3,ordinal,1,0,fulfilled);};''')
# Unavailable-realm predicate BEFORE fence construction/native page evaluation/POST.
old='''                  try{await Promise.race([fence(),new Promise((_,reject)=>{
                    timer=setTimeout(()=>reject(new Error('TIME')),Math.max(1,deadline-performance.now()));})]);}
                  finally{clearTimeout(timer);}
                  fenceSucceeded=true;'''
new='''                  const holder=selected?.c6===3&&selected.path===1?c6CdpHolders.get(context):null;
                  const current=holder?revMode():null,browser=holder?context.browser():null;
                  const unavailable=holder?.context===context&&holder.closed===false&&selected.active===true
                    &&current?.active===true&&current.c6===3&&current.path===1
                    &&current.case===selected.case&&current.epoch===selected.epoch
                    &&holder.mode.case===selected.case&&holder.mode.epoch===selected.epoch
                    &&holder.mode.c6===3&&holder.mode.path===1&&revLocalMode?.case===selected.case
                    &&revLocalMode?.epoch===selected.epoch&&revC6ContextBound&&revStarted&&revC6Probed===2
                    &&holder.dev===revC6ProfileDev&&holder.ino===revC6ProfileIno
                    &&browser!==null&&typeof browser?.isConnected==='function'&&browser.isConnected()===false;
                  if(!unavailable){
                    try{await Promise.race([fence(),new Promise((_,reject)=>{
                      timer=setTimeout(()=>reject(new Error('TIME')),Math.max(1,deadline-performance.now()));})]);}
                    finally{clearTimeout(timer);}
                    fenceSucceeded=true;
                  } // Genuine bound disconnection supplies UNKNOWN, never a healthy page fence.'''
change(p,old,new)
# Seal reader selected branch keeps raw state and exact ACK count, never sealed/zero.
old='''          if (sample.path("sealed").booleanValue()) {
            finalSample = sample;
            break;
          }'''
new='''          boolean managedLoss = state.c6Kind == 3 && producer == 1;
          if (managedLoss
              ? state.c6NativeClose && state.restored && state.closed
                  && !sample.path("sealed").booleanValue()
                  && p4Number(sample, "busy") == 0
                  && p4Number(sample, "restoreAttempt") > 0
                  && p4Number(sample, "restoreRefusal") == 0
                  && p4Number(sample, "cdpCreationPending") == 0
                  && p4Number(sample, "originalPending") == 0
                  && p4Number(sample, "pending") == p4Number(sample, "highPending")
                  && p4Number(sample, "sent") == p4Number(sample, "acked")
              : sample.path("sealed").booleanValue()) {
            finalSample = sample;
            break;
          }'''
change(p,old,new)
change(p,'''      assertThat(p4Number(finalSample, "pending")).isZero();''','''      if (state.c6Kind == 3 && producer == 1) {
        assertThat(finalSample.path("sealed").booleanValue()).isFalse();
        assertThat(p4Number(finalSample, "pending")).isEqualTo(p4Number(finalSample, "highPending"));
        assertThat(p4Number(finalSample, "nativeActive")).isEqualTo(state.active.size());
      } else {
        assertThat(p4Number(finalSample, "pending")).isZero();
      }''')
# Existing seal is after genuine tree release and original owner close, before restoration wait.
old='''    p3CleanupOwnedResources();
    p8AssertUnknownUsageLineage(state);
    if (!browserTree.isEmpty()) p6AwaitProcesses(browserTree, true);
    p8AwaitC6Closed(state);'''
new='''    if (kind == 3) {
      // Existing seal command is authorized only after actual original stop and captured tree exit.
      p6AwaitProcesses(browserTree, true);
      p4SealPrivateProducersAfterOwnerCleanup(state);
      state.c6ProducerSealed = true; // Observer output closed; its raw SDK sealed field remains false.
    }
    p3CleanupOwnedResources();
    p8AssertUnknownUsageLineage(state);
    if (!browserTree.isEmpty()) p6AwaitProcesses(browserTree, true);
    p8AwaitC6Closed(state);'''
change(p,old,new)
change(p,'''    p4SealPrivateProducersAfterOwnerCleanup(state);
    state.c6ProducerSealed = true;
    assertThat(state.active).isEmpty();''','''    if (!state.c6ProducerSealed) {
      p4SealPrivateProducersAfterOwnerCleanup(state);
      state.c6ProducerSealed = true;
    }
    p8AssertManagedNativeState(state);''')
# p8 closing permits only actual selected unresolved native ordinal; no removal/fake event.
change(p,'''            && state.active.isEmpty()
            && (state.path == 2 || state.closed)) break;''','''            && (state.c6Kind == 3 || state.active.isEmpty())
            && (state.path == 2 || state.closed)) break;''')
change(p,'''    assertThat(state.active).isEmpty();
    if (state.path == 1) assertThat(state.closed).isTrue();''','''    p8AssertManagedNativeState(state);
    if (state.path == 1) assertThat(state.closed).isTrue();''')
# Specific outer cleanup equality; all old exception/quarantine flags remain.
change(p,'''        if (owned != null && owned.c6Kind != 0 && (!owned.restored || !owned.active.isEmpty())) {''','''        if (owned != null && owned.c6Kind != 0
            && (!owned.restored || (owned.c6Kind != 3 && !owned.active.isEmpty()))) {''')
anchor='''  private P6OwnedPid p8OwnedPrimaryBrowser(P4RevocationState state) throws Exception {'''
helper='''  private static void p8AssertManagedNativeState(P4RevocationState state) {
    if (state.c6Kind == 3) {
      // The retained actual native map is raw-settlement evidence, never reset by managed close.
      assertThat(state.active.size()).isLessThanOrEqualTo(1);
      if (!state.active.isEmpty()) {
        assertThat(state.active).containsOnlyKeys(state.inFlightOrdinal);
        assertThat(state.active.get(state.inFlightOrdinal)).isEqualTo(1);
      }
      assertThat(state.closed && state.restored && state.c6NativeClose).isTrue();
    } else {
      assertThat(state.active).isEmpty();
    }
  }

'''
change(p,anchor,helper+anchor)
# New focused unit tests (old test text unchanged). Gated close proving no early completion and no loser output.
unit='''  it.each(['fulfill','reject'] as const)('completes managed secret loss only after original close and consumes late %s without output reentry',async late=>{
    let originalLoss:(()=>void)|undefined;
    const h=await setup({secret:true,onLostObserver:callback=>{originalLoss=callback;}});await h.runtime.dispatch(h.request);
    const o=(h.messages.filter(m=>m.route==='observations').at(-1)?.body as BridgeObservation).observation;
    const evidence={kind:'observedDocument' as const,sessionId:h.context.sessionId,contextId:h.context.contextId,documentId:o.documentId,generation:o.generation,origin:o.origin,observationHash:hash(o)};
    let nativeFulfill:()=>void=()=>undefined,nativeReject:(error:Error)=>void=()=>undefined,closeFinish:()=>void=()=>undefined;
    const native=new Promise<void>((resolve,reject)=>{nativeFulfill=resolve;nativeReject=reject;});
    h.browser.observations.preparePassword=()=>Promise.resolve();
    const fill=vi.fn(()=>native);h.browser.observations.fillPassword=fill;
    vi.mocked(h.browser.close).mockImplementationOnce(()=>new Promise<void>(resolve=>{closeFinish=resolve;}));
    const p=proposal(h.context,evidence,'fill',{kind:'fill',value:{kind:'secretRef',sourceInputId:'pass'}},{kind:'passwordControl',documentId:o.documentId,generation:o.generation});
    const prepared=await h.runtime.prepare({...identity(h.context),proposal:p,requestDigest:hash(p),expiresAt:new Date(Date.now()+10000).toISOString()});
    const request={...dispatch(h.context,p,prepared),secret:{secretId:'PASS',value:'managed-unit-canary',versionId:'unit',allowedOrigins:[o.origin]}};
    const stderr=vi.spyOn(process.stderr,'write').mockImplementation(()=>true);
    try{
      let completed=false;const pending=h.runtime.dispatch(request).then(result=>{completed=true;return result;});
      await vi.waitFor(()=>{expect(fill).toHaveBeenCalledOnce();});
      if(!originalLoss)throw new Error('LOSS_CALLBACK');originalLoss();
      const stopping=(h.runtime as unknown as {closing:Promise<void>}).closing;
      await Promise.resolve();expect(completed).toBe(false);
      expect((h.runtime as unknown as {busy:boolean}).busy).toBe(true);expect(h.runtime.active).toBe(true);
      closeFinish();await stopping;
      const result=await pending;expect(result.ledger.state).toBe('UNKNOWN_OUTCOME');expect(result.ledger.outcomeCode).toBe('ACK_LOST');
      expect((h.runtime as unknown as {busy:boolean}).busy).toBe(false);expect(h.runtime.active).toBe(false);expect(request).not.toHaveProperty('secret');
      const before=JSON.stringify(h.messages),errCount=stderr.mock.calls.length;
      const name=(await readdir(h.path)).find(f=>f.endsWith('.diagnostic.jsonl'));if(!name)throw new Error('DIAGNOSTIC');
      const diagnostic=await readFile(join(h.path,name),'utf8');
      if(late==='fulfill')nativeFulfill();else nativeReject(new Error('managed-unit-canary'));
      await native.catch(()=>undefined);await Promise.resolve();await Promise.resolve();
      expect(JSON.stringify(h.messages)).toBe(before);expect(stderr.mock.calls).toHaveLength(errCount);
      expect(await readFile(join(h.path,name),'utf8')).toBe(diagnostic);expect(fill).toHaveBeenCalledOnce();
      await expect(h.runtime.dispatch(request)).rejects.toThrow('CONTEXT_LOST');
    }finally{nativeFulfill();closeFinish();stderr.mockRestore();}
  });
'''
change(u,"describe('",unit+"describe('") if False else None
# Keep new unit inside original describe, before the first original test.
anchor="  it('adds a newly captured runtime value to the dispatch-local redactor before shutdown can clear it',async()=>{"
change(u,anchor,unit+anchor)
change(u,'observationCallback?:(body:unknown,key?:string)=>Promise<void>}={}){',
  'observationCallback?:(body:unknown,key?:string)=>Promise<void>;onLostObserver?:(callback:()=>void)=>void}={}){')
change(u,'launch:()=>Promise.resolve(browser),callback:',
  'launch:(_config,_contextId,onLost)=>{options.onLostObserver?.(onLost);return Promise.resolve(browser);},callback:')

for path in paths:
 original=(out/'before'/path).read_text();candidate=sources[path]
 inverse=candidate
 for c in reversed(changes[path]):
  assert inverse.count(c['after'])==1
  inverse=inverse.replace(c['after'],c['before'])
 assert inverse==original
 for folder,value in [('before',original),('candidate',candidate)]:
  dest=out/folder/path;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(value)
 patch=''.join(difflib.unified_diff(original.splitlines(True),candidate.splitlines(True),fromfile='before/'+path,tofile='candidate/'+path))
 (out/(Path(path).name+'.patch')).write_text(patch)
(out/'inverse-transformations.json').write_text(json.dumps(changes,indent=2)+'\n')
print(json.dumps({p:sha(sources[p]) for p in paths}))
# Follow-up source-only closure corrections before sealing: independent physical-exit authorization
# and immutable last observed raw sample prevent cleanup or late ACK timing from inventing a seal.
change(p,'    volatile boolean c6NativeClose, c6FenceAvailable, c6InterruptedNotification, c6ProducerSealed;',
'''    volatile boolean c6NativeClose, c6FenceAvailable, c6InterruptedNotification, c6ProducerSealed;
    volatile boolean c6BrowserTreeGone;''')
change(p,'        p3AttemptTeardown(failures, () -> p6AwaitProcesses(owned.c6BrowserTree, true));',
'''        p3AttemptTeardown(failures, () -> {
          assertThat(owned.c6BrowserTree.isEmpty()).isFalse();
          p6AwaitProcesses(owned.c6BrowserTree, true);
          owned.c6BrowserTreeGone = true;
        });''')
change(p,'''      p6AwaitProcesses(browserTree, true);
      p4SealPrivateProducersAfterOwnerCleanup(state);''','''      p6AwaitProcesses(browserTree, true);
      state.c6BrowserTreeGone = true;
      p4SealPrivateProducersAfterOwnerCleanup(state);''')
anchor='''  private void p4SealPrivateProducersAfterOwnerCleanup(P4RevocationState state) throws Exception {
'''
change(p,anchor,anchor+'''    if (state.c6Kind == 3) {
      assertThat(state.c6BrowserTreeGone && state.c6NativeClose).isTrue();
      if (state.c6ProducerSealed) {
        p8AssertManagedNativeState(state);
        return; // Existing command already proved managed output closure, not raw SDK sealing.
      }
    }
''')
change(p,'snapshot', 'snapshot') if False else None
change(p,'cleanupAuthorized:false,retired:false};','cleanupAuthorized:false,retired:false,snapshot:null};')
change(p,'''            const body=JSON.stringify({case:mode.case,producer:revProducer,epoch:mode.epoch,role:revProducer,
              sent:revSeq,acked:revAcked,pending:revPending+revOriginalPending+revC6HighPending+revC6CdpPending,originalPending:revOriginalPending,''',
'''            // Retired raw status is the last actual observation, never fake settlement/zero.
            const raw=revManagedLoss()?revLossLifetime.snapshot:null;
            const body=JSON.stringify({case:mode.case,producer:revProducer,epoch:mode.epoch,role:revProducer,
              sent:revSeq,acked:revAcked,pending:revPending+revOriginalPending+(raw?.high??revC6HighPending)+revC6CdpPending,originalPending:revOriginalPending,''')
change(p,'''              ...(mode.c6===3&&revProducer===1?{highPending:revC6HighPending,cdpCreationPending:revC6CdpPending,
                nativeActive:revActive.size,busy:revLossBusy,restoreAttempt:revLossRestoreAttempt,''',
'''              ...(mode.c6===3&&revProducer===1?{highPending:raw?.high??revC6HighPending,cdpCreationPending:revC6CdpPending,
                nativeActive:raw?.active??revActive.size,busy:revLossBusy,restoreAttempt:revLossRestoreAttempt,''')
change(p,'        const revMaybeSeal=()=>{','''        const revMaybeSeal=()=>{
          if(revManagedLoss())return; // This epoch explicitly has no normal raw SDK seal.''')
change(p,'                    if(lifetime)lifetime.retired=true;',
'''                    if(lifetime){lifetime.snapshot={high:revC6HighPending,active:revActive.size};lifetime.retired=true;}''')
change(p,'''                    &&current?.active===true&&current.c6===3&&current.path===1''',
'''                    &&Number.isInteger(selected.case)&&selected.case>0&&selected.epoch===selected.case
                    &&current?.active===true&&current.c6===3&&current.path===1''')
change(p,'''      assertThat(state.closed && state.restored && state.c6NativeClose).isTrue();''',
'''      assertThat(state.closed && state.restored && state.c6NativeClose && state.c6BrowserTreeGone).isTrue();''')
change(p,'''      if (kind == 3) {
        assertThat(state.c6RawCalls).isEqualTo(1);''',
'''      if (kind == 3) {
        // This hook may observe managed CONTEXT_LOST; it supplies no genuine native-error credit.
        assertThat(state.c6RawCalls).isEqualTo(1);''')
# Write final files and complete whole-source inverse proof (no compile/runtime execution).
manifest=[]
for path in paths:
 original=(out/'before'/path).read_text();candidate=sources[path];inverse=candidate
 for c in reversed(changes[path]):
  assert inverse.count(c['after'])==1,(path,c['after'][:80])
  inverse=inverse.replace(c['after'],c['before'])
 assert inverse==original
 dest=out/'candidate'/path;dest.write_text(candidate)
 patch=''.join(difflib.unified_diff(original.splitlines(True),candidate.splitlines(True),fromfile='before/'+path,tofile='candidate/'+path))
 (out/(Path(path).name+'.patch')).write_text(patch)
 manifest.append({'path':path,'baseSha256':sha(original),'candidateSha256':sha(candidate),'patchSha256':sha(patch),'wholeInverseBytesExact':True})
(out/'inverse-transformations.json').write_text(json.dumps(changes,indent=2)+'\n')
# Exact @Test bodies remain inside the original helper source, checked by unchanged method slices.
original=(out/'before'/p).read_text();candidate=sources[p];testRegions=[]
for m in re.finditer(r'  @Test\n',original):
 start=m.start();nextMethod=re.search(r'\n  (?:@|private |public |static )',original[start+8:])
 end=start+8+nextMethod.start() if nextMethod else len(original)
 region=original[start:end];assert region in candidate,region[:100]
 testRegions.append({'sha256':sha(region),'byteExact':True})
unitOld=(out/'before'/u).read_text();unitInverse=sources[u]
for c in reversed(changes[u]):unitInverse=unitInverse.replace(c['after'],c['before'])
assert unitInverse==unitOld
report={'state':'FROZEN_ISOLATED_SOURCE_CANDIDATE_UNBUILT_UNRUN_NOT_APPLIED','sources':manifest,'originalPublicationTestRegions':testRegions,'originalUnitFileRecoveredByRemovingNewTestsAndDefaultOffLossCapture':True,'newUnitCases':['late native fulfillment cannot re-enter output after real confirmed stop','late native rejection cannot re-enter output after real confirmed stop'],'unitPlan':['Run complete existing guided/runtime.test.ts including old prior/current secret redaction matrix','Run selected existing guided C6 kind3 with original genuine pending/cut/audit/close/privacy guards','Run original C6 kind1/2/4 and original C5 first/ninth to verify default/source behavior'],'unitOrderingDisposition':'Root1030f20c approval: ONLY original launch onLost callback can confirm browser loss. Generic stop() remains entire byte-exact; old stop-inside-fill rejection/redaction assertions untouched and their confirmation signal stays unresolved. No padding or expected changes. Actual original unit runtime remains UNRUN.','sourceProof':['Whole inverse exact for all three files','All original publication @Test body regions exact; only selected/helper/script changes','Original default/null/nonselected modes retain original calls and normal seals; selected kind3 managed output closure is explicitly not raw SDK seal','Private loss signal resolves only original launch onLost stop promise fulfillment; losing rejection consumed by the managed race, no output callback added to losing branch','Raw epoch counters/map retained in last actual observation; original callbacks operate captured old map and do not emit late observer output after retirement','All prior sticky ACK/schema/notification errors preserved; unavailable pre-fence only same selected context/profile/case/epoch/public disconnected Browser, never empty pages/time alone','Existing cleanup command authorizes descriptor restore only after independent actual browser-tree-gone plus original SDK close; source is not process-exit evidence','Original callback/managed methods forwarded once with original receiver/args/result/error; counts require actual operation/callback completion and busy false','Raw SDK/high-level settlement UNOBSERVED and non-normal sealed=false, no event3 or counter clearing to simulate closure'],'limits':['Meaningful unit additions and old suite remain unrun','Default enabled diagnostic/custom instrumentation/tracing changes would invalidate output premises','No native-error canary/heap-wipe/SDK settlement credit from managed context-loss','Prior generic-signal draft preserved as superseded-all-stop-draft, not applyable','Missing genuine resource/tree/callback closure or any prior sticky refusal remains failed/quarantined','Substantive root review required before integration/static/actual source-bound gates'],'authority':['.aiox/sdc/STUDIO-OBS-007/dispatch/resume-d-c6-combined-managed-isolated-author-intent.txt','.aiox/sdc/STUDIO-OBS-007/dispatch/resume-d-c6-combined-managed-isolated-author-context.txt','docs/qa/evidence/STUDIO-OBS-007/root-loss-fence-design-review.json'],'actions':{'liveSourceWrites':0,'runtime':0,'builds':0,'newFrameworks':0,'newEndToEndCases':0,'newEndpointsOrProtocolFields':0},'wholeWaveCeilingUsd':500,'billing':'UNAVAILABLE','whole19AcPass':False,'lifecycleVerdict':None}
(out/'result.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'finalSources':manifest,'reportSha256':sha((out/'result.json').read_text()),'oldPublicationTests':len(testRegions)}))
