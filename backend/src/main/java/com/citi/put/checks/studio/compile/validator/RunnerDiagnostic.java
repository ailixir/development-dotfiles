package com.citi.put.checks.studio.compile.validator;

/**
 * One validator rejection, as the frozen {@code RunnerDiagnostic} schema declares it (ADR-002;
 * architecture &sect;4.5).
 *
 * <p>Diagnostics carry no source text beyond the bounded {@code excerpt} the runner already
 * redacted, and never the typed operation list, which stays inside the runner (&sect;9.2).
 *
 * @param code the runner's diagnostic code
 * @param stepIndex the step it belongs to, or {@code null} for an artifact-level problem
 * @param message the human-readable rejection
 * @param node syntax kind of the offending node, when the problem is a node
 * @param excerpt bounded excerpt of the offending node only
 */
public record RunnerDiagnostic(
    String code, Integer stepIndex, String message, String node, String excerpt) {}
