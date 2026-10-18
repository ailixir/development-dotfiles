from pathlib import Path
import hashlib,json,difflib
r=Path('docs/qa/evidence/STUDIO-OBS-007/resume-d-c6-cdp-isolated-author');p=Path('backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java')
b=(r/'before'/p).read_text();s=b;changes=[]
def edit(o,n):
 global s
 assert s.count(o)==1,(o[:70],s.count(o));s=s.replace(o,n,1);changes.append((o,n))
edit('''    volatile long c6FocusAt, c6PendingAt, c6CutAt, c6DeadlineMarginMs;''','''    volatile long c6FocusAt, c6PrimitiveAt, c6PendingAt, c6CutAt, c6DeadlineMarginMs;''')
edit('''              || state.c6FocusAt == 0''','''              || state.c6PrimitiveAt == 0
              || state.c6FillEntries != 1''')
edit('''                "C6 original native promise is not pending at real focus"''','''                "C6 original sole CDP primitive promise is not pending"''')
edit('''          if (operation == 1 && state.c6Timing != null) {
            state.c6Timing.nativeNotice(true, ordinal, true);
          }
        } else if (event == 3)''','''          if (operation == 1 && state.c6Timing != null) {
            state.c6Timing.nativeNotice(true, ordinal, true);
          }
          if (operation == 1 && state.c6Kind > 0 && state.c6Kind < 4) {
            if (state.c6PrimitiveAt != 0 || state.c6FillEntries != 1) {
              throw new IllegalArgumentException("Duplicate selected sole CDP entry");
            }
            state.c6PrimitiveAt = System.nanoTime();
            timingSite = 240;
            p8WritePendingProbe(state, 1);
            if (state.c6Timing != null) state.c6Timing.mark(4);
          }
        } else if (event == 3)''')
edit('''          if (operation == 1 && body.path("ok").booleanValue()) {''','''          // CDP fulfillment is transport settlement, never proof that the password was written.
          if (state.c6Kind == 0 && operation == 1 && body.path("ok").booleanValue()) {''')
edit('''              "real password focus ingress plus contemporaneous original Node pending acknowledgement"''','''              "actual sole CDP invocation plus contemporaneous original Node pending acknowledgement"''')
edit('''        assertThat(state.c6FocusAt).isPositive();
        assertThat(state.c6PendingAt).isGreaterThanOrEqualTo(state.c6FocusAt);''','''        assertThat(state.c6PrimitiveAt).isPositive();
        assertThat(state.c6PendingAt).isGreaterThanOrEqualTo(state.c6PrimitiveAt);''')
edit('''                "sameJavaClockFocusToAckNanos",
                state.c6PendingAt == 0 ? 0 : state.c6PendingAt - state.c6FocusAt)''','''                "sameJavaClockPrimitiveToAckNanos",
                state.c6PendingAt == 0 || state.c6PrimitiveAt == 0
                    ? 0 : state.c6PendingAt - state.c6PrimitiveAt)''')
edit('''        let revPending=0,revOriginalPending=0,revAcked=0,revFailed=false,revSealing=false,revSealed=false;''','''        let revPending=0,revOriginalPending=0,revAcked=0,revFailed=false,revSealing=false,revSealed=false;
        let revC6HighPending=0,revC6CdpPending=0;''')
edit('''              sent:revSeq,acked:revAcked,pending:revPending+revOriginalPending,originalPending:revOriginalPending,''','''              sent:revSeq,acked:revAcked,pending:revPending+revOriginalPending+revC6HighPending+revC6CdpPending,originalPending:revOriginalPending,''')
edit('''          if(revSealing&&revPending===0&&revOriginalPending===0){''','''          if(revSealing&&revPending===0&&revOriginalPending===0&&revC6HighPending===0&&revC6CdpPending===0){''')
edit('''          if(mode.c6){revNativeOrdinal=0;revC6Probed=0;revC6Restored=false;}''','''          if(mode.c6){revNativeOrdinal=0;revC6Probed=0;revC6Restored=false;}
          if(mode.c6>=1&&mode.c6<=3){revStarted=false;revC6HighPending=0;revC6CdpPending=0;}''')
edit('''          if(!cap||revGroups.size||typeof cap.fillPassword!=='function'||typeof cap.invoke!=='function'){revFail();return;}''','''          const cdpSelected=mode.c6>=1&&mode.c6<=3;
          if(!cap||(!cdpSelected&&revGroups.size)||[...revGroups].some(group=>group.cap===cap)
            ||typeof cap.fillPassword!=='function'||typeof cap.invoke!=='function'){revFail();return;}''')
edit('''            const wrapped=function(...args){
              const operation=name==='fillPassword'?1:args[0]?.operation?.kind==='click'?2:3;''','''            const wrapped=function(...args){
              if(cdpSelected&&name==='fillPassword'){
                revC6HighPending++;let result;
                const settled=()=>{revC6HighPending--;revPublish(mode,revSealed);revMaybeSeal();};
                try{result=Reflect.apply(original,this,args);}catch(error){settled();throw error;}
                try{result.then(settled,settled).catch(()=>{revFail();});}catch{revFail();}
                return result;
              }
              const operation=name==='fillPassword'?1:args[0]?.operation?.kind==='click'?2:3;''')
