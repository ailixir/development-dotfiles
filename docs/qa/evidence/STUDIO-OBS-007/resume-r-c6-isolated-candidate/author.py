from pathlib import Path
import hashlib,json,difflib,re
root=Path('docs/qa/evidence/STUDIO-OBS-007')
src=root/'resume-projection-c4-four-static/GuidedPublicationReplayIT.java.formatted'
out=root/'resume-r-c6-isolated-candidate'
before=src.read_bytes(); assert hashlib.sha256(before).hexdigest()=='f69b4beafe89aece89343c2027c70f4b57c06eb389a656b593c1b63c70f89a79'
s=before.decode(); changes=[]
def replace(old,new,label):
 global s
 assert s.count(old)==1,(label,s.count(old));s=s.replace(old,new);changes.append(label)
def insert(marker,text,label): replace(marker,text+marker,label)
replace('    int inFlightOrdinal,residualSettlements;','    int inFlightOrdinal,residualSettlements;', 'NOOP') if '    int inFlightOrdinal,residualSettlements;' in s else None
# Extend the existing per-case state; no independent observer framework.
insert('    P4RevocationState(int ordinal, int path, UUID test, JdbcTemplate actualJdbc)', '''    // Default zero preserves every existing revocation case and producer schema.
    volatile int c6Kind, c6Phase, c6FillEntries, c6RawCalls, c6LiteralHits, c6EncodedHits, c6CallbackRedacted, c6PendingSamples;
    volatile long c6FocusAt, c6PendingAt, c6CutAt, c6DeadlineMarginMs;
    volatile boolean c6NativeClose, c6FenceAvailable, c6InterruptedNotification;
    List<P6OwnedPid> c6BrowserTree = List.of();
    final java.util.concurrent.CountDownLatch c6Pending = new java.util.concurrent.CountDownLatch(1);
    final java.util.concurrent.CountDownLatch c6CutPending = new java.util.concurrent.CountDownLatch(1);

''','case-scoped-fields')
insert('  private static volatile int p4PasswordControls', '''  // These phases confirm original close, never a playable/fenced/no-effect claim.
  private static final Set<Integer> P8_C6_CLOSED_UNKNOWN = java.util.concurrent.ConcurrentHashMap.newKeySet();

''','closed-unknown-phases')
# Four selectors only; retain all original test bodies.
insert('  /** Observations only; neither the PID header', '''  @Test
  @org.junit.jupiter.api.Order(29)
  void actualPublishedNativePasswordStepDeadlinePreservesUnknownEffect() throws Exception {
    p8C6Case(1);
  }

  @Test
  @org.junit.jupiter.api.Order(30)
  void actualPublishedPublicCancelWhileNativePasswordWorldPending() throws Exception {
    p8C6Case(2);
  }

  @Test
  @org.junit.jupiter.api.Order(31)
  void actualGuidedOwnedPrimaryBrowserLossWhileNativePasswordWorldPending() throws Exception {
    p8C6Case(3);
  }

  @Test
  @org.junit.jupiter.api.Order(32)
  void actualGuidedReleasedValueInjectedFailureRedactsProducedSinks() throws Exception {
    p8C6Case(4);
  }

''','four-selectors')
# Existing trusted observer handler: special closed branches, original revocation unchanged.
replace('        if (event == 1) {','''        if (state.c6Kind != 0 && event == 10) {
          if (!state.started || state.c6FocusAt == 0 || state.c6PendingSamples >= (state.c6Kind == 1 ? 1 : 2)
              || !body.path("ok").booleanValue() || operation != 1
              || state.active.size() != 1 || !Integer.valueOf(1).equals(state.active.get(ordinal))) {
            throw new IllegalArgumentException("C6 original native promise is not pending at real focus");
          }
          state.inFlightOrdinal = ordinal;
          state.c6DeadlineMarginMs = p4Number(body, "deltaMicros");
          state.c6PendingAt = System.nanoTime();
          if (++state.c6PendingSamples == 1) state.c6Pending.countDown();
          else state.c6CutPending.countDown();
        } else if (state.c6Kind != 0 && event == 11) {
          if (ordinal != 1 || reason != 1 || state.c6RawCalls != 0) {
            throw new IllegalArgumentException("C6 raw scalar observation mismatch");
          }
          state.c6RawCalls++;
          state.c6LiteralHits = operation;
          state.c6EncodedHits = p4Number(body, "deltaMicros");
        } else if (state.c6Kind != 0 && event == 13) {
          if (!body.path("ok").booleanValue() || state.c6NativeClose || ordinal != state.c6Phase) {
            throw new IllegalArgumentException("C6 original SDK close not confirmed");
          }
          state.c6NativeClose = true;
          state.c6FenceAvailable = operation == 1;
          if (!state.c6FenceAvailable) P8_C6_CLOSED_UNKNOWN.add(state.c6Phase);
        } else if (event == 1) {''','closed-c6-node-events')
