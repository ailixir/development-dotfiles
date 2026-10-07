package com.citi.put.checks.studio.scheduling;

import static com.citi.put.checks.studio.scheduling.StudioScheduleRepository.number;
import static com.citi.put.checks.studio.scheduling.StudioScheduleRepository.string;
import static com.citi.put.checks.studio.scheduling.StudioScheduleRepository.timestamp;
import static com.citi.put.checks.studio.scheduling.StudioScheduleRepository.uuid;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.studio.StudioAccessDeniedException;
import com.citi.put.checks.studio.StudioConflictException;
import com.citi.put.checks.studio.UITestRevisionRepository;
import com.citi.put.checks.studio.dispatch.ExecutionReferences;
import com.citi.put.checks.studio.dispatch.ReferenceDeclarations;
import com.citi.put.checks.studio.dispatch.StudioReferenceResolver;
import com.citi.put.checks.studio.readiness.ExecutionReadinessService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** CSI-scoped administration, always serialized with the test's executable mutations. */
@Service
public class StudioScheduleService {
  private final StudioScheduleRepository repository;
  private final StudioCronResolver resolver;
  private final StudioSchedulingProperties properties;
  private final StudioBackgroundAuthorization authorization;
  private final CsiOwnershipEvaluator ownership;
  private final ExecutionReadinessService readiness;
  private final UITestRevisionRepository revisions;
  private final StudioReferenceResolver references;
  private final ObjectMapper mapper;
  private final StudioScheduleInvalidation invalidation;

  @SuppressWarnings("checkstyle:ParameterNumber")
  public StudioScheduleService(
      StudioScheduleRepository repository,
      StudioCronResolver resolver,
      StudioSchedulingProperties properties,
      StudioBackgroundAuthorization authorization,
      CsiOwnershipEvaluator ownership,
      ExecutionReadinessService readiness,
      UITestRevisionRepository revisions,
      StudioReferenceResolver references,
      ObjectMapper mapper,
      StudioScheduleInvalidation invalidation) {
    this.repository = repository;
    this.resolver = resolver;
    this.properties = properties;
    this.authorization = authorization;
    this.ownership = ownership;
    this.readiness = readiness;
    this.revisions = revisions;
    this.references = references;
    this.mapper = mapper;
    this.invalidation = invalidation;
  }

  public StudioScheduleDtos.Policy policy() {
    return new StudioScheduleDtos.Policy(
        60, properties.getGraceSeconds(), "SKIP", "EARLIER_OFFSET");
  }

  @Transactional(readOnly = true)
  public StudioScheduleDtos.Capability capabilities(UUID id, Authentication auth) {
    Map<String, Object> test = authorized(id, auth, false, false);
    return new StudioScheduleDtos.Capability(
        properties.isEnabled(),
        ownership.canWrite(auth, string(test, "csi_id")),
        authorization.principals(string(test, "csi_id"), string(test, "environment")),
        authorization.localOnly(),
        policy());
  }

  @Transactional(readOnly = true)
  public StudioScheduleDtos.Schedule read(UUID id, Authentication auth) {
    authorized(id, auth, false, false);
    return repository
        .schedule(id, false)
        .filter(r -> r.get("deleted_at") == null)
        .map(repository::project)
        .orElse(null);
  }

  public StudioScheduleDtos.Preview preview(StudioScheduleDtos.PreviewRequest request) {
    StudioCronResolver.Rule rule = resolver.validate(request.cronExpression(), request.timeZone());
    return new StudioScheduleDtos.Preview(
        rule.cronExpression(), rule.timeZone(), resolver.preview(rule, resolver.now()), policy());
  }

  @Transactional
  public StudioScheduleDtos.Schedule create(
      UUID id, StudioScheduleDtos.Create request, Authentication auth) {
    Map<String, Object> test = authorized(id, auth, true, true);
    requireEnabled();
    StudioCronResolver.Rule rule = resolver.validate(request.cronExpression(), request.timeZone());
    principal(request.executionPrincipal());
    authorization.require(
        request.executionPrincipal(), string(test, "csi_id"), string(test, "environment"));
    Map<String, Object> existing = repository.schedule(id, true).orElse(null);
    if (existing != null && existing.get("deleted_at") == null) {
      throw conflict("SCHEDULE_EXISTS", "This test already has a schedule");
    }
    String actor = actor(auth);
    if (existing == null) {
      repository
          .jdbc()
          .update(
              """
              INSERT INTO studio_schedules(test_id, csi_id, cron_expression,
              time_zone, execution_principal, created_by, updated_by)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              """,
              id,
              string(test, "csi_id"),
              rule.cronExpression(),
              rule.timeZone(),
              request.executionPrincipal(),
              actor,
              actor);
    } else {
      repository
          .jdbc()
          .update(
              """
              UPDATE studio_schedules SET cron_expression=?, time_zone=?,
              execution_principal=?,
              state='PAUSED', requested_enabled=false, blocked_code=NULL,
              deleted_at=NULL,
              version=version+1, updated_by=?, updated_at=now() WHERE test_id=?
              """,
              rule.cronExpression(),
              rule.timeZone(),
              request.executionPrincipal(),
              actor,
              id);
    }
    return project(id);
  }

