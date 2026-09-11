package com.citi.put.checks.studio.dto;

import com.citi.put.checks.studio.compile.CompileState;
import com.citi.put.checks.studio.entity.UITest;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * A Studio draft in the frozen typed shape (Architecture §8.3, AC-2).
 *
 * <p>Steps are ordered English lines, variables are typed references, and the execution-affecting
 * configuration is one nested object. Whatever legacy shape the row was written in, it is read back
 * through {@link LegacyStudioAdapter} into this contract.
 *
 * <h2>The compile-state projection</h2>
 *
 * <p>{@code compileStatus}, {@code currentCandidateRevisionId}, {@code confirmedRevisionId}, {@code
 * compileError} and {@code compileDiagnostics} are read from the draft row in one transaction, so
 * the diagnostics in a response are always index-aligned to the {@code steps} in the <em>same</em>
 * response and describe the {@code sourceRevision} and {@code configurationRevision} in the same
 * response (ADR-002 §16.3).
 *
 * <p>The two new fields were added by ADR-002 §16 and are <strong>additive</strong>: every field
 * above them keeps its name, its type and its position. {@code compileError} and {@code
 * compileDiagnostics} are mutually exclusive — at most one is ever non-null, which the five
 * statements of {@code CompileStateService} guarantee.
 *
 * <p>Neither field states or implies that a step the validator accepted does what its author meant.
 * Static validation cannot prove that (§4.1, §4.5).
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
    CompileState compileStatus,
    UUID currentCandidateRevisionId,
    UUID confirmedRevisionId,
    CompileErrorDto compileError,
    CompileDiagnosticsDto compileDiagnostics) {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  /**
   * The single-draft projection: everything the row carries, diagnostics included.
   *
   * @param entity the draft row
   * @return the full representation returned by {@code GET /tests/{id}} and the write routes
   */
  public static UITestDto from(UITest entity) {
    return from(entity, true);
  }

  /**
   * The list projection: {@code compileDiagnostics} is always {@code null} (ADR-002 §16.5).
   *
   * <p>The bound is per draft, so a page of drafts in {@code NEEDS_REVISION} would be a
   * multi-megabyte response carrying per-step reasons no list renders. {@code compileError} stays,
   * because it is a bounded code — nothing a caller needs in order to <em>know</em> that reasons
   * exist is hidden; only the reasons themselves are one read away.
   *
   * @param entity the draft row
   * @return the list representation returned by {@code GET /tests}
   */
  public static UITestDto forList(UITest entity) {
    return from(entity, false);
  }

  private static UITestDto from(UITest entity, boolean withDiagnostics) {
    return new UITestDto(
        entity.getId(),
        entity.getName(),
        entity.getDescription(),
        entity.getCsiId(),
        entity.getEnvironment(),
        LegacyStudioAdapter.parseSteps(entity.getSteps()),
        LegacyStudioAdapter.parseVariables(entity.getVariables()),
        new TestConfiguration(
            LegacyStudioAdapter.normalizeBrowser(entity.getBrowser()),
            LegacyStudioAdapter.viewport(entity.getViewportWidth(), entity.getViewportHeight()),
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
        entity.getCompileStatus(),
        entity.getCurrentCandidateRevisionId(),
        entity.getConfirmedRevisionId(),
        parse(entity.getCompileError(), CompileErrorDto.class),
        withDiagnostics
            ? parse(entity.getCompileDiagnostics(), CompileDiagnosticsDto.class)
            : null);
  }

  /**
   * Deserializes one of the two {@code jsonb} columns into its declared shape.
   *
   * <p>A stored document that cannot be read back is reported as absent rather than as a {@code
   * 500}: these are advisory reasons on a draft the caller is otherwise entitled to read, and
   * failing the whole read because one column is unparseable would withhold the draft over the
   * thing that was meant to explain it. The column is only ever written by this application, so
   * this is a defence against a future writer rather than against a caller.
   */
  private static <T> T parse(String json, Class<T> type) {
    if (json == null || json.isBlank()) {
      return null;
    }
    try {
      return MAPPER.readValue(json, type);
    } catch (JsonProcessingException e) {
      return null;
    }
  }
}
