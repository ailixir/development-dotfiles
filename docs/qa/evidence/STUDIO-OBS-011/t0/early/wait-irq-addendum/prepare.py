"""Prepare only: copy sealed source-derived methods and add owned-thread interval probes."""
from pathlib import Path
import hashlib
import json
import re

O = Path(__file__).resolve().parent
EARLY = O.parent
ROOT = O.parents[6]
SEALED = EARLY/'it-s-draft/resume2/conformance'
BRIDGE = EARLY/'gs-t2-draft/resume2'
ITS = EARLY/'it-s-draft/resume2'
sha = lambda data: hashlib.sha256(data).hexdigest()
original_java = (SEALED/'WaitConformance.java').read_text()
old_binding = json.loads((SEALED/'bindings.json').read_text())
assert sha(original_java.encode()) == old_binding['generatedJavaSha256']
fixture = original_java[original_java.index('  static final class Fixture {'):original_java.index('  record Outcome(')]
ids = [r['id'] for r in old_binding['cases']]
assert len(ids)==26

probe = r'''
  static final class Probe {
    // Scratch coordination budget only. Original10/20/25/50ms intervals are unchanged.
    final long budgetMillis=2500;
    final List<String> trace=new ArrayList<>();
    final CountDownLatch firstReadEntered=new CountDownLatch(1);
    final CountDownLatch allowFirstReturn=new CountDownLatch(1);
    final CountDownLatch firstReturnReady=new CountDownLatch(1);
    volatile int reads;
    boolean last;
    boolean tick() {
      trace.add("read:"+(++reads));
      if(reads==1) {
        firstReadEntered.countDown();
        try {
          if(!allowFirstReturn.await(1,TimeUnit.SECONDS))throw new AssertionError("SETUP first-read release missing");
        } catch(InterruptedException beforeInterval) {
          Thread.currentThread().interrupt();
          throw new AssertionError("SETUP interrupted before actual interval entry",beforeInterval);
        }
        firstReturnReady.countDown();
      }
      return last=false;
    }
  }
'''

