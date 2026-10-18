from pathlib import Path
import json, hashlib, difflib
root=Path(__file__).parent
rel=Path('backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java')
base=(root/'before'/rel).read_text();candidate=base;changes=[]
def edit(old,new):
 global candidate
 assert candidate.count(old)==1, (candidate.count(old),old[:100])
 candidate=candidate.replace(old,new,1);changes.append({'before':old,'after':new})
edit('|| !observer.registeredCurrent()) {','|| !observer.observingCallbacks()) {')
edit('''    private final Map<Thread, PgClaimBinding> bindings = new java.util.IdentityHashMap<>();
''','''    private final Map<Thread, PgClaimBinding> bindings = new java.util.IdentityHashMap<>();

    private record SourceSample(PgClaimBinding binding, int family) {}

    private final Map<Thread, SourceSample> sourceSamples = new java.util.IdentityHashMap<>();
''')
edit('''    private final long[] pgBlockerStages = new long[7],
''','''    // 0..6: original SQL histogram. 7..12: independent supplemental source-family counts.
    // Never sum the two partitions: one confirmed blocker can contribute to both.
    // Source codes: 7 claim, 8 translation, 9 observation/materialization, 10 consume/outcome,
    // 11 read/start/command, 12 stop/reconcile.
    private final long[] pgBlockerStages = new long[13],
''')
edit('''    boolean registeredCurrent() {
      try {
        synchronized (gate) {
          return !stopping && System.nanoTime() < end && executing.contains(Thread.currentThread());
''','''    boolean observingCallbacks() {
      try {
        synchronized (gate) {
          return sampler != null && !stopping && System.nanoTime() < end;
''')
edit('''        if (!registeredCurrent()
''','''        if (!observingCallbacks()
''')
edit('''              || !executing.contains(current)
              || bindings.containsKey(current)
              || bindings.size() >= MAX_THREADS) {
''','''              || bindings.containsKey(current)) {
            return null;
          }
          if (!executing.contains(current) && unionSizeLocked() >= MAX_THREADS) {
            bindingUnconfirmed = true;
''')
edit('''            bindings.remove(current);
          }
        }
      } catch (Throwable unavailable) {
        bindingUnconfirmed = true;
''','''            bindings.remove(current);
            sourceSamples.remove(current);
          }
        }
      } catch (Throwable unavailable) {
        bindingUnconfirmed = true;
''')
edit('''          if (executing.size() >= MAX_THREADS) {
            status = Status.FAILED;
            return;
          }
          Thread current = Thread.currentThread();
''','''          Thread current = Thread.currentThread();
          if (!executing.contains(current)
              && !bindings.containsKey(current)
              && unionSizeLocked() >= MAX_THREADS) {
            status = Status.FAILED;
            return;
          }
''')
edit('''          entered.remove(current);
          bindings.remove(current);
''','''          entered.remove(current);
          bindings.remove(current);
          sourceSamples.remove(current);
''')
# Keep the original registered-claim histogram statements byte-identical inside claimSnapshot gate.
start=candidate.index('    private void sample() {',candidate.index('  private static final class C5ClaimSampler'))
end=candidate.index('    private void triggerPgOnce(Thread target)',start)
old=candidate[start:end]
new='''    private void sample() {
      try {
        while (!stopping && System.nanoTime() < end) {
          Thread[] snapshot;
          var claimSnapshot =
              java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<Thread, Boolean>());
          Map<Thread, PgClaimBinding> callbackSnapshot = new java.util.IdentityHashMap<>();
          synchronized (gate) {
            claimSnapshot.addAll(executing);
            callbackSnapshot.putAll(bindings);
            var union =
                java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<Thread, Boolean>());
            union.addAll(executing);
            union.addAll(bindings.keySet());
            snapshot = union.toArray(Thread[]::new); // Combined TOTAL <= 8, not eight per set.
            union.clear();
          }
          try {
            for (Thread target : snapshot) {
              if (stopping || System.nanoTime() >= end) {
                break;
              }
              StackTraceElement[] stack = target.getStackTrace();
              try {
                Thread.State state =
                    claimSnapshot.contains(target) ? target.getState() : null;
                if (stack.length == 0 || stack.length > 512) {
                  if (claimSnapshot.contains(target)) {
                    empty++;
                  }
                  sampleSource(target, callbackSnapshot.get(target), -1);
                  continue;
                }
                sampleSource(target, callbackSnapshot.get(target), sourceFamily(stack));
                if (claimSnapshot.contains(target)) {
                  Segment segment = classify(stack);
                  if (segment == Segment.OTHER) {
                    unattributed++;
                  }
                  counts[segment.ordinal()][state.ordinal()]++;
                  if (segment == Segment.JDBC_PATH && state == Thread.State.WAITING) {
                    triggerPgOnce(target);
                  }
                  if (segment != Segment.OTHER
                      && status != Status.FAILED
                      && status != Status.NON_QUIESCENT) {
                    status = Status.OBSERVED;
                  }
                }
              } finally {
                java.util.Arrays.fill(stack, null);
              }
            }
          } finally {
            java.util.Arrays.fill(snapshot, null);
            claimSnapshot.clear();
            callbackSnapshot.clear();
          }
          cycles++;
          Thread.sleep(20); // Diagnostic cadence only; no authority poll/action changed.
        }
      } catch (InterruptedException stopped) {
        Thread.currentThread().interrupt();
      } catch (Throwable unsupported) {
        status = Status.FAILED; // No exception/message/raw stack retained or emitted.
      } finally {
        synchronized (gate) {
          executing.clear();
          entered.clear();
          bindings.clear();
          sourceSamples.clear();
        }
      }
    }

'''
edit(old,new)
edit('''        PgClaimBinding expected = bindings.get(target);
        pgStatus = PgStatus.RUNNING;
''','''        PgClaimBinding expected = bindings.get(target);
        Map<Thread, SourceSample> expectedHolders = new java.util.IdentityHashMap<>(sourceSamples);
        pgStatus = PgStatus.RUNNING;
''')
edit('''                .unstarted(() -> snapshotPg(target, expected));
''','''                .unstarted(() -> snapshotPg(target, expected, expectedHolders));
''')
edit('''          pgObserver.start();
        } catch (Throwable failed) {
          pgStatus = PgStatus.FAILED;
''','''          pgObserver.start();
        } catch (Throwable failed) {
          expectedHolders.clear();
          pgStatus = PgStatus.FAILED;
''')
edit('''    private void snapshotPg(Thread target, PgClaimBinding expected) {
      // Only the original slow-trigger identity; no other registered or later binding can qualify.
      boolean activeBefore = activeTriggerBinding(target, expected);
''','''    private void snapshotPg(
        Thread target, PgClaimBinding expected, Map<Thread, SourceSample> expectedHolders) {
      // Only the original slow-trigger identity; no other registered or later binding can qualify.
      boolean activeBefore = activeTriggerBinding(target, expected);
      Map<Thread, SourceSample> activeHolders = new java.util.IdentityHashMap<>();
      Map<Thread, SourceSample> matchedHolders = new java.util.IdentityHashMap<>();
      for (var holder : expectedHolders.entrySet()) {
        if (holder.getKey() != target && activeHolderBinding(holder.getKey(), holder.getValue())) {
          activeHolders.put(holder.getKey(), holder.getValue());
        }
      }
''')
edit('''                  targetRowMatched = true;
''','''                  targetRowMatched = true;
                  // Supplement ONLY the actual triggering target's authentic blocker edge.
                  if (!rows.wasNull()) {
                    Thread matchedThread = null;
                    SourceSample matchedSample = null;
                    int matches = 0;
                    for (var holder : activeHolders.entrySet()) {
                      if (holder.getValue().binding().pid() == blocker
                          && activeHolderBinding(holder.getKey(), holder.getValue())) {
                        matches++;
                        matchedThread = holder.getKey();
                        matchedSample = holder.getValue();
                      }
                    }
                    if (matches == 1) {
                      matchedHolders.put(matchedThread, matchedSample);
                    }
                  }
''')
edit('''        privatePids.clear();
        candidates.clear();
        blockers.clear();
        settings.clear();
''','''        synchronized (gate) {
          if (pgStatus == PgStatus.OBSERVED
              && pgExactClaimAttribution
              && !bindingUnconfirmed
              && activeTriggerBinding(target, expected)) {
            for (var holder : matchedHolders.entrySet()) {
              if (activeHolderBinding(holder.getKey(), holder.getValue())) {
                pgBlockerStages[holder.getValue().family()]++;
              }
            }
          }
        }
        // Finalization follows original JDBC resource close. Normal later retirement retains
        // genuine latched historical matches; failed/truncated/ambiguous snapshots never latch.
        privatePids.clear();
        candidates.clear();
        blockers.clear();
        expectedHolders.clear();
        activeHolders.clear();
        matchedHolders.clear();
        settings.clear();
''')
# Add private helpers; exact closed allowlist from root-reviewed source design.
design=json.loads(Path('docs/qa/evidence/STUDIO-OBS-007/resume-d-c5-holder-method-family-design.json').read_text())
byclass={}
for family in design['sourceAllowlist']:
 for method in family['allowedSourceMethods']:
  byclass.setdefault(method['class'],{}).setdefault(family['appendedCode'],[]).append(method['method'])
