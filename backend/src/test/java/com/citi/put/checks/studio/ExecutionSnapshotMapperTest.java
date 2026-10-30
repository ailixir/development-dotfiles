package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.dto.ReplayFailure;
import com.citi.put.checks.studio.dto.StepResult;
import com.citi.put.checks.studio.dto.VideoEvidence;
import com.citi.put.checks.studio.entity.UITestExecution;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * Story 10.1 AC-3 / AC-11 — one snapshot shape, and legacy rows that do not pretend to be more than
 * they are.
 */
class ExecutionSnapshotMapperTest {

  private static final Instant NOW = Instant.parse("2026-09-10T12:00:00Z");
  private static final String CSI_ID = "60400";

  private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());
  private final ExecutionSnapshotMapper mapper =
      new ExecutionSnapshotMapper(objectMapper, Clock.fixed(NOW, ZoneOffset.UTC));

  @Test
  void anAcceptedRunHasNoBrowserStartNoEndAndNoDuration() {
    UITestExecution execution = accepted();

    ExecutionSnapshotDto snapshot = mapper.toSnapshot(execution);

    assertThat(snapshot.status()).isEqualTo("PENDING");
    assertThat(snapshot.acceptedAt()).isEqualTo(NOW.minusSeconds(60));
    assertThat(snapshot.startedAt()).isNull();
    assertThat(snapshot.endedAt()).isNull();
    assertThat(snapshot.durationMs()).isNull();
    assertThat(snapshot.stepResults()).isEmpty();
    assertThat(snapshot.logs()).isEmpty();
    assertThat(snapshot.video().status()).isEqualTo(VideoEvidence.PROCESSING);
    assertThat(snapshot.videoPath()).isNull();
    assertThat(snapshot.streamComplete()).isFalse();
  }

  @Test
  void anAfterLearnProofCarriesItsTriggerSourceAndNoSchedule() {
    UITestExecution execution = accepted();
    execution.setTriggerSource("AFTER_LEARN");

    ExecutionSnapshotDto snapshot = mapper.toSnapshot(execution);

    assertThat(snapshot.triggerSource()).isEqualTo("AFTER_LEARN");
    assertThat(snapshot.scheduleId()).isNull();
    assertThat(snapshot.scheduledAt()).isNull();
  }

  @Test
  void acceptedAtIsThePartitionKeyAndStartedAtIsTheBrowserStart() {
    UITestExecution execution = accepted();
    Instant browserStart = NOW.minusSeconds(50);
    execution.setBrowserStartedAt(browserStart);
    execution.setStatus("RUNNING");

    ExecutionSnapshotDto snapshot = mapper.toSnapshot(execution);

    assertThat(snapshot.acceptedAt()).isEqualTo(execution.getStartedAt());
    assertThat(snapshot.startedAt()).isEqualTo(browserStart);
  }

  @Test
  void aLegacyRowExposesNullRevisionAndUnknownRuntime() {
    UITestExecution legacy = accepted();
    legacy.setStatus("PASSED");
    legacy.setEndedAt(NOW.minusSeconds(30));
    legacy.setDurationMs(30_000);

    ExecutionSnapshotDto snapshot = mapper.toSnapshot(legacy);

    assertThat(snapshot.revisionId()).isNull();
    assertThat(snapshot.replayFailure()).as("historical rows never stored a cause").isNull();
    assertThat(snapshot.runtime().playwright()).isNull();
    assertThat(snapshot.runtime().chromium()).isNull();
    // A finished run with no recorded evidence state has no usable recording, not a pending one.
    assertThat(snapshot.video().status()).isEqualTo(VideoEvidence.UNAVAILABLE);
    assertThat(snapshot.streamComplete()).isTrue();
  }

  @Test
  void anAvailableRecordingIsExposedAsAProtectedApiPathOnly() {
    UITestExecution execution = finishedWithVideo(VideoEvidence.AVAILABLE, NOW.plusSeconds(3600));
    execution.setVideoKey("studio/60400/test/exec/attempt.webm");

    ExecutionSnapshotDto snapshot = mapper.toSnapshot(execution);

    assertThat(snapshot.videoPath())
        .isEqualTo("/api/v1/studio/executions/" + execution.getId() + "/video");
    assertThat(snapshot.videoPath()).doesNotContain("studio/60400");
  }

  @Test
  void logicalExpiryIsEnforcedOnReadEvenBeforePhysicalDeletion() {
    UITestExecution expired = finishedWithVideo(VideoEvidence.AVAILABLE, NOW.minusSeconds(1));

    ExecutionSnapshotDto snapshot = mapper.toSnapshot(expired);

    assertThat(snapshot.video().status()).isEqualTo(VideoEvidence.EXPIRED);
    assertThat(snapshot.videoPath()).isNull();
  }

  /**
   * Studio v1 gaps: with no store the API can read, a recording the runner reported AVAILABLE is
   * published UNAVAILABLE with a reason, and no path — so the MFE renders no player for a route
   * that could only answer 404.
   */
  @Test
  void anAvailableRecordingWithNoReadableStoreIsPublishedUnavailableWithoutAPath() {
    ExecutionSnapshotMapper noStore =
        new ExecutionSnapshotMapper(objectMapper, Clock.fixed(NOW, ZoneOffset.UTC), false);
    UITestExecution execution = finishedWithVideo(VideoEvidence.AVAILABLE, NOW.plusSeconds(3600));
    execution.setVideoPartial(true);

    ExecutionSnapshotDto snapshot = noStore.toSnapshot(execution);

    assertThat(snapshot.status()).isEqualTo("PASSED");
    assertThat(snapshot.video().status()).isEqualTo(VideoEvidence.UNAVAILABLE);
    assertThat(snapshot.video().error()).isEqualTo(ExecutionSnapshotMapper.NO_RECORDING_STORE);
    assertThat(snapshot.video().partial()).isFalse();
    assertThat(snapshot.video().expiresAt()).isNull();
    assertThat(snapshot.videoPath()).isNull();
    assertThat(snapshot.streamComplete()).isTrue();
    // The persisted evidence is untouched, so a real store makes it servable again.
    assertThat(execution.getVideoStatus()).isEqualTo(VideoEvidence.AVAILABLE);
  }

  @Test
  void withNoReadableStoreTheOtherEvidenceStatesAreReportedAsTheyAre() {
    ExecutionSnapshotMapper noStore =
        new ExecutionSnapshotMapper(objectMapper, Clock.fixed(NOW, ZoneOffset.UTC), false);

    UITestExecution failed = finishedWithVideo(VideoEvidence.FAILED, null);
    failed.setVideoError("Upload failed after 3 attempts");
    assertThat(noStore.toSnapshot(failed).video().error())
        .isEqualTo("Upload failed after 3 attempts");
    assertThat(
            noStore
                .toSnapshot(finishedWithVideo(VideoEvidence.AVAILABLE, NOW.minusSeconds(1)))
                .video()
                .status())
        .isEqualTo(VideoEvidence.EXPIRED);
    assertThat(
            noStore.toSnapshot(finishedWithVideo(VideoEvidence.PROCESSING, null)).video().status())
        .isEqualTo(VideoEvidence.PROCESSING);
  }

  @Test
  void anEvidenceFailureNeverOverwritesAKnownOutcome() {
    UITestExecution execution = finishedWithVideo(VideoEvidence.FAILED, null);
    execution.setVideoError("Upload failed after 3 attempts");

    ExecutionSnapshotDto snapshot = mapper.toSnapshot(execution);

    assertThat(snapshot.status()).isEqualTo("PASSED");
    assertThat(snapshot.video().status()).isEqualTo(VideoEvidence.FAILED);
    assertThat(snapshot.video().error()).isEqualTo("Upload failed after 3 attempts");
    assertThat(snapshot.streamComplete()).isTrue();
  }

  @Test
  void aTerminalOutcomeDoesNotCompleteTheStreamWhileEvidenceIsStillProcessing() {
    UITestExecution execution = finishedWithVideo(VideoEvidence.PROCESSING, null);

    assertThat(mapper.toSnapshot(execution).streamComplete()).isFalse();
  }

  @Test
  void storedStepResultsAndLogsAreReadIntoTheTypedSnapshot() {
    UITestExecution execution = accepted();
    execution.setStatus("FAILED");
    execution.setStepResults(
        "[{\"stepIndex\":0,\"originalText\":\"Go home\",\"status\":\"PASS\",\"offsetMs\":100,"
            + "\"durationMs\":900,\"message\":null},"
            + "{\"stepIndex\":1,\"originalText\":\"Click Sign On\",\"status\":\"SKIPPED\","
            + "\"offsetMs\":null,\"durationMs\":null,\"message\":null}]");
    execution.setLogs(
        "[{\"at\":\"2026-09-10T11:59:30Z\",\"level\":\"INFO\",\"message\":\"Browser started\","
            + "\"stepIndex\":null}]");
    execution.setLogsTruncated(true);
    execution.setRuntimeVersions("{\"playwright\":\"1.47.2\",\"chromium\":\"129.0.6668.29\"}");
    execution.setSnapshotRevision(12L);

    ExecutionSnapshotDto snapshot = mapper.toSnapshot(execution);

    assertThat(snapshot.stepResults()).hasSize(2);
    assertThat(snapshot.stepResults().get(1))
        .isEqualTo(new StepResult(1, "Click Sign On", StepResult.SKIPPED, null, null, null));
    assertThat(snapshot.logs()).hasSize(1);
    assertThat(snapshot.logsTruncated()).isTrue();
    assertThat(snapshot.runtime().playwright()).isEqualTo("1.47.2");
    assertThat(snapshot.revision()).isEqualTo(12L);
  }

  // ── STUDIO-OBS-008 T0 ruling A1: replayFailure ───────────────────────────

  @Test
  void aPersistedLoginCauseIsMappedWithItsLoginFlag() throws Exception {
    UITestExecution execution = failedRun();
    execution.setReplayFailure("LOGIN_REQUIRED", "step-b", 1, false);

    ExecutionSnapshotDto snapshot = mapper.toSnapshot(execution);

    assertThat(snapshot.replayFailure()).isEqualTo(ReplayFailure.loginRequired("step-b", 1, false));
    JsonNode json = objectMapper.readTree(objectMapper.writeValueAsString(snapshot));
    assertThat(json.path("replayFailure").path("loginStepsPresent").isBoolean()).isTrue();
    assertThat(json.path("replayFailure").path("loginStepsPresent").asBoolean()).isFalse();
  }

  @Test
  void aPersistedDriftCauseOmitsTheLoginFlagOnTheWire() throws Exception {
    UITestExecution execution = failedRun();
    execution.setStatus("ERROR");
    execution.setReplayFailure("TARGET_DRIFT", "step-c", 2, null);

    ExecutionSnapshotDto snapshot = mapper.toSnapshot(execution);

    assertThat(snapshot.status()).isEqualTo("ERROR");
    assertThat(snapshot.errorCode()).isNull();
    assertThat(snapshot.replayFailure()).isEqualTo(ReplayFailure.targetDrift("step-c", 2));
    JsonNode cause =
        objectMapper.readTree(objectMapper.writeValueAsString(snapshot)).path("replayFailure");
    assertThat(cause.has("loginStepsPresent")).isFalse();
    assertThat(cause.path("code").asText()).isEqualTo("TARGET_DRIFT");
    assertThat(cause.path("stepId").asText()).isEqualTo("step-c");
    assertThat(cause.path("stepIndex").asInt()).isEqualTo(2);
  }

  @Test
  void aRowWithNoCauseHasNullAndTheLabelledCopyKeepsTheCause() {
    assertThat(mapper.toSnapshot(failedRun()).replayFailure()).isNull();

    UITestExecution execution = failedRun();
    execution.setReplayFailure("LOGIN_REQUIRED", "step-a", 0, true);
    ExecutionSnapshotDto labelled = mapper.toSnapshot(execution).withTestName("Checkout");

    // GET, list and SSE share the mapper; the list route labels the same snapshot.
    assertThat(labelled.testName()).isEqualTo("Checkout");
    assertThat(labelled.replayFailure()).isEqualTo(ReplayFailure.loginRequired("step-a", 0, true));
  }

  @Test
  void aCauseWithoutItsCoordinatesIsRefusedRatherThanPublished() {
    UITestExecution noCoordinates = failedRun();
    noCoordinates.setReplayFailure("TARGET_DRIFT", null, null, null);
    assertThatThrownBy(() -> mapper.toSnapshot(noCoordinates))
        .isInstanceOf(IllegalStateException.class);

    UITestExecution mixed = failedRun();
    mixed.setReplayFailure("TARGET_DRIFT", "step-a", 0, true);
    assertThatThrownBy(() -> mapper.toSnapshot(mixed)).isInstanceOf(IllegalStateException.class);
  }

  private UITestExecution failedRun() {
    UITestExecution execution = accepted();
    execution.setStatus("FAILED");
    execution.setBrowserStartedAt(NOW.minusSeconds(55));
    execution.setEndedAt(NOW.minusSeconds(20));
    execution.setDurationMs(35_000);
    return execution;
  }

  private UITestExecution accepted() {
    return new UITestExecution(UUID.randomUUID(), "PENDING", NOW.minusSeconds(60), CSI_ID);
  }

  private UITestExecution finishedWithVideo(String videoStatus, Instant expiresAt) {
    UITestExecution execution = accepted();
    execution.setStatus("PASSED");
    execution.setBrowserStartedAt(NOW.minusSeconds(55));
    execution.setEndedAt(NOW.minusSeconds(20));
    execution.setDurationMs(35_000);
    execution.setVideoStatus(videoStatus);
    execution.setVideoExpiresAt(expiresAt);
    return execution;
  }
}
