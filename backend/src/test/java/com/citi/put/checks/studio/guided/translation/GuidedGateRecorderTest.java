package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** The first gate that refused is the one persisted with the rejected attempt. */
class GuidedGateRecorderTest {
  @Test
  void theFirstLeafBeatsTheOuterGate() {
    GuidedGateRecorder recorder = new GuidedGateRecorder();
    recorder.record(GuidedRefusalDiagnostics.Gate.STEP_CAPTURES);
    recorder.record(GuidedRefusalDiagnostics.Gate.APPLICATION);
    assertThat(recorder.firstGate()).isEqualTo(GuidedRefusalDiagnostics.Gate.STEP_CAPTURES);
  }

  @Test
  void anUnknownGateIsNotKeptAndNothingRefusedMeansNoGate() {
    GuidedGateRecorder recorder = new GuidedGateRecorder();
    assertThat(recorder.firstGate()).isNull();
    recorder.record(GuidedRefusalDiagnostics.Gate.UNKNOWN);
    recorder.record(null);
    assertThat(recorder.firstGate()).isNull();
    recorder.record(GuidedRefusalDiagnostics.Gate.STEP_CODE_SHAPE);
    assertThat(recorder.firstGate()).isEqualTo(GuidedRefusalDiagnostics.Gate.STEP_CODE_SHAPE);
  }
}
