package com.citi.put.checks.studio.dto;

import com.citi.put.checks.studio.compile.CompileState;
import com.citi.put.checks.studio.entity.UITest;
import com.citi.put.checks.studio.entity.UITestRevision;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
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
 *
 * <h2>The candidate's artifact and its hash</h2>
 *
 * <p>{@code currentCandidateArtifactHash} and {@code currentCandidateArtifact} were added by
 * ADR-002 §21 and belong to the revision {@code currentCandidateRevisionId} names. They are read in
 * the <em>same</em> transaction as the draft row, which is what makes {@code ConfirmCompileRequest}
 * a coherent conditional transaction: all four of its fields come from one read of this body, so
 * the revision, the hash, the source revision and the configuration revision a client asserts are a
 * set the draft actually held at one instant (§21.3). Sourcing the hash from a second request would
 * let the draft recompile in between and produce an internally inconsistent body that {@code
 * STALE_CANDIDATE} was never designed to name.
 *
 * <p>Both are {@code null} when there is no candidate, and both are {@code null} on the list
 * projection (§21.2, on §16.5's precedent).
 *
 * <p>The artifact is the <b>candidate's</b>; {@code steps} is the draft's current English. A review
 * surface that claims to show what was validated renders the artifact, never {@code steps} (§21.7).
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
    String currentCandidateArtifactHash,
    JsonNode currentCandidateArtifact,
    UUID confirmedRevisionId,
    String confirmedRevisionArtifactHash,
    JsonNode confirmedRevisionArtifact,
    CompileErrorDto compileError,
    CompileDiagnosticsDto compileDiagnostics) {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  /**
   * The single-draft projection: everything the row carries, diagnostics and candidate included.
   *
   * <p>The candidate revision is passed in rather than looked up here so that the caller can read
   * it in the <em>same</em> transaction as the draft row. That is not a style choice: it is the
   * whole of ADR-002 §21.3's argument for candidate A over a revision read route.
   *
   * @param entity the draft row
   * @param candidate the revision {@code entity.getCurrentCandidateRevisionId()} names, read in the
   *     same transaction, or {@code null} when the draft has no candidate
   * @return the full representation returned by {@code GET /tests/{id}} and the write routes
   */
  public static UITestDto from(UITest entity, UITestRevision candidate) {
    return from(entity, candidate, null, true);
  }

  /** The candidate and confirmed revisions are resolved independently by their persisted IDs. */
  public static UITestDto from(UITest entity, UITestRevision candidate, UITestRevision confirmed) {
    return from(entity, candidate, confirmed, true);
  }

  /**
   * The list projection: {@code compileDiagnostics}, {@code currentCandidateArtifact} and {@code
   * currentCandidateArtifactHash} are always {@code null} (ADR-002 §16.5, §21.2).
   *
   * <p>The bound is per draft, so a page of drafts in {@code NEEDS_REVISION} would be a
   * multi-megabyte response carrying per-step reasons and generated source no list renders. {@code
   * compileStatus}, {@code currentCandidateRevisionId} and the bounded {@code compileError} stay —
   * nothing a caller needs in order to <em>know</em> that reasons or a candidate exist is hidden;
   * only the reasons, the artifact and its hash are one read away.
   *
   * <p>No candidate is loaded on this path at all. That is the enforcement of the omission rather
   * than a description of it: this overload has no parameter to pass one through.
   *
   * @param entity the draft row
   * @return the list representation returned by {@code GET /tests}
   */
  public static UITestDto forList(UITest entity) {
    return from(entity, null, null, false);
  }

  private static UITestDto from(
      UITest entity, UITestRevision candidate, UITestRevision confirmed, boolean withDiagnostics) {
    // The hash and the artifact travel together, and **this method is not what makes that true**.
    //
    // An earlier version read the artifact first and then withheld the hash when the artifact came
    // back null, with a comment saying the asymmetry "is closed" here. @qa deleted that branch and
    // the entire studio package stayed green — 91 classes, 692 tests, the identical six failures —
    // because the branch is unreachable. `ui_test_revisions.artifact` is `JSONB NOT NULL` and
    // `artifact_hash` is `VARCHAR(64) NOT NULL` (V12), both named in the write-once trigger, and a
    // `jsonb` column cannot hold anything that is not already valid JSON. So `parse` cannot return
    // null for a revision row, and the withholding could never fire. A comment claiming a property
    // is closed, over code nothing can exercise, is this epic's twenty-first catalogued shape.
    //
    // What is true is that the pairing is a property of the **row**, enforced by the schema, and it
    // is asserted against the live database rather than restated here:
    // `CandidateArtifactProjectionIT.theRevisionRowIsWhatGuaranteesTheArtifactAndItsHashTravel-
    // Together` reads `information_schema` and reddens if either column becomes nullable. That
    // assertion can fail; this branch could not.
    JsonNode candidateArtifact =
        candidate == null ? null : parse(candidate.getArtifact(), JsonNode.class);
    String candidateArtifactHash = candidate == null ? null : candidate.getArtifactHash();

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
        candidateArtifactHash,
        candidateArtifact,
        entity.getConfirmedRevisionId(),
        confirmed == null ? null : confirmed.getArtifactHash(),
        confirmed == null ? null : parse(confirmed.getArtifact(), JsonNode.class),
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
