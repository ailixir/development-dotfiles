package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.UUID;

/** Server-held evidence reference. Only a trusted capture boundary may mint observed source. */
@JsonIgnoreProperties(ignoreUnknown = false)
public record EvidenceReference(
    @NotNull UUID id,
    @Min(1) long revision,
    @NotNull Source source,
    @NotNull @Size(max = 20) String csiId,
    @NotNull @Size(max = 50) String environment,
    @NotNull @Size(min = 1) String route,
    @NotNull @Size(min = 1) String state,
    @NotNull UUID stepId,
    @NotNull OffsetDateTime capturedAt,
    @NotNull AuthoringEvidenceReference.Completeness completeness,
    @NotNull @Pattern(regexp = "^[a-f0-9]{64}$") String hash) {

  public enum Source {
    @JsonProperty("supplied")
    SUPPLIED,
    @JsonProperty("observed")
    OBSERVED
  }
}