  @Transactional
  public StudioScheduleDtos.Schedule update(
      UUID id, StudioScheduleDtos.Update request, Authentication auth) {
    Map<String, Object> test = authorized(id, auth, true, true);
    requireEnabled();
    Map<String, Object> schedule = requireSchedule(id);
    version(schedule, request.expectedVersion());
    StudioCronResolver.Rule rule = resolver.validate(request.cronExpression(), request.timeZone());
    principal(request.executionPrincipal());
    authorization.require(
        request.executionPrincipal(), string(test, "csi_id"), string(test, "environment"));
    invalidation.settle(id, "SKIPPED", "SCHEDULE_UPDATED");
    repository
        .jdbc()
        .update(
            """
            UPDATE studio_schedules SET cron_expression=?, time_zone=?,
            execution_principal=?, state='PAUSED',
            requested_enabled=false, blocked_code=NULL, version=version+1,
            updated_by=?, updated_at=now() WHERE test_id=?
            """,
            rule.cronExpression(),
            rule.timeZone(),
            request.executionPrincipal(),
            actor(auth),
            id);
    return project(id);
  }

  @Transactional
  public StudioScheduleDtos.Schedule enabled(
      UUID id, StudioScheduleDtos.Enabled request, Authentication auth) {
    Map<String, Object> test = authorized(id, auth, true, true);
    requireEnabled();
    Map<String, Object> schedule = requireSchedule(id);
    version(schedule, request.expectedVersion());
    if (request.enabled() == null) {
      throw new StudioScheduleException(
          400, "INVALID_SCHEDULE", "An explicit enabled boolean is required");
    }
    if (!request.enabled()) {
      invalidation.settle(id, "SKIPPED", "SCHEDULE_PAUSED");
      repository
          .jdbc()
          .update(
              """
              UPDATE studio_schedules SET state='PAUSED', requested_enabled=false,
              blocked_code=NULL, version=version+1, updated_by=?, updated_at=now()
              WHERE test_id=?
              """,
              actor(auth),
              id);
      return project(id);
    }
    UUID revision = readiness.requireReady(id);
    if (!revision.equals(request.confirmedRevisionId())) {
      throw conflict(
          "ACTIVATION_REVISION_MISMATCH",
          "Acknowledge the current confirmed revision before Resume");
    }
    String csi = string(test, "csi_id");
    String environment = string(test, "environment");
    String principal = string(schedule, "execution_principal");
    authorization.require(principal, csi, environment);
    var declared =
        ExecutionReferences.declared(
            mapper, revisions.findById(revision).orElseThrow().getReferences());
    references.preflight(
        csi, environment, id, principal, new ReferenceDeclarations(List.of(), declared.secrets()));
    List<UUID> uncertainty = repository.uncertainties(id, uuid(schedule, "id"));
    List<UUID> ack =
        request.acknowledgedUncertaintyExecutionIds() == null
            ? List.of()
            : request.acknowledgedUncertaintyExecutionIds();
    if (new HashSet<>(ack).size() != ack.size()
        || !new HashSet<>(uncertainty).equals(new HashSet<>(ack))) {
      throw conflict(
          "UNCERTAINTY_ACKNOWLEDGEMENT_REQUIRED",
          "Investigate and acknowledge the exact current uncertain executions");
    }
    invalidation.settle(id, "SKIPPED", "SCHEDULE_UPDATED");
    long version = number(schedule, "version") + 1;
    UUID activation = UUID.randomUUID();
    Instant now = resolver.now();
    repository
        .jdbc()
        .update(
            """
            INSERT INTO studio_schedule_activations(id, schedule_id, test_id,
            csi_id, schedule_version, revision_id,
            environment, execution_principal, activated_by, activated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            activation,
            uuid(schedule, "id"),
            id,
            csi,
            version,
            revision,
            environment,
            principal,
            actor(auth),
            timestamp(now));
    for (UUID execution : uncertainty) {
      repository
          .jdbc()
          .update(
              """
              INSERT INTO studio_schedule_uncertainty_ack
              (schedule_id, execution_id, activation_id, acknowledged_by,
              acknowledged_at)
              VALUES (?, ?, ?, ?, ?)
              """,
              uuid(schedule, "id"),
              execution,
              activation,
              actor(auth),
              timestamp(now));
    }
    Instant due =
        resolver
            .next(
                new StudioCronResolver.Rule(
                    string(schedule, "cron_expression"), string(schedule, "time_zone")),
                now)
            .scheduledAt();
    repository
        .jdbc()
        .update(
            """
            UPDATE studio_schedules SET state='ENABLED', requested_enabled=true,
            blocked_code=NULL,
            activated_revision_id=?, activation_id=?, version=?, next_due_at=?,
            poll_after_at=?, updated_by=?, updated_at=now()
            WHERE test_id=?
            """,
            revision,
            activation,
            version,
            timestamp(due),
            timestamp(due),
            actor(auth),
            id);
    return project(id);
  }

  @Transactional
  public void remove(UUID id, Long expectedVersion, Authentication auth) {
    authorized(id, auth, true, true);
    requireEnabled();
    Map<String, Object> schedule = requireSchedule(id);
    version(schedule, expectedVersion);
    invalidation.settle(id, "SKIPPED", "SCHEDULE_REMOVED");
    repository
        .jdbc()
        .update(
            """
            UPDATE studio_schedules SET state='PAUSED', requested_enabled=false,
            blocked_code=NULL, deleted_at=now(), version=version+1,
            updated_by=?, updated_at=now()
            WHERE test_id=?
            """,
            actor(auth),
            id);
  }

  @Transactional(readOnly = true)
  public StudioScheduleDtos.Page<StudioScheduleDtos.Occurrence> occurrences(
      UUID id, int page, int size, Authentication auth) {
    Map<String, Object> test =
        repository.test(id, false).orElseThrow(StudioAccessDeniedException::new);
    String csi = string(test, "csi_id");
    if (csi == null || !ownership.canRead(auth, csi)) {
      throw new StudioAccessDeniedException();
    }
    if (page < 0 || size < 1 || size > 100) {
      throw new StudioScheduleException(
          400, "INVALID_PAGINATION", "Page must be nonnegative and size 1..100");
    }
    return repository.occurrences(id, page, size);
  }

  private Map<String, Object> authorized(
      UUID id, Authentication auth, boolean write, boolean lock) {
    Map<String, Object> test =
        repository.test(id, lock).orElseThrow(StudioAccessDeniedException::new);
    String csi = string(test, "csi_id");
    if (csi == null
        || !(write ? ownership.canWrite(auth, csi) : ownership.canRead(auth, csi))
        || test.get("deleted_at") != null
        || test.get("quarantined_at") != null) {
      throw new StudioAccessDeniedException();
    }
    return test;
  }

  private Map<String, Object> requireSchedule(UUID id) {
    return repository
        .schedule(id, true)
        .filter(r -> r.get("deleted_at") == null)
        .orElseThrow(() -> conflict("SCHEDULE_NOT_FOUND", "No operational schedule for this test"));
  }

  private StudioScheduleDtos.Schedule project(UUID id) {
    return repository.project(repository.schedule(id, false).orElseThrow());
  }

  private void requireEnabled() {
    if (!properties.isEnabled()) {
      throw new StudioScheduleException(
          503, "SCHEDULING_DISABLED", "Studio scheduling is disabled");
    }
  }

  private static void version(Map<String, Object> row, Long expected) {
    if (expected == null || expected < 1) {
      throw new StudioScheduleException(
          400, "INVALID_SCHEDULE_VERSION", "A positive expectedVersion is required");
    }
    if (number(row, "version") != expected) {
      throw conflict("SCHEDULE_VERSION_CONFLICT", "Reload the schedule before changing it");
    }
  }

  private static void principal(String value) {
    if (value == null || value.isBlank() || value.length() > 255) {
      throw new StudioScheduleException(
          400, "INVALID_SCHEDULE", "An approved execution principal is required");
    }
  }

  private static StudioConflictException conflict(String code, String message) {
    return new StudioConflictException(code, message);
  }

  private static String actor(Authentication auth) {
    if (auth instanceof BffAuthenticationToken token) {
      return token.getPrincipal().email();
    }
    throw new StudioAccessDeniedException();
  }
}
