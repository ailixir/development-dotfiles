package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

/**
 * Why the last compile produced nothing runnable, in the author's own step order (ADR-002 §16.2;
 * architecture §4.7).
 *
 * <p>Non-null only with {@code compileStatus: NEEDS_REVISION}, and never non-null at the same time
 * as {@link CompileErrorDto} — the five statements of {@code CompileStateService} guarantee that,
 * not this record.
 *
 * <p><strong>Truncation is explicit at all three levels and never silent</strong>: a clamped {@code
 * message} or {@code excerpt} ends with a marker, a step that lost diagnostics carries {@code
 * truncated}, and a document that had to shed whole steps' diagnostics to fit the byte cap carries
 * a document-level {@code truncated} with a {@code truncationReason}.
 *
 * <p>The document describes <strong>the last attempt only</strong>. Repair is bounded at two
 * attempts (§4.3), so at most three attempts are made; {@code attempts} says how many happened and
 * {@code exhausted} says whether the bound was reached with the artifact still invalid. Earlier
 * attempts' diagnostics describe artifacts the author never saw and are not accumulated.
 *
 * <p>Nothing here reports that a step the validator accepted does what its author meant.
 *
 * @param validatorSchemaVersion the validator version that produced the verdict
 * @param artifact artifact-level rejections belonging to no single step
 * @param steps one entry per original source step, index aligned
 * @param truncated true when whole steps' diagnostics were shed to fit the document byte cap
 * @param truncationReason present only when {@code truncated} is true
 * @param attempts how many compile attempts this document describes the last of (≥ 1)
 * @param exhausted true when the repair bound was reached and the artifact was still invalid
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record CompileDiagnosticsDto(
    String validatorSchemaVersion,
    List<CompileDiagnosticDto> artifact,
    List<CompileStepDiagnosticsDto> steps,
    Boolean truncated,
    String truncationReason,
    Integer attempts,
    Boolean exhausted) {}
