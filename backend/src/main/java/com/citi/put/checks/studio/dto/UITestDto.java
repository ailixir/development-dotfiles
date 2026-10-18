package com.citi.put.checks.studio.dto;

import com.citi.put.checks.studio.entity.UITest;
import com.citi.put.checks.studio.entity.UITestRevision;
import com.citi.put.checks.studio.readiness.StudioReadiness;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * A Studio draft in the frozen typed shape (Architecture §8.3, AC-2; ADR-SC-005).
 *
 * <p>Steps are ordered English lines, variables are typed references, and the execution-affecting
 * configuration is one nested object. Canonical stored arrays and typed declarations are read
 * through {@link CanonicalStudioCodec}; authoring identity comes from the persisted v2 document.
 *
 * <h2>Readiness</h2>
 *
 * <p>{@code readiness} is {@code UNLEARNED | LEARNING | READY | NEEDS_RELEARN}, derived on every
 * read by the same predicate the execute path consults; no column stores it. {@code
 * firstChangedStepId} accompanies {@code NEEDS_RELEARN}, which STUDIO-OBS-015 introduces; until
 * then the server never emits {@code NEEDS_RELEARN} and the field is always {@code null}.
 *
 * <h2>The learned revision</h2>
 *
 * <p>{@code confirmedRevisionArtifactHash} and {@code confirmedRevisionArtifact} belong to exactly
 * the revision {@code confirmedRevisionId} names and are read with the draft in one transaction
 * (ADR-002 §30). Both are {@code null} on the list projection, where a page of drafts would
 * otherwise carry executable plans no list renders.
 */
public record UITestDto(
    UUID id,
    String name,
    String description,
    String csiId,
    String environment,
    List<String> steps,
    List<StudioVariable> variables,
    TestConfiguration configuration,
    String status,
    String schedule,
    String createdBy,
    Instant createdAt,
    Instant updatedAt,
    Instant lastRunAt,
    String lastRunStatus,
    long sourceRevision,
    long configurationRevision,
    StudioReadiness readiness,
    UUID firstChangedStepId,
    UUID confirmedRevisionId,
    String confirmedRevisionArtifactHash,
    JsonNode confirmedRevisionArtifact) {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  /**
   * The single-draft projection returned by {@code GET /tests/{id}} and the write routes.
   *
   * @param entity the draft row
   * @param confirmed the learned revision the draft names, read in the same transaction, or {@code
   *     null}
   * @param readiness the derived readiness
   * @return the full representation
   */
  public static UITestDto from(UITest entity, UITestRevision confirmed, StudioReadiness readiness) {
    return from(entity, confirmed, readiness, null);
  }

  public static UITestDto from(
      UITest entity, UITestRevision confirmed, StudioReadiness readiness, UUID firstChangedStepId) {
    return new UITestDto(
        entity.getId(),
        entity.getName(),
        entity.getDescription(),
        entity.getCsiId(),
        entity.getEnvironment(),
        CanonicalStudioCodec.parseSteps(entity.getSteps()),
        CanonicalStudioCodec.parseVariables(entity.getVariables()),
        new TestConfiguration(
            CanonicalStudioCodec.normalizeBrowser(entity.getBrowser()),
            CanonicalStudioCodec.viewport(entity.getViewportWidth(), entity.getViewportHeight()),
            entity.getTimeoutSeconds(),
            entity.getWaitStrategy()),
        entity.getStatus(),
        entity.getSchedule(),
        entity.getCreatedBy(),
        entity.getCreatedAt(),
        entity.getUpdatedAt(),
        entity.getLastRunAt(),
        entity.getLastRunStatus(),
        entity.getSourceRevision(),
        entity.getConfigurationRevision(),
        readiness,
        firstChangedStepId,
        entity.getConfirmedRevisionId(),
        confirmed == null ? null : confirmed.getArtifactHash(),
        confirmed == null ? null : parse(confirmed.getArtifact()));
  }

  /**
   * The list projection: {@code confirmedRevisionArtifact} and {@code
   * confirmedRevisionArtifactHash} are always {@code null}; readiness and the revision id stay, so
   * nothing a caller needs in order to know that a runnable revision exists is hidden (ADR-002
   * §16.5, §21.2). No revision is loaded on this path at all.
   *
   * @param entity the draft row
   * @param readiness the derived readiness
   * @return the list representation returned by {@code GET /tests}
   */
  public static UITestDto forList(UITest entity, StudioReadiness readiness) {
    return from(entity, null, readiness);
  }

  /**
   * Deserializes a stored revision document. A {@code jsonb} column cannot hold anything that is
   * not valid JSON, so a failure here is a future writer's defect, reported as absent rather than
   * as a {@code 500} on a draft the caller is otherwise entitled to read.
   */
  private static JsonNode parse(String json) {
    if (json == null || json.isBlank()) {
      return null;
    }
    try {
      return MAPPER.readValue(json, JsonNode.class);
    } catch (JsonProcessingException e) {
      return null;
    }
  }
}
