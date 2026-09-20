package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/** One ordered authoring step whose UUID remains stable across edits and reorder. */
@JsonIgnoreProperties(ignoreUnknown = false)
public record AuthoringStep(
    @NotNull UUID id, @NotNull @Size(max = 500) String text, @Valid StepAuthoringContext context) {

  public AuthoringStep {
    context = context == null ? StepAuthoringContext.empty() : context;
  }
}