replace('          if (!state.started\n              || state.flippedAt != 0','''          if (state.c6Kind != 0 && state.c6CutAt != 0) {
            throw new IllegalArgumentException("C6 unexpected later native entry after cut");
          }
          if (operation == 1 && state.c6Kind != 0) state.c6FillEntries++;
          if (!state.started
              || state.flippedAt != 0''','no-later-native')
replace('          if (state.flippedAt == 0\n              && state.started','''          if (state.c6Kind == 0 && state.flippedAt == 0
              && state.started''','renewal-does-not-revoke-c6')
replace('          if (!state.started\n              || state.flippedAt == 0\n              || ordinal != 1','''          if (state.c6Kind != 0) {
            if (!state.started || ordinal != 1 || reason < 1 || reason > 6) {
              throw new IllegalArgumentException("C6 original stopping observation mismatch");
            }
            state.cutoffAt = System.nanoTime();
            state.reasonProved = true;
            state.cutoff.countDown();
          } else if (!state.started
              || state.flippedAt == 0
              || ordinal != 1''','original-cutoff-c6')
replace('          if (state.cutoffAt == 0) {','          if (state.c6Kind == 0 && state.cutoffAt == 0) {','preserve-old-cutoff-clock')
replace('        } else {\n          throw new IllegalArgumentException("Unknown scalar observer phase");\n        }\n      }\n      accepted = true;','        } else {\n          throw new IllegalArgumentException("Unknown scalar observer phase");\n        }\n        if (state.c6Kind != 0) state.notifyAll();\n      }\n      accepted = true;','wake-original-close-observation')
replace('    if (state.execution != null) {\n      mode.put("executionId"','''    if (state.c6Kind != 0) mode.put("c6", state.c6Kind);
    if (state.execution != null) {
      mode.put("executionId"''','default-off-mode')
replace('              || sample.size() != 10','              || sample.size() != (state.c6Kind == 0 ? 10 : 13)','bounded-sample-extension')
replace('  private void p4AssertObserverPhaseCompleted(int phase) throws IOException {','''  private void p4AssertObserverPhaseCompleted(int phase) throws IOException {
    P4RevocationState selected = p4Revocation;
    if (selected != null && selected.c6Kind != 0 && selected.c6Phase == phase) {
      long deadline = System.nanoTime() + Duration.ofSeconds(10).toNanos();
      synchronized (selected) {
        while (!selected.c6NativeClose && !selected.failed && System.nanoTime() < deadline) {
          long remaining = deadline - System.nanoTime();
          if (remaining <= 0) break;
          try { java.util.concurrent.TimeUnit.NANOSECONDS.timedWait(selected, remaining); }
          catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt(); throw new IOException("C6 close witness interrupted");
          }
        }
      }
      assertThat(selected.c6NativeClose).as("original SDK close was actually received").isTrue();
    }
    if (P8_C6_CLOSED_UNKNOWN.contains(phase)) {
      // Confirmed original close with an unavailable realm fence is UNKNOWN effects.
      // This branch supplies no completed fence, no zero-write or no-effect evidence.
      assertThat(P4_CLOSED_PHASES.contains(phase)).isFalse();
      return;
    }''','truthful-interrupted-fence')
# Existing page protocol accepts two case-gated numeric events.
replace('          } else if (List.of("registered", "write", "submit").contains(kind)) {','''          } else if (List.of("registered", "write", "submit").contains(kind)
              || (p4Revocation != null && p4Revocation.c6Kind > 0
                  && p4Revocation.c6Kind < 4 && witness.phase == p4Revocation.c6Phase
                  && List.of("focus-enter", "focus-exit").contains(kind))) {''','numeric-focus-tags')
replace('              case "submit" -> P4_NATIVE_SUBMITS.incrementAndGet();','''              case "submit" -> P4_NATIVE_SUBMITS.incrementAndGet();
              case "focus-enter" -> {
                P4RevocationState selected = p4Revocation;
                if (selected.c6FocusAt != 0 || selected.c6Kind == 4) {
                  throw new IllegalArgumentException("Duplicate C6 native focus");
                }
                selected.c6FocusAt = System.nanoTime();
                p8WritePendingProbe(selected, 1);
              }
              case "focus-exit" -> {
                if (p4Revocation.c6FocusAt == 0) {
                  throw new IllegalArgumentException("C6 focus exit without entry");
                }
              }''','original-focus-ingress')
