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
 * @param repairDiagnostics the repair context of a repair attempt, or {@code null} on attempt 1:
 *     explicit correction instructions, the bounded, redacted rejected proposal and the document
 *     {@code DiagnosticsBounder} already produced (Story 10.9, architecture &sect;4.3; Story 10.45,
 *     FR-10). Built by {@code RepairPromptAssembler} — never a resolved value, never a raw
 *     validator body.
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
    String promptVersion,
    String repairDiagnostics,
    String proposalKind,
    List<UUID> writableStepIds) {

  @SuppressWarnings("checkstyle:ParameterNumber")
  public CompileRequest(
      UUID testId,
      String csiId,
      String principal,
      String compileRequestId,
      int attempt,
      List<String> fencedSourceLines,
      String syntaxReference,
      String syntaxReferenceVersion,
      String outputContract,
      String promptVersion,
      String repairDiagnostics) {
    this(
        testId,
        csiId,
        principal,
        compileRequestId,
        attempt,
        fencedSourceLines,
        syntaxReference,
        syntaxReferenceVersion,
        outputContract,
        promptVersion,
        repairDiagnostics,
        "FULL",
        java.util.stream.IntStream.range(0, fencedSourceLines.size())
            .mapToObj(
                i ->
                    UUID.nameUUIDFromBytes(
                        (compileRequestId + ":" + i)
                            .getBytes(java.nio.charset.StandardCharsets.UTF_8)))
            .toList());
  }

  /**
   * A first-attempt request, carrying no repair diagnostics.
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
  @SuppressWarnings("checkstyle:ParameterNumber")
  public CompileRequest(
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
    this(
        testId,
        csiId,
        principal,
        compileRequestId,
        attempt,
        fencedSourceLines,
        syntaxReference,
        syntaxReferenceVersion,
        outputContract,
        promptVersion,
        null);
  }

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
    writableStepIds = List.copyOf(writableStepIds);
    if (!List.of("FULL", "PATCH").contains(proposalKind)
        || writableStepIds.isEmpty()
        || writableStepIds.size() > 100
        || new java.util.HashSet<>(writableStepIds).size() != writableStepIds.size()) {
      throw new IllegalArgumentException("invalid frozen proposal plan");
    }
  }
}
