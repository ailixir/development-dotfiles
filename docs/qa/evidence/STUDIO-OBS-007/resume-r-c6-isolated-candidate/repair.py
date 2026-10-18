from pathlib import Path
import hashlib,json,difflib
p=Path('docs/qa/evidence/STUDIO-OBS-007/resume-r-c6-isolated-candidate')
before=(p/'repair-before/GuidedPublicationReplayIT.java').read_text();assert hashlib.sha256(before.encode()).hexdigest()=='b54eeea294dd6f4dcf41176303e287abb5c0e8a243f61eaa285724029580d088'
s=before;changes=[]
def rep(old,new,name):
 global s
 assert s.count(old)==1,(name,s.count(old));s=s.replace(old,new);changes.append(name)
rep('    volatile boolean c6NativeClose, c6FenceAvailable, c6InterruptedNotification;', '    volatile boolean c6NativeClose, c6FenceAvailable, c6InterruptedNotification, c6ProducerSealed;', 'bounded-terminal-evidence-state')
rep('        let revC6RunDeadline=0,revC6StepMs=0;', '        let revC6RunDeadline=0,revC6StepMs=0,revC6Restored=false,revC6RetryRestore=null;', 'retain-selected-restoration-capability')
rep('          if(mode.c6){revNativeOrdinal=0;revC6Probed=0;}', '          if(mode.c6){revNativeOrdinal=0;revC6Probed=0;revC6Restored=false;}', 'per-case-confirmed-restoration')
rep('''                revSealing=true;revFs.unwatchFile(command);revWatching=false;revMaybeSeal();''','''                if(mode.c6&&revC6RetryRestore){
                  // Existing teardown seal retries the retained selected restoration task.
                  // No action/stop/native authority is created by this observation command.
                  const retry=revC6RetryRestore;
                  retry().then(restored=>{if(!restored){revFail();return;}
                    revSealing=true;revFs.unwatchFile(command);revWatching=false;revMaybeSeal();
                  },()=>{revFail();}).catch(()=>{revFail();});return;
                }
                revSealing=true;revFs.unwatchFile(command);revWatching=false;revMaybeSeal();''','existing-seal-retries-late-guided-restoration')
rep("                revEmit(mode,6,1,0,0,revRestore());revEmit(mode,5,1,0,4);", "                if(!mode.c6)revEmit(mode,6,1,0,0,revRestore());\n                revEmit(mode,5,1,0,4);",'cancel-keeps-wrappers-until-native-drain')
rep('''            if(mode?.active&&mode.path===2){revInit(mode);revSealing=true;revSealed=true;revPublish(mode,true);}''','''            if(mode?.active&&mode.path===2){revInit(mode);
              if(mode.c6&&!revC6Restored)revFail();
              revSealing=true;revSealed=true;revPublish(mode,true);}''','timeout-exit-never-invents-stop-or-restoration')
rep('''                  if(selected?.c6){
                    revEmit(selected,13,phase,fenceSucceeded?1:0,0,true);
                    // The original close already settled. Bound only observer ACK drain; no
                    // renewed run/step/lease permissions or delay of the native call itself.
                    let timer;try{await Promise.race([revTail,new Promise((_,reject)=>{
                      timer=setTimeout(()=>reject(new Error('C6_ACK_DRAIN')),1000);})]);}
                    catch{revFail();}finally{clearTimeout(timer);}
                  }''','''                  if(selected?.c6){
                    // Original close has settled, and the original native promise must also
                    // settle before descriptor removal. Neither timeout nor Stop grants this.
                    const observerDeadline=performance.now()+1000;
                    if(selected.path===2){
                      while(revActive.size&&performance.now()<observerDeadline)
                        await new Promise(resolve=>setTimeout(resolve,10));
                      if(revActive.size)revFail();
                      else{revC6Restored=revRestore();revEmit(selected,6,1,0,0,revC6Restored);}
                    }
                    revEmit(selected,13,phase,fenceSucceeded?1:0,0,true);
                    // Reuse the same finite post-close observer budget for final ACK drain.
                    let timer;try{const remaining=observerDeadline-performance.now();
                      if(remaining<=0)throw new Error('C6_ACK_DRAIN');
                      await Promise.race([revTail,new Promise((_,reject)=>{
                        timer=setTimeout(()=>reject(new Error('C6_ACK_DRAIN')),remaining);})]);}
                    catch{revFail();}finally{clearTimeout(timer);}
                  }''','ordinary-restore-only-after-real-settlement-and-close')
