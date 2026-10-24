"""Emit (never execute) differential scratch Java from exact delivered local blocks."""
from pathlib import Path
import hashlib
import json
import re
import textwrap

O = Path(__file__).resolve().parent
B = O.parents[1] / 'gs-t2-draft/resume2'
ROOT = O.parents[7]
sha = lambda text: hashlib.sha256(text.encode()).hexdigest()
bridge = json.loads((B / 'loop-edits.json').read_text())
its = json.loads((O / 'loop-edits.json').read_text())
bindings, methods = [], []


def statement_after(s, loop, pattern):
    after = s[s.index(loop)+len(loop):]
    m = re.search(pattern, after)
    assert m, pattern
    return m[0]


for index, row in enumerate(bridge + its):
    isbridge = index < len(bridge)
    root = B if isbridge else O
    directory = 'candidates' if isbridge else 'repo'
    delivered = (root / directory / row['path']).read_text()
    assert row['replacement'] in delivered
    oldprefix = newprefix = ''
    if isbridge:
        prior = (B / 'preimages' / row['path']).read_text()
        helper = prior[prior.index('  static void await('):prior.rfind('\n}')]
        body = helper[helper.index('{')+1:helper.rfind('}')]
        old = body
        new = row['replacement'].replace(row['condition'], 'condition.getAsBoolean()')
        new = new.replace('TimeUnit.MILLISECONDS.toNanos('+str(row['timeoutMillis'])+')', 'TimeUnit.MILLISECONDS.toNanos(timeout)')
        post = ''
        original_bind = helper
        adaptations = ['condition expression→instrumented BooleanSupplier', 'literal budget→bounded scratch timeout; original control flow unchanged']
    else:
        prior = (O / 'preimages' / row['path']).read_text()
        old, new = row['originalLoop'], row['replacement']
        original_bind = old
        key = row['id']
        post = ''
        if key.endswith('-condition'):
            post = statement_after(prior, old, r'assertThat\(condition\.getAsBoolean\(\)\)\.isTrue\(\);')
        elif key == 'Evidence-recording':
            post = statement_after(prior, old, r'assertThat\(recordingRows\(id\)\)[\s\S]*?\.isEqualTo\(1\);')
        elif key == 'Secret-terminal-row-lock':
            oldprefix = 'boolean waited = false;'
            old += '\n' + statement_after(prior, old, r'assertThat\(waited\)\.isTrue\(\);')
        elif key == 'Race-publisher-row-lock':
            oldprefix = 'boolean waiting = false;'
            old += '\n' + statement_after(prior, old, r'assertThat\(waiting\)[\s\S]*?\.isTrue\(\);')
        elif key == 'Transport-owned-row-lock':
            post = statement_after(prior, old, r'throw new AssertionError\("FAIL_TO_REACH_OWN_ROW_LOCK:[^\n]+;')
        elif key == 'Transport-actual-stop':
            post = statement_after(prior, old, r'throw new AssertionError\("Actual stop/confirmation/[^\n]+;')
        elif key == 'Transport-route-idle-observe':
            post = statement_after(prior, old, r'assertThat\(route.closed\)[\s\S]*?assertThat\(route.idle\(\)\)\.isTrue\(\);')
        elif key == 'Transport-route-idle-cleanup':
            post = statement_after(prior, old, r'assertThat\(route.idle\(\)\)[\s\S]*?\.isTrue\(\);')
        elif key == 'Transport-controller-stage':
            oldprefix = 'String stageContent = readStageOrEmpty(stageFile);'
            newprefix = 'String initialStageContent = readStageOrEmpty(stageFile);\nProcess itsStageChild = child;\nString stageContent;'
            assert newprefix.replace('\n', '\n      ') in delivered
            post = statement_after(prior, old, r'assertThat\(stageContent\)[\s\S]*?\.isEqualTo\(expectedStage\);')
        else:
            assert key == 'Transport-teardown'
        if key == 'Transport-actual-stop':
            old = old.replace('return;', 'return "COMPLETED";')
            new = new.replace('return;', 'return "COMPLETED";')
        adaptations = ['external DB/file/process/condition seams supplied by trace-recording fixture stubs',
                       'deadline declarations use bounded scratch budget, retaining original deadline variables/order',
                       'void success return→COMPLETED marker only for actual-stop']
    special = row['id'] if not isbridge else 'bridge'
    for variant, source, prefix in [('original', old, oldprefix), ('delivered', new, newprefix)]:
        # External seam types/SQL/body statements stay literal; both variants use identical stubs.
        setup = '''
        BooleanSupplier condition = p::tick;
        long timeout = p.budgetMillis;
        long end = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeout);
        long until = end;
        long stageDeadline = end;
        String id = "session";
        int holderPid = 1, waiterPid = 2;
        AtomicInteger backendPid = new AtomicInteger(2);
        Path stageFile = Path.of("scratch-marker");
        String expectedStage = "ready";
        Process child = new Child();
        '''
        if isbridge:
            setup = setup.replace('        long end = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeout);\n', '')
            setup = setup.replace('        long until = end;\n', '').replace('        long stageDeadline = end;\n', '')
        body = textwrap.dedent(source) + '\n' + post
        # Avoid an unreachable return after original unconditional throw while leaving it literal.
        if special not in ['Transport-owned-row-lock', 'Transport-actual-stop']:
            body += '\nreturn null;'
        methods.append('Object s'+str(index)+'_'+variant+'() throws Exception {\n'+textwrap.dedent(setup)+prefix+'\n'+body+'\n}')
    bindings.append({'index': index, 'id': row['id'], 'path': row['path'], 'originalBoundSha256': sha(original_bind),
                     'deliveredBoundSha256': sha(row['replacement']), 'actualDeliveredBlockOccurrence': True,
                     'separateOriginalFinalStatement': post, 'separateFinalStatementSha256': sha(post),
                     'adaptations': adaptations, 'variantMethods': ['s'+str(index)+'_original', 's'+str(index)+'_delivered']})