replace('          void notify(\'registered\');','''          %s
          void notify('registered');''','finite-focus-stall')
replace('        .formatted(document);','''        .formatted(document, p4Revocation != null && p4Revocation.c6Kind > 0 && p4Revocation.c6Kind < 4
            ? "document.addEventListener('focusin',event=>{if(event.target instanceof HTMLInputElement"
                + "&&event.target.type==='password'){void notify('focus-enter');"
                + "const end=performance.now()+" + (p4Revocation.c6Kind == 1 ? 40000 : 8000) + ";"
                + "while(performance.now()<end){}void notify('focus-exit');}});"
            : "");''','default-off-stall')
# Extend existing producer sample and command; no raw path/args persisted.
replace('        let revLocalMode=null,revWatching=false;','''        let revLocalMode=null,revWatching=false,revC6Probed=0;
        let revC6ProfileDev=0,revC6ProfileIno=0,revC6ContextBound=false;
        let revC6RunDeadline=0,revC6StepMs=0;''','private-context-scalars')
replace('              failed:revFailed,sealed});','''              failed:revFailed,sealed,...(mode.c6?{profileDev:revC6ProfileDev,
                profileIno:revC6ProfileIno,contextBound:revC6ContextBound}:{})});''','numeric-context-sample')
replace('          revCase=mode.case;revSeq=0;revPending=0;revAcked=0;revOriginalPending=0;','''          revCase=mode.case;revSeq=0;revPending=0;revAcked=0;revOriginalPending=0;
          if(mode.c6){revNativeOrdinal=0;revC6Probed=0;}''','c6-case-counter-only')
replace('          if(revProducer!==3&&!revWatching){','          if((revProducer!==3||mode.c6)&&!revWatching){','same-command-child-probe')
replace("                const seal=JSON.parse(revFs.readFileSync(command,'utf8'));",'''                const seal=JSON.parse(revFs.readFileSync(command,'utf8'));
                if(mode.c6&&Object.keys(seal).sort().join(',')==='case,epoch,probe,producer'
                  &&seal.case===mode.case&&seal.epoch===mode.epoch&&seal.producer===revProducer&&Number.isInteger(seal.probe)&&seal.probe>=1&&seal.probe<=2){
                  if(seal.probe<=revC6Probed)return;
                  if(seal.probe!==revC6Probed+1)throw new Error('C6_PROBE_SEQUENCE');revC6Probed=seal.probe;
                  const pending=[...revActive].filter(([,operation])=>operation===1);
                  const margin=mode.path===2?Math.floor(revC6RunDeadline-Date.now()-revC6StepMs):0;
                  revEmit(mode,10,pending.length===1?pending[0][0]:0,1,0,
                    pending.length===1&&revActive.size===1,Math.max(0,margin));return;
                }''','contemporaneous-original-node-ack')
# Native close/profile identity reused in same generated entry. Context scratch is bound at start below.
replace('          return launched.then(context=>{\n            const originalClose=context.close;','''          return launched.then(context=>{
            const selected=revMode();
            if(selected?.c6){try{
              const actual=p4Fs.lstatSync(args[0]),canonical=p4Fs.realpathSync(args[0]);
              if(actual.isSymbolicLink()||!actual.isDirectory()||canonical!==args[0]
                ||actual.uid!==process.getuid()||(actual.mode&0o777)!==0o700
                ||!Number.isSafeInteger(actual.dev)||!Number.isSafeInteger(actual.ino))throw new Error('C6_PROFILE');
              revC6ProfileDev=actual.dev;revC6ProfileIno=actual.ino;
            }catch(error){revFail();return Promise.resolve(Reflect.apply(context.close,context,[]))
              .then(()=>{throw error;},closeFailure=>{revFail();throw closeFailure;});}}
            const originalClose=context.close;''','original-sdk-private-profile-identity')
replace('                }catch{fail();}\n                finally{\n                  let result;','''                }catch(error){
                  // Only the deliberate in-flight cut may leave a destroyed/stalled realm.
                  // Malformed ACK/fence failures remain sticky even in C6.
                  const unavailable=error instanceof Error&&(error.message==='TIME'
                    ||error.message.includes('Target page, context or browser has been closed'));
                  if(!selected?.c6||selected.c6===4||!unavailable)fail();
                }
                finally{
                  let result;''','interrupted-fence-not-positive')