edit('''                    while(runtime.busy&&performance.now()<deadline)
                      await new Promise(resolve=>setTimeout(resolve,10));
                    if(runtime.busy){revFail();return false;}''','''                    while((runtime.busy||revActive.size||revC6HighPending||revC6CdpPending)&&performance.now()<deadline)
                      await new Promise(resolve=>setTimeout(resolve,10));
                    if(runtime.busy||revActive.size||revC6HighPending||revC6CdpPending){revFail();return false;}''')
edit('''                      while(revActive.size&&performance.now()<observerDeadline)
                        await new Promise(resolve=>setTimeout(resolve,10));
                      if(revActive.size)revFail();''','''                      while((revActive.size||revC6HighPending||revC6CdpPending)&&performance.now()<observerDeadline)
                        await new Promise(resolve=>setTimeout(resolve,10));
                      if(revActive.size||revC6HighPending||revC6CdpPending)revFail();''')
# Remove the obsolete focus transport requests while preserving the original real focus stall.
edit('''          const notify=(kind,cutFocus=false)=>{''','''          const notify=kind=>{''')
edit('''              if(cutFocus){
                const queued=navigator.sendBeacon(endpoint(kind),new Blob([JSON.stringify({seq})],{type:'application/json'}));
                if(!queued)throw new Error('QUEUE');
                // Queueing is not an ACK; the existing Java receiver and Node probe prove entry.
                // The original page ACK deadline still fails if this realm survives the stall.
                await Promise.resolve();
              }else await request(kind,{seq},deadline);''','''              await request(kind,{seq},deadline);''')
edit('''                    + "&&event.target.type==='password'){void notify('focus-enter',true);"''','''                    + "&&event.target.type==='password'){"''')
edit('''                    + "while(performance.now()<end){}void notify('focus-exit');}});"''','''                    + "while(performance.now()<end){}}});"''')
# The source preserves unused focus receiver compatibility; its pending-probe side effect is gone.
edit('''                timingSite = 240;
                p8WritePendingProbe(selected, 1);
                if (selected.c6Timing != null) {
                  selected.c6Timing.mark(4);
                }''','''                // DOM focus is effect support only; the real CDP entry requests the probe.''')
# Add only fixed source identity import for pinning the original collector installation.
edit('''        const c5ValuesFile=%s,c5CountsFile=%s;
        const c5Variants''','''        const c5ValuesFile=%s,c5CountsFile=%s;
        import {installObservationCollector as c6TrustedCollector} from %s;
        const c5Variants''')
edit('''            JSON.writeValueAsString(TEMP.resolve("c5-profile-counts.jsonl").toString()));
  }

  private static String p3GuidedLaunchCounter''','''            JSON.writeValueAsString(TEMP.resolve("c5-profile-counts.jsonl").toString()),
            JSON.writeValueAsString(Path.of("../studio-runner/dist/run/observationCollector.js")
                .toAbsolutePath().normalize().toUri().toString()));
  }

  private static String p3GuidedLaunchCounter''')
# Superseding source-tier navigation authority: only newCDPSession/send; no Page hooks.
helper=Path(r/'cdp-helper.txt').read_text() if (r/'cdp-helper.txt').exists() else None
assert helper is not None,'Approved lifetime helper pending'
edit('''        const p4NativeLaunch=p4Chromium.launchPersistentContext;''',helper+'''        const p4NativeLaunch=p4Chromium.launchPersistentContext;''')
edit('''            const originalClose=context.close;
            context.close=function(...closeArgs){''','''            if(selected?.c6>=1&&selected.c6<=3)c6BindContext(context,selected);
            const originalClose=context.close;
            context.close=function(...closeArgs){''')
edit('''                  try{result=await Reflect.apply(originalClose,receiver,closeArgs);}
                  catch(originalFailure){fail();throw originalFailure;}''','''                  try{result=await Reflect.apply(originalClose,receiver,closeArgs);}
                  catch(originalFailure){fail();throw originalFailure;}
                  if(selected?.c6>=1&&selected.c6<=3)c6ClosedContext(receiver);''')
(r/'candidate'/p).write_text(s)
inv=s
for o,n in reversed(changes):assert inv.count(n)==1;inv=inv.replace(n,o,1)
assert inv==b
(r/'candidate.patch').write_text(''.join(difflib.unified_diff(b.splitlines(True),s.splitlines(True),fromfile='before/'+str(p),tofile='candidate/'+str(p))))
(r/'inverse-transformations.json').write_text(json.dumps([{'before':o,'after':n}for o,n in changes],indent=2)+'\n')
print(json.dumps({'base':hashlib.sha256(b.encode()).hexdigest(),'candidate':hashlib.sha256(s.encode()).hexdigest(),'inverse':True,'transformations':len(changes)}))
