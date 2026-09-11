package com.citi.put.checks.studio.compile.gateway;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * One compile proposal request (Story 10.5, AC-1).
 *
 * <p>Carries opaque token inputs only. Source lines must already contain {@code <secret ID>} and
 * {@code <var NAME>} placeholders rather than resolved values (architecture &sect;4.3); this type
 * does not resolve, validate or fence anything. Semantic prompt assembly — fencing, the syntax
 * reference body, credential-pattern rejection — belongs to story 10.8.
 *
 * @param testId the UI test being compiled
 * @param csiId the owning CSI
 * @param principal the authenticated user that triggered the compile
 * @param compileRequestId compile request identity, stable across repair attempts
 * @param attempt 1-based attempt number within that compile request
 * @param fencedSourceLines ordered source lines, already fenced as data by the caller
 * @param syntaxReference the versioned Playwright syntax reference body
 * @param syntaxReferenceVersion version identifier of that reference
 * @param outputContract the output/allowed-language contract text
 * @param promptVersion pinned prompt version, recorded in provenance and audit
 */
public record CompileRequest(
    UUID testId,
    String csiId,
    String principal,
    String compileRequestId,
    int attempt,
    List<String> fencedSourceLines,
    String syntaxReference,
    String syntaxReferenceVersion,
    String outputContract,
    String promptVersion) {

  public CompileRequest {
    Objects.requireNonNull(testId, "testId");
    Objects.requireNonNull(csiId, "csiId");
    Objects.requireNonNull(principal, "principal");
    Objects.requireNonNull(compileRequestId, "compileRequestId");
    Objects.requireNonNull(fencedSourceLines, "fencedSourceLines");
    Objects.requireNonNull(syntaxReference, "syntaxReference");
    Objects.requireNonNull(syntaxReferenceVersion, "syntaxReferenceVersion");
    Objects.requireNonNull(outputContract, "outputContract");
    Objects.requireNonNull(promptVersion, "promptVersion");
    if (attempt < 1) {
      throw new IllegalArgumentException("attempt must be >= 1 but was " + attempt);
    }
    fencedSourceLines = List.copyOf(fencedSourceLines);
  }
}
