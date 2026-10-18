package com.citi.put.checks.studio.readiness;

import com.citi.put.checks.studio.StudioConflictException;
import com.citi.put.checks.studio.dispatch.ExecutionReadiness;
import com.citi.put.checks.studio.dto.CanonicalStudioCodec;
import com.citi.put.checks.studio.entity.UITest;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The readiness gate (Story 10.8, AC-22 to AC-27; architecture &sect;4.6; ADR-SC-005).
 *
 * <h2>One family</h2>
 *
 * <p>Only a confirmed observed revision ({@code publication_kind = 'GUIDED_RUN'}) is runnable. It
 * replays model-free through the observed verifier; anything else — no revision, a revision of
 * another family, or one whose source or configuration no longer matches the draft — is {@code 409
 * LEARN_REQUIRED}: the author presses Run and the guided session learns it.
 *
 * <h2>The terms</h2>
 *
 * <ol>
 *   <li>{@code deleted_at IS NULL} and {@code quarantined_at IS NULL}
 *   <li>{@code confirmed_revision_id} resolves to a revision of <em>this</em> test and CSI
 *   <li>that revision carries a {@code confirmed_by} and a {@code confirmed_at}
 *   <li>it was published by a guided run
 *   <li>its {@code source_revision} and {@code configuration_revision} equal the draft's
 *   <li>its {@code source_hash} equals the hash of the draft's current ordered steps, and its
 *       {@code artifact_hash} equals the hash of its artifact
 *   <li>the observed verifier accepts its immutable publication evidence and its authoring and
 *       configuration hashes equal the draft's
 * </ol>
 *
 * <p>Term 6 is deliberate belt-and-braces over the counters of term 5: a bug that failed to advance
 * one would otherwise let edited text run under an approved hash.
 *
 * <h2>Unconditional</h2>
 *
 * <p>There is no auto-confirm fallback, no {@code permitAll}-style property, no profile and no
 * feature flag that skips this gate, and no client-supplied "already learned" hint it will read.
 *
 * <h2>The one implementation of {@link ExecutionReadiness}</h2>
 *
 * <p>The acceptance path is wired to the interface and never to a concrete class.
 */
@Service
public class ExecutionReadinessService implements ExecutionReadiness {

  /**
   * The entire read the predicate performs.
   *
   * <p>One statement, so the draft and its confirmed revision are read consistently — two reads
   * could straddle a publication and produce a verdict that was never true of any single state of
   * the database.
   */
  public static final String READINESS_QUERY =
      "SELECT t.deleted_at, t.quarantined_at, t.csi_id, t.steps::text AS draft_source,\n"
          + "       t.source_revision, t.configuration_revision, t.confirmed_revision_id,\n"
          + "       r.id AS revision_id, r.test_id AS revision_test_id, r.csi_id AS"
          + " revision_csi_id,\n"
          + "       r.confirmed_by, r.confirmed_at,\n"
          + "       r.source_revision AS revision_source_revision,\n"
          + "       r.configuration_revision AS revision_configuration_revision,\n"
          + "       r.source_hash, r.artifact::text AS revision_artifact, r.artifact_hash,\n"
          + "       r.publication_kind,\n"
          + "       t.authoring::text AS draft_authoring,\n"
          + "       jsonb_build_object('browser',t.browser,\n"
          + "        "
          + " 'viewport',jsonb_build_object('width',t.viewport_width,'height',t.viewport_height),\n"
          + "         'timeoutSeconds',t.timeout_seconds,'waitStrategy',t.wait_strategy,\n"
          + "         'environment',t.environment)::text AS draft_configuration\n"
          + "  FROM ui_tests t\n"
          + "  LEFT JOIN ui_test_revisions r ON r.id = t.confirmed_revision_id\n"
          + " WHERE t.id = ?\n";

  /**
   * Whether a guided learning session for the test is still in progress. Terminal states are the
   * guided session service's own; an expired lease is not in progress.
   */
  static final String LEARNING_QUERY =
      "SELECT EXISTS(SELECT 1 FROM studio_guided_sessions WHERE test_id = ? AND expires_at > now()"
          + " AND state NOT IN ('SUCCEEDED','PUBLICATION_CONFLICT','FAILED','UNKNOWN_OUTCOME',"
          + "'CANCELLED','EXPIRED'))";

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private final JdbcTemplate jdbc;
  private com.citi.put.checks.studio.guided.publication.ObservedRevisionVerifier observed;

