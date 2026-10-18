package com.citi.put.checks.studio.guided.evidence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.citi.put.checks.studio.ExecutionSnapshotMapper;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/**
 * STUDIO-OBS-013 AR-1 R1: every row of the projection table, against a stubbed repository. The
 * DB-clock judgements ({@code withinWindow}, {@code expired}) are inputs here; {@code
 * GuidedSessionEvidenceTest} proves them on PostgreSQL.
 */
class RecordedGuidedEvidenceProjectionTest {

  private static final Instant EXPIRES = Instant.parse("2026-11-12T10:00:00.123456Z");
  private static final String TIMINGS =
      "[{\"kind\":\"step\",\"stepId\":\"s\",\"admissionId\":null,\"ordinal\":null,"
          + "\"startMs\":1,\"endMs\":2},{\"kind\":\"action\",\"stepId\":\"s\","
          + "\"admissionId\":\"a\",\"ordinal\":0,\"startMs\":1,\"endMs\":2}]";

  private final GuidedSessionEvidenceRepository repository =
      mock(GuidedSessionEvidenceRepository.class);
  private final GuidedRecordingProperties properties = new GuidedRecordingProperties(null);

  private GuidedEvidenceProjection.Projection project(
      boolean serves, String sessionState, GuidedSessionEvidenceRepository.Snapshot snapshot) {
    when(repository.snapshot(eq("s1"), anyDouble())).thenReturn(Optional.of(snapshot));
    return new RecordedGuidedEvidenceProjection(
            repository, properties, serves, new GuidedContracts())
        .project("s1", sessionState);
  }

  private static GuidedSessionEvidenceRepository.Snapshot absent(String state, boolean within) {
    return new GuidedSessionEvidenceRepository.Snapshot(
        state, within, null, false, null, false, null);
  }

  private static GuidedSessionEvidenceRepository.Snapshot row(
      String state, boolean partial, Instant expiresAt, boolean expired) {
    return new GuidedSessionEvidenceRepository.Snapshot(
        "SUCCEEDED", false, state, partial, expiresAt, expired, TIMINGS);
  }

  private static String video(GuidedEvidenceProjection.Projection p) {
    return p.video().toString();
  }

  @Test
  void absentRowIsProcessingWhileTheSessionRunsOrTheWindowIsOpen() {
    var running = project(true, "ACTING", absent("ACTING", false));
    assertThat(video(running))
        .isEqualTo(
            "{\"status\":\"PROCESSING\",\"error\":null,\"expiresAt\":null,\"partial\":false}");
    assertThat(running.actionTimings()).isEmpty();
    assertThat(project(true, "FINALIZING", absent("FINALIZING", false)).status())
        .isEqualTo("PROCESSING");
    assertThat(project(true, "SUCCEEDED", absent("SUCCEEDED", true)).status())
        .isEqualTo("PROCESSING");
  }

  @Test
  void absentRowAfterTheDeadlineOfATerminalSessionIsUnavailable() {
    for (String terminal :
        new String[] {
          "SUCCEEDED", "PUBLICATION_CONFLICT", "FAILED", "UNKNOWN_OUTCOME", "CANCELLED", "EXPIRED"
        }) {
      var p = project(true, terminal, absent(terminal, false));
      assertThat(video(p))
          .isEqualTo(
              "{\"status\":\"UNAVAILABLE\",\"error\":null,\"expiresAt\":null,\"partial\":false}");
      assertThat(p.actionTimings()).isEmpty();
    }
  }

  @Test
  void theCallersLockedStateWinsAndANullStateReadsTheRow() {
    assertThat(project(true, null, absent("ACTING", false)).status()).isEqualTo("PROCESSING");
    assertThat(project(true, null, absent("FAILED", false)).status()).isEqualTo("UNAVAILABLE");
  }

  @Test
  void availableWithNoReadableStoreIsUnavailableWithTheSharedText() {
    var p = project(false, "SUCCEEDED", row("AVAILABLE", true, EXPIRES, false));
    assertThat(p.video().path("status").asText()).isEqualTo("UNAVAILABLE");
    assertThat(p.video().path("error").asText())
        .isEqualTo(ExecutionSnapshotMapper.NO_RECORDING_STORE);
    assertThat(p.video().path("expiresAt").isNull()).isTrue();
    assertThat(p.video().path("partial").asBoolean()).isFalse();
    assertThat(p.actionTimings()).isEmpty();
  }

