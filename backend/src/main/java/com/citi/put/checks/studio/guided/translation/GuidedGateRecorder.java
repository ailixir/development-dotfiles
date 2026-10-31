package com.citi.put.checks.studio.guided.translation;

import java.util.concurrent.atomic.AtomicReference;

/**
 * The production capture of one STEP_CODE apply. It keeps the first gate that refused (read after
 * the apply transaction has rolled back, to be persisted with the REJECTED attempt). It can wrap
 * the opt-in private-diagnostics capture so that channel keeps receiving every gate.
 */
public final class GuidedGateRecorder implements GuidedRefusalDiagnostics.Capture {
  private final GuidedRefusalDiagnostics.Capture chained;
  private final AtomicReference<GuidedRefusalDiagnostics.Gate> first = new AtomicReference<>();

  public GuidedGateRecorder() {
    this(null);
  }

  /** {@code chained} may be null; it receives every record after this recorder has kept it. */
  public GuidedGateRecorder(GuidedRefusalDiagnostics.Capture chained) {
    this.chained = chained;
  }

  @Override
  public void record(GuidedRefusalDiagnostics.Gate gate) {
    if (gate != null && gate != GuidedRefusalDiagnostics.Gate.UNKNOWN) {
      first.compareAndSet(null, gate);
    }
    if (chained != null) {
      GuidedRefusalDiagnostics.record(chained, gate);
    }
  }

  /** The first gate that refused, or null when none did. */
  public GuidedRefusalDiagnostics.Gate firstGate() {
    return first.get();
  }
}
