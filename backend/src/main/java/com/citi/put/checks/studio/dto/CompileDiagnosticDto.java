package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * One validator rejection, bounded and redacted for publication (ADR-002 §16.2; architecture §4.5,
 * §4.7).
 *
 * <p>The same five fields as the internal {@code RunnerDiagnostic} the validator produces, declared
 * separately because what reaches a user is the <em>bounded</em> copy: {@code message} and {@code
 * excerpt} are clamped to the deployment-configured caps of {@code studio.compile.diagnostics.*}
 * and a clamped string ends with {@link
 * com.citi.put.checks.studio.compile.DiagnosticsBounder#TRUNCATION_MARKER}.
 *
 * <p>Nothing here reports whether a step does what its author meant. The validator decides whether
 * a step is <em>expressible</em> in the allowed language; it cannot decide whether a locator
 * matches the application or an assertion captures the user's intent (§4.1, §4.5).
 *
 * @param code the validator's stable rejection code
 * @param stepIndex the offending step, or null for an artifact-level problem belonging to no step
 * @param message the bounded, clamped explanation
 * @param node the syntax kind of the offending node, when the problem is a node
 * @param excerpt a bounded excerpt of the offending node only — never the whole step (§9.2)
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record CompileDiagnosticDto(
    String code, Integer stepIndex, String message, String node, String excerpt) {}
