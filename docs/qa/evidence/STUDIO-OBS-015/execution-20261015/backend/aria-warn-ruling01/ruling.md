# STUDIO-OBS-015 aria-warn-ruling01: H8 past-window teardown WARN (closes QA R2)

Aria (@architect), 2026-10-16. This ruling was read-only on source. No Gradle, no DB and no network were used. Nothing was committed.
Labels: [V] = I read it or ran it (read/grep/shasum). [I] = inferred.

Inputs:
- `qa-source-review-final01/review.md` §5 and §9 R2 (sha256 `fdfa4254…`)
- `backend/h8h6-window01/h8-warn-once-adjustment.diff` (`6b310385…`)
- `backend/r2-diagnosis01/aria-h8-h6-ruling01/ruling.md` H8.4(5) and H8.5 (`86a53bec…`)

Live files (unchanged by me):
- `GuidedSessionRepository` `7fd81750`
- `GuidedSessionService` `bda27005`
- `GuidedSessionReaper` `3cbae036`
- `GuidedServiceTransportFaultIT` `25079c12`

## 1. Decision

**Disposition: SUPERSEDE.** Both earlier designs are replaced:
- H8.4(5)/H8.5 "one count-only WARN per sweep" is superseded.
- The coordinator's WARN-once-per-row-per-process adjustment is **not accepted**.

The final design (option C):
- **One count query per interval.** A value-free `SELECT count(*)` runs at most once per `studio.guided-authoring.teardown-abandoned-warn-interval` per process. The default is `PT15M`.
- **One WARN per interval, only if the count is above 0.** The WARN carries the count only, with the same message text and the same single `Integer` argument as today.
- **No id list anywhere.** The query returns no ids, and no id set is kept in memory.
- **The count runs in its own step.** It moves out of `redriveTeardowns` into a new `reportAbandonedTeardowns(window, interval)`. The reaper calls it after the redrive.
- **Process state is one `AtomicReference<Instant>`**, the next due instant. Memory is O(1).

This answers R2's second question: the unbounded `abandonedTeardowns` id list is removed, not capped.

## 2. Facts the decision rests on [V]

- **The live code loads every past-window id on every tick.**
  - `abandonedTeardowns` returns `List<String>` with no LIMIT.
  - `redriveTeardowns` calls it on every reaper tick (`fixedDelay` 10 s).
  - It is then added to, and `retainAll`-ed against, a `ConcurrentHashMap` key set (`GuidedSessionService:42`, `:1581-1593`).
- **Sessions are never deleted.**
  - V19 marks pruning with `pruned_at`. The partial index `ix_guided_session_prune(expires_at) WHERE pruned_at IS NULL` exists (V19:279).
  - `ix_guided_session_expiry(expires_at)` covers every row ever written (V14:23).
  - So today's `expires_at<=?` range grows forever. Only the jsonb filter keeps the result to unpruned rows.
- **Pruned rows cannot carry a `teardownRequest`.**
  - `studio_guided_prune_guard` requires `progress - retained_keys = '{}'` on prune, and forbids regaining content afterwards (V19:281-295).
  - `teardownRequest` is not in `studio_guided_progress_retained_keys()`.
  - So adding `pruned_at IS NULL` to the count predicate changes nothing in the result. It does narrow the scan to the partial index.
- **The pruner is batched and hourly** (`pruner-delay-ms` 3600000, `LIMIT batchSize`). Unpruned past-window rows can therefore outlive the nominal retention by a backlog. "Bounded by retention" is weaker than it sounds.
- **Nothing in the report path writes.** The only statement is a `SELECT`, so the session guard triggers (`tr_015_session_guard`, `tr_guided_prune_guard`, `tr_guided_identity`, `tr_guided_secret_revocation`) are never involved.
- **Mockito 5.11 is in the Gradle cache, and the final class `GuidedContracts` is already spied** (`ObservedArtifactLowererTest:155`). A spy of the final `GuidedSessionRepository` is therefore usable in tests.

## 3. Options and trade-offs