  @org.springframework.beans.factory.annotation.Autowired(required = false)
  public void installObservedVerifier(
      com.citi.put.checks.studio.guided.publication.ObservedRevisionVerifier verifier) {
    this.observed = verifier;
  }

  public ExecutionReadinessService(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public com.citi.put.checks.studio.authoring.IncrementalChangeService.Change change(UUID testId) {
    return new com.citi.put.checks.studio.authoring.IncrementalChangeService(jdbc).inspect(testId);
  }

  /**
   * The readiness state the authoring surface shows, derived from the same verdict the execute path
   * consults. OBS-015 uses the same semantic boundary for {@link StudioReadiness#NEEDS_RELEARN} and
   * ordinary acceptance, including edits to declarations that no step references.
   *
   * @param testId the test
   * @return {@code READY}, {@code LEARNING} or {@code UNLEARNED}
   */
  @Transactional(readOnly = true)
  public StudioReadiness readiness(UUID testId) {
    if (evaluate(testId).ready()) {
      return StudioReadiness.READY;
    }
    Boolean learning = jdbc.queryForObject(LEARNING_QUERY, Boolean.class, testId.toString());
    if (Boolean.TRUE.equals(learning)) {
      return StudioReadiness.LEARNING;
    }
    try {
      var change = change(testId);
      return change.baseRevisionId() != null && change.changed()
          ? StudioReadiness.NEEDS_RELEARN
          : StudioReadiness.UNLEARNED;
    } catch (com.citi.put.checks.studio.guided.session.GuidedSessionException refused) {
      return StudioReadiness.UNLEARNED;
    }
  }

  /**
   * Evaluates readiness. Reads only; changes nothing.
   *
   * @param testId the test the caller wants to execute
   * @return the verdict, with a message that says what needs to happen
   */
  @Transactional(readOnly = true)
  public ReadinessVerdict evaluate(UUID testId) {
    List<Map<String, Object>> rows = jdbc.queryForList(READINESS_QUERY, testId);
    if (rows.isEmpty()) {
      throw new IllegalArgumentException("UI Test not found: " + testId);
    }
    Map<String, Object> row = rows.get(0);

    // Term 1 — lifecycle. Refused by their own existing codes, not by LEARN_REQUIRED.
    if (row.get("deleted_at") != null) {
      return ReadinessVerdict.refused(
          ReadinessVerdict.TEST_DELETED, "Test " + testId + " is deleted; it cannot be executed.");
    }
    if (row.get("quarantined_at") != null) {
      return ReadinessVerdict.refused(
          ReadinessVerdict.TEST_QUARANTINED,
          "Test "
              + testId
              + " is quarantined pending CSI resolution; it cannot be executed until its CSI is"
              + " registered.");
    }

    // Term 2 — a confirmed revision of this test and this CSI.
    UUID confirmedRevisionId = (UUID) row.get("confirmed_revision_id");
    if (confirmedRevisionId == null || row.get("revision_id") == null) {
      return learnRequired(
          "This test has not been learned yet. Run it to learn the steps before it can replay.");
    }
    if (!testId.equals(row.get("revision_test_id"))
        || !String.valueOf(row.get("csi_id")).equals(String.valueOf(row.get("revision_csi_id")))) {
      return learnRequired(
          "The published revision of this test belongs to a different test or CSI. Run it to"
              + " learn the current steps.");
    }

    // Term 3 — write-once confirmation identity.
    if (row.get("confirmed_by") == null || row.get("confirmed_at") == null) {
      return learnRequired(
          "Revision " + confirmedRevisionId + " was never published. Run the test to learn it.");
    }

    // Term 4 — only a guided-run publication replays.
    if (!"GUIDED_RUN".equals(row.get("publication_kind"))) {
      return learnRequired(
          "This test has no learned revision. Run it to learn the steps before it can replay.");
    }

    // Semantic identity, rather than unused declaration counter changes, controls re-learning.
    try {
      var change = change(testId);
      if (change.changed()) {
        return learnRequired("The current authoring requires learning from its first changed step");
      }
    } catch (com.citi.put.checks.studio.guided.session.GuidedSessionException missing) {
      return learnRequired("The current authoring references cannot be resolved");
    }

    // Term 6 — the hashes. Belt-and-braces over the counters above; see the class javadoc.
    try {
      List<String> draftSourceLines =
          CanonicalStudioCodec.parseSteps(String.valueOf(row.get("draft_source")));
      ArrayNode draftLines = MAPPER.createArrayNode();
      draftSourceLines.forEach(line -> draftLines.add(line == null ? "" : line));
      if (!GuidedContracts.hash(draftLines).equals(String.valueOf(row.get("source_hash")))) {
        return learnRequired(
            "The steps of this test no longer match the text that was learned, even though the"
                + " revision counter did not move. Run it to learn the current steps.");
      }
      if (!GuidedContracts.hash(MAPPER.readTree(String.valueOf(row.get("revision_artifact"))))
          .equals(String.valueOf(row.get("artifact_hash")))) {
        return learnRequired(
            "The learned plan published for this test does not match its recorded hash. Run it"
                + " to learn the current steps.");
      }
    } catch (com.fasterxml.jackson.core.JsonProcessingException unreadable) {
      return learnRequired(
          "The learned plan published for this test cannot be read. Run it to learn the current"
              + " steps.");
    }

    // Term 7 — the observed verifier and the draft's current authoring and configuration.
    try {
      if (observed == null) {
        return ReadinessVerdict.refused(
            ReadinessVerdict.RUNTIME_INCOMPATIBLE, "Observed replay is unavailable");
      }
      JsonNode verified = observed.verify(confirmedRevisionId);
      JsonNode currentAuthoring = MAPPER.readTree(String.valueOf(row.get("draft_authoring")));
      ArrayNode orderedAuthoring = MAPPER.createArrayNode();
      for (JsonNode step : currentAuthoring.path("steps")) {
        int ordinal = orderedAuthoring.size();
        orderedAuthoring
            .addObject()
            .put("stepId", step.path("id").asText())
            .put("ordinal", ordinal)
            .put("source", step.path("text").asText());
      }
      if (!GuidedContracts.hash(orderedAuthoring)
              .equals(verified.path("artifact").path("authoringHash").asText())
          || !GuidedContracts.hash(MAPPER.readTree(String.valueOf(row.get("draft_configuration"))))
              .equals(verified.path("artifact").path("configurationHash").asText())) {
        return learnRequired("Observed source or configuration changed; deliberately relearn");
      }
      return ReadinessVerdict.ready(confirmedRevisionId);
    } catch (com.citi.put.checks.studio.guided.session.GuidedSessionException
        | com.fasterxml.jackson.core.JsonProcessingException refusal) {
      return ReadinessVerdict.refused(
          ReadinessVerdict.RUNTIME_INCOMPATIBLE,
          "Observed replay requires supported immutable publication evidence");
    }
  }

  /**
   * The {@link ExecutionReadiness} seam the acceptance transaction consults (Story 10.7a AC-8a).
   *
   * <p>A thin adaptor over {@link #evaluate(UUID)} and deliberately nothing more: the predicate has
   * one expression, and a second one reachable through the interface would be a second gate. The
   * draft is re-read by id rather than trusted from the passed entity, because {@link
   * #READINESS_QUERY} must read the draft and its confirmed revision in one statement.
   *
   * @param test the draft acceptance wants to run
   * @return the verdict, never {@code null} and never thrown for an unready draft
   */
  @Override
  @Transactional(readOnly = true)
  public Verdict evaluate(UITest test) {
    ReadinessVerdict verdict = evaluate(test.getId());
    return verdict.ready()
        ? Verdict.accepted()
        : new Verdict(false, verdict.code(), verdict.message());
  }

  /**
   * Evaluates readiness and refuses loudly.
   *
   * @param testId the test the caller wants to execute
   * @return the confirmed revision that may run
   * @throws StudioConflictException {@code 409} carrying the verdict's code and message
   */
  @Transactional(readOnly = true)
  public UUID requireReady(UUID testId) {
    ReadinessVerdict verdict = evaluate(testId);
    if (!verdict.ready()) {
      throw new StudioConflictException(verdict.code(), verdict.message());
    }
    return verdict.revisionId();
  }

  private static ReadinessVerdict learnRequired(String message) {
    return ReadinessVerdict.refused(ReadinessVerdict.LEARN_REQUIRED, message);
  }

  private static long asLong(Object value) {
    return value == null ? -1L : ((Number) value).longValue();
  }
}
