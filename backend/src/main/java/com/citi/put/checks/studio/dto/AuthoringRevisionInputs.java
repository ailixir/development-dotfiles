package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/** Context fields included in configuration/context identity. */
@JsonIgnoreProperties(ignoreUnknown = false)
public record AuthoringRevisionInputs(
    @NotNull @Pattern(regexp = "^[a-f0-9]{64}$") String contextDigest,
    @NotNull @Pattern(regexp = "^[a-f0-9]{64}$") String globalContext,
    @NotNull List<@Valid StepContextHash> stepContexts,
    @NotNull List<@Valid NonsecretReferenceHash> nonsecretReferencedValues,
    @NotNull List<@Valid SelectedEvidenceHash> selectedEvidenceReferences) {

  public AuthoringRevisionInputs {
    stepContexts = stepContexts == null ? null : List.copyOf(stepContexts);
    nonsecretReferencedValues =
        nonsecretReferencedValues == null ? null : List.copyOf(nonsecretReferencedValues);
    selectedEvidenceReferences =
        selectedEvidenceReferences == null ? null : List.copyOf(selectedEvidenceReferences);
  }

  @JsonIgnoreProperties(ignoreUnknown = false)
  public record StepContextHash(
      @NotNull UUID stepId, @NotNull @Pattern(regexp = "^[a-f0-9]{64}$") String hash) {}

  @JsonIgnoreProperties(ignoreUnknown = false)
  public record NonsecretReferenceHash(
      @NotNull @Size(min = 1) String referenceId,
      @NotNull @Pattern(regexp = "^[a-f0-9]{64}$") String valueHash) {}

  @JsonIgnoreProperties(ignoreUnknown = false)
  public record SelectedEvidenceHash(
      @NotNull UUID id,
      @Min(1) long revision,
      @NotNull @Pattern(regexp = "^[a-f0-9]{64}$") String hash) {}
}
