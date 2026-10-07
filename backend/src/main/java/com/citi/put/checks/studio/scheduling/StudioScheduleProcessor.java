package com.citi.put.checks.studio.scheduling;

import static com.citi.put.checks.studio.scheduling.StudioScheduleRepository.instant;
import static com.citi.put.checks.studio.scheduling.StudioScheduleRepository.number;
import static com.citi.put.checks.studio.scheduling.StudioScheduleRepository.string;
import static com.citi.put.checks.studio.scheduling.StudioScheduleRepository.timestamp;
import static com.citi.put.checks.studio.scheduling.StudioScheduleRepository.uuid;

import com.citi.put.checks.studio.StudioConflictException;
import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.dispatch.StudioAcceptanceService;
import com.citi.put.checks.studio.readiness.ExecutionReadinessService;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Produces durable occurrence decisions; the existing dispatcher alone sends browser work. */
@Component
public class StudioScheduleProcessor {
  private static final Logger LOG = LoggerFactory.getLogger(StudioScheduleProcessor.class);
  private final StudioScheduleRepository repository;
  private final StudioCronResolver resolver;
  private final StudioSchedulingProperties properties;
  private final StudioExecutionProperties executionProperties;
  private final StudioBackgroundAuthorization authorization;
  private final ExecutionReadinessService readiness;
  private final StudioAcceptanceService acceptance;
  private final TransactionTemplate transactions;
  private volatile String csiCursor = "";

  @Autowired(required = false)
  private MeterRegistry metrics;

  @SuppressWarnings("checkstyle:ParameterNumber")
  public StudioScheduleProcessor(
      StudioScheduleRepository repository,
      StudioCronResolver resolver,
      StudioSchedulingProperties properties,
      StudioExecutionProperties executionProperties,
      StudioBackgroundAuthorization authorization,
      ExecutionReadinessService readiness,
      StudioAcceptanceService acceptance,
      TransactionTemplate transactions) {
    this.repository = repository;
    this.resolver = resolver;
    this.properties = properties;
    this.executionProperties = executionProperties;
    this.authorization = authorization;
    this.readiness = readiness;
    this.acceptance = acceptance;
    this.transactions = transactions;
  }

  public int poll() {
    if (!properties.isEnabled()) {
      return 0;
    }
    Instant passNow = resolver.now();
    List<String> csis =
        repository
            .jdbc()
            .queryForList(
                """
                SELECT DISTINCT csi_id FROM studio_schedules WHERE state='ENABLED'
                AND deleted_at IS NULL
                AND poll_after_at<=? AND csi_id>? ORDER BY csi_id LIMIT ?
                """,
                String.class,
                timestamp(passNow),
                csiCursor,
                properties.getBatchSize());
    if (csis.isEmpty()) {
      csis =
          repository
              .jdbc()
              .queryForList(
                  "SELECT DISTINCT csi_id FROM studio_schedules WHERE state='ENABLED' AND"
                      + " deleted_at IS NULL AND poll_after_at<=? ORDER BY csi_id LIMIT ?",
                  String.class,
                  timestamp(passNow),
                  properties.getBatchSize());
    }
    List<Map.Entry<UUID, String>> candidates = new ArrayList<>();
    for (String csi : csis) {
      if (candidates.size() >= properties.getBatchSize()) {
        break;
      }
      candidates.addAll(
          repository
              .jdbc()
              .queryForList(
                  """
                  SELECT test_id FROM studio_schedules WHERE state='ENABLED' AND
                  deleted_at IS NULL
                  AND poll_after_at<=? AND csi_id=? ORDER BY poll_after_at, id LIMIT ?
                  """,
                  UUID.class,
                  timestamp(passNow),
                  csi,
                  Math.min(
                      properties.getPerCsiBatchSize(),
                      properties.getBatchSize() - candidates.size()))
              .stream()
              .map(id -> Map.entry(id, csi))
              .toList());
    }
    int decisions = 0;
    long deadline =
        System.nanoTime() + java.time.Duration.ofMillis(properties.getPassBudgetMillis()).toNanos();
    for (Map.Entry<UUID, String> candidate : candidates) {
      if (System.nanoTime() > deadline || !properties.isEnabled()) {
        break;
      }
      // Advance only for an attempted CSI: a slow first admission must rotate away next pass.
      csiCursor = candidate.getValue();
      UUID test = candidate.getKey();
      try {
        if (process(test) != null) {
          decisions++;
        }
      } catch (RuntimeException ex) {
        // Database failures rolled the complete occurrence unit back. Never treat them as
        // permission
        // to create a replacement run or log reference values from an arbitrary exception body.
        LOG.warn(
            "Studio schedule transaction rolled back for test {} ({})",
            test,
            ex.getClass().getSimpleName());
      }
    }
    return decisions;
  }