orchestration = r'''
  static final java.lang.management.ThreadMXBean THREADS=java.lang.management.ManagementFactory.getThreadMXBean();
  static final List<String> PROOF=new ArrayList<>();
  static Path proofPath;
  record Outcome(Object result,Throwable failure,boolean interrupt,List<String> trace,int reads,
                 int escapes,boolean handlerStable,boolean entryProved,boolean restoreSleepProved){}
  record Snapshot(long waitedCount,java.lang.Thread.State state,StackTraceElement[] stack){}

  static Snapshot snapshot(Thread worker) {
    var info=THREADS.getThreadInfo(worker.threadId(),128);
    return info==null?null:new Snapshot(info.getWaitedCount(),info.getThreadState(),info.getStackTrace());
  }
  static boolean exactInterval(Snapshot x,int site,boolean delivered) {
    if(x==null||x.state()!=Thread.State.TIMED_WAITING)return false;
    boolean nativeSleep=false,owner=false,uninterruptible=false,awaiter=false;
    for(var frame:x.stack()) {
      nativeSleep|=frame.getClassName().equals("java.lang.Thread")&&frame.getMethodName().startsWith("sleep");
      owner|=frame.getClassName().equals("WaitIrqConformance$Fixture")&&
             frame.getMethodName().equals("s"+site+(delivered?"_delivered":"_original"));
      uninterruptible|=frame.getClassName().equals("org.awaitility.core.Uninterruptibles")&&
                       frame.getMethodName().equals("sleepUninterruptibly");
      awaiter|=frame.getClassName().equals("org.awaitility.core.ConditionAwaiter")&&frame.getMethodName().equals("await");
    }
    return nativeSleep&&owner&&(delivered?(uninterruptible&&awaiter):(!uninterruptible&&!awaiter));
  }
  static void event(String id,String variant,String name,Snapshot x,int reads,long observedAt) {
    PROOF.add("EVENT "+id+" "+variant+" "+name+" observedMonotonicNs="+observedAt+" reads="+reads+
      (x==null?" no-thread-info":" waitedCount="+x.waitedCount()+" state="+x.state()+" stack="+Arrays.toString(x.stack())));
  }
  static void saveProof(String status) throws IOException {
    var lines=new ArrayList<>(PROOF);lines.add("STATUS "+status+"; no native-gate or timing credit");
    Files.write(proofPath,lines);
  }
  static boolean joinOwned(Thread worker,long millis) {
    long until=System.nanoTime()+TimeUnit.MILLISECONDS.toNanos(millis);boolean interrupted=false;
    try {
      while(worker.isAlive()) {
        long left=until-System.nanoTime();if(left<=0)return false;
        try {worker.join(Math.max(1L,TimeUnit.NANOSECONDS.toMillis(left)));}
        catch(InterruptedException coordinatorInterrupted) {interrupted=true;}
      }
      return true;
    } finally {if(interrupted)Thread.currentThread().interrupt();}
  }
  static Outcome run(int site,boolean delivered,String id) throws Exception {
    String variant=delivered?"delivered":"original";
    Probe p=new Probe();Fixture f=new Fixture(p,id);
    var before=Thread.getDefaultUncaughtExceptionHandler();
    var result=new AtomicReference<Object>();
    var escaped=new AtomicReference<Throwable>();
    var flag=new AtomicBoolean();var escapes=new AtomicInteger();
    Thread worker=Thread.ofPlatform().daemon(false).name("obs011-owned-irq-"+site+"-"+variant).unstarted(()->{
      try {
        result.set(Fixture.class.getDeclaredMethod("s"+site+(delivered?"_delivered":"_original")).invoke(f));
      } catch(java.lang.reflect.InvocationTargetException wrapper) {
        Throwable first=wrapper.getCause();escapes.incrementAndGet();
        if(!escaped.compareAndSet(null,first))throw new AssertionError("duplicate escaped outcome");
        if(id.startsWith("Transport-route-idle")&&first instanceof InterruptedException)Thread.currentThread().interrupt();
      } catch(Throwable setupFailure) {
        escapes.incrementAndGet();escaped.compareAndSet(null,setupFailure);
      } finally {
        flag.set(Thread.currentThread().isInterrupted());
      }
    });
    boolean entry=false,restored=false;
    worker.start();
    try {
      if(!p.firstReadEntered.await(1,TimeUnit.SECONDS))throw new AssertionError("UNPROVED first-read rendezvous: "+id);
      if(p.reads!=1||worker.isInterrupted())throw new AssertionError("SETUP first false read/clear flag missing");
      event(id,variant,"first-read-held",snapshot(worker),p.reads,System.nanoTime());
      p.allowFirstReturn.countDown();
      long entryUntil=System.nanoTime()+TimeUnit.SECONDS.toNanos(1);
      Snapshot entered=null;long enteredAt=0;
      while(System.nanoTime()<entryUntil&&worker.isAlive()) {
        Snapshot current=snapshot(worker);
        if(p.firstReturnReady.getCount()==0&&p.reads==1&&exactInterval(current,site,delivered)) {
          entered=current;enteredAt=System.nanoTime();break;
        }
        Thread.onSpinWait();
      }
      if(entered==null)throw new AssertionError("UNPROVED real native interval entry (no retry): "+id+" "+variant);
      entry=true;
      // Only this freshly constructed, identity-held worker is ever interrupted.
      worker.interrupt();
      long interruptedAt=System.nanoTime();Snapshot interruptedState=snapshot(worker);
      Snapshot acknowledged=null;long acknowledgedAt=0;
      if(delivered) {
        if(entered.waitedCount()>=0&&p.reads==1&&exactInterval(interruptedState,site,true)&&
           interruptedState.waitedCount()>entered.waitedCount()) {
          restored=true;acknowledged=interruptedState;acknowledgedAt=System.nanoTime();
        }
        long ackUntil=System.nanoTime()+TimeUnit.SECONDS.toNanos(1);
        while(!restored&&System.nanoTime()<ackUntil&&worker.isAlive()) {
          Snapshot current=snapshot(worker);
          if(entered.waitedCount()>=0&&p.reads==1&&exactInterval(current,site,true)&&current.waitedCount()>entered.waitedCount()) {
            restored=true;acknowledged=current;acknowledgedAt=System.nanoTime();break;
          }
          Thread.onSpinWait();
        }
      }
      // Format potentially large stack evidence only after the interrupt/acknowledgment window.
      event(id,variant,"native-interval-before-owned-interrupt",entered,1,enteredAt);
      event(id,variant,"owned-interrupt-sent",interruptedState,p.reads,interruptedAt);
      if(acknowledged!=null)event(id,variant,"uninterruptible-resleep-ack",acknowledged,p.reads,acknowledgedAt);
      if(delivered&&!restored)throw new AssertionError("UNPROVED during-interval handling: no same-first-read resleep acknowledgment (no retry): "+id);
      if(!joinOwned(worker,3000))throw new AssertionError("owned worker did not finish within join budget: "+id);
      event(id,variant,"joined",null,p.reads,System.nanoTime());
      return new Outcome(result.get(),escaped.get(),flag.get(),List.copyOf(p.trace),p.reads,escapes.get(),
                         before==Thread.getDefaultUncaughtExceptionHandler(),entry,restored);
    } finally {
      p.allowFirstReturn.countDown();
      if(worker.isAlive())worker.interrupt();
      if(!joinOwned(worker,4000)) {
        PROOF.add("FATAL owned worker survived bounded cleanup; terminate this owned scratch JVM");
        try {saveProof("FAIL_OWNED_THREAD_SURVIVOR");} finally {Runtime.getRuntime().halt(3);}
      }
    }
  }
  public static void main(String[] args) throws Exception {
    if(args.length!=1)throw new IllegalArgumentException("one fresh task-owned proof output path required");
    proofPath=Path.of(args[0]);
    if(Files.exists(proofPath))throw new IllegalArgumentException("proof file already exists");
    String[] ids=IDS;
    int[] originalSleepLines=ORIGINAL_LINES;
    int[] deliveredAfterIntervalLines=DELIVERED_LINES;
    int completed=0;
    try {
      for(int i=0;i<ids.length;i++) {
        Outcome old=run(i,false,ids[i]),now=run(i,true,ids[i]);
        for(var pair:List.of(Map.entry("original",old),Map.entry("delivered",now))) {
          Outcome value=pair.getValue();String label=ids[i]+" "+pair.getKey();
          assertThat(value.entryProved()).as(label+" actual interval entry").isTrue();
          assertThat(value.failure()).as(label+" unwrapped first escaped interruption").isExactlyInstanceOf(InterruptedException.class);
          assertThat(value.failure().getCause()).as(label+" no replacement wrapper").isNull();
          assertThat(value.failure().getSuppressed()).as(label+" no substituted secondary failure").isEmpty();
          assertThat(value.escapes()).as(label+" one first escaped Throwable").isEqualTo(1);
          assertThat(value.reads()).as(label+" no condition/SQL/marker read after interrupted interval").isEqualTo(1);
          assertThat(value.result()).as(label+" no terminal success/final result manufactured").isNull();
          assertThat(value.interrupt()).as(label+" actual caller flag mapping").isEqualTo(ids[i].startsWith("Transport-route-idle"));
          assertThat(value.handlerStable()).as(label+" unrelated-thread exception ownership").isTrue();
        }
        assertThat(now.restoreSleepProved()).as(ids[i]+" interrupted library interval resumes before flag restoration").isTrue();
        assertThat(now.trace()).as(ids[i]+" exact original first-read/effect sequence").isEqualTo(old.trace());
        final int site=i;
        assertThat(Arrays.stream(old.failure().getStackTrace()).anyMatch(frame->
          frame.getClassName().equals("WaitIrqConformance$Fixture")&&frame.getMethodName().equals("s"+site+"_original")&&
          frame.getLineNumber()==originalSleepLines[site])).as(ids[i]+" original real sleep throw site").isTrue();
        assertThat(Arrays.stream(old.failure().getStackTrace()).anyMatch(frame->
          frame.getClassName().equals("java.lang.Thread")&&frame.getMethodName().startsWith("sleep")))
          .as(ids[i]+" original InterruptedException arose from actual Thread.sleep").isTrue();
        assertThat(Arrays.stream(now.failure().getStackTrace()).anyMatch(frame->frame.getMethodName().equals("step")&&
          frame.getClassName().startsWith("WaitIrqConformance$Fixture$")&&frame.getLineNumber()==deliveredAfterIntervalLines[site]))
          .as(ids[i]+" actual delivered post-interval check threw, not initial pre-sleep check").isTrue();
        PROOF.add("PAIR_PASS "+ids[i]+" original/delivered first-read interruption; latency not compared");completed++;
      }
      saveProof("PASS "+completed+" paired real-during-interval comparisons");
      System.out.println("Completed "+completed+" paired during-interval probes; native gates and234 earlier comparisons remain separate");
    } catch(Throwable failure) {
      PROOF.add("FAIL "+failure);saveProof("FAIL completed="+completed+" of26; missing evidence is UNPROVED");
      if(failure instanceof Exception exception)throw exception;
      if(failure instanceof Error error)throw error;
      throw new AssertionError(failure);
    }
  }
'''
header = original_java[:original_java.index('public final class WaitConformance {')]
java = header+'public final class WaitIrqConformance {\n'+probe+fixture+orchestration+'\n}\n'
java = java.replace('IDS', '{'+','.join(json.dumps(x) for x in ids)+'}')


