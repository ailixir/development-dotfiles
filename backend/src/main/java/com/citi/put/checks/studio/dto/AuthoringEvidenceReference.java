package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.UUID;

/** Client-selectable supplied evidence; clients cannot mint observed provenance. */
@JsonIgnoreProperties(ignoreUnknown = false)
public record AuthoringEvidenceReference(
    @NotNull UUID id,
    @Min(1) long revision,
    @NotNull Source source,
    @NotNull @Size(max = 20) String csiId,
    @NotNull @Size(max = 50) String environment,
    @NotNull @Size(min = 1) String route,
    @NotNull @Size(min = 1) String state,
    @NotNull UUID stepId,
    @NotNull OffsetDateTime capturedAt,
    @NotNull Completeness completeness,
    @NotNull @Pattern(regexp = "^[a-f0-9]{64}$") String hash) {

  public enum Source {
    @JsonProperty("supplied")
    SUPPLIED
  }

  public enum Completeness {
    @JsonProperty("complete")
    COMPLETE,
    @JsonProperty("partial")
    PARTIAL,
    @JsonProperty("unknown")
    UNKNOWN
  }
}
