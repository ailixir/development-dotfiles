package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/** V2 source plus optional immutable-revision and review projections. */
@JsonIgnoreProperties(ignoreUnknown = false)
public record AuthoringV2Response(
    @Min(2) @Max(2) int authoringSchemaVersion,
    @Valid GlobalAuthoringContext globalContext,
    @NotNull @Size(max = 100) List<@Valid AuthoringStep> steps,
    @Valid AuthoringRevisionInputs revisionInputs,
    List<@Valid ResolvedStepReview> review) {

  public AuthoringV2Response {
    globalContext = globalContext == null ? GlobalAuthoringContext.empty() : globalContext;
    steps = steps == null ? null : List.copyOf(steps);
    review = review == null ? null : List.copyOf(review);
  }
}
