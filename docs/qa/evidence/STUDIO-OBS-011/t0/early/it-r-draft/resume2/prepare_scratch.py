"""Generate inert paired Java scratch sources from the actual original/corrected block bytes.
Never invokes Java, a compiler, Gradle, or the native fixture. Writes only this package.
"""
from pathlib import Path
import json,re,hashlib
OUT=Path(__file__).resolve().parent
sha=lambda s:hashlib.sha256(s.encode()).hexdigest()
loops={x['ids'][0]:x for x in json.loads((OUT/'loop-sites.json').read_text())}
edits={x['ids'][0]:x for x in json.loads((OUT/'poll-edits.json').read_text())}
selected=[5,6,29,31,32,33,38,83,84,86]
root=OUT/'scratch';root.mkdir(exist_ok=True)
methods=[];bindings=[]
for n in selected:
 for side in ['original','corrected']:
  raw=loops[n]['source'] if side=='original' else edits[n]['replacement']
  code=raw;operations=[]
  # Both sides use the same monotonic offset clock. Only old sleep edges start elapsed time.
  count=code.count('System.nanoTime()');code=code.replace('System.nanoTime()','Clock.nanoTime()')
  operations.append(dict(operation='replace clock seam',fromToken='System.nanoTime()',toToken='Clock.nanoTime()',count=count))
  if side=='original':
   code,count=re.subn(r'Thread\.sleep\((\d+)\);',r'Clock.startElapsed(); probeIntervalEntered.countDown(); Thread.sleep(\1); if (noAwaitGap) Clock.advance(1_000_000_000L);',code)
   operations.append(dict(operation='old owned interval instrumentation',count=count))
  else:
   code,count=re.subn(r'(itr\d{3}\.intervalOwed = true; )(itr\d{3}\.owedUntil)',r'\1Clock.startElapsed(); \2',code)
   operations.append(dict(operation='new same old interval edge starts clock',count=count))
   needle=f'long itrNow{n:03d} = Clock.nanoTime();'
   assert code.count(needle)==1
   code=code.replace(needle,'if (noAwaitGap) { Clock.advance(1_000_000_000L); noAwaitGap = false; }\n'+needle,1)
   operations.append(dict(operation='scheduled pause before actual remaining/owed calculation',anchor=needle,enabledOnly='NO_AWAIT scenarios'))
   needle='return false; // Cached tick: no second immediate condition/read/effect.'
   assert code.count(needle)==1
   code=code.replace(needle,'probeIntervalEntered.countDown(); '+needle,1)
   operations.append(dict(operation='coordination only on cached first tick',anchor=needle,count=1))
   bound=f'long itrBound{n:03d} = Math.max(itrRemaining{n:03d}, itrOwed{n:03d});'
   assert code.count(bound)==1
   code=code.replace(bound,bound+f' if (itrBound{n:03d} <= 0) noAwaitPathObserved = true;',1)
   operations.append(dict(operation='record actual no-main-Await bound branch',anchor=bound,count=1))
   start='org.awaitility.Awaitility.await('
   code=code.replace(start,f'final long probeChainStarted{n:03d} = System.nanoTime();\n'+start,1)
   callback=f'boolean itrObserved{n:03d} = itrPoll{n:03d}.call();'
   assert code.count(callback)==1
   code=code.replace(callback,f'boolean itrObserved{n:03d}; try {{ itrObserved{n:03d} = itrPoll{n:03d}.call(); }} finally {{ if (scenario.startsWith("LATE_")) {{ lateCallbackEntered = true; lateCompletionBeyondBound = System.nanoTime() - probeChainStarted{n:03d} > itrBound{n:03d}; }} }}',1)
   operations.append(dict(operation='observe actual callback entry/completion beyond actual framework bound',anchor=callback,count=1))
  path=root/f'row{n:03d}-{side}.block.java.txt';path.write_text(code+'\n')
  suffix='''if (fixtureAnnouncement.isBlank()) throw new IllegalStateException("Secret fixture readiness deadline");''' if n==5 else ''
  prefix='''String fixtureAnnouncement = "";
      long probeDeadline = scenario.startsWith("LATE_") ? 100_000_000L : 5_000_000L;
      long fixtureDeadline = probeDeadline, until = probeDeadline, end = probeDeadline, deadline = probeDeadline;
      long started = 0, renewCredentialsAt = 0;
      String id = "scratch", sql = "scratch-count"; int stepIndex = 0;
      var owned = java.util.Map.entry("scratch", "scratch"); String teardown = "";
      JsonNode report = rowId == 83 ? null : C.object().put("streamComplete", false);
      if (scenario.equals("INITIAL_SUCCESS_PREINTERRUPTED") && rowId == 83) report = C.object().put("streamComplete", true);
      String execution = "scratch", p3Cookie = "scratch";
      Instant expires = Instant.EPOCH;
'''
  methods.append(f'  static void row{n:03d}_{side}() throws Exception {{\n'+prefix+code+'\n'+suffix+'\n  }')
  bindings.append(dict(row=n,side=side,originalBlockSha256=sha(loops[n]['source']),
    correctedBlockSha256=sha(edits[n]['replacement']),actualInputBlockSha256=sha(raw),
    instrumentedBlockSha256=sha(code+'\n'),path=str(path.relative_to(OUT)),operations=operations,
    finalReadScope='Block differential only. Original surrounding assertions/fresh reads are separately preserved by exact stage undo proof.'))

