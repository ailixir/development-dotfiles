package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/** The ordered pre-v2 source. Every string remains byte-for-byte unchanged. */
@JsonIgnoreProperties(ignoreUnknown = false)
public record LegacyAuthoringRequest(@NotNull @Size(max = 100) List<@Size(max = 500) String> steps)
    implements StudioAuthoring {

  public LegacyAuthoringRequest {
    steps = steps == null ? null : List.copyOf(steps);
  }
}
