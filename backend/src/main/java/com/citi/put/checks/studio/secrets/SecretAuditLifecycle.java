package com.citi.put.checks.studio.secrets;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Joins safe source/admission/execution facts to append-only audit events in caller transactions.
 */
@Component
public final class SecretAuditLifecycle {
  private final JdbcTemplate jdbc;
  private final SecretUseAuditRecorder audit;

  public SecretAuditLifecycle(JdbcTemplate jdbc, SecretUseAuditRecorder audit) {
    this.jdbc = jdbc;
    this.audit = audit;
  }

  public SecretUseAuditRecorder.Release guidedRelease(
      JsonNode session,
      JsonNode action,
      String secretId,
      String version,
      SecretUseAuditRecorder.ResolutionOutcome outcome) {
    JsonNode scope = session.path("scope"), coordinate = action.path("coordinate");
    String id = session.path("sessionId").asText();
    long sequence = nextSequence("session_id", id, secretId, coordinate.path("stepId").asText());
    var identity =
        new SecretUseAuditRecorder.Scope(
            SecretUseAuditRecorder.Path.GUIDED,
            null,
            id,
            action.path("admission").path("admissionId").asText(),
            scope.path("principalId").asText(),
            scope.path("csiId").asText(),
            scope.path("environmentId").asText(),
            UUID.fromString(session.path("testId").asText()),
            secretId,
            id + ":" + action.path("ownerFence").asText(),
            sequence,
            coordinate.path("stepId").asText(),
            coordinate.path("ordinal").asInt(),
            guidedReferenceId(
                id,
                action.path("admission").path("admissionId").asText(),
                secretId,
                coordinate.path("stepId").asText()));
    return audit.recordRelease(identity, version, outcome);
  }

  public void guidedOutcome(JsonNode session, JsonNode action) {
    for (var row :
        jdbc.queryForList(
            ("SELECT * FROM studio_secret_use_audit WHERE session_id=? AND admission_id=? AND decis"
                + "ion_stage='DISPATCH'"),
            session.path("sessionId").asText(),
            action.path("admission").path("admissionId").asText())) {
      String code = action.path("outcomeCode").asText();
      audit.recordUsage(
          release(row),
          code.equals("OK")
              ? SecretUseAuditRecorder.UsageOutcome.USED
              : SecretUseAuditRecorder.UsageOutcome.UNKNOWN_OUTCOME);
    }
  }