rep('''            result.then(()=>{try{if(!runtime.accepting||revStarted)throw new Error('OWNER');''','''            result.then(()=>{try{
              if(mode.c6){revInit(mode);if(!revGroups.size&&!revC6RetryRestore)revStarted=false;}
              if(!runtime.accepting||revStarted)throw new Error('OWNER');''','selected-case-lifetime-does-not-reuse-prior-runtime-tag')
rep('''            const runtime=this;
            result.then(async()=>{
              if(mode.c6){const deadline=performance.now()+10000;
                while(runtime.busy&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
                if(runtime.busy){revFail();return;}revEmit(mode,6,1,0,0,revRestore());}
              revEmit(mode,9,1);
            },()=>{revFail();}).catch(()=>{revFail();});revRuntimes.delete(this);}''','''            const runtime=this;
            if(mode.c6){
              if(!revC6RetryRestore){
                let restoring=null,closeSucceeded=false,closedRecorded=false;
                const retry=()=>{
                  if(restoring)return restoring;
                  restoring=(async()=>{
                    const deadline=performance.now()+10000;
                    while(runtime.busy&&performance.now()<deadline)
                      await new Promise(resolve=>setTimeout(resolve,10));
                    if(runtime.busy){revFail();return false;}
                    const restored=revRestore();revEmit(mode,6,1,0,0,restored);
                    if(!restored){revFail();return false;}
                    revC6Restored=true;
                    if(closeSucceeded&&!closedRecorded){closedRecorded=true;revEmit(mode,9,1);}
                    // Drop only after actual dispatch settlement and exact descriptor restore.
                    revRuntimes.delete(runtime);revC6RetryRestore=null;return true;
                  })().catch(()=>{revFail();return false;}).finally(()=>{restoring=null;});
                  return restoring;
                };
                revC6RetryRestore=retry;
                result.then(()=>{closeSucceeded=true;return retry();},()=>{
                  // Original rejection remains on the unchanged result; restoration is distinct.
                  revFail();return retry();
                }).catch(()=>{revFail();});
              } else {
                result.then(()=>revC6RetryRestore?.(),()=>{revFail();return revC6RetryRestore?.();})
                  .catch(()=>{revFail();});
              }
            } else {
              result.then(()=>revEmit(mode,9,1),()=>{revFail();}).catch(()=>{revFail();});
              revRuntimes.delete(this);
            }}''','guidied-rejected-and-expired-drain-retains-bounded-retry')
# Runtime validation always sticky. Only valid focus-response transport loss is provisional;
# actual realm closure and independent pending witnesses must subsequently prove interruption.
rep('''      if (selected != null && selected.c6Kind > 0 && selected.c6Kind < 4
          && selected.c6CutAt != 0 && !accepted) selected.c6InterruptedNotification = true;
      else P4_NOTIFICATION_FAILED.set(true);''','''      if (failure instanceof RuntimeException) {
        P4_NOTIFICATION_FAILED.set(true);
      } else {
        Map<String, String> query = Map.of();
        P4DocumentWitness actual = null;
        try {
          query = p4Query(exchange.getRequestURI().getRawQuery());
          actual = P4_DOCUMENTS.get(p4PositiveOrdinal(query.get("document")));
        } catch (RuntimeException invalid) { P4_NOTIFICATION_FAILED.set(true); }
        if (accepted && selected != null && selected.c6Kind > 0 && selected.c6Kind < 4
            && "focus-enter".equals(query.get("kind")) && actual != null
            && actual.phase == selected.c6Phase) {
          // Provisional transport unavailability, not a healthy ACK or no-effect receipt.
          // Terminal proof below must independently confirm the realm was genuinely closed.
          selected.c6InterruptedNotification = true;
        } else P4_NOTIFICATION_FAILED.set(true);
      }''','validation-failure-always-sticky-no-clock-exemption')
# All cleanup attempts retain primary failures; retry is reachable even when main assertions fail.
rep('''      if (!cleanupUnconfirmed) {
        // Retain capture/hooks until actual owner closure and final producer acknowledgements.''','''      if (!cleanupUnconfirmed) {
        if (owned != null && owned.c6Kind != 0 && !owned.c6ProducerSealed) {
          p3AttemptTeardown(failures, () -> {
            p4SealPrivateProducersAfterOwnerCleanup(owned);owned.c6ProducerSealed=true;
          });
        }
        if (owned != null && owned.c6Kind != 0
            && (!owned.restored || !owned.active.isEmpty())) {
          cleanupUnconfirmed = true;
          failures.add(new IllegalStateException("C6 exact restoration or original native drain remains unresolved"));
        }
        // Retain capture/hooks until actual owner closure and final producer acknowledgements.''','finally-reaches-retained-restoration-seal')
