package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

/**
 * One entry per <em>original source step</em>, index aligned (ADR-002 §16.2; architecture §4.4 "one
 * entry per source line").
 *
 * <p>Present even where the validator returned nothing for that step, so the entry count equals the
 * length of {@code steps} on the same {@link UITestDto} and a client may align {@code steps[i]} to
 * {@code compileDiagnostics.steps[i]} without searching.
 *
 * @param stepIndex the zero-based index of the original source step
 * @param ok whether the validator accepted this step — never a claim that it is semantically right
 * @param diagnostics the bounded rejections for this step
 * @param truncated true when this step had more diagnostics than the per-step cap, or when its
 *     diagnostics were shed to fit the document cap; "there were no more problems" and "we stopped
 *     telling you" are different facts and this is the field that tells them apart
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record CompileStepDiagnosticsDto(
    Integer stepIndex, Boolean ok, List<CompileDiagnosticDto> diagnostics, Boolean truncated) {}