  public void guidedTerminal(JsonNode session) {
    String id = session.path("sessionId").asText();
    for (var row :
        jdbc.queryForList(
            ("SELECT a.*,g.document::text AS action FROM studio_secret_use_audit a JOIN studio_guid"
                + "ed_actions g ON g.session_id=a.session_id AND g.admission_id=a.admission_id WHERE a.s"
                + "ession_id=? AND a.decision_stage='DISPATCH' AND NOT EXISTS(SELECT 1 FROM studio_secre"
                + "t_use_audit u WHERE u.release_id=a.id AND u.row_kind='USAGE')"),
            id)) {
      JsonNode action = new GuidedContracts().parse((String) row.get("action"));
      String code = action.path("outcomeCode").asText();
      SecretUseAuditRecorder.UsageOutcome usage =
          code.equals("OK")
              ? SecretUseAuditRecorder.UsageOutcome.USED
              : SecretUseAuditRecorder.UsageOutcome.UNKNOWN_OUTCOME;
      audit.recordUsage(release(row), usage);
    }
    var manifests =
        jdbc.queryForList(
            "SELECT manifest::text FROM studio_guided_source_manifests WHERE session_id=?",
            String.class,
            id);
    if (manifests.isEmpty()) {
      return;
    }
    JsonNode scope = session.path("scope");
    JsonNode manifest = new GuidedContracts().parse(manifests.getFirst());
    var consumed =
        jdbc.queryForList(
            ("SELECT g.document::text AS action,g.proposal::text AS proposal,m.authored_inputs::tex"
                + "t AS inputs FROM studio_guided_actions g JOIN studio_guided_materialization_snapshots m ON m.s"
                + "ession_id=g.session_id AND m.context_revision=(g.document->>'contextRevision')::integer"
                + " AND m.authored_inputs_hash=g.document->>'authoredInputsHash' WHERE g.session_id=? AND"
                + " (g.document->>'dispatchCount')::integ"
                + "er=1 AND g.proposal->'operation'->>'kind'='fill' AND g.proposal->'operation'->'value'"
                + "->>'kind'='secretRef'"),
            id);
    for (JsonNode reference : manifest.path("configurationReferences")) {
      if (!reference.path("kind").asText().equals("secretRef")) {
        continue;
      }
      String secret = reference.path("referenceName").asText();
      String step = reference.path("stepId").asText();
      String referenceId = reference.path("referenceId").asText();
      if (referenceId.isBlank()) {
        throw new IllegalStateException("Missing source reference identity");
      }
      var matching = new java.util.ArrayList<JsonNode>();
      for (var admission : consumed) {
        JsonNode proposal = new GuidedContracts().parse((String) admission.get("proposal"));
        JsonNode action = new GuidedContracts().parse((String) admission.get("action"));
        for (JsonNode input :
            new GuidedContracts().parse((String) admission.get("inputs")).path("inputs")) {
          if (input
                  .path("inputId")
                  .equals(proposal.path("operation").path("value").path("sourceInputId"))
              && input.path("kind").asText().equals("secretRef")
              && input.path("secretId").asText().equals(secret)
              && input.path("sourceStepId").asText().equals(step)
              && input.path("intendedSlot").asText().equals("fill.value")
              && input.path("provenance").path("referenceId").asText().equals(referenceId)
              && action.path("coordinate").path("stepId").asText().equals(step)) {
            matching.add(action);
          }
        }
      }
      if (matching.isEmpty()) {
        Integer summaries =
            jdbc.queryForObject(
                ("SELECT count(*) FROM studio_secret_use_audit WHERE session_id=? AND source_reference_"
                    + "id=? AND row_kind='USAGE'"),
                Integer.class,
                id,
                referenceId);
        if (summaries != null && summaries > 0) {
          continue;
        }
        audit.recordUnreachedGuided(
            new SecretUseAuditRecorder.Scope(
                SecretUseAuditRecorder.Path.GUIDED,
                null,
                id,
                null,
                scope.path("principalId").asText(),
                scope.path("csiId").asText(),
                scope.path("environmentId").asText(),
                UUID.fromString(session.path("testId").asText()),
                secret,
                id + ":" + session.path("owner").path("fence").asText(),
                null,
                step,
                null,
                referenceId));
      } else {
        for (JsonNode actual : matching) {
          String admissionId = actual.path("admission").path("admissionId").asText();
          Integer existing =
              jdbc.queryForObject(
                  ("SELECT count(*) FROM studio_secret_use_audit WHERE session_id=? AND admission_id=? AN"
                      + "D row_kind='USAGE'"),
                  Integer.class,
                  id,
                  admissionId);
          if (existing != null && existing > 0) {
            continue;
          }
          audit.recordConsumedNoDecision(
              new SecretUseAuditRecorder.Scope(
                  SecretUseAuditRecorder.Path.GUIDED,
                  null,
                  id,
                  admissionId,
                  scope.path("principalId").asText(),
                  scope.path("csiId").asText(),
                  scope.path("environmentId").asText(),
                  UUID.fromString(session.path("testId").asText()),
                  secret,
                  id + ":" + actual.path("ownerFence").asText(),
                  null,
                  actual.path("coordinate").path("stepId").asText(),
                  actual.path("coordinate").path("ordinal").asInt(),
                  referenceId),
              SecretUseAuditRecorder.UsageOutcome.UNKNOWN_OUTCOME);
        }
      }
    }
  }

