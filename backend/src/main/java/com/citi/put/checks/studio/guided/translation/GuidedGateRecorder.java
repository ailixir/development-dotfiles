package com.citi.put.checks.studio.guided.translation;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

/**
 * ADR-SC-007 D5: the production capture of one NEXT_ACTION apply. It keeps the first grounding gate
 * that refused (read after the apply transaction has rolled back, to be persisted with the REJECTED
 * attempt) and, when the pick was admitted, how the intent gate admitted it and which evidence
 * fields supplied the intent words (persisted with the APPLIED attempt). It can wrap the opt-in
 * private-diagnostics capture so that channel keeps receiving every gate.
 */
public final class GuidedGateRecorder implements GuidedRefusalDiagnostics.Capture {
  private final GuidedRefusalDiagnostics.Capture chained;
  private final AtomicReference<GuidedRefusalDiagnostics.Gate> first = new AtomicReference<>();
  private final AtomicReference<GuidedGates.IntentPath> path = new AtomicReference<>();
  private final AtomicReference<List<String>> fields = new AtomicReference<>();

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

  @Override
  public void intent(GuidedGates.IntentPath admittedBy, List<String> evidenceFields) {
    path.set(admittedBy);
    fields.set(evidenceFields == null ? List.of() : List.copyOf(evidenceFields));
    if (chained != null) {
      try {
        chained.intent(admittedBy, evidenceFields);
      } catch (Throwable unavailable) {
        // An optional diagnostic never replaces the product outcome.
      }
    }
  }

  /** The first gate that refused, or null when none did. */
  public GuidedRefusalDiagnostics.Gate firstGate() {
    return first.get();
  }

  /** How the intent gate admitted the pick, or null when no pick was admitted. */
  public GuidedGates.IntentPath intentPath() {
    return path.get();
  }

  /** The comma-joined evidence fields, in evidence order, or null when none were recorded. */
  public String intentFields() {
    List<String> value = fields.get();
    return value == null || value.isEmpty() ? null : String.join(",", value);
  }
}
