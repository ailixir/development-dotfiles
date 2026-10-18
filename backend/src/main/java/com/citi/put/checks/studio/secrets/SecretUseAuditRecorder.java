package com.citi.put.checks.studio.secrets;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Append-only safe metadata, in the caller's dispatch/outcome transaction. Never accepts a value.
 */
@Component
public class SecretUseAuditRecorder {
  public enum Path {
    GUIDED,
    OBSERVED_REPLAY
  }

  public enum NoSendDisposition {
    CLOSED,
    REQUEUED
  }

  public enum ResolutionOutcome {
    RESOLVED,
    NOT_AUTHORIZED,
    REVOKED,
    UNAVAILABLE,
    VAULT_UNAVAILABLE,
    REVOKED_MID_RUN
  }

  public enum UsageOutcome {
    USED,
    NOT_USED,
    REFUSED,
    OK,
    ASSERTION_FAILED,
    TARGET_CHANGED,
    POLICY_DENIED,
    TIMEOUT,
    ACK_LOST,
    UNKNOWN_OUTCOME,
    CANCELLED
  }

  public record Scope(
      Path path,
      UUID executionId,
      String sessionId,
      String admissionId,
      String principalId,
      String csiId,
      String environment,
      UUID testId,
      String secretId,
      String attemptId,
      Long releaseSeq,
      String coordinateStepId,
      Integer coordinateOrdinal,
      String sourceReferenceId) {
    public Scope {
      Objects.requireNonNull(path);
      Objects.requireNonNull(testId);
      bounded(principalId, 256);
      bounded(csiId, 20);
      bounded(environment, 256);
      bounded(attemptId, 256);
      if (secretId == null
          || !secretId.matches("[A-Za-z0-9_.-]{1,64}")
          || releaseSeq != null && releaseSeq < 1
          || coordinateStepId == null && coordinateOrdinal != null
          || coordinateOrdinal != null && coordinateOrdinal < 0) {
        throw invalid();
      }
      if (coordinateStepId != null) {
        bounded(coordinateStepId, 256);
      }
      if (admissionId != null) {
        bounded(admissionId, 256);
      }
      if (sourceReferenceId != null) {
        bounded(sourceReferenceId, 256);
      }
      if (path == Path.GUIDED) {
        bounded(sessionId, 256);
        if (executionId != null || coordinateStepId == null) {
          throw invalid();
        }
      } else if (executionId == null
          || sessionId != null
          || admissionId != null
          || coordinateStepId != null
          || coordinateOrdinal != null
          || sourceReferenceId != null) {
        throw invalid();
      }
    }

    public Scope(
        Path path,
        UUID executionId,
        String sessionId,
        String admissionId,
        String principalId,
        String csiId,
        String environment,
        UUID testId,
        String secretId,
        String attemptId,
        long releaseSeq,
        String coordinateStepId,
        Integer coordinateOrdinal) {
      this(
          path,
          executionId,
          sessionId,
          admissionId,
          principalId,
          csiId,
          environment,
          testId,
          secretId,
          attemptId,
          Long.valueOf(releaseSeq),
          coordinateStepId,
          coordinateOrdinal,
          null);
    }
  }

  public record Release(
      UUID id, Instant releasedAt, Scope scope, String vaultVersion, ResolutionOutcome outcome) {
    public Release {
      Objects.requireNonNull(id);
      Objects.requireNonNull(releasedAt);
      Objects.requireNonNull(scope);
      Objects.requireNonNull(outcome);
      if (scope.releaseSeq() == null
          || scope.path() == Path.GUIDED
              && (scope.admissionId() == null || scope.coordinateOrdinal() == null)) {
        throw invalid();
      }
      if (vaultVersion != null) {
        bounded(vaultVersion, 256);
      }
      if (outcome == ResolutionOutcome.RESOLVED && vaultVersion == null) {
        throw invalid();
      }
    }
  }