  private String guidedReferenceId(
      String sessionId, String admissionId, String secretId, String stepId) {
    var rows =
        jdbc.queryForList(
            ("SELECT g.proposal::text AS proposal,m.authored_inputs::text AS inputs FROM studio_gui"
                + "ded_actions g JOIN studio_guided_materialization_snapshots m ON m.session_id=g.session_id"
                + " AND m.context_revision=(g.document->>'contextRevision')::integer"
                + " AND m.authored_inputs_hash=g.document->>'authoredInputsHash' WHER"
                + "E g.session_id=? AND g.admission_id=?"),
            sessionId,
            admissionId);
    var ids = new java.util.HashSet<String>();
    for (var row : rows) {
      JsonNode proposal = new GuidedContracts().parse((String) row.get("proposal"));
      for (JsonNode input :
          new GuidedContracts().parse((String) row.get("inputs")).path("inputs")) {
        if (input
                .path("inputId")
                .equals(proposal.path("operation").path("value").path("sourceInputId"))
            && input.path("kind").asText().equals("secretRef")
            && input.path("secretId").asText().equals(secretId)
            && input.path("sourceStepId").asText().equals(stepId)
            && input.path("intendedSlot").asText().equals("fill.value")) {
          ids.add(input.path("provenance").path("referenceId").asText());
        }
      }
    }
    if (ids.size() != 1 || ids.contains("")) {
      throw new IllegalStateException("Missing consumed source reference identity");
    }
    return ids.iterator().next();
  }

  /** Only backend decisions made before a secret frame can enter transport may use this path. */
  public void guidedNoSend(JsonNode session, JsonNode action) {
    for (var row :
        jdbc.queryForList(
            ("SELECT * FROM studio_secret_use_audit WHERE session_id=? AND admission_id=? AND decis"
                + "ion_stage='DISPATCH'"),
            session.path("sessionId").asText(),
            action.path("admission").path("admissionId").asText())) {
      audit.recordUsage(release(row), SecretUseAuditRecorder.UsageOutcome.REFUSED);
    }
  }

  public boolean replayTerminalSettlement(
      UUID execution, String plannedErrorCode, java.time.Instant plannedEndedAt) {
    return audit.recordObservedTerminalSettlement(execution, plannedErrorCode, plannedEndedAt);
  }

  public void replayReadEntry(JsonNode binding, String leaseOwner, String secretId) {
    audit.recordObservedReadEntry(binding, leaseOwner, secretId);
  }

  public void replayNoSendDecision(
      JsonNode binding,
      String leaseOwner,
      java.util.Set<String> notEntered,
      SecretUseAuditRecorder.NoSendDisposition disposition) {
    var proven = new java.util.LinkedHashSet<>(notEntered);
    proven.removeAll(
        jdbc.queryForList(
            "SELECT secret_id FROM studio_observed_secret_read_entries WHERE execution_id=? AND attempt_id=?",
            String.class,
            UUID.fromString(binding.path("executionId").asText()),
            UUID.fromString(binding.path("attemptId").asText())));
    audit.recordObservedNoSend(binding, leaseOwner, proven, disposition);
  }

  /** An authoritative terminal owner cannot infer effects from an absent child report. */
  public void replayOwnerTerminal(UUID execution) {
    replayDecision(execution, null, SecretUseAuditRecorder.UsageOutcome.UNKNOWN_OUTCOME);
  }

  /** Called only with actual failed resolution or an authoritative runner no-admission refusal. */
  public void replayNoSend(UUID execution, UUID attempt) {
    replayDecision(execution, attempt, SecretUseAuditRecorder.UsageOutcome.REFUSED);
  }

  private void replayDecision(
      UUID execution, UUID attempt, SecretUseAuditRecorder.UsageOutcome usage) {
    for (var row :
        jdbc.queryForList(
            ("SELECT a.* FROM studio_secret_use_audit a WHERE a.execution_id=? AND (?::text IS NULL"
                + " OR a.attempt_id=?::text) AND a.decision_stage='DISPATCH' AND NOT EXISTS (SELECT 1 FR"
                + "OM studio_secret_use_audit u WHERE u.release_id=a.id AND u.row_kind='USAGE')"),
            execution,
            attempt == null ? null : attempt.toString(),
            attempt == null ? null : attempt.toString())) {
      audit.recordUsage(release(row), usage);
    }
  }