  /** One independently committed test, enabling replica/concurrency and rollback tests. */
  public String process(UUID testId) {
    if (!properties.isEnabled()) {
      return null;
    }
    String code = transactions.execute(status -> decide(testId));
    if (code != null && metrics != null) {
      Runnable increment =
          () ->
              Counter.builder("studio_schedule_decisions_total")
                  .tag("code", code)
                  .register(metrics)
                  .increment();
      if (TransactionSynchronizationManager.isSynchronizationActive()) {
        TransactionSynchronizationManager.registerSynchronization(
            new TransactionSynchronization() {
              @Override
              public void afterCommit() {
                increment.run();
              }
            });
      } else {
        increment.run();
      }
    }
    return code;
  }

  private String decide(UUID testId) {
    List<Map<String, Object>> locked =
        repository
            .jdbc()
            .queryForList("SELECT * FROM ui_tests WHERE id=? FOR UPDATE SKIP LOCKED", testId);
    if (locked.isEmpty()) {
      return null;
    }
    Map<String, Object> test = locked.get(0);
    Map<String, Object> schedule = repository.schedule(testId, true).orElse(null);
    Instant now = resolver.now();
    if (schedule == null
        || !"ENABLED".equals(string(schedule, "state"))
        || schedule.get("deleted_at") != null
        || !properties.isEnabled()
        || instant(schedule, "poll_after_at").isAfter(now)) {
      return null;
    }
    UUID scheduleId = uuid(schedule, "id");
    StudioCronResolver.Rule rule =
        new StudioCronResolver.Rule(
            string(schedule, "cron_expression"), string(schedule, "time_zone"));
    Map<String, Object> deferred = repository.deferred(scheduleId, true).orElse(null);
    if (deferred != null && !instant(deferred, "grace_expires_at").isAfter(now)) {
      finish(uuid(deferred, "id"), "SKIPPED", "GRACE_EXPIRED");
      advance(testId, rule, resolver.now());
      return "GRACE_EXPIRED";
    }
    StudioCronResolver.Slot slot;
    UUID occurrenceId;
    Instant grace;
    if (deferred != null) {
      slot =
          new StudioCronResolver.Slot(
              instant(deferred, "scheduled_at"),
              ((Timestamp) deferred.get("local_scheduled_at")).toLocalDateTime(),
              ((Number) deferred.get("offset_seconds")).intValue());
      occurrenceId = uuid(deferred, "id");
      grace = instant(deferred, "grace_expires_at");
    } else {
      Instant nominal = instant(schedule, "next_due_at");
      slot = resolver.latestDue(rule, nominal, now, properties.getGraceSeconds());
      boolean missed = nominal.isBefore(now.minusSeconds(properties.getGraceSeconds()));
      if (slot == null) {
        slot =
            new StudioCronResolver.Slot(
                nominal,
                nominal.atZone(java.time.ZoneId.of(rule.timeZone())).toLocalDateTime(),
                nominal.atZone(java.time.ZoneId.of(rule.timeZone())).getOffset().getTotalSeconds());
        occurrenceId = insert(schedule, slot, now, null, "SKIPPED", "MISFIRE", nominal, now);
        advance(testId, rule, resolver.now());
        return occurrenceId == null ? null : "MISFIRE";
      }
      grace = slot.scheduledAt().plusSeconds(properties.getGraceSeconds());
      occurrenceId =
          insert(
              schedule,
              slot,
              now,
              grace,
              "DEFERRED",
              "PENDING_QUOTA_EXCEEDED",
              missed ? nominal : null,
              missed ? slot.scheduledAt() : null);
      if (occurrenceId == null) {
        advance(testId, rule, resolver.now());
        return null;
      }
      repository
          .jdbc()
          .update(
              "UPDATE studio_schedules SET next_due_at=?,poll_after_at=? WHERE test_id=?",
              timestamp(slot.scheduledAt()),
              timestamp(now),
              testId);
    }

    String lifecycle =
        test.get("deleted_at") != null
            ? "TEST_DELETED"
            : test.get("quarantined_at") != null ? "TEST_QUARANTINED" : null;
    if (lifecycle != null) {
      return refuse(testId, occurrenceId, lifecycle);
    }
    var verdict = readiness.evaluate(testId);
    if (!verdict.ready()) {
      return refuse(testId, occurrenceId, verdict.code());
    }
    if (!verdict.revisionId().equals(uuid(schedule, "activated_revision_id"))) {
      return refuse(testId, occurrenceId, "ACTIVATION_REVISION_MISMATCH");
    }
    if (repository.active(testId)) {
      finish(occurrenceId, "SKIPPED", "OVERLAP");
      advance(testId, rule, resolver.now());
      return "OVERLAP";
    }
    if (!repository.uncertainties(testId, scheduleId).isEmpty()) {
      return refuse(testId, occurrenceId, "UNCERTAIN_EXECUTION");
    }
    if (!executionProperties.enabledOrDefault()) {
      finish(occurrenceId, "SKIPPED", "DISPATCH_DISABLED");
      advance(testId, rule, resolver.now());
      return "DISPATCH_DISABLED";
    }
    String principal = string(schedule, "execution_principal");
    String csi = string(test, "csi_id");
    String environment = string(test, "environment");
    try {
      authorization.require(principal, csi, environment);
    } catch (StudioScheduleException ex) {
      if (ex.getStatus() == 503) {
        return defer(
            testId,
            occurrenceId,
            grace,
            deferred == null ? 0 : (int) number(deferred, "retry_attempts"),
            ex.getCode());
      }
      return refuse(testId, occurrenceId, ex.getCode());
    }
    final Instant graceDeadline = grace;
    StudioAcceptanceService.ScheduledIdentity identity =
        new StudioAcceptanceService.ScheduledIdentity(
            occurrenceId,
            scheduleId,
            number(schedule, "version"),
            uuid(schedule, "activation_id"),
            slot.scheduledAt(),
            uuid(schedule, "activated_revision_id"));
    var result =
        acceptance.acceptScheduled(
            testId,
            principal,
            identity,
            () -> {
              if (!properties.isEnabled()) {
                throw new StudioConflictException(
                    "DISPATCH_DISABLED", "Scheduling was disabled during admission");
              }
              authorization.require(principal, csi, environment);
              if (!graceDeadline.isAfter(resolver.now())) {
                throw new StudioConflictException(
                    "GRACE_EXPIRED", "The nominal occurrence grace expired before acceptance");
              }
            });
    if ("DEFERRED".equals(result.decision())) {
      return defer(
          testId,
          occurrenceId,
          grace,
          deferred == null ? 0 : (int) number(deferred, "retry_attempts"),
          result.code());
    } else if ("REFUSED".equals(result.decision())) {
      refuse(testId, occurrenceId, result.code());
    } else {
      finish(occurrenceId, result.decision(), result.code());
      advance(testId, rule, resolver.now());
    }
    return result.code();
  }

