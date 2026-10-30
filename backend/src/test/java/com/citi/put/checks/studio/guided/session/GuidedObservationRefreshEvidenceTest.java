package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

/**
 * ADR-SC-007 WI-3.1: an observation refresh is allowed over observed-document evidence, and over
 * the initial blank page when the first navigation's post-dispatch observation ended at the
 * runner's deadline. The generation must match; every other evidence kind stays STALE_GENERATION.
 */
class GuidedObservationRefreshEvidenceTest {
  private final GuidedContracts contracts = new GuidedContracts();

  private ObjectNode progress(String kind, int generation) {
    ObjectNode progress = contracts.object().put("generation", generation);
    progress.set("executionEvidence", contracts.object().put("kind", kind));
    return progress;
  }

  private ObjectNode request(int expectedGeneration) {
    return contracts.object().put("expectedGeneration", expectedGeneration);
  }

  @Test
  void anInitialBlankSessionMayPullTheObservationForItsOwnGeneration() {
    assertThat(GuidedSessionService.refreshEvidenceCurrent(request(0), progress("initialBlank", 0)))
        .isTrue();
  }

  @Test
  void anObservedDocumentSessionStillMayPullTheObservationForItsGeneration() {
    assertThat(
            GuidedSessionService.refreshEvidenceCurrent(
                request(3), progress("observedDocument", 3)))
        .isTrue();
  }

  @Test
  void anyOtherEvidenceKindIsStale() {
    for (String kind : new String[] {"", "initialContext", "unknown", "OBSERVEDDOCUMENT"}) {
      assertThat(GuidedSessionService.refreshEvidenceCurrent(request(0), progress(kind, 0)))
          .as("kind '%s'", kind)
          .isFalse();
    }
    assertThat(
            GuidedSessionService.refreshEvidenceCurrent(
                request(0), contracts.object().put("generation", 0)))
        .as("no evidence")
        .isFalse();
  }

  @Test
  void aGenerationThatDiffersIsStaleWhateverTheEvidence() {
    for (String kind : new String[] {"initialBlank", "observedDocument"}) {
      assertThat(GuidedSessionService.refreshEvidenceCurrent(request(1), progress(kind, 0)))
          .as(kind)
          .isFalse();
    }
  }
}