  public void replayRelease(
      JsonNode binding,
      List<String> ids,
      Map<String, String> versions,
      SecretUseAuditRecorder.ResolutionOutcome outcome) {
    UUID execution = UUID.fromString(binding.path("executionId").asText());
    for (String id : ids) {
      audit.recordRelease(
          new SecretUseAuditRecorder.Scope(
              SecretUseAuditRecorder.Path.OBSERVED_REPLAY,
              execution,
              null,
              null,
              binding.path("principalId").asText(),
              binding.path("csiId").asText(),
              binding.path("environment").asText(),
              UUID.fromString(binding.path("testId").asText()),
              id,
              binding.path("attemptId").asText(),
              nextSequence("execution_id", execution, id, null),
              null,
              null),
          versions.get(id),
          outcome);
    }
  }

  public void replayKnownUses(UUID execution, UUID attempt, Map<String, String> usage) {
    if (usage.isEmpty()) {
      return;
    }
    if (usage.values().stream().anyMatch(value -> !"USED".equals(value))) {
      throw new IllegalArgumentException("Invalid positive secret usage report");
    }
    var releases =
        jdbc.queryForList(
            ("SELECT * FROM studio_secret_use_audit WHERE execution_id=? AND attempt_id=? AND decis"
                + "ion_stage='DISPATCH' AND outcome='RESOLVED'"),
            execution,
            attempt.toString());
    var available = new java.util.HashSet<String>();
    releases.forEach(row -> available.add((String) row.get("secret_id")));
    if (!available.containsAll(usage.keySet())) {
      throw new IllegalArgumentException("Missing scoped resolved secret release");
    }
    for (var row : releases) {
      if (usage.containsKey((String) row.get("secret_id"))) {
        audit.recordUsage(release(row), SecretUseAuditRecorder.UsageOutcome.USED);
      }
    }
  }

  public void replayTerminal(UUID execution, UUID attempt, Map<String, String> usage) {
    var rows =
        jdbc.queryForList(
            ("SELECT * FROM studio_secret_use_audit WHERE execution_id=? AND attempt_id=? AND decis"
                + "ion_stage='DISPATCH'"),
            execution,
            attempt.toString());
    var declared = new java.util.HashSet<String>();
    rows.forEach(row -> declared.add((String) row.get("secret_id")));
    if (!declared.containsAll(usage.keySet())) {
      throw new IllegalArgumentException("Invalid secret usage report");
    }
    for (var row : rows) {
      audit.recordUsage(
          release(row),
          usage.containsKey((String) row.get("secret_id"))
              ? SecretUseAuditRecorder.UsageOutcome.valueOf(
                  usage.get((String) row.get("secret_id")))
              : SecretUseAuditRecorder.UsageOutcome.UNKNOWN_OUTCOME);
    }
  }

  private long nextSequence(String ownerColumn, Object id, String secret, String step) {
    Long count =
        jdbc.queryForObject(
            "SELECT COALESCE(max(release_seq),0)+1 FROM studio_secret_use_audit WHERE "
                + ownerColumn
                + "=? AND secret_id=? AND coordinate_step_id IS NOT DISTINCT FROM ? AND decision_stage='DISPATCH'",
            Long.class,
            id,
            secret,
            step);
    return count == null ? 1 : count;
  }

  public static SecretUseAuditRecorder.Release release(Map<String, Object> row) {
    var scope =
        new SecretUseAuditRecorder.Scope(
            SecretUseAuditRecorder.Path.valueOf((String) row.get("path")),
            (UUID) row.get("execution_id"),
            (String) row.get("session_id"),
            (String) row.get("admission_id"),
            (String) row.get("principal_id"),
            (String) row.get("csi_id"),
            (String) row.get("environment"),
            (UUID) row.get("test_id"),
            (String) row.get("secret_id"),
            (String) row.get("attempt_id"),
            ((Number) row.get("release_seq")).longValue(),
            (String) row.get("coordinate_step_id"),
            (Integer) row.get("coordinate_ordinal"),
            (String) row.get("source_reference_id"));
    return new SecretUseAuditRecorder.Release(
        (UUID) row.get("id"),
        ((Timestamp) row.get("release_occurred_at")).toInstant(),
        scope,
        (String) row.get("vault_version"),
        SecretUseAuditRecorder.ResolutionOutcome.valueOf((String) row.get("outcome")));
  }
}