  private UUID insert(
      Map<String, Object> schedule,
      StudioCronResolver.Slot slot,
      Instant now,
      Instant grace,
      String decision,
      String code,
      Instant missedFrom,
      Instant missedUntil) {
    UUID id = UUID.randomUUID();
    int inserted =
        repository
            .jdbc()
            .update(
                """
                INSERT INTO studio_schedule_occurrences(id, schedule_id,
                schedule_version, test_id, csi_id,
                environment, execution_principal, activation_id,
                activated_revision_id, scheduled_at,
                local_scheduled_at, time_zone, offset_seconds, decision, code,
                retry_at, grace_expires_at, missed_from, missed_until)
                SELECT ?, s.id, s.version, s.test_id, s.csi_id, a.environment,
                a.execution_principal, a.id, a.revision_id,
                ?, ?, ?, ?,  ?, ?, ?, ?,  ?, ? FROM studio_schedules s
                JOIN studio_schedule_activations a ON a.id=s.activation_id WHERE
                s.id=?
                ON CONFLICT (schedule_id, time_zone, local_scheduled_at) DO NOTHING
                """,
                id,
                timestamp(slot.scheduledAt()),
                Timestamp.valueOf(slot.localScheduledAt()),
                string(schedule, "time_zone"),
                slot.offsetSeconds(),
                decision,
                code,
                "DEFERRED".equals(decision) ? timestamp(now) : null,
                timestamp(grace),
                timestamp(missedFrom),
                timestamp(missedUntil),
                uuid(schedule, "id"));
    return inserted == 1 ? id : null;
  }