rep('        p3AttemptTeardown(failures, () -> p3Scan(List.of(value)));\n        p3AttemptTeardown(failures, capture::writeNumericEvidence);\n        p3AttemptTeardown(failures, capture::close);\n        p3AttemptTeardown(failures, () -> Files.writeString(\n            TEMP.resolve("p4-revocation-state.json"), "{\\"active\\":false}", StandardCharsets.UTF_8));\n        c5Capture = null;\n        p4Revocation = null;','        if (!cleanupUnconfirmed) {\n          p3AttemptTeardown(failures, () -> p3Scan(List.of(value)));\n          p3AttemptTeardown(failures, capture::writeNumericEvidence);\n          p3AttemptTeardown(failures, capture::close);\n          p3AttemptTeardown(failures, () -> Files.writeString(\n              TEMP.resolve("p4-revocation-state.json"), "{\\"active\\":false}", StandardCharsets.UTF_8));\n          c5Capture = null;\n          p4Revocation = null;\n        }','unresolved-restoration-retains-live-oracle-and-private-comparator')
rep('''    p4SealPrivateProducersAfterOwnerCleanup(state);
    assertThat(state.active).isEmpty();''','''    p4SealPrivateProducersAfterOwnerCleanup(state);
    state.c6ProducerSealed = true;
    assertThat(state.active).isEmpty();''','record-only-actual-successful-final-seal')
rep('''    assertThat(state.failed).isFalse();
    assertThat(P4_NOTIFICATION_FAILED.get()).as("no unexplained page observer loss").isFalse();''','''    assertThat(state.failed).isFalse();
    if (state.c6InterruptedNotification) {
      assertThat(state.c6Kind > 0 && state.c6Kind < 4 && state.c6PendingSamples > 0
          && state.c6NativeClose && !state.c6FenceAvailable
          && P8_C6_CLOSED_UNKNOWN.contains(state.c6Phase))
          .as("provisional focus response loss requires actual native pending and original realm closure")
          .isTrue();
    }
    assertThat(P4_NOTIFICATION_FAILED.get()).as("no unexplained page observer loss").isFalse();''','transport-loss-needs-real-closed-realm-proof')
# Require one authentic linked UNKNOWN row, while retaining the forbidden-code check.
rep('''    p3AssertAuditScope(state.guidedSession, state.execution, scope);
    p3CleanupOwnedResources();
    if (!browserTree.isEmpty())''','''    p3AssertAuditScope(state.guidedSession, state.execution, scope);
    p3CleanupOwnedResources();
    p8AssertUnknownUsageLineage(state);
    if (!browserTree.isEmpty())''','actual-terminal-unknown-lineage-required')
marker='  private static void p8WritePendingProbe('
helper='''  private void p8AssertUnknownUsageLineage(P4RevocationState state) {
    String ownerColumn = state.path == 1 ? "session_id" : "execution_id";
    Object owner = state.path == 1 ? state.guidedSession : state.execution;
    List<Map<String, Object>> releases = jdbc.queryForList(
        "SELECT * FROM studio_secret_use_audit WHERE " + ownerColumn + "=? AND secret_id='PASS'"
            + " AND row_kind='RELEASE' AND decision_stage='DISPATCH' AND outcome='RESOLVED'", owner);
    List<Map<String, Object>> usages = jdbc.queryForList(
        "SELECT * FROM studio_secret_use_audit WHERE " + ownerColumn + "=? AND secret_id='PASS'"
            + " AND row_kind='USAGE'", owner);
    assertThat(releases.size()).as("one real resolved release").isEqualTo(1);
    assertThat(usages.size()).as("one actual terminal usage summary").isEqualTo(1);
    Map<String, Object> release = releases.getFirst(), usage = usages.getFirst();
    assertThat("UNKNOWN_OUTCOME".equals(usage.get("usage_outcome")))
        .as("actual terminal unknown effect, never missing summary").isTrue();
    assertThat("RESOLVED".equals(usage.get("outcome")) && release.get("vault_version") != null)
        .as("actual released version lineage").isTrue();
    assertThat(java.util.Objects.equals(release.get("id"), release.get("release_id"))
        && java.util.Objects.equals(release.get("id"), usage.get("release_id"))
        && release.get("affected_release_id") == null && usage.get("affected_release_id") == null)
        .as("actual immutable release usage linkage").isTrue();
    p4CompareAuditScope(release, usage);
    assertThat(p4AuditOwnerIdentity(state, release))
        .as("actual consumed admission or accepted observed attempt lineage").isTrue();
  }

'''
rep(marker,helper+marker,'reuse-original-release-scope-attempt-version-lineage')
# Scan raw callback bytes before JSON parsing or any content predicates.
rep('''      JsonNode outcome = C.parseWire(bytes);
      if (!outcome.path("errorMessage").isTextual())''','''      C5Capture capture = c5Capture;
      if (capture == null) throw new IllegalArgumentException("C6 original sink capture unavailable");
      for (String value : capture.values) assertJoinedSinkAbsent(Map.of("c6-actual-callback", bytes), value);
      JsonNode outcome = C.parseWire(bytes);
      if (!outcome.path("errorMessage").isTextual())''','callback-raw-scalar-scan-precedes-parse')