| Option | WARN volume while ≥1 row is abandoned (per replica) | Query and memory per tick | Re-signals while the condition persists | Verdict |
|---|---|---|---|---|
| A. Count-only WARN on every sweep (original H8) | 8640/day, for up to 30+ days | 1 count; O(1) | yes (too often) | Rejected: noise buries the signal. Dex flagged it in h8-source01 notes #9 |
| B. WARN once per row per process (live) | 1 per new row | full id list plus an id set; grows with unpruned abandoned rows | **no**, until restart | Rejected: unbounded per-tick transfer, and silent after the first WARN |
| **C. Count query and WARN gated to once per interval** | ≤ 96/day at PT15M | **0 queries on most ticks**; 1 count per interval; O(1) | yes, once per interval | **Chosen** |
| D. Count every tick, WARN only when the count changes | unbounded under churn (a runner outage raises the count on every tick) | 1 count per tick; O(1) | no, while the count is stable | Rejected: still not rate-limited, and silent while the count is steady |
| E. Bounded id set (cap N) on top of B | 1 per new row, up to N | capped list | no | Rejected: the cap still needs a policy for when it is full, and keeps ids in memory for nothing |

Costs that C accepts:
- **Detection latency.** A row that crosses `expires_at + window` can be reported up to one interval later, so ≤ 30 min after expiry with the defaults. Acceptable: the row is already truthful PENDING. This WARN is a diagnostic, not the teardown mechanism.
- **Replica volume.** Each replica reports on its own, so volume scales with the replica count. Acceptable: it is bounded and value-free.
- **A failed query consumes the slot.** The slot is claimed before the query, so if `count(*)` throws, the next try is one interval later. The exception propagates to the scheduled tick as today. Fail-quiet is right for a diagnostic.
- **A backward clock step delays the next report** by the size of the step. That is bounded and acceptable.
- **A gauge metric is not added.** Quinn's advisory is left as a follow-up. Micrometer and actuator are on the classpath (build.gradle.kts:37-40), but a scrape-time DB query needs its own caching design. It is out of this R2 scope.

## 4. Exact change spec (owner: @dev, backend)

### 4.1 `GuidedSessionRepository.abandonedTeardowns`

Restore the count shape. Add `pruned_at IS NULL` first, so the scan uses the partial index. Replace the whole method and its javadoc:

```java
  /**
   * STUDIO-OBS-015 aria-warn-ruling01: the number of unacknowledged teardowns whose re-drive window
   * has passed; no identifiers. A pruned row cannot hold a teardownRequest (prune guard), so
   * {@code pruned_at IS NULL} only narrows the scan to ix_guided_session_prune.
   */
  public int abandonedTeardowns(Instant now, Duration window) {
    Integer count =
        jdbc.queryForObject(
            "SELECT count(*) FROM studio_guided_sessions WHERE pruned_at IS NULL AND state IN "
                + TERMINAL_STATES
                + PENDING_TEARDOWN
                + " AND expires_at<=?",
            Integer.class,
            Timestamp.from(now.minus(window)));
    return count == null ? 0 : count;
  }
```

`pendingTeardowns` is unchanged.

### 4.2 `GuidedSessionService`

1. **Delete the field `warnedTeardowns`** (`:41-42`) and its javadoc. Add:
   ```java
   /** STUDIO-OBS-015 aria-warn-ruling01: earliest instant of the next past-window count. */
   private final java.util.concurrent.atomic.AtomicReference<Instant> nextAbandonedReport =
       new java.util.concurrent.atomic.AtomicReference<>(Instant.MIN);
   ```
2. **In `redriveTeardowns`:**
   - Delete everything from `List<String> abandoned = repository.abandonedTeardowns(now, window);` to the end of the `if (newlyAbandoned > 0) {…}` block. The method ends after the submit loop.
   - Replace the javadoc's last sentence with: `Rows past the window stay PENDING (no proof of teardown); {@link #reportAbandonedTeardowns} counts them.`