  private void finish(UUID occurrenceId, String decision, String code) {
    repository
        .jdbc()
        .update(
            "UPDATE studio_schedule_occurrences SET"
                + " decision=?,code=?,retry_at=NULL,retry_attempts=0,updated_at=now() WHERE id=?"
                + " AND decision='DEFERRED'",
            decision,
            code,
            occurrenceId);
  }

  private String refuse(UUID testId, UUID occurrence, String code) {
    finish(occurrence, "REFUSED", code);
    repository
        .jdbc()
        .update(
            "UPDATE studio_schedules SET"
                + " state='BLOCKED',blocked_code=?,version=version+1,updated_at=now() WHERE"
                + " test_id=?",
            code,
            testId);
    return code;
  }

  private String defer(UUID testId, UUID occurrence, Instant grace, int attempts, String code) {
    Instant now = resolver.now();
    if (!grace.isAfter(now)) {
      finish(occurrence, "SKIPPED", "GRACE_EXPIRED");
      Map<String, Object> s = repository.schedule(testId, false).orElseThrow();
      advance(
          testId,
          new StudioCronResolver.Rule(string(s, "cron_expression"), string(s, "time_zone")),
          now);
      return "GRACE_EXPIRED";
    }
    int delay = Math.min(30, 5 * (1 << Math.min(attempts, 3)));
    Instant retry = now.plusSeconds(delay).isAfter(grace) ? grace : now.plusSeconds(delay);
    repository
        .jdbc()
        .update(
            "UPDATE studio_schedule_occurrences SET"
                + " code=?,retry_at=?,retry_attempts=?,updated_at=now() WHERE id=? AND"
                + " decision='DEFERRED'",
            code,
            timestamp(retry),
            attempts + 1,
            occurrence);
    repository
        .jdbc()
        .update(
            "UPDATE studio_schedules SET poll_after_at=? WHERE test_id=?",
            timestamp(retry),
            testId);
    return code;
  }

  private void advance(UUID testId, StudioCronResolver.Rule rule, Instant now) {
    Instant due = resolver.next(rule, now).scheduledAt();
    repository
        .jdbc()
        .update(
            "UPDATE studio_schedules SET next_due_at=?,poll_after_at=?,updated_at=now() WHERE"
                + " test_id=?",
            timestamp(due),
            timestamp(due),
            testId);
  }
}