  @Test
  void aDisabledStoreTakesPrecedenceEvenWhenAvailableEvidenceHasExpired() {
    var p = project(false, "SUCCEEDED", row("AVAILABLE", true, EXPIRES, true));
    assertThat(p.status()).isEqualTo("UNAVAILABLE");
    assertThat(p.video().path("error").asText())
        .isEqualTo(ExecutionSnapshotMapper.NO_RECORDING_STORE);
    assertThat(p.video().path("expiresAt").isNull()).isTrue();
    assertThat(p.video().path("partial").asBoolean()).isFalse();
    assertThat(p.actionTimings()).isEmpty();
  }

  @Test
  void availableExpiredOnTheDatabaseClockIsExpiredWithoutTimings() {
    var p = project(true, "SUCCEEDED", row("AVAILABLE", true, EXPIRES, true));
    assertThat(video(p))
        .isEqualTo(
            "{\"status\":\"EXPIRED\",\"error\":null,\"expiresAt\":\"2026-11-12T10:00:00.123456Z\","
                + "\"partial\":true}");
    assertThat(p.actionTimings()).isEmpty();
  }

  @Test
  void availableServesTheStoredTimingsVerbatim() {
    var p = project(true, "SUCCEEDED", row("AVAILABLE", false, EXPIRES, false));
    assertThat(video(p))
        .isEqualTo(
            "{\"status\":\"AVAILABLE\",\"error\":null,\"expiresAt\":\"2026-11-12T10:00:00.123456Z\","
                + "\"partial\":false}");
    assertThat(p.actionTimings().toString()).isEqualTo(TIMINGS);
  }

  @Test
  void failedCarriesTheFixedApiTextAndUnavailableCarriesNone() {
    var failed = project(true, "SUCCEEDED", row("FAILED", false, null, false));
    assertThat(video(failed))
        .isEqualTo(
            "{\"status\":\"FAILED\",\"error\":\""
                + RecordedGuidedEvidenceProjection.FAILED_TEXT
                + "\",\"expiresAt\":null,\"partial\":false}");
    assertThat(failed.actionTimings()).isEmpty();
    var unavailable = project(true, "SUCCEEDED", row("UNAVAILABLE", false, null, false));
    assertThat(video(unavailable))
        .isEqualTo(
            "{\"status\":\"UNAVAILABLE\",\"error\":null,\"expiresAt\":null,\"partial\":false}");
  }

  @Test
  void anUnwiredNoneResultFailsTheV3ContractWhileTheInstalledProjectionSucceeds() throws Exception {
    var contracts = new GuidedContracts();
    var fixtures =
        contracts.parse(
            java.nio.file.Files.readString(
                java.nio.file.Path.of(
                    "../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json")));
    com.fasterxml.jackson.databind.node.ObjectNode result =
        fixtures.path("documents").path("recordingResult").deepCopy();
    contracts.validate("v3/result", result);
    String sessionId = result.path("sessionId").asText();
    GuidedEvidenceProjection.NONE.project(sessionId, "SUCCEEDED").writeTo(result, sessionId);
    org.assertj.core.api.Assertions.assertThatThrownBy(
            () -> contracts.validate("v3/result", result))
        .isInstanceOf(com.citi.put.checks.studio.guided.session.GuidedSessionException.class)
        .hasMessage("INVALID_CONTRACT");
    when(repository.snapshot(eq(sessionId), anyDouble()))
        .thenReturn(Optional.of(absent("SUCCEEDED", false)));
    new RecordedGuidedEvidenceProjection(repository, properties, true, contracts)
        .project(sessionId, "SUCCEEDED")
        .writeTo(result, sessionId);
    assertThat(result.path("evidence").path("video").path("status").asText())
        .isEqualTo("UNAVAILABLE");
    contracts.validate("v3/result", result);
  }

  @Test
  void noneKeepsTodaysLiteralsAndWritesTheEvidenceShape() {
    var none = GuidedEvidenceProjection.NONE.project("s1", "SUCCEEDED");
    assertThat(none.video().isNull()).isTrue();
    assertThat(none.status()).isNull();
    var result = new GuidedContracts().object();
    none.writeTo(result, "s1");
    assertThat(result.toString())
        .isEqualTo(
            "{\"actionTimings\":[],\"evidence\":{\"kind\":\"guidedLedger\",\"ref\":\"s1\","
                + "\"video\":null}}");
  }
}