3. **Add this method directly after `redriveTeardowns`:**
   ```java
   /**
    * STUDIO-OBS-015 aria-warn-ruling01: at most once per {@code interval} per process, counts the
    * unacknowledged teardowns whose re-drive window has passed and logs the count only. Reads no
    * identifier, writes nothing; the rows stay PENDING (no proof of teardown).
    */
   public void reportAbandonedTeardowns(java.time.Duration window, java.time.Duration interval) {
     if (stopSender == null) {
       return;
     }
     Instant now = clock.instant();
     Instant due = nextAbandonedReport.get();
     if (now.isBefore(due) || !nextAbandonedReport.compareAndSet(due, now.plus(interval))) {
       return;
     }
     int abandoned = repository.abandonedTeardowns(now, window);
     if (abandoned > 0) {
       LOG.warn("Guided teardown unacknowledged past the re-drive window: {} session(s)", abandoned);
     }
   }
   ```
   - The `stopSender == null` guard keeps parity with H8: no report where no teardown is ever driven.
   - The message text and the single `Integer` argument are unchanged. Log-based alerting keeps matching.
   - The CAS lets exactly one caller run per due instant, even when tests call it directly alongside the reaper.
   - The `Set` import stays (it is used elsewhere).

### 4.3 `GuidedSessionReaper`

- Add a constructor parameter, read with `@Value` in the same style as the H8 keys. Do not add it to `GuidedSessionProperties`, per H8.4(5).
  ```java
  @Value("${studio.guided-authoring.teardown-abandoned-warn-interval:PT15M}") Duration abandonedWarnInterval
  ```
- Extend the guard: `|| abandonedWarnInterval.isNegative() || abandonedWarnInterval.isZero()`. Keep the existing message.
- Store it in a `private final Duration abandonedWarnInterval`.
- `expire()` becomes:
  ```java
  service.expire();
  service.redriveTeardowns(teardownWindow, teardownBatch);
  service.reportAbandonedTeardowns(teardownWindow, abandonedWarnInterval);
  ```
- No YAML, Helm or migration change. The default covers every Spring context [V: no `teardown-redrive*` key is set in `src/main/resources`].

### 4.4 Not changed

- The runner.
- Schemas and migrations.
- `pendingTeardowns`, `teardownAttempt` and the executor.
- `GuidedBridgeIntegrationTest`: its `redriveTeardowns` call at :1075 needs no report.
- Advisories (a) and (b) from Quinn §4.

## 5. Exact test changes

All tests are in `GuidedServiceTransportFaultIT`. Add the constant `private static final Duration ABANDONED_WARN_INTERVAL = Duration.ofMinutes(15);` next to `TEARDOWN_WINDOW`.

### T1. Modify `teardownWithoutAckNeverConfirmsAndStopsAfterWindow`

Replace the body of the `try` block with:

```java
      sessions.redriveTeardowns(TEARDOWN_WINDOW, 32);
      sessions.redriveTeardowns(TEARDOWN_WINDOW, 32);
      Thread.sleep(300);
      assertThat(warnings(appender)).as("the re-drive sweep itself never warns").isEmpty();
      sessions.reportAbandonedTeardowns(TEARDOWN_WINDOW, ABANDONED_WARN_INTERVAL);
      sessions.reportAbandonedTeardowns(TEARDOWN_WINDOW, ABANDONED_WARN_INTERVAL);
      clock.advance(ABANDONED_WARN_INTERVAL.minusSeconds(5));
      sessions.reportAbandonedTeardowns(TEARDOWN_WINDOW, ABANDONED_WARN_INTERVAL);
      assertThat(warnings(appender)).as("one count-only warning per interval").hasSize(1);
      clock.advance(Duration.ofSeconds(5));
      sessions.reportAbandonedTeardowns(TEARDOWN_WINDOW, ABANDONED_WARN_INTERVAL);
```

- Replace the final size assertion with `assertThat(warnings).as("re-asserted once the interval elapses").hasSize(2);`. Derive `warnings` from the same helper.
- Keep every other assertion unchanged:
  - `stub.calls` stays 6, which proves the report sends nothing;
  - PENDING, `teardownRequest` present, `EXPIRED`;
  - `teardownInvariants(id)` equals `before`, which proves no write;
  - each WARN has one `Integer` argument ≥ 1 and contains no session, assignment or worker id.
- Add a private helper:
  `warnings(ListAppender<ILoggingEvent> a)` returns the WARN-level events as a `List`.