def mask(s):
    return re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/',lambda m:''.join('\n' if c=='\n' else ' ' for c in m[0]),s)


def method(s, index, variant):
    match=re.search(r'(?m)^ *Object s'+str(index)+'_'+variant+r'\(\) throws Exception \{',s)
    assert match,(index,variant)
    begin=match.start()
    hidden=mask(s);opening=hidden.index('{',begin);depth=1;end=opening+1
    while depth:
        depth+=(hidden[end]=='{')-(hidden[end]=='}');end+=1
    return begin,end,s[begin:end]


old_lines=[];new_lines=[];records=[]
for index, prior in enumerate(old_binding['cases']):
    for variant in ['original','delivered']:
        assert method(java,index,variant)[2]==method(original_java,index,variant)[2]
    a,b,body=method(java,index,'original')
    sleep=next(re.finditer(r'Thread\.sleep\((\d+)\)',mask(body)))
    interval=int(sleep[1])
    old_lines.append(java.count('\n',0,a+sleep.start())+1)
    a,b,body=method(java,index,'delivered')
    guard=body.index('if (slept && Thread.interrupted())')
    throw=body.index('throw new InterruptedException();',guard)
    new_lines.append(java.count('\n',0,a+throw)+1)
    records.append(prior|{'copiedOriginalMethodSha256':sha(method(java,index,'original')[2].encode()),
                          'copiedDeliveredMethodSha256':sha(method(java,index,'delivered')[2].encode()),
                          'originalSleepSourceLine':old_lines[-1],'deliveredPostIntervalThrowSourceLine':new_lines[-1],
                          'intervalMillisUnchanged':interval,'expectedConditionReads':1,
                          'expectedCallerInterruptFlag':prior['id'].startswith('Transport-route-idle'),
                          'expectedException':'java.lang.InterruptedException, unwrapped/no suppressed replacement, one escape',
                          'expectedTrace':'equal original/delivered complete first-read/effect prefix; no final-fresh-read after interruption'})