classifier='''    private static int sourceFamily(StackTraceElement[] stack) {
      int boundary = -1;
      for (int i = 0; i < stack.length; i++) {
        if (stack[i].getClassName().equals(
                "com.citi.put.checks.studio.guided.session.GuidedSessionRepository")
            && stack[i].getMethodName().equals("transaction")) {
          boundary = i; // Outermost repository callback; nested joins do not rebind it.
        }
      }
      if (boundary < 0) {
        return -1;
      }
      for (int i = boundary + 1; i < stack.length; i++) {
        String type = stack[i].getClassName(), method = stack[i].getMethodName();
        if (type.equals("com.citi.put.checks.studio.guided.session.GuidedSessionService")
            && (method.equals("internal") || method.equals("translationTransaction"))) {
          continue;
        }
'''
for cls,families in byclass.items():
 classifier+='        if (type.equals("'+cls+'")) {\n          return switch (method) {\n'
 for code,methods in families.items():
  classifier+='            case '+', '.join('"'+m+'"' for m in methods)+' -> '+str(code)+';\n'
 classifier+='            default -> -1;\n          };\n        }\n'
classifier+='''        return -1; // Unsupported immediate caller: never borrow a more distant broad class.
      }
      return -1;
    }

'''
helpers='''    private int unionSizeLocked() {
      int size = executing.size();
      for (Thread owner : bindings.keySet()) {
        if (!executing.contains(owner)) {
          size++;
        }
      }
      return size;
    }

    private void sampleSource(Thread target, PgClaimBinding expected, int family) {
      synchronized (gate) {
        if (expected == null || bindings.get(target) != expected
            || stopping || System.nanoTime() >= end) {
          return;
        }
        if (family >= 7 && family <= 12) {
          sourceSamples.put(target, new SourceSample(expected, family));
        } else {
          sourceSamples.remove(target);
        }
      }
    }

    private boolean activeHolderBinding(Thread target, SourceSample sample) {
      synchronized (gate) {
        return target != null && sample != null && !stopping
            && System.nanoTime() < end && !bindingUnconfirmed
            && bindings.get(target) == sample.binding();
      }
    }

    private long[] blockerStageEvidence() {
      synchronized (gate) {
        long[] exported = pgBlockerStages.clone();
        if (!pgJoined() || sampler != null && sampler.isAlive()
            || pgStatus != PgStatus.OBSERVED || !pgExactClaimAttribution
            || bindingUnconfirmed || status == Status.FAILED
            || status == Status.NON_QUIESCENT) {
          java.util.Arrays.fill(exported, 7, exported.length, 0);
        }
        return exported;
      }
    }

'''+classifier
edit('    private void triggerPgOnce(Thread target) {\n',helpers+'    private void triggerPgOnce(Thread target) {\n')
# Both existing cleanup points gain only diagnostic ref retirement.
edit('''      synchronized (gate) {
        executing.clear();
        bindings.clear();
      }
''','''      synchronized (gate) {
        executing.clear();
        bindings.clear();
        sourceSamples.clear();
      }
''')
edit('''          executing.clear();
          entered.clear();
          bindings.clear();
        }
        if (restoreInterrupt) {
''','''          executing.clear();
          entered.clear();
          bindings.clear();
          sourceSamples.clear();
        }
        if (restoreInterrupt) {
''')
edit('''              "pgSnapshotBlockerStageCounts", JSON.valueToTree(claimSampler.pgBlockerStages));
''','''              "pgSnapshotBlockerStageCounts", JSON.valueToTree(claimSampler.blockerStageEvidence()));
''')
reverse=candidate
for change in reversed(changes):
 assert reverse.count(change['after'])==1, change['after'][:100]
 reverse=reverse.replace(change['after'],change['before'],1)
assert reverse==base
(root/'candidate'/rel).write_text(candidate)
(root/'inverse-transformations.json').write_text(json.dumps(changes,indent=2)+'\n')
patch=''.join(difflib.unified_diff(base.splitlines(True),candidate.splitlines(True),fromfile='before/'+str(rel),tofile='candidate/'+str(rel)))
(root/'candidate.patch').write_text(patch)
print('transformations',len(changes),'candidate',hashlib.sha256(candidate.encode()).hexdigest())