- Why `≥ 1` stays: the class shares one database, so the count may include other cases' rows [V: notes h8-source01 "the sweep is global"].

### T2. New test `abandonedTeardownReportQueriesOncePerIntervalAndIsSilentWhenNone`

```java
    var clock = new OffsetClock();
    var spied = org.mockito.Mockito.spy(repository);
    var sessions = service(actualJdbc, spied, materialization, access, 30, clock);
    sessions.installStopSender(new TeardownStub(ordinal -> null));
    org.mockito.Mockito.clearInvocations(spied);
    Duration none = Duration.ofDays(36500); // no row expired a century ago: count is 0
    // attach the ListAppender as in T1, then:
    sessions.reportAbandonedTeardowns(none, ABANDONED_WARN_INTERVAL);
    sessions.reportAbandonedTeardowns(none, ABANDONED_WARN_INTERVAL);
    verify(spied, times(1)).abandonedTeardowns(any(), eq(none));
    clock.advance(ABANDONED_WARN_INTERVAL);
    sessions.reportAbandonedTeardowns(none, ABANDONED_WARN_INTERVAL);
    verify(spied, times(2)).abandonedTeardowns(any(), eq(none));
    verifyNoMoreInteractions(spied);          // no other repository call, hence no write
    // detach; then: assertThat(warnings(appender)).as("silent when nothing is abandoned").isEmpty();
```

This test proves three things:
- the query gate, deterministically, without depending on what the shared database holds;
- silence at count 0;
- no repository write.

### T3. New unit test `GuidedSessionReaperTest` (package `…guided.session`, plain JUnit and Mockito, no Spring)

- The constructor rejects `abandonedWarnInterval` of `Duration.ZERO` and of `Duration.ofSeconds(-1)` with `IllegalArgumentException`.
- `expire()` on `mock(GuidedSessionService.class)` calls, in this `InOrder`:
  - `expire()`
  - `redriveTeardowns(PT15M, 32)`
  - `reportAbandonedTeardowns(PT15M, interval)`

  It then calls nothing else.

### Removed expectation

The IT description "one value-free warning per abandoned row, not per sweep" is gone, and so is the expectation of exactly 1 WARN per row.

## 6. Verification for the Gradle owner (not run by me)

```
./gradlew --no-daemon test \
  --tests '*GuidedServiceTransportFaultIT.teardownWithoutAckNeverConfirmsAndStopsAfterWindow' \
  --tests '*GuidedServiceTransportFaultIT.abandonedTeardownReportQueriesOncePerIntervalAndIsSilentWhenNone' \
  --tests '*GuidedSessionReaperTest' \
  --tests '*GuidedServiceTransportFaultIT.expiredTeardown*' \
  --tests '*GuidedServiceTransportFaultIT.concurrentAfterCompletionAndSweepSendOneStopAtATime' \
  --tests '*GuidedServiceTransportFaultIT.legacyPendingWithoutRequestIsNotRedriven' \
  --tests '*GuidedBridgeIntegrationTest.stopRetryAfterCloseCompletesConfirmsWithSameKey'
```

- Format the touched hunks with google-java-format 1.22.0, as in R1. The new `@Value` parameter line is longer than 100 columns, so gjf will wrap it.
- Run `spotlessCheck checkstyleMain checkstyleTest spotbugsMain` with the R1 run.
- These changes supersede the review §8 javadoc deviation at `GuidedSessionRepository` 227-228, because that javadoc is replaced.
- Red-before is discriminating [I]. On the live code:
  - T2 does not compile (there is no `reportAbandonedTeardowns`);
  - T1's "sweep never warns" assertion would fail (the live sweep warns).

## 7. Security and backward compatibility

- **Value-free.** The only logged argument is an `Integer`. No id is read into the JVM by this path.
- **No writes.** The query is a single `SELECT count(*)`, so no trigger interaction is possible.
- **Bounded.** Memory is O(1), and there is at most 1 query and 1 WARN per interval per replica.
- **No compatibility layer.** Studio is unreleased (single path). The WARN text is unchanged, and the new key has a safe default.
