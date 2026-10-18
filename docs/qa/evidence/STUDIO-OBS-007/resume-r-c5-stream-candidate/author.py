from pathlib import Path
import json,hashlib,difflib
p=Path('docs/qa/evidence/STUDIO-OBS-007/resume-r-c5-stream-candidate');live=Path('backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java')
before=live.read_text();assert hashlib.sha256(before.encode()).hexdigest()=='27e9fce94ff7d4a13252391b82552d087890fb23f0886922999b027e3f24797f'
(p/'before.java').write_text(before);s=before;changes=[]
def rep(old,new,label):
 global s
 assert s.count(old)==1,(label,s.count(old));s=s.replace(old,new);changes.append(label)
# Exact old 15 encoders are extracted, in their existing order, for both scanners.
start=s.index('    var variants = new java.util.ArrayList<byte[]>();',s.index('  private static void assertJoinedSinkAbsent'))
end=s.index('    for (var sink : sinks.entrySet()) {',start)
factory=s[start:end]
factory=factory.replace('throw new IllegalStateException("Synthetic sink JSON encoding unavailable", failure);','throw new IllegalStateException("Synthetic sink JSON encoding unavailable");')
rep('  private static void assertJoinedSinkAbsent(Map<String, byte[]> sinks, String value) {\n'+s[start:end], '  private static List<byte[]> canaryByteVariants(String value) {\n'+factory+'    return variants;\n  }\n\n  private static void assertJoinedSinkAbsent(Map<String, byte[]> sinks, String value) {\n    List<byte[]> variants = canaryByteVariants(value);\n','shared-exact15-variant-factory')
rep('  private static boolean containsBytes(byte[] bytes, byte[] needle) {',(p/'matcher.txt').read_text()+'  private static boolean containsBytes(byte[] bytes, byte[] needle) {','bounded-private-kmp-matcher')
rep('    private final java.io.ByteArrayOutputStream encoded = new java.io.ByteArrayOutputStream();','    private final C5CanaryStream encoded;','replace-aggregate-history-only')
rep('    private long rootEvents, appEvents;','    private boolean rootTraceObserved, appTraceObserved, streamedLogsCollected, streamedLogsFinalChecked;','unique-events-explicitly-unobserved')
rep('''      this.values = values;
      this.traceFromStart = traceFromStart;''','''      this.values = values;
      encoded = new C5CanaryStream(values);
      this.traceFromStart = traceFromStart;''','bounded-pattern-inventory-in-existing-target')
rep('''                if (encoded.size() < MAX_BYTES) {
                  encoded.write(value);
                } else {
                  failed = true;
                }''','''                try { encoded.write(value); }
                catch (RuntimeException invalid) { encoded.invalid(); }''','consume-all-intwrites-sticky-observer-errors')
rep('''                if (encoded.size() <= MAX_BYTES - length) {
                  encoded.write(bytes, offset, length);
                } else {
                  failed = true;
                }''','''                try { encoded.write(bytes, offset, length); }
                catch (RuntimeException invalid) { encoded.invalid(); }''','consume-all-offset-chunks-no-volume-cap')
rep('''              // Appender stream replacement closes this private target; retain bytes until scan.''','''              synchronized (C5Capture.this) { encoded.closeInput(); }
              // Original replacement/encoder footer closes this target; no raw history retained.''','actual-original-target-close')
old='''        byte[] actualLogs = encoded.toByteArray();
        rootEvents = 0;
        appEvents = 0;
        for (String line : new String(actualLogs, StandardCharsets.UTF_8).split("\\n")) {
          if (!line.isBlank()) {
            JsonNode event = C.parse(line);
            rootEvents++;
            if (event.path("logger").asText().startsWith("com.citi.put.checks")) {
              appEvents++;
            }
          }
        }
        sinks.putAll(produced);
        sinks.put("c5-original-JSON_CONSOLE", actualLogs);'''
new='''        rootTraceObserved = rootLogger.getEffectiveLevel() == ch.qos.logback.classic.Level.TRACE;
        appTraceObserved = appLogger.getEffectiveLevel() == ch.qos.logback.classic.Level.TRACE;
        assertThat(traceArmed && rootTraceObserved && appTraceObserved)
            .as("actual original root/app TRACE levels during collection").isTrue();
        encoded.assertClean(false);
        streamedLogsCollected = true;
        sinks.putAll(produced);
        // Original encoded logs were fully streamed; no fake raw-log Map entry.'''