replace("                  if(fenceSucceeded){try{p4Fs.appendFileSync(p4SettledFile,phase+'\\\\n',{mode:0o600});}",'''                  if(selected?.c6){
                    revEmit(selected,13,phase,fenceSucceeded?1:0,0,true);
                    // The original close already settled. Bound only observer ACK drain; no
                    // renewed run/step/lease permissions or delay of the native call itself.
                    let timer;try{await Promise.race([revTail,new Promise((_,reject)=>{
                      timer=setTimeout(()=>reject(new Error('C6_ACK_DRAIN')),1000);})]);}
                    catch{revFail();}finally{clearTimeout(timer);}
                  }
                  if(fenceSucceeded){try{p4Fs.appendFileSync(p4SettledFile,phase+'\\\\n',{mode:0o600});}''','actual-original-close-receipt')
# Runtime: bind actual browser scratch to original SDK inode, install sanctioned hooks.
replace('              revStarted=true;revRuntimes.set(runtime,mode);revObserveNative(runtime.browser?.observations,mode);','''              if(mode.c6&&mode.path===1){const profile=revFs.lstatSync(runtime.browser.scratchDirectory+'/browser-profile');
                if(profile.isSymbolicLink()||profile.dev!==revC6ProfileDev||profile.ino!==revC6ProfileIno)
                  throw new Error('C6_CONTEXT');revC6ContextBound=true;}
              revStarted=true;revRuntimes.set(runtime,mode);revObserveNative(runtime.browser?.observations,mode);
              if(mode.c6&&mode.path===1){
                const options=runtime.options,group={cap:options,methods:[]};
                if(!options||Object.hasOwn(options,'onRawFailure')||Object.hasOwn(options,'beforeSecretFill'))
                  throw new Error('C6_HOOK_COLLISION');revGroups.add(group);
                const comparisons=()=>{const stat=revFs.lstatSync(c5ValuesFile);
                  if(stat.isSymbolicLink()||!stat.isFile()||(stat.mode&0o777)!==0o600||stat.size>32768)
                    throw new Error('C6_VALUES');const values=JSON.parse(revFs.readFileSync(c5ValuesFile,'utf8'));
                  if(!Array.isArray(values)||values.length!==1||typeof values[0]!=='string'||values[0].length>4096)
                    throw new Error('C6_VALUES');return values;};
                const hooks={onRawFailure(error){try{const text=error instanceof Error?error.message:'';
                  let literal=0,encoded=0;for(const value of comparisons()){
                    if(text.includes(value))literal++;
                    for(const variant of [encodeURIComponent(value),Buffer.from(value).toString('base64')])
                      if(text.includes(variant))encoded++;}
                  revEmit(mode,11,1,literal,1,true,encoded);
                  }catch{revFail();}}};
                if(mode.c6===4)hooks.beforeSecretFill=value=>{
                  if(comparisons()[0]!==value){revFail();throw new Error('C6_RELEASE_MISMATCH');}
                  throw new Error('C6_RELEASED '+value+' '+encodeURIComponent(value)+' '
                    +Buffer.from(value).toString('base64')+' '+ '界'.repeat(3000));};
                for(const [name,hook] of Object.entries(hooks)){const descriptor=Object.getOwnPropertyDescriptor(options,name);
                  if(!Reflect.defineProperty(options,name,{configurable:true,writable:true,value:hook}))
                    throw new Error('C6_HOOK');group.methods.push([name,descriptor,hook]);}
              }''','sanctioned-hooks-and-selected-context')
replace("          if(mode){const restored=revRestore();revEmit(mode,6,1,0,0,restored);}","          if(mode&&!mode.c6){const restored=revRestore();revEmit(mode,6,1,0,0,restored);}",'retain-hooks-through-late-failure')
replace("const reason=['REVOKED','LEASE_LOST','EXPIRED','CANCELLED','CONTEXT_LOST'].indexOf(args[0])+1;", "const reason=['REVOKED','LEASE_LOST','EXPIRED','CANCELLED','CONTEXT_LOST',...(mode.c6?['UNKNOWN_OUTCOME']:[])].indexOf(args[0])+1;",'truthful-guided-reason')
replace('            result.then(()=>revEmit(mode,9,1),()=>{revFail();}).catch(()=>{revFail();});revRuntimes.delete(this);}', '''            const runtime=this;
            result.then(async()=>{
              if(mode.c6){const deadline=performance.now()+10000;
                while(runtime.busy&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
                if(runtime.busy){revFail();return;}revEmit(mode,6,1,0,0,revRestore());}
              revEmit(mode,9,1);
            },()=>{revFail();}).catch(()=>{revFail();});revRuntimes.delete(this);}''','restore-after-original-dispatch-lifetime')
