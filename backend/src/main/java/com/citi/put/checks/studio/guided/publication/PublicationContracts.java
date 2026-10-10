package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/** Defensive values shared by the publication writer, independent evidence reader and API. */
public final class PublicationContracts {
  public static final int MAX_ARTIFACT_BYTES = 1_048_576;
  public static final int MAX_BASIS_BYTES = 6_291_456;
  public static final int MAX_VALIDATION_BYTES = 8_388_608;
  public static final int MAX_JOB_BYTES = 4_194_304;
  public static final int MAX_RECEIPT_BYTES = 32_768;

  private PublicationContracts() {}

  /** New observed-family times have one exact millisecond identity in JSON and PostgreSQL. */
  public static Instant millisecond(Instant instant) {
    return Objects.requireNonNull(instant).truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
  }

  public static String time(Instant instant) {
    return new java.time.format.DateTimeFormatterBuilder()
        .appendInstant(3)
        .toFormatter()
        .format(millisecond(instant));
  }

  /** Internal JSON is copied on entry and exit; no repository row is mutable through a record. */
  public static ObjectNode copy(JsonNode value) {
    require(value != null && value.isObject(), "INVALID_CONTRACT", 422);
    GuidedContracts.canonical(value);
    return ((ObjectNode) value).deepCopy();
  }

  public static ObjectNode bounded(JsonNode value, int maximumBytes) {
    ObjectNode result = copy(value);
    require(
        result.toString().getBytes(StandardCharsets.UTF_8).length <= maximumBytes,
        "BUDGET_EXCEEDED",
        413);
    return result;
  }

  public record Base(JsonNode document) {
    public Base {
      document = bounded(document, MAX_ARTIFACT_BYTES);
    }

    @Override
    public JsonNode document() {
      return copy(document);
    }
  }

  /** Locked current ui_tests fields; contains no resolved variable/account values. */
  public record CurrentSource(JsonNode document) {
    public CurrentSource {
      document = bounded(document, MAX_ARTIFACT_BYTES);
    }

    @Override
    public JsonNode document() {
      return copy(document);
    }
  }

  /** Original independent database facts, before any guard/recipe/IR construction. */
  public record Evidence(JsonNode document) {
    public Evidence {
      document = bounded(document, MAX_BASIS_BYTES);
    }

    @Override
    public JsonNode document() {
      return copy(document);
    }
  }

  public record Snapshot(JsonNode identity, JsonNode basis) {
    public Snapshot {
      identity = bounded(identity, 65_536);
      basis = bounded(basis, MAX_BASIS_BYTES);
    }

    @Override
    public JsonNode identity() {
      return copy(identity);
    }

    @Override
    public JsonNode basis() {
      return copy(basis);
    }

    public String hash() {
      return GuidedContracts.hash(identity);
    }
  }

  public record Candidate(
      JsonNode learnedPlan, JsonNode artifact, JsonNode policy, JsonNode hashes) {
    public Candidate {
      learnedPlan = bounded(learnedPlan, MAX_ARTIFACT_BYTES);
      artifact = bounded(artifact, MAX_ARTIFACT_BYTES);
      policy = bounded(policy, 524_288);
      hashes = bounded(hashes, 8_192);
    }

    @Override
    public JsonNode learnedPlan() {
      return copy(learnedPlan);
    }

    @Override
    public JsonNode artifact() {
      return copy(artifact);
    }

    @Override
    public JsonNode policy() {
      return copy(policy);
    }

    @Override
    public JsonNode hashes() {
      return copy(hashes);
    }
  }

  public enum AttemptStatus {
    RESERVED,
    VALIDATING,
    VALIDATED,
    REJECTED,
    SUPERSEDED,
    UNKNOWN
  }

  public record Claim(
      String sessionId, String finalizeKey, String finalizeDigest, Snapshot snapshot) {
    public Claim {
      Objects.requireNonNull(sessionId);
      Objects.requireNonNull(finalizeKey);
      Objects.requireNonNull(finalizeDigest);
      Objects.requireNonNull(snapshot);
    }
  }

  public record Attempt(
      String sessionId,
      UUID attemptId,
      UUID claimId,
      int number,
      AttemptStatus status,
      Instant validationDeadline,
      JsonNode identity,
      JsonNode verdict,
      String failureCode) {
    public Attempt {
      Objects.requireNonNull(sessionId);
      Objects.requireNonNull(attemptId);
      Objects.requireNonNull(claimId);
      Objects.requireNonNull(status);
      Objects.requireNonNull(validationDeadline);
      require(number >= 1 && number <= 3, "INVALID_CONTRACT", 422);
      identity = bounded(identity, 65_536);
      verdict = verdict == null || verdict.isNull() ? null : bounded(verdict, 65_536);
    }

    @Override
    public JsonNode identity() {
      return copy(identity);
    }

    @Override
    public JsonNode verdict() {
      return verdict == null ? null : copy(verdict);
    }
  }

  /** In-memory result of an actual fresh Core check; contains no cookie or credential. */
  public record Grant(
      String sessionId, String principalId, String csiId, String snapshotHash, Instant expiresAt) {
    public Grant {
      Objects.requireNonNull(sessionId);
      Objects.requireNonNull(principalId);
      Objects.requireNonNull(csiId);
      Objects.requireNonNull(snapshotHash);
      Objects.requireNonNull(expiresAt);
    }
  }

  public record Commit(
      String sessionId,
      UUID revisionId,
      UUID attemptId,
      UUID claimId,
      String finalizeKey,
      String finalizeDigest,
      Snapshot snapshot,
      Candidate candidate,
      Grant grant) {
    public Commit {
      Objects.requireNonNull(sessionId);
      Objects.requireNonNull(revisionId);
      Objects.requireNonNull(attemptId);
      Objects.requireNonNull(claimId);
      Objects.requireNonNull(finalizeKey);
      Objects.requireNonNull(finalizeDigest);
      Objects.requireNonNull(snapshot);
      Objects.requireNonNull(candidate);
      Objects.requireNonNull(grant);
    }
  }

  /** Internal receipt metadata plus its closed publicReceipt; not directly serialized publicly. */
  public record Receipt(JsonNode document) {
    public Receipt {
      document = bounded(document, MAX_ARTIFACT_BYTES * 2);
    }

    @Override
    public JsonNode document() {
      return copy(document);
    }
  }
}