rep(old,new,'independent-stream-collect-check-no-json-event-parser')
rep('''              .put("rootEvents", rootEvents)
              .put("appEvents", appEvents)
              .put("encodedBytes", encoded.size())''','''              .putNull("rootEvents")
              .putNull("appEvents")
              .put("eventCountsStatus", "SUPPORT_UNOBSERVED")
              .put("logCoverage", "STREAMED_ORIGINAL_ENCODED_OUTPUT")
              .put("encodedBytes", encoded.encodedBytes)
              .put("encodedWriteCalls", encoded.writeCalls)
              .put("encodedPatternHits", encoded.hits)
              .put("encodedInvalidWrites", encoded.invalidWrites)
              .put("encodedObserverFailed", encoded.failed)
              .put("streamedLogsCollected", streamedLogsCollected)
              .put("streamedLogsFinalChecked", streamedLogsFinalChecked)
              .put("captureTargetClosed", encoded.inputClosed)
              .put("patternCount", encoded.patterns.size())
              .put("patternBytes", encoded.patternBytes)
              .put("rootTraceObserved", rootTraceObserved)
              .put("appTraceObserved", appTraceObserved)''','fixed-actual-stream-counters-support-events-unobserved')
rep('''              .put("traceArmed", traceArmed)
              .put("appEventsObserved", appEvents > 0);''','''              .put("traceArmed", traceArmed);''','remove-fake-zero-event-credit')
rep('''      var failures = new java.util.ArrayList<Throwable>();
      try {
        if (claimSampler != null)''','''      var failures = new java.util.ArrayList<Throwable>();
      boolean producersDrained = false;
      try {
        if (claimSampler != null)''','track-actual-existing-producer-drain')
rep('''        p3AttemptTeardown(failures, () -> rootLogger.setLevel(rootLevel));''','''        producersDrained = failures.isEmpty() && !cleanupUnconfirmed;
        final boolean actualProducersDrained = producersDrained;
        p3AttemptTeardown(failures, () -> rootLogger.setLevel(rootLevel));''','drain-before-original-level-stream-restoration')
rep('''                var finalBytes = new java.util.LinkedHashMap<>(produced);
                finalBytes.put("c5-final-original-JSON_CONSOLE", encoded.toByteArray());''','''                assertThat(actualProducersDrained).as("existing producers genuinely drained").isTrue();
                assertThat(appender.getOutputStream() == originalStream)
                    .as("original output target actually restored").isTrue();
                encoded.assertClean(true);
                streamedLogsFinalChecked = true;
                var finalBytes = new java.util.LinkedHashMap<>(produced);''','final-post-footer-restoration-stream-check')
rep('''      } finally {
        p3AttemptTeardown(
            failures, () -> Files.deleteIfExists(TEMP.resolve("c5-private-values.json")));
        encoded.reset();
        produced.clear();
      }
      throwTeardownFailures(failures);
    }
  }

  private static final class C5Stream''','''        // Persist only actual fixed counters, including late/restoration bytes or sticky hits.
        p3AttemptTeardown(failures, this::writeNumericEvidence);
      } finally {
        synchronized (this) {
          if (producersDrained && encoded.inputClosed && appender.getOutputStream() == originalStream) {
            p3AttemptTeardown(failures,
                () -> Files.deleteIfExists(TEMP.resolve("c5-private-values.json")));
            encoded.wipe();
            produced.clear();
          } else {
            cleanupUnconfirmed = true;
            failures.add(new IllegalStateException("C5 encoded stream closure remains unconfirmed"));
            // Retain bounded patterns/state and original evidence while writers are unresolved.
          }
        }
      }
      throwTeardownFailures(failures);
    }
  }

  private static final class C5Stream''','wipe-only-owned-quiescent-pattern-state-retain-quarantine')
# Support body is insertion-only; independent hardcoded vectors, never factory-derived expectations.
old='''            "%C3%A8%F0%9F%98%80%22%5CA%20z%2B".getBytes(StandardCharsets.UTF_8)),
        value);
  }'''
new=old[:-3]+(p/'support.txt').read_text()+'  }'
rep(old,new,'extend-existing-support-only-no-new-case')
assert hashlib.sha256(live.read_bytes()).hexdigest()=='27e9fce94ff7d4a13252391b82552d087890fb23f0886922999b027e3f24797f'
live.write_text(s);(p/'after.java').write_text(s)
patch=''.join(difflib.unified_diff(before.splitlines(True),s.splitlines(True),fromfile='a/'+str(live),tofile='b/'+str(live)))
(p/'source.patch').write_text(patch)
manifest={'beforeSha256':hashlib.sha256(before.encode()).hexdigest(),'afterSha256':hashlib.sha256(s.encode()).hexdigest(),'patchSha256':hashlib.sha256(patch.encode()).hexdigest(),'changes':changes,'runtime':'UNRUN','sourceApplied':True,'checks':0}
(p/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps(manifest))