java=java.replace('ORIGINAL_LINES','{'+','.join(map(str,old_lines))+'}').replace('DELIVERED_LINES','{'+','.join(map(str,new_lines))+'}')
# Substitution occurs below every method and cannot shift their compiled source line bindings.
assert java[java.index('  static final class Fixture {'):java.index('  static final java.lang.management.ThreadMXBean')]==fixture+'\n'
for index in range(26):
    assert method(java,index,'original')[2]==method(original_java,index,'original')[2]
    assert method(java,index,'delivered')[2]==method(original_java,index,'delivered')[2]

(O/'WaitIrqConformance.java').write_text(java)
(O/'classpath.json').write_bytes((SEALED/'classpath.json').read_bytes())
sealed_files={}
for out in [BRIDGE,ITS]:
    manifest=json.loads((out/'artifact-manifest.json').read_text())
    actual={str(p.relative_to(out)) for p in out.rglob('*') if p.is_file()}
    expected=set(manifest)|{'artifact-manifest.json','receipt.json','receipt.md'}
    assert actual==expected
    for rel,digest in manifest.items():assert sha((out/rel).read_bytes())==digest
    sealed_files[str(out.relative_to(ROOT))]={'files':{str(p.relative_to(out)):sha(p.read_bytes()) for p in sorted(out.rglob('*')) if p.is_file()}}
bindings={'status':'ALL26 PAIRED PROBES UNEXECUTED; no Java/compiler/234comparison/native/timing credit',
          'generatedJavaSha256':sha(java.encode()),'sealedOriginalJavaSha256':sha(original_java.encode()),
          'fixtureCopiedByteExactSha256':sha(fixture.encode()),'cases':records,'siteCount':26,
          'pairedRuns':52,'scratchCoordinationBudgetMillis':2500,'actualIntervalsChanged':False,
          'coordination':'first-read gate→observed exact real native sleep→owned interrupt→delivered native resleep acknowledgment with larger waitedCount and same first read→bound source-line escape→bounded join',
          'failureRule':'missing snapshot/ack/thread counters/source-line evidence fails UNPROVED, no retry or inferred pass',
          'sealedPackages':sealed_files}
(O/'bindings.json').write_text(json.dumps(bindings,indent=2)+'\n')
inputs=[ROOT/'AGENTS.md',ROOT/'.codex/skills/aiox-dev/SKILL.md',ROOT/'.aiox-core/development/agents/dev.md',
        ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/bridge-its-drafts-rereview/review.md',
        ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/bridge-its-drafts/ConditionAwaiter.javap.txt',
        ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/bridge-its-drafts/Uninterruptibles.javap.txt',
        ITS/'prepare_conformance.py',SEALED/'WaitConformance.java',SEALED/'bindings.json',SEALED/'run_later.py',SEALED/'classpath.json']
for out in [BRIDGE,ITS]:inputs.append(out/'loop-edits.json')
for name in ['intent','context','preflight']:
    inputs.append(ROOT/('.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/wait-irq-addendum-'+name+('.json' if name=='preflight' else '.txt')))
(O/'input-bindings.json').write_text(json.dumps([{'path':str(p.relative_to(ROOT)),'sha256':sha(p.read_bytes())} for p in inputs],indent=2)+'\n')
print(json.dumps({'preparedOnly':True,'pairedSites':26,'ownedRunsUnexecuted':52,'javaSha256':sha(java.encode()),'sealedPackagesUnchanged':True}))