# Observe original frames synchronously before forwarding, retaining numeric deadline scalars only.
replace('            const result=Reflect.apply(listener,this,args),mode=revMode();','''            const mode=revMode(),message=args[0];
            if(mode?.c6&&mode.path===2){
              if(message?.kind==='launch')revC6RunDeadline=Math.min(Date.parse(message.admission?.runDeadlineAt),Date.now()+message.totalRuntimeMs);
              if(message?.kind==='execute')revC6StepMs=message.stepTimeoutMs;
            }
            const result=Reflect.apply(listener,this,args);''','original-admitted-deadline-observation')
# Callback positivity: extend existing original-forward filter, not runtime callback API.
replace('            C5Capture activeC5 = c5Capture;','''            C5Capture activeC5 = c5Capture;
            P4RevocationState c6 = p4Revocation;
            if (c6 != null && c6.c6Kind == 4 && c6.guidedSession != null
                && http.getRequestMethod().equals("POST")
                && http.getRequestURI().equals("/internal/v2/studio/guided-sessions/" + c6.guidedSession + "/outcomes")) {
              var wrapped = new org.springframework.web.util.ContentCachingRequestWrapper(http, 262144);
              try { chain.doFilter(wrapped, response); }
              finally { p8CaptureInjectedCallback(c6, wrapped.getContentAsByteArray(),
                  ((jakarta.servlet.http.HttpServletResponse) response).getStatus()); }
              return;
            }''','produced-original-callback-scalar')
replace('      P4_NOTIFICATION_FAILED.set(true);\n      throw failure;\n    }\n  }\n\n  private static void p4AwaitNativeSubmitFence','      P4RevocationState selected = p4Revocation;\n      if (selected != null && selected.c6Kind > 0 && selected.c6Kind < 4\n          && selected.c6CutAt != 0 && !accepted) selected.c6InterruptedNotification = true;\n      else P4_NOTIFICATION_FAILED.set(true);\n      throw failure;\n    }\n  }\n\n  private static void p4AwaitNativeSubmitFence','retain-selected-interruption-notification-limit')
# New case logic inserted before original helpers; generated separately below.
s=s.replace('  private P3Publication p4PositiveNativeControl(UUID test)',(out/'case-helpers.txt').read_text()+'  private P3Publication p4PositiveNativeControl(UUID test)')
after=s.encode();(out/'before.java').write_bytes(before);(out/'GuidedPublicationReplayIT.java').write_bytes(after)
patch=''.join(difflib.unified_diff(s=[]) ) if False else ''.join(difflib.unified_diff(before.decode().splitlines(True),s.splitlines(True),fromfile='a/backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java',tofile='b/backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java'))
(out/'candidate.patch').write_text(patch)
# Existing testcase body byte comparison by original next @Test/header interval: final original test ends at next helper, not newly inserted test.
oldnames=re.findall(r'  @Test\n(?:  @[^\n]*\n)*  void (\w+)\(',before.decode())
checks=[]
for name in oldnames:
 marker='  void '+name+'('
 a=before.decode().index(marker);b=s.index(marker)
 # Java lexical scanner handles strings/comments/text blocks and counts braces.
 def method(text,start):
  i=text.index('{',start);j=i;depth=0;state='code'
  while j<len(text):
   if state=='code':
    if text.startswith('"""',j):state='text';j+=3;continue
    if text.startswith('//',j):state='line';j+=2;continue
    if text.startswith('/*',j):state='block';j+=2;continue
    if text[j]=='"':state='str'
    elif text[j]=="'":state='char'
    elif text[j]=='{':depth+=1
    elif text[j]=='}':
     depth-=1
     if depth==0:return text[start:j+1]
   elif state=='text':
    if text.startswith('"""',j):state='code';j+=3;continue
   elif state=='line':
    if text[j]=='\n':state='code'
   elif state=='block':
    if text.startswith('*/',j):state='code';j+=2;continue
   else:
    if text[j]=='\\':j+=2;continue
    if text[j]==('"' if state=='str' else "'"):state='code'
   j+=1
  raise ValueError(name)
 ob=method(before.decode(),a);ab=method(s,b);assert ob==ab,name
 checks.append({'method':name,'bodySha256':hashlib.sha256(ob.encode()).hexdigest(),'identical':True})
assert len(checks)==28,len(checks)
manifest={'beforeSha256':hashlib.sha256(before).hexdigest(),'afterSha256':hashlib.sha256(after).hexdigest(),'patchSha256':hashlib.sha256(patch.encode()).hexdigest(),'originalTests':checks,'oldCount':28,'newCount':4,'totalCount':32,'changes':changes,'runtime':'UNRUN','liveApplied':False}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({k:v for k,v in manifest.items() if k!='originalTests'}))
