package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.compile.gateway.CompileRequest;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Builds a <em>repair</em> proposal request (Story 10.9, AC-14; architecture &sect;4.3).
 *
 * <p>A repair carries exactly what the first attempt carried — the fenced source, the pinned syntax
 * reference and its version, the output contract and {@code promptVersion} — plus one thing: the
 * <strong>bounded, redacted diagnostics of the attempt that just failed</strong>. Nothing else.
 *
 * <h2>No resolved value, on any attempt</h2>
 *
 * <p>This class delegates the whole prompt to {@link PromptAssembler}, which has a no-argument
 * constructor and only {@code String} fields — there is no surface through which a secrets service
 * or a vault client could reach it, and adding one here would be visible as a constructor
 * parameter. Secret and variable references travel exactly as the author wrote them, {@code <secret
 * ID>} and {@code <var NAME>}, on attempt 3 as on attempt 1: the compiler compiles a reference, not
 * a value (&sect;9.2).
 *
 * <h2>The diagnostics are the ones already persisted</h2>
 *
 * <p>The caller passes the document {@link DiagnosticsBounder} produced, not the raw {@code
 * ValidationOutcome}. That is deliberate and not merely convenient: the bounder is the one place
 * that applies the per-step, message, excerpt and total-byte caps and the explicit truncation
 * markers, so a repair prompt can never carry more validator output than the author would be shown
 * — and a hostile validator response cannot become an unbounded outbound payload by travelling
 * through the repair path instead of the storage path.
 *
 * <h2>Repair does not make an artifact more trustworthy</h2>
 *
 * <p>An artifact that took three attempts is neither more nor less trustworthy than one that took
 * one. The author reviews and confirms it identically, and no message on this path states or
 * implies that a validated step does what its author meant (&sect;4.1, &sect;4.5).
 */
@Component
public class RepairPromptAssembler {

  private final PromptAssembler promptAssembler;

  public RepairPromptAssembler(PromptAssembler promptAssembler) {
    this.promptAssembler = promptAssembler;
  }

  /**
   * Assembles one repair proposal request.
   *
   * @param inputs the immutable snapshot the whole compile request is working from
   * @param compileRequestId the persisted compile request identity, stable across repair attempts
   * @param attempt the 1-based attempt number; a repair is always at least 2
   * @param boundedDiagnostics the bounded, redacted diagnostics of the attempt that just failed
   * @return the transport request 10.5's client accepts
   * @throws IllegalArgumentException on attempt 1, or with no diagnostics to repair from
   */
  public CompileRequest assemble(
      CompileInputs inputs, UUID compileRequestId, int attempt, String boundedDiagnostics) {
    if (attempt < 2) {
      throw new IllegalArgumentException("a repair attempt is at least 2 but was " + attempt);
    }
    if (boundedDiagnostics == null || boundedDiagnostics.isBlank()) {
      // A repair with nothing to repair from is a second guess at the same prompt, which §4.3's
      // bound is not there to buy. Failing here rather than sending it keeps the bound honest.
      throw new IllegalArgumentException(
          "a repair attempt must carry the bounded diagnostics of the attempt that failed");
    }
    CompileRequest first =
        promptAssembler.assemble(
            inputs.testId(),
            inputs.csiId(),
            inputs.principal(),
            compileRequestId,
            attempt,
            inputs.orderedSource());
    return new CompileRequest(
        first.testId(),
        first.csiId(),
        first.principal(),
        first.compileRequestId(),
        first.attempt(),
        first.fencedSourceLines(),
        first.syntaxReference(),
        first.syntaxReferenceVersion(),
        first.outputContract(),
        first.promptVersion(),
        boundedDiagnostics);
  }
}
