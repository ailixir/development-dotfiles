package com.citi.put.checks.studio.recovery;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.dto.ExecutionStatus;
import com.citi.put.checks.studio.dto.VideoEvidence;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Finalization reconciliation (AC-31, §5.3, §6.2).
 *
 * <p>A delivery can be lost; the manifest cannot. Before either reaper writes a timeout verdict it
 * reads the terminal manifest at the <b>deterministic key the API derives from immutable execution
 * identity</b> — never a runner-supplied key, never a bucket listing, never a durable callback URL
 * — and, if it is there, applies the real outcome instead. That is the difference between a run
 * that reports {@code STALE} because delivery failed and one that reports what actually happened.
 *
 * <p>The rule is asymmetric on purpose and the asymmetry is in the statement, not in the ordering:
 * a manifest found <b>before</b> finalization wins, because {@link
 * StudioDispatchLedgerStatements#applyReconciledOutcome} requires the history row to be
 * un-finalized; a manifest arriving <b>after</b> finalization matches nothing, is recorded for
 * investigation, changes no history and triggers no run.
 */
@Component
public class FinalizationReconciler {

  private static final Logger LOGGER = LoggerFactory.getLogger(FinalizationReconciler.class);

  private final StudioDispatchLedgerStatements statements;
  private final ResultManifestStore manifests;
  private final StudioExecutionProperties properties;
  private final Clock clock;

  @Autowired
  public FinalizationReconciler(
      StudioDispatchLedgerStatements statements,
      ResultManifestStore manifests,
      StudioExecutionProperties properties) {
    this(statements, manifests, properties, Clock.systemUTC());
  }

  FinalizationReconciler(
      StudioDispatchLedgerStatements statements,
      ResultManifestStore manifests,
      StudioExecutionProperties properties,
      Clock clock) {
    this.statements = statements;
    this.manifests = manifests;
    this.properties = properties;
    this.clock = clock;
  }

  /**
   * Attempts reconciliation for one execution.
   *
   * @return true when a real outcome was applied in place of a timeout verdict
   */
  @Transactional
  public boolean reconcile(UUID executionId) {
    Optional<Map<String, Object>> found = statements.find(executionId);
    if (found.isEmpty()) {
      return false;
    }
    Map<String, Object> row = found.get();
    Object attemptId = row.get("attempt_id");
    if (attemptId == null) {
      // No attempt was ever issued, so no runner can have written a manifest for this row.
      return false;
    }

    ResultManifestStore.ExecutionIdentity identity =
        new ResultManifestStore.ExecutionIdentity(
            String.valueOf(row.get("csi_id")),
            (UUID) row.get("test_id"),
            executionId,
            UUID.fromString(attemptId.toString()));
    String key = ManifestKeys.manifestKey(identity);

    Optional<ResultManifest> manifest;
    try {
      manifest = manifests.read(key);
    } catch (RuntimeException e) {
      // An unreachable store is not an absent key. Refusing to conclude anything is the only
      // honest answer: concluding "no manifest" here would convert an outage into a STALE verdict.
      LOGGER.warn(
          "Studio manifest store unreachable while reconciling execution {}; no verdict written",
          executionId);
      return false;
    }
    if (manifest.isEmpty()) {
      return false;
    }

    ResultManifest result = manifest.get();
    Instant endedAt = result.endedAt() == null ? clock.instant() : result.endedAt();
    String videoStatus = videoStatus(result);
    Instant videoExpiresAt =
        VideoEvidence.AVAILABLE.equals(videoStatus)
            ? clock.instant().plus(properties.evidenceRetentionOrDefault())
            : null;

    int applied =
        statements.applyReconciledOutcome(
            executionId,
            normalizedOutcome(result),
            // A manifest-supplied runner code is recorded, never copied into error_code (AC-16).
            null,
            endedAt,
            result.videoKey() == null ? ManifestKeys.videoKey(identity) : result.videoKey(),
            videoStatus,
            videoExpiresAt);

    if (applied == 1) {
      LOGGER.info(
          "Studio execution {} reconciled from its terminal manifest at the derived key; the real "
              + "outcome replaced a timeout verdict",
          executionId);
      return true;
    }

    // Already finalized. §5.3: recorded for investigation; it cannot silently change history or
    // trigger a new run.
    LOGGER.warn(
        "Studio terminal manifest for execution {} arrived after finalization and was recorded for "
            + "investigation only; history unchanged and no run dispatched",
        executionId);
    return false;
  }

  private static String normalizedOutcome(ResultManifest result) {
    String outcome = result.outcome();
    if (ExecutionStatus.isTerminal(outcome)) {
      return outcome;
    }
    return ExecutionStatus.ERROR;
  }

  /** The runner reports storage; the API reports availability (§6.1). */
  private static String videoStatus(ResultManifest result) {
    if (result.evidenceState() == null) {
      return VideoEvidence.UNAVAILABLE;
    }
    return switch (result.evidenceState()) {
      case "STORED" -> VideoEvidence.AVAILABLE;
      case "FAILED" -> VideoEvidence.FAILED;
      case "PENDING" -> VideoEvidence.PROCESSING;
      default -> VideoEvidence.UNAVAILABLE;
    };
  }

  @SuppressWarnings("unused")
  private static Instant instant(Object value) {
    return value instanceof Timestamp timestamp ? timestamp.toInstant() : null;
  }
}