harness=r'''// UNEXECUTED: private scratch only. No native fixture, real database, provider, or real evidence writes.
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

public final class ItrWaitDifferentialScratch {
  static String scenario, evidenceOutcome; static int rowId, reads, writes, livenessReads, credentialsRefreshes;
  static boolean noAwaitGap, noAwaitPathObserved, intervalObserved, lateCallbackEntered, lateCompletionBeyondBound;
  static CountDownLatch probeIntervalEntered;
  static final RuntimeException firstException = new RuntimeException("closed scratch sentinel");
  static final Error firstError = new AssertionError("closed scratch sentinel");
  static final Path TEMP=Path.of("private-scratch-no-files"), COHORT_DIRECTORY=TEMP;
  static final class Clock {
    static long base, origin; static boolean running;
    static synchronized long nanoTime() { return base + (running ? System.nanoTime()-origin : 0); }
    static synchronized void startElapsed() { if (!running) { running=true; origin=System.nanoTime(); } }
    static synchronized void advance(long n) { base+=n; }
    static synchronized void reset() { base=0; origin=0; running=false; }
  }
  static final class C {
    static ObjectNode object() { return com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode(); }
  }
  static final class Fixture {
    boolean isAlive() { livenessReads++; return !scenario.equals("LIVENESS_ERROR"); }
  }
  static final Fixture SECRET_FIXTURE = new Fixture();
  static final class Files {
    static String readString(Path ignored) {
      reads++;
      if (scenario.equals("INITIAL_SUCCESS_PREINTERRUPTED")) return "ready";
      if (scenario.startsWith("BLANK_CROSSED")) {
        Clock.advance(1_000_000_000L);
        if (scenario.endsWith("INTERRUPT")) Thread.currentThread().interrupt();
        return "";
      }
      return reads==1 ? "" : "ready";
    }
  }
  static void lateObservationDelay() {
    long end=System.nanoTime()+Duration.ofMillis(150).toNanos();
    while (System.nanoTime()<end) java.util.concurrent.locks.LockSupport.parkNanos(end-System.nanoTime());
  }
  static boolean condition() {
    reads++;
    boolean initial=scenario.equals("INITIAL_SUCCESS_PREINTERRUPTED");
    if (reads>1 && scenario.startsWith("LATE_")) lateObservationDelay();
    if (reads>1 && scenario.equals("LATE_THROW")) { Clock.advance(1_000_000_000L); throw firstException; }
    if (reads>1 && scenario.equals("LATE_ERROR")) { Clock.advance(1_000_000_000L); throw firstError; }
    if (reads>1 && scenario.equals("LATE_SUCCESS_FLAG")) { Clock.advance(1_000_000_000L); Thread.currentThread().interrupt(); }
    return initial || reads>1;
  }
  static final Map<String,JsonNode> INCREMENTAL_DRIFT_CAPTURE = new HashMap<>() {
    @Override public boolean containsKey(Object key) { return condition(); }
  };
  static final Map<String,JsonNode> P3_FINAL_REPORTS = new HashMap<>() {
    @Override public JsonNode get(Object key) { return observedReport(); }
  };
  static JsonNode observedReport() {
    reads++;
    if (scenario.startsWith("LATE_")) lateObservationDelay();
    if (scenario.equals("LATE_THROW")) { Clock.advance(1_000_000_000L); throw firstException; }
    if (scenario.equals("LATE_ERROR")) { Clock.advance(1_000_000_000L); throw firstError; }
    if (scenario.equals("LATE_SUCCESS_FLAG")) { Clock.advance(1_000_000_000L); Thread.currentThread().interrupt(); }
    return C.object().put("streamComplete", true);
  }
  static JsonNode p3Call(String cookie,String path,Object ignored,int status) { return observedReport(); }
  static Object b1Step(int step) { return step; }
  static final class Jdbc {
    @SuppressWarnings("unchecked") <T> T queryForObject(String sql,Class<T> kind,Object... args) {
      return (T)Integer.valueOf(condition() ? 1 : 0);
    }
    Map<String,Object> queryForMap(String sql,Object... args) {
      reads++;
      boolean confirmed = !scenario.contains("TIMEOUT") && (reads>1 || scenario.equals("INITIAL_SUCCESS_PREINTERRUPTED"));
      return Map.of("state","EXPIRED","teardown",confirmed ? "CONFIRMED" : "REQUESTED","requested",!confirmed);
    }
  }
  static final Jdbc jdbc=new Jdbc();
  static final class Sessions {
    <T> T transaction(Supplier<T> action) { return action.get(); }
    Locked lock(String id) { return new Locked(); }
  }
  static final class Locked {
    ObjectNode document() { return C.object().put("state",condition() ? "AWAITING_CLARIFICATION" : "RUNNING"); }
    ObjectNode progress() { return C.object().put("teardownStatus",condition() ? "CONFIRMED" : "REQUESTED"); }
  }
  static final Sessions sessions=new Sessions();
  static final class Profile { final String lane="SCRATCH"; }
  static final Profile FIXTURE_PROFILE=new Profile();
  static int budgetSessionOrdinal(Jdbc j,String id) { return 1; }
  static void refreshFixtureCredentials() { credentialsRefreshes++; if (scenario.contains("NO_AWAIT")) Clock.advance(1_000_000_000L); }
  static void privateImmutableJson(Path ignored,JsonNode evidence) {
    writes++;evidenceOutcome=evidence.path("outcome").asText();
    if (scenario.startsWith("LATE_")) lateObservationDelay();
    if (scenario.endsWith("H8_WRITE_ERROR")) throw firstError;
  }
  record Outcome(String type, int reads, int writes, int livenessReads, int credentialsRefreshes, String evidenceOutcome, boolean interruptFlag,
      boolean exactFirstException, boolean exactFirstError, boolean actualIntervalObserved, boolean noAwaitObserved,
      boolean actualLateCallback, boolean completionBeyondFrameworkBound) {}
  static void invoke(String side) throws Exception {
    switch (rowId) {
METHOD_SWITCH
      default: throw new AssertionError("unknown closed row");
    }
  }
METHODS
  static Outcome run(int row,String mode,String side) throws Exception {
    rowId=row;scenario=mode;reads=0;writes=0;livenessReads=0;credentialsRefreshes=0;evidenceOutcome="NONE";
    Clock.reset();noAwaitGap=mode.contains("NO_AWAIT");noAwaitPathObserved=false;intervalObserved=false;lateCallbackEntered=false;lateCompletionBeyondBound=false;
    probeIntervalEntered=new CountDownLatch(1);
    final Outcome[] result={null};
    Thread worker=new Thread(() -> {
      Throwable error=null;
      try {
        if (mode.equals("INITIAL_SUCCESS_PREINTERRUPTED")) Thread.currentThread().interrupt();
        invoke(side);
      } catch (Throwable thrown) { error=thrown; }
      finally {
        result[0]=new Outcome(error==null ? "RETURN" : error.getClass().getName(),reads,writes,livenessReads,credentialsRefreshes,evidenceOutcome,
          Thread.currentThread().isInterrupted(),error==firstException,error==firstError,intervalObserved,noAwaitPathObserved,lateCallbackEntered,lateCompletionBeyondBound);
        Thread.interrupted(); // Owned scratch-thread final cleanup only, after observation.
      }
    },"owned-itr-private-scratch");
    worker.setDaemon(true);
    try {
      worker.start();
      if (mode.equals("DURING_INTERVAL_INTERRUPT")) {
        if (!probeIntervalEntered.await(1,TimeUnit.SECONDS)) throw new AssertionError("interval coordination missing");
        long end=System.nanoTime()+Duration.ofSeconds(1).toNanos();
        while (worker.isAlive() && System.nanoTime()<end) {
          // Inspect ONLY this actually owned Thread, privately. Never export any stack/identity.
          boolean realSleep=false;
          for (StackTraceElement frame : worker.getStackTrace()) {
            if (side.equals("corrected") && frame.getClassName().equals("org.awaitility.core.Uninterruptibles")
                && frame.getMethodName().equals("sleepUninterruptibly")) realSleep=true;
            if (side.equals("original") && frame.getClassName().equals("java.lang.Thread")
                && frame.getMethodName().startsWith("sleep")) realSleep=true;
          }
          if (worker.getState()==Thread.State.TIMED_WAITING && realSleep) {
            intervalObserved=true;worker.interrupt();break; // Exactly one actually owned interval interruption.
          }
          Thread.onSpinWait();
        }
        if (!intervalObserved) throw new AssertionError("actual during-interval observation missing");
      }
      worker.join(2000);
      if (worker.isAlive()) throw new AssertionError("bounded scratch observation incomplete");
      if (result[0]==null) throw new AssertionError("missing authoritative worker result");
      return result[0];
    } finally {
      if (worker.isAlive()) { worker.interrupt();worker.join(1000); }
      if (worker.isAlive()) throw new AssertionError("owned scratch cleanup incomplete");
    }
  }
  static void compare(int row,String mode) throws Exception {
    Outcome a=run(row,mode,"original"), b=run(row,mode,"corrected");
    assertThat(b.type()).as("same mapped outcome row%s %s",row,mode).isEqualTo(a.type());
    assertThat(b.reads()).as("original observation multiplicity").isEqualTo(a.reads());
    assertThat(b.writes()).as("terminal evidence write multiplicity").isEqualTo(a.writes());
    assertThat(b.livenessReads()).isEqualTo(a.livenessReads());
    assertThat(b.credentialsRefreshes()).isEqualTo(a.credentialsRefreshes());
    assertThat(b.evidenceOutcome()).isEqualTo(a.evidenceOutcome());
    assertThat(b.interruptFlag()).isEqualTo(a.interruptFlag());
    assertThat(b.exactFirstException()).isEqualTo(a.exactFirstException());
    assertThat(b.exactFirstError()).isEqualTo(a.exactFirstError());
    if (mode.equals("DURING_INTERVAL_INTERRUPT")) {
      assertThat(a.actualIntervalObserved()).isTrue();assertThat(b.actualIntervalObserved()).isTrue();
      assertThat(b.type()).isEqualTo("java.lang.InterruptedException");assertThat(b.interruptFlag()).isFalse();
    }
    if (mode.contains("NO_AWAIT")) assertThat(b.noAwaitObserved()).isTrue();
    if (mode.startsWith("LATE_")) {
      assertThat(b.actualLateCallback()).isTrue();assertThat(b.completionBeyondFrameworkBound()).isTrue();
    }
    if (row==84 && !mode.equals("DURING_INTERVAL_INTERRUPT")) {
      assertThat(b.writes()).isEqualTo(1);
      assertThat(b.evidenceOutcome()).isEqualTo(mode.contains("TIMEOUT") ? "TIMEOUT" : "CONFIRMED");
    }
    // Only closed facts: no raw throwable message, stack, thread identity, value, or environment export.
    System.out.println("row="+row+" scenario="+mode+" paired=true reads="+b.reads()+" writes="+b.writes());
  }
  static void pairedCases() throws Exception {
    if (Runtime.version().feature()!=21) throw new AssertionError("reviewed JDK21 required");
    // Private scratch classloading warm-up; never a production/native run or a canonical test retry.
    assertThat(true).isTrue();
    org.awaitility.Awaitility.await().pollInSameThread().dontCatchUncaughtExceptions().ignoreNoExceptions()
        .pollDelay(Duration.ZERO).atMost(Duration.ofSeconds(1)).until(() -> true);
    for (int row : new int[]{29,31,32,33}) {
      compare(row,"FINAL_CONDITION_SUCCESS");compare(row,"NO_AWAIT_SUCCESS");
      compare(row,"LATE_SUCCESS_FLAG");compare(row,"LATE_THROW");compare(row,"LATE_ERROR");
      compare(row,"INITIAL_SUCCESS_PREINTERRUPTED");compare(row,"DURING_INTERVAL_INTERRUPT");
    }
    for (int row : new int[]{83,86}) {
      compare(row,"ENTERED_DEADLINE");compare(row,"NO_AWAIT_SUCCESS");compare(row,"LATE_SUCCESS_FLAG");
      compare(row,"LATE_THROW");compare(row,"LATE_ERROR");compare(row,"DURING_INTERVAL_INTERRUPT");
    }
    compare(5,"BLANK_CROSSED_INTERRUPT");compare(5,"BLANK_CROSSED_CLEAR");
    compare(5,"INITIAL_SUCCESS_PREINTERRUPTED");compare(5,"LIVENESS_ERROR");compare(5,"DURING_INTERVAL_INTERRUPT");
    compare(6,"DEADLINE_FIRST_NO_BODY");compare(38,"DEADLINE_FIRST_NO_BODY");
    compare(84,"H8_NO_AWAIT_CONFIRMED");compare(84,"H8_NO_AWAIT_TIMEOUT");compare(84,"H8_WRITE_ERROR");
    compare(84,"DURING_INTERVAL_INTERRUPT");compare(84,"LATE_H8_CONFIRMED");compare(84,"LATE_H8_WRITE_ERROR");
  }
  public static void main(String[] args) {
    try { pairedCases(); }
    catch (Throwable failure) {
      System.out.println("status=INCOMPLETE row="+rowId+" scenario="+scenario+" privateDetailsExported=false");
      System.exit(2);
    }
  }
}
'''
switch='\n'.join(f'      case {n}: if (side.equals("original")) row{n:03d}_original(); else row{n:03d}_corrected(); break;' for n in selected)
harness=harness.replace('METHOD_SWITCH',switch).replace('METHODS','\n\n'.join(methods))
(root/'ItrWaitDifferentialScratch.java').write_text(harness)
(root/'source-bindings.json').write_text(json.dumps(dict(status='UNEXECUTED_NO_JAVA_COMPILER_OR_PROBE',
 originalSha256='b8b10df42b739d07d1abbd70ae1e54488f8a7587058a488e268445a396ac2475',
 fullCandidateSha256=json.loads((OUT/'stages.json').read_text())[4]['candidateSha256'],
 javaSha256=sha(harness),blocks=bindings),indent=2)+'\n')
print(json.dumps({'actualBlockPairs':len(selected),'javaExecuted':False,'javaSha256':sha(harness)}))