java = r'''import static org.assertj.core.api.Assertions.assertThat;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.concurrent.locks.LockSupport;
import java.util.function.*;
import java.nio.file.*;
import java.io.*;
import java.time.*;

// SCRATCH ONLY. Emitted from hash-bound original and delivered blocks. No retained repo test.
public final class WaitConformance {
  static final class Probe {
    final String mode;
    final long budgetMillis;
    final Throwable first;
    final Throwable second = new AssertionError("second terminal observation must not replace first");
    final List<String> trace = new ArrayList<>();
    int reads;
    boolean last;
    Probe(String mode, Throwable first) {
      this.mode=mode; this.first=first; budgetMillis=mode.equals("timeout-fallthrough")?0:80;
    }
    boolean tick() {
      trace.add("read:"+(++reads));
      if (mode.equals("initial-true-preinterrupt")) return last=true;
      if (mode.equals("initial-false-preinterrupt")) return last=false;
      if (mode.equals("false-sets-interrupt")) { Thread.currentThread().interrupt(); return last=false; }
      if (mode.equals("immediate-runtime") || mode.equals("immediate-error")) return raise(first);
      if (mode.equals("timeout-fallthrough")) return last=reads>1;
      if (reads==1) return last=false;
      if (reads==2) {
        LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(170));
        if (mode.equals("late-runtime") || mode.equals("late-error")) return raise(first);
        return last=true;
      }
      if (mode.equals("late-runtime") || mode.equals("late-error")) return raise(second);
      return last=true;
    }
    static boolean raise(Throwable x) {
      if(x instanceof RuntimeException r)throw r;
      if(x instanceof Error e)throw e;
      throw new AssertionError(x);
    }
  }
  static final class Fixture {
    final Probe p;
    final String site;
    final Jdbc actualJdbc=new Jdbc();
    final F f=new F();
    final Db db=new Db();
    final Route route=new Route();
    final Work work=new Work();
    final Scenario scenario=new Scenario();
    final Worker workerHarness=new Worker();
    Fixture(Probe p,String site){this.p=p;this.site=site;}
    int recordingRows(String id){return p.tick()?1:0;}
    String readStageOrEmpty(Path file){return p.tick()?"ready":"waiting";}
    String sessionState(String id){p.trace.add("diagnostic-state");return "state";}
    String pendingDeliveries(String id){p.trace.add("diagnostic-pending");return "pending";}
    String tail(Path file){p.trace.add("diagnostic-tail");return "tail";}
    final class Jdbc {
      @SuppressWarnings("unchecked") <T>T queryForObject(String sql,Class<T> type,Object...args){
        p.trace.add("sql:"+sql);
        if(site.equals("Transport-actual-stop"))return (T)Integer.valueOf(sql.contains("AND live")?(p.last?0:1):1);
        boolean value=p.tick();
        if(type==Boolean.class)return (T)Boolean.valueOf(value);
        return (T)Integer.valueOf(value?1:0);
      }
      List<Map<String,Object>> queryForList(String sql,Object...args){
        p.trace.add("sql:"+sql);
        return p.tick()?List.of(Map.of("first-result-read",p.reads)):List.of();
      }
      Map<String,Object> queryForMap(String sql,Object...args){
        p.trace.add("sql:"+sql);
        return p.tick()?Map.of("state","CANCELLED","teardown","CONFIRMED"):
                        Map.of("state","PROPOSING","teardown","PENDING");
      }
    }
    final class F {Jdbc jdbc(){return actualJdbc;}}
    final class Db {final Jdbc jdbc=actualJdbc;}
    final class Route {boolean closed; boolean idle(){return site.equals("Transport-actual-stop")||p.tick();}}
    final class Work {
      final AtomicReference<Throwable> failure=new AtomicReference<>();
      final AtomicInteger initiated=new AtomicInteger(1);
      boolean operationsComplete(){p.trace.add("operationsComplete");return true;}
    }
    final class Scenario {final String sessionId="session";}
    final class Worker {Path logFile(){return Path.of("scratch-log");}}
    final class Child extends Process {
      public OutputStream getOutputStream(){return OutputStream.nullOutputStream();}
      public InputStream getInputStream(){return InputStream.nullInputStream();}
      public InputStream getErrorStream(){return InputStream.nullInputStream();}
      public int waitFor(){return 0;}
      public int exitValue(){return 0;}
      public void destroy(){}
      public boolean isAlive(){p.trace.add("childAlive");return true;}
    }
    METHODS
  }
  record Outcome(Object result,Throwable failure,boolean interrupt,List<String> trace,boolean handlerStable){}
  static Outcome run(int site,boolean delivered,String id,String mode,Throwable first) throws Exception {
    Thread.interrupted();
    Probe p=new Probe(mode,first);
    Fixture f=new Fixture(p,id);
    var before=Thread.getDefaultUncaughtExceptionHandler();
    if(mode.endsWith("preinterrupt"))Thread.currentThread().interrupt();
    Object result=null;Throwable failure=null;
    try {
      result=Fixture.class.getDeclaredMethod("s"+site+(delivered?"_delivered":"_original")).invoke(f);
    } catch(java.lang.reflect.InvocationTargetException wrapped){
      failure=wrapped.getCause();
      // Preserve the actual enclosing route caller's interruption-to-cleanup mapping.
      if(id.startsWith("Transport-route-idle") && failure instanceof InterruptedException)Thread.currentThread().interrupt();
    }
    boolean interrupted=Thread.currentThread().isInterrupted();Thread.interrupted();
    return new Outcome(result,failure,interrupted,List.copyOf(p.trace),before==Thread.getDefaultUncaughtExceptionHandler());
  }
  public static void main(String[] args) throws Exception {
    String[] ids=IDS;
    String[] modes={"initial-true-preinterrupt","initial-false-preinterrupt","false-sets-interrupt",
      "immediate-runtime","immediate-error","late-true","late-runtime","late-error","timeout-fallthrough"};
    int compared=0;
    for(int i=0;i<ids.length;i++)for(String mode:modes){
      Throwable first=mode.endsWith("runtime")?new IllegalStateException("first observation"):
                                                new AssertionError("first observation");
      Outcome old=run(i,false,ids[i],mode,first),now=run(i,true,ids[i],mode,first);
      String context=ids[i]+" / "+mode;
      assertThat(now.trace()).as(context+" exact read/effect sequence").isEqualTo(old.trace());
      assertThat(now.result()).as(context+" result/marker stability").isEqualTo(old.result());
      assertThat(now.interrupt()).as(context+" caller interrupt state").isEqualTo(old.interrupt());
      assertThat(now.failure()==null?null:now.failure().getClass()).as(context+" outcome kind")
          .isEqualTo(old.failure()==null?null:old.failure().getClass());
      if(old.failure()==first)assertThat(now.failure()).as(context+" first Throwable identity").isSameAs(first);
      assertThat(now.handlerStable()).as(context+" unrelated thread handler ownership").isTrue();
      compared++;
    }
    System.out.println("Compared "+compared+" original/delivered observations; native gates remain mandatory");
  }
}
'''.replace('METHODS', '\n'.join(methods)).replace('IDS', '{'+','.join(json.dumps(r['id']) for r in bindings)+'}')
target = O / 'conformance'
target.mkdir(exist_ok=True)
(target / 'WaitConformance.java').write_text(java)
(target / 'bindings.json').write_text(json.dumps({'status': 'UNEXECUTED', 'comparison': 'original versus actual delivered hash-bound block, identical external seam stubs; no native gate substitution',
                                               'cases': bindings, 'generatedJavaSha256': sha(java),
                                               'modesPerSite': 9, 'siteCount': len(bindings)}, indent=2)+'\n')
print(json.dumps({'generatedOnly': True, 'sites': len(bindings), 'comparisonsUnexecuted': len(bindings)*9,
                  'javaSha256': sha(java)}))