rep('''      C5Capture capture = c5Capture;
      if (capture == null) throw new IllegalArgumentException("C6 original sink capture unavailable");
      for (String value : capture.values) assertJoinedSinkAbsent(Map.of("c6-actual-callback", bytes), value);
      synchronized (state)''','''      synchronized (state)''','callback-never-asserts-raw-object')
rep('''    List<String> lines = Files.readAllLines(diagnostic, StandardCharsets.UTF_8);
    assertThat(lines).hasSize(1);
    JsonNode line = C.parse(lines.getFirst());
    assertThat(line.path("sessionId").asText()).isEqualTo(state.guidedSession);
    assertThat(line.path("stepId").asText()).isEqualTo(TWO);
    String message = line.path("errorMessage").asText();
    assertThat(message).contains("C6_RELEASED", "REDACTED");
    assertThat(message.getBytes(StandardCharsets.UTF_8).length).isLessThanOrEqualTo(2048);
    assertThat(message.length()).isLessThanOrEqualTo(2048);
    byte[] stderr = Files.readAllBytes(TEMP.resolve("guided.log"));
    assertThat(new String(stderr, StandardCharsets.UTF_8)).contains(message);
    assertJoinedSinkAbsent(Map.of("c6-original-stderr", stderr,
        "c6-real-diagnostic", Files.readAllBytes(diagnostic)), value);''','''    byte[] diagnosticBytes = Files.readAllBytes(diagnostic);
    byte[] stderr = Files.readAllBytes(TEMP.resolve("guided.log"));
    // Scan privately before parse/content checks; assertion failures only show fixed scalars.
    assertJoinedSinkAbsent(Map.of("c6-original-stderr", stderr,
        "c6-real-diagnostic", diagnosticBytes), value);
    List<String> lines = new String(diagnosticBytes, StandardCharsets.UTF_8).lines().toList();
    assertThat(lines.size()).as("actual bounded diagnostic record count").isEqualTo(1);
    JsonNode line;
    try { line = C.parse(lines.getFirst()); }
    catch (RuntimeException invalid) { throw new AssertionError("C6 privately scanned diagnostic parse failed"); }
    assertThat(line.path("sessionId").asText().equals(state.guidedSession)
        && line.path("stepId").asText().equals(TWO))
        .as("actual selected diagnostic identity").isTrue();
    String message = line.path("errorMessage").asText();
    assertThat(message.contains("C6_RELEASED") && message.contains("REDACTED"))
        .as("actual diagnostic marker and redacted value").isTrue();
    assertThat(message.getBytes(StandardCharsets.UTF_8).length)
        .as("actual diagnostic UTF8 bytes").isLessThanOrEqualTo(2048);
    assertThat(message.length()).as("actual diagnostic character count").isLessThanOrEqualTo(2048);
    assertThat(new String(stderr, StandardCharsets.UTF_8).contains(message))
        .as("actual original stderr contains the privately scanned redacted diagnostic").isTrue();''','raw-diagnostic-stderr-never-rendered-by-assertions')
base=(p/'before.java').read_text()
(p/'GuidedPublicationReplayIT.java').write_text(s)
full=''.join(difflib.unified_diff(base.splitlines(True),s.splitlines(True),fromfile='a/backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java',tofile='b/backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java'))
repair=''.join(difflib.unified_diff(before.splitlines(True),s.splitlines(True),fromfile='a/isolated/GuidedPublicationReplayIT.java',tofile='b/isolated/GuidedPublicationReplayIT.java'))
(p/'candidate.patch').write_text(full);(p/'repair.patch').write_text(repair)
m=json.loads((p/'repair-before/manifest.json').read_text());m['afterSha256']=hashlib.sha256(s.encode()).hexdigest();m['patchSha256']=hashlib.sha256(full.encode()).hexdigest();m['repairBeforeSha256']=hashlib.sha256(before.encode()).hexdigest();m['repairPatchSha256']=hashlib.sha256(repair.encode()).hexdigest();m['repairChanges']=changes
(p/'manifest.json').write_text(json.dumps(m,indent=2)+'\n')
print(json.dumps({k:v for k,v in m.items() if k not in ['originalTests','changes']}))
