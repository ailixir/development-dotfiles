package com.citi.put.checks.studio.authoring;

import com.citi.put.checks.studio.dto.StudioVariable;
import com.citi.put.checks.studio.dto.TestConfiguration;
import com.citi.put.checks.studio.dto.UITestDto;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Frozen v2 authoring boundary; executable code is never a write field. */
public final class AuthoringDtos {
  private AuthoringDtos() {}

  private static void reject(String key) {
    throw new IllegalArgumentException("Unknown authoring field: " + key);
  }

  public record Scope(
      @NotNull @Pattern(regexp = "1\\.0\\.0") String policyVersion,
      @NotNull @Pattern(regexp = "UNKNOWN|STEP_SCOPED") String declaration) {
    @com.fasterxml.jackson.annotation.JsonAnySetter
    public void unknown(String key, Object value) {
      reject(key);
    }
  }

  public record Step(UUID id, @NotBlank @Size(max = 500) String text) {
    @com.fasterxml.jackson.annotation.JsonAnySetter
    public void unknown(String key, Object value) {
      reject(key);
    }
  }

  public record Write(
      @NotBlank @Size(max = 255) String name,
      String description,
      @Size(max = 20) String csiId,
      @NotBlank @Size(max = 50) String environment,
      @NotNull @Size(min = 1, max = 100) List<@NotNull @Valid Step> steps,
      @NotNull @Valid Scope scope,
      @NotNull List<StudioVariable> variables,
      @NotNull @Valid TestConfiguration configuration,
      @Min(1) Long sourceRevision,
      @Min(1) Long configurationRevision) {
    @com.fasterxml.jackson.annotation.JsonAnySetter
    public void unknown(String key, Object value) {
      reject(key);
    }

    UITestRequest legacy() {
      return new UITestRequest(
          name,
          description,
          csiId,
          environment,
          steps.stream().map(Step::text).toList(),
          variables,
          configuration,
          sourceRevision,
          configurationRevision);
    }
  }

  public record Compile(
      @NotNull @Pattern(regexp = "AUTO|FULL") String mode,
      @NotNull @Min(1) Long sourceRevision,
      @NotNull @Min(1) Long configurationRevision,
      @NotNull @Pattern(regexp = "[0-9a-f]{64}") String authoringHash) {
    @com.fasterxml.jackson.annotation.JsonAnySetter
    public void unknown(String key, Object value) {
      reject(key);
    }
  }

  public record Confirm(
      @NotNull UUID compileRequestId,
      @NotNull UUID revisionId,
      @NotNull @Pattern(regexp = "[0-9a-f]{64}") String artifactHash,
      @NotNull @Min(1) Long sourceRevision,
      @NotNull @Min(1) Long configurationRevision,
      @NotNull @Pattern(regexp = "[0-9a-f]{64}") String authoringHash) {
    @com.fasterxml.jackson.annotation.JsonAnySetter
    public void unknown(String key, Object value) {
      reject(key);
    }
  }

  public record View(
      UITestDto test,
      JsonNode authoring,
      String authoringHash,
      String scopeReviewedBy,
      Instant scopeReviewedAt,
      JsonNode compileAttempt) {}

  public record Accepted(
      UUID compileRequestId,
      String compileStatus,
      long sourceRevision,
      long configurationRevision,
      String authoringHash,
      JsonNode plan) {}
}