  private static final List<String> COLUMNS =
      List.of(
          "id",
          "occurred_at",
          "release_occurred_at",
          "path",
          "row_kind",
          "release_id",
          "affected_release_id",
          "decision_stage",
          "attempt_id",
          "release_seq",
          "execution_id",
          "session_id",
          "admission_id",
          "principal_id",
          "csi_id",
          "environment",
          "test_id",
          "secret_id",
          "vault_version",
          "coordinate_step_id",
          "coordinate_ordinal",
          "source_reference_id",
          "outcome",
          "usage_outcome");
  private final JdbcTemplate jdbc;
  private final NamedParameterJdbcTemplate named;
  private final Clock clock;

  @Autowired
  public SecretUseAuditRecorder(JdbcTemplate jdbc) {
    this(jdbc, Clock.systemUTC());
  }

  public SecretUseAuditRecorder(JdbcTemplate jdbc, Clock clock) {
    this.jdbc = Objects.requireNonNull(jdbc);
    this.named = new NamedParameterJdbcTemplate(jdbc);
    this.clock = Objects.requireNonNull(clock);
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public Release recordRelease(Scope scope, String vaultVersion, ResolutionOutcome outcome) {
    Objects.requireNonNull(outcome);
    if (outcome == ResolutionOutcome.REVOKED_MID_RUN
        || scope.releaseSeq() == null
        || scope.path() == Path.GUIDED
            && (scope.admissionId() == null || scope.coordinateOrdinal() == null)) {
      throw invalid();
    }
    if (vaultVersion != null) {
      bounded(vaultVersion, 256);
    }
    if (outcome == ResolutionOutcome.RESOLVED && vaultVersion == null) {
      throw invalid();
    }
    UUID id = identity("release", scope, null);
    Instant now = now();
    Map<String, Object> row =
        row(scope, id, now, now, "RELEASE", id, null, "DISPATCH", vaultVersion, outcome, null);
    Map<String, Object> stored = append(scope, row);
    return new Release(
        id,
        ((Timestamp) stored.get("release_occurred_at")).toInstant(),
        scope,
        vaultVersion,
        outcome);
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public void recordUsage(Release release, UsageOutcome usage) {
    Objects.requireNonNull(release);
    Objects.requireNonNull(usage);
    if (release.scope().path() == Path.OBSERVED_REPLAY
        && usage != UsageOutcome.USED
        && usage != UsageOutcome.NOT_USED
        && usage != UsageOutcome.REFUSED
        && usage != UsageOutcome.UNKNOWN_OUTCOME) {
      throw invalid();
    }
    append(
        release.scope(),
        row(
            release.scope(),
            identity("usage", release.scope(), release.id()),
            now(),
            release.releasedAt(),
            "USAGE",
            release.id(),
            null,
            null,
            release.vaultVersion(),
            release.outcome(),
            usage));
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public void recordUnreachedGuided(Scope scope) {
    if (scope.path() != Path.GUIDED
        || scope.admissionId() != null
        || scope.coordinateOrdinal() != null
        || scope.releaseSeq() != null
        || scope.sourceReferenceId() == null) {
      throw invalid();
    }
    requireTransaction();
    String state =
        jdbc.queryForObject(
            "SELECT state FROM studio_guided_sessions WHERE session_id=? FOR UPDATE",
            String.class,
            scope.sessionId());
    if (!List.of(
            "FINALIZING",
            "SUCCEEDED",
            "PUBLICATION_CONFLICT",
            "FAILED",
            "UNKNOWN_OUTCOME",
            "CANCELLED",
            "EXPIRED")
        .contains(state)) {
      throw invalid();
    }
    Instant now = now();
    append(
        scope,
        row(
            scope,
            identity("unreached", scope, null),
            now,
            now,
            "USAGE",
            null,
            null,
            null,
            null,
            null,
            UsageOutcome.NOT_USED));
  }

  /** Consume committed, but no resolution decision committed; never a no-read/no-use claim. */
  @Transactional(propagation = Propagation.MANDATORY)
  public void recordConsumedNoDecision(Scope scope, UsageOutcome usage) {
    if (scope.path() != Path.GUIDED
        || scope.admissionId() == null
        || scope.coordinateOrdinal() == null
        || scope.releaseSeq() != null
        || usage != UsageOutcome.UNKNOWN_OUTCOME && usage != UsageOutcome.ACK_LOST) {
      throw invalid();
    }
    requireTransaction();
    String state =
        jdbc.queryForObject(
            "SELECT state FROM studio_guided_sessions WHERE session_id=? FOR UPDATE",
            String.class,
            scope.sessionId());
    if (!List.of(
            "FINALIZING",
            "SUCCEEDED",
            "PUBLICATION_CONFLICT",
            "FAILED",
            "UNKNOWN_OUTCOME",
            "CANCELLED",
            "EXPIRED")
        .contains(state)) {
      throw invalid();
    }
    Instant now = now();
    append(
        scope,
        row(
            scope,
            identity("consumed-uncertain", scope, null),
            now,
            now,
            "USAGE",
            null,
            null,
            null,
            null,
            null,
            usage));
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public void recordLiveRevocation(Release release) {
    Objects.requireNonNull(release);
    if (release.outcome() != ResolutionOutcome.RESOLVED) {
      throw invalid();
    }
    UUID id = identity("revocation", release.scope(), release.id());
    append(
        release.scope(),
        row(
            release.scope(),
            id,
            now(),
            release.releasedAt(),
            "RELEASE",
            id,
            release.id(),
            "LIVE_RECHECK",
            release.vaultVersion(),
            ResolutionOutcome.REVOKED_MID_RUN,
            null));
  }

  /** Durable possible-read entry, committed by the caller before the existing provider call. */
  @Transactional(propagation = Propagation.MANDATORY)
  public void recordObservedReadEntry(JsonNode binding, String leaseOwner, String secretId) {
    if (secretId == null || !secretId.matches("[A-Za-z0-9_.-]{1,64}")) {
      throw invalid();
    }
    Map<String, Object> metadata = observedMetadata(binding, leaseOwner);
    metadata.put(
        "id",
        UUID.nameUUIDFromBytes(
            ("read|"
                    + metadata.get("execution_id")
                    + "|"
                    + metadata.get("attempt_id")
                    + "|"
                    + secretId)
                .getBytes(StandardCharsets.UTF_8)));
    metadata.put("secret_id", secretId);
    metadata.put("occurred_at", Timestamp.from(now()));
    var existing =
        jdbc.queryForList(
            ("SELECT * FROM studio_observed_secret_read_entries WHERE execution_id=? "
                + "AND attempt_id=? AND secret_id=?"),
            metadata.get("execution_id"),
            metadata.get("attempt_id"),
            secretId);
    if (!existing.isEmpty()) {
      var stored = existing.getFirst();
      for (var field : metadata.entrySet()) {
        // One conservative entered fact survives another real pass/owner; creator metadata stays
        // immutable.
        if (field.getKey().equals("occurred_at") || field.getKey().equals("lease_owner")) {
          continue;
        }
        if (!Objects.equals(stored.get(field.getKey()), field.getValue())) {
          throw new IllegalStateException("Conflicting observed read-entry scope");
        }
      }
      return;
    }
    named.update(
        ("INSERT INTO studio_observed_secret_read_entries(id,occurred_at,execution"
            + "_id,execution_accepted_at,attempt_id,revision_id,revision_digest,binding"
            + "_digest,scope_hash,principal_id,csi_id,environment,test_id,lease_owner,s"
            + "ecret_id) VALUES (:id,:occurred_at,:execution_id,:execution_accepted_at,"
            + ":attempt_id,:revision_id,:revision_digest,:binding_digest,:scope_hash,:p"
            + "rincipal_id,:csi_id,:environment,:test_id,:lease_owner,:secret_id)"),
        metadata);
  }

  /** Safe positive absence and owner transition must commit together; this grants no retry. */
  @Transactional(propagation = Propagation.MANDATORY)
  public void recordObservedNoSend(
      JsonNode binding,
      String leaseOwner,
      Set<String> positivelyNotEnteredIds,
      NoSendDisposition disposition) {
    Objects.requireNonNull(disposition);
    Objects.requireNonNull(positivelyNotEnteredIds);
    if (positivelyNotEnteredIds.size() > 64
        || positivelyNotEnteredIds.stream()
            .anyMatch(id -> id == null || !id.matches("[A-Za-z0-9_.-]{1,64}"))) {
      throw invalid();
    }
    Map<String, Object> metadata = observedMetadata(binding, leaseOwner);
    metadata.put(
        "id",
        UUID.nameUUIDFromBytes(
            ("no-send|" + metadata.get("execution_id") + "|" + metadata.get("attempt_id"))
                .getBytes(StandardCharsets.UTF_8)));
    metadata.put("occurred_at", Timestamp.from(now()));
    metadata.put("disposition", disposition.name());
    var names = new GuidedContracts().object().putArray("ids");
    positivelyNotEnteredIds.stream().sorted().forEach(names::add);
    metadata.put("not_entered_ids", names.toString());
    named.update(
        ("INSERT INTO studio_observed_no_send_decisions(id,occurred_at,execution_i"
            + "d,execution_accepted_at,attempt_id,revision_id,revision_digest,binding_d"
            + "igest,scope_hash,principal_id,csi_id,environment,test_id,lease_owner,not"
            + "_entered_ids,disposition) VALUES "
            + "(:id,:occurred_at,:execution_id,:execution_accepted_at,:attempt_id,:revi"
            + "sion_id,:revision_digest,:binding_digest,:scope_hash,:principal_id,:csi_"
            + "id,:environment,:test_id,:lease_owner,CAST(:not_entered_ids AS "
            + "jsonb),:disposition)"),
        metadata);
    for (String secret : positivelyNotEnteredIds) {
      Scope scope =
          new Scope(
              Path.OBSERVED_REPLAY,
              (UUID) metadata.get("execution_id"),
              null,
              null,
              (String) metadata.get("principal_id"),
              (String) metadata.get("csi_id"),
              (String) metadata.get("environment"),
              (UUID) metadata.get("test_id"),
              secret,
              metadata.get("attempt_id").toString(),
              null,
              null,
              null,
              null);
      Instant at = ((Timestamp) metadata.get("occurred_at")).toInstant();
      append(
          scope,
          row(
              scope,
              identity("unattempted", scope, null),
              at,
              at,
              "USAGE",
              null,
              null,
              null,
              null,
              null,
              UsageOutcome.NOT_USED));
    }
  }

  /** Actual pre-send terminal winner, with independently verified planned close metadata. */
  @Transactional(propagation = Propagation.MANDATORY)
  public boolean recordObservedTerminalSettlement(
      UUID executionId, String plannedErrorCode, Instant plannedEndedAt) {
    requireTransaction();
    Objects.requireNonNull(executionId);
    Objects.requireNonNull(plannedEndedAt);
    if (plannedErrorCode == null || !plannedErrorCode.matches("[A-Z][A-Z0-9_]{0,63}")) {
      throw invalid();
    }
    var rows =
        jdbc.queryForList(
            ("SELECT l.execution_id,l.execution_accepted_at,CAST(e.observed_revision_b"
                + "inding->>'attemptId' AS uuid) AS "
                + "attempt_id,e.revision_id,e.observed_revision_binding->>'revisionDigest' "
                + "AS revision_digest,studio_publication_hash(e.observed_revision_binding) "
                + "AS binding_digest,e.observed_revision_binding->>'scopeHash' AS "
                + "scope_hash,l.principal AS principal_id,l.csi_id,e.environment,l.test_id,"
                + "e.ended_at AS retained_ended_at FROM studio_dispatch_ledger l JOIN "
                + "ui_test_executions e ON e.id=l.execution_id AND "
                + "e.started_at=l.execution_accepted_at WHERE l.execution_id=? AND l.state "
                + "IN ('QUEUED','CLAIMED') AND l.attempt_id IS NULL AND l.admission_id IS "
                + "NULL AND e.status='PENDING' AND e.observed_admission_receipt IS NULL AND "
                + "e.observed_revision_binding IS NOT NULL FOR UPDATE OF l,e"),
            executionId);
    if (rows.isEmpty()) {
      return false;
    }
    var metadata = new LinkedHashMap<>(rows.getFirst());
    var expected =
        new GuidedContracts()
            .parse(
                jdbc.queryForObject(
                    "SELECT studio_observed_terminal_classification(?,?)::text",
                    String.class,
                    executionId,
                    metadata.get("attempt_id")));
    if (expected.path("noReadIds").isEmpty() && expected.path("possibleReadIds").isEmpty()) {
      return false;
    }
    metadata.put(
        "id",
        UUID.nameUUIDFromBytes(
            ("terminal|" + executionId + "|" + metadata.get("attempt_id"))
                .getBytes(StandardCharsets.UTF_8)));
    metadata.put("occurred_at", Timestamp.from(now()));
    metadata.put("terminal_error_code", plannedErrorCode);
    var oldEnded = (Timestamp) metadata.remove("retained_ended_at");
    metadata.put("terminal_ended_at", oldEnded != null ? oldEnded : Timestamp.from(plannedEndedAt));
    metadata.put("no_read_ids", expected.path("noReadIds").toString());
    metadata.put("possible_read_ids", expected.path("possibleReadIds").toString());
    named.update(
        ("INSERT INTO studio_observed_terminal_secret_settlements(id,occurred_at,e"
            + "xecution_id,execution_accepted_at,attempt_id,revision_id,revision_digest"
            + ",binding_digest,scope_hash,principal_id,csi_id,environment,test_id,termi"
            + "nal_error_code,terminal_ended_at,no_read_ids,possible_read_ids) VALUES "
            + "(:id,:occurred_at,:execution_id,:execution_accepted_at,:attempt_id,:revi"
            + "sion_id,:revision_digest,:binding_digest,:scope_hash,:principal_id,:csi_"
            + "id,:environment,:test_id,:terminal_error_code,:terminal_ended_at,CAST(:n"
            + "o_read_ids AS jsonb),CAST(:possible_read_ids AS jsonb))"),
        metadata);
    for (String field : List.of("noReadIds", "possibleReadIds")) {
      for (JsonNode id : expected.path(field)) {
        String secret = id.asText();
        UsageOutcome usage =
            field.equals("noReadIds") ? UsageOutcome.NOT_USED : UsageOutcome.UNKNOWN_OUTCOME;
        Scope scope =
            new Scope(
                Path.OBSERVED_REPLAY,
                executionId,
                null,
                null,
                (String) metadata.get("principal_id"),
                (String) metadata.get("csi_id"),
                (String) metadata.get("environment"),
                (UUID) metadata.get("test_id"),
                secret,
                metadata.get("attempt_id").toString(),
                null,
                null,
                null,
                null);
        Instant at = ((Timestamp) metadata.get("occurred_at")).toInstant();
        append(
            scope,
            row(
                scope,
                identity(
                    usage == UsageOutcome.NOT_USED ? "unattempted" : "terminal-uncertain",
                    scope,
                    null),
                at,
                at,
                "USAGE",
                null,
                null,
                null,
                null,
                null,
                usage));
      }
    }
    return true;
  }

  private Map<String, Object> observedMetadata(JsonNode binding, String leaseOwner) {
    requireTransaction();
    bounded(leaseOwner, 256);
    if (binding == null || !binding.isObject()) {
      throw invalid();
    }
    final UUID execution;
    final Instant accepted;
    final UUID attempt;
    try {
      execution = UUID.fromString(binding.path("executionId").asText());
      accepted = Instant.parse(binding.path("startedAt").asText());
      attempt = UUID.fromString(binding.path("attemptId").asText());
    } catch (RuntimeException invalidIdentity) {
      throw invalid();
    }
    var rows =
        jdbc.queryForList(
            ("SELECT l.execution_id,l.execution_accepted_at,e.observed_revision_bindin"
                + "g::text AS accepted_binding,CAST(e.observed_revision_binding->>'attemptI"
                + "d' AS uuid) AS attempt_id,e.revision_id,e.observed_revision_binding->>'r"
                + "evisionDigest' AS revision_digest,studio_publication_hash(e.observed_rev"
                + "ision_binding) AS binding_digest,e.observed_revision_binding->>'scopeHas"
                + "h' AS scope_hash,l.principal AS "
                + "principal_id,l.csi_id,e.environment,l.test_id,l.lease_owner FROM "
                + "studio_dispatch_ledger l JOIN ui_test_executions e ON "
                + "e.id=l.execution_id AND e.started_at=l.execution_accepted_at WHERE "
                + "l.execution_id=? AND l.execution_accepted_at=? AND l.state='CLAIMED' AND "
                + "l.lease_owner=? AND l.lease_expires_at>clock_timestamp() AND "
                + "l.attempt_id IS NULL AND l.admission_id IS NULL AND "
                + "e.observed_admission_receipt IS NULL AND "
                + "e.observed_revision_binding->>'attemptId'=? FOR UPDATE OF l,e"),
            execution,
            Timestamp.from(accepted),
            leaseOwner,
            attempt.toString());
    if (rows.size() != 1) {
      throw invalid();
    }
    if (Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM studio_observed_terminal_secret_settlements WHERE"
                + " execution_id=?)",
            Boolean.class,
            execution))) {
      throw invalid();
    }
    var result = new LinkedHashMap<>(rows.getFirst());
    if (!binding.equals(new GuidedContracts().parse((String) result.remove("accepted_binding")))) {
      throw invalid();
    }
    return result;
  }

  private Map<String, Object> append(Scope scope, Map<String, Object> row) {
    requireTransaction();
    // Match the raw SQL guard: owner row, owner advisory, then event advisory.
    if (scope.path() == Path.GUIDED) {
      jdbc.queryForObject(
          "SELECT session_id FROM studio_guided_sessions WHERE session_id=? FOR UPDATE",
          String.class,
          scope.sessionId());
    } else {
      jdbc.queryForObject(
          "SELECT execution_id FROM studio_dispatch_ledger WHERE execution_id=? FOR UPDATE",
          UUID.class,
          scope.executionId());
    }
    String owner =
        "studio-secret-audit-owner:"
            + scope.path()
            + ":"
            + (scope.sessionId() != null ? scope.sessionId() : scope.executionId());
    jdbc.query(
        "SELECT pg_advisory_xact_lock(hashtextextended(?,0))",
        rs -> {
          // Advisory lock acquisition intentionally has no row projection.
        },
        owner);
    jdbc.query(
        "SELECT pg_advisory_xact_lock(hashtextextended(?,0))",
        rs -> {
          // Advisory lock acquisition intentionally has no row projection.
        },
        "studio-secret-audit-id:" + row.get("id"));
    List<Map<String, Object>> existing =
        jdbc.queryForList(
            "SELECT " + String.join(",", COLUMNS) + " FROM studio_secret_use_audit WHERE id=?",
            row.get("id"));
    if (!existing.isEmpty()) {
      Map<String, Object> stored = existing.getFirst();
      for (String column : COLUMNS) {
        if (column.equals("occurred_at")
            || column.equals("release_occurred_at") && row.get("release_id") == null) {
          continue;
        }
        if (column.equals("release_occurred_at") && "DISPATCH".equals(row.get("decision_stage"))) {
          continue;
        }
        if (column.equals("usage_outcome")
            && ("UNKNOWN_OUTCOME".equals(row.get(column)) || "ACK_LOST".equals(row.get(column)))
            && stored.get(column) != null
            && List.of(
                    "USED",
                    "NOT_USED",
                    "REFUSED",
                    "OK",
                    "ASSERTION_FAILED",
                    "TARGET_CHANGED",
                    "POLICY_DENIED",
                    "TIMEOUT",
                    "CANCELLED")
                .contains(stored.get(column))) {
          continue;
        }
        if (!Objects.equals(stored.get(column), row.get(column))) {
          throw new IllegalStateException("Conflicting secret audit event");
        }
      }
      return stored;
    }
    named.update(
        "INSERT INTO studio_secret_use_audit ("
            + String.join(",", COLUMNS)
            + ") VALUES ("
            + String.join(",", COLUMNS.stream().map(c -> ":" + c).toList())
            + ")",
        row);
    return row;
  }

  private static Map<String, Object> row(
      Scope s,
      UUID id,
      Instant occurred,
      Instant lifecycle,
      String kind,
      UUID release,
      UUID affected,
      String stage,
      String version,
      ResolutionOutcome outcome,
      UsageOutcome usage) {
    Map<String, Object> r = new LinkedHashMap<>();
    r.put("id", id);
    r.put("occurred_at", Timestamp.from(occurred));
    r.put("release_occurred_at", Timestamp.from(lifecycle));
    r.put("path", s.path().name());
    r.put("row_kind", kind);
    r.put("release_id", release);
    r.put("affected_release_id", affected);
    r.put("decision_stage", stage);
    r.put("attempt_id", s.attemptId());
    r.put("release_seq", s.releaseSeq());
    r.put("execution_id", s.executionId());
    r.put("session_id", s.sessionId());
    r.put("admission_id", s.admissionId());
    r.put("principal_id", s.principalId());
    r.put("csi_id", s.csiId());
    r.put("environment", s.environment());
    r.put("test_id", s.testId());
    r.put("secret_id", s.secretId());
    r.put("vault_version", version);
    r.put("coordinate_step_id", s.coordinateStepId());
    r.put("coordinate_ordinal", s.coordinateOrdinal());
    r.put("source_reference_id", s.sourceReferenceId());
    r.put("outcome", outcome == null ? null : outcome.name());
    r.put("usage_outcome", usage == null ? null : usage.name());
    return r;
  }

  private Instant now() {
    return clock.instant().truncatedTo(ChronoUnit.MICROS);
  }

  private static UUID identity(String event, Scope s, UUID release) {
    String text =
        event
            + "|"
            + s.path()
            + "|"
            + s.executionId()
            + "|"
            + s.sessionId()
            + "|"
            + s.attemptId()
            + "|"
            + s.secretId()
            + "|"
            + s.coordinateStepId()
            + "|"
            + s.coordinateOrdinal()
            + "|"
            + s.releaseSeq()
            + (event.equals("unreached") ? "|" + s.sourceReferenceId() : "")
            + "|"
            + release;
    return UUID.nameUUIDFromBytes(text.getBytes(StandardCharsets.UTF_8));
  }

  private static void requireTransaction() {
    if (!TransactionSynchronizationManager.isActualTransactionActive()) {
      throw new IllegalStateException("Secret audit requires the dispatch transaction");
    }
  }

  private static void bounded(String value, int bound) {
    if (value == null || value.isBlank() || value.length() > bound) {
      throw invalid();
    }
  }

  private static IllegalArgumentException invalid() {
    return new IllegalArgumentException("Invalid secret audit metadata");
  }
}
