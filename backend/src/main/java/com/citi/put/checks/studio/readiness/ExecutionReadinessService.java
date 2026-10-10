package com.citi.put.checks.studio.readiness;

import com.citi.put.checks.studio.StudioConflictException;
import com.citi.put.checks.studio.compile.ArtifactCanonicalizer;
import com.citi.put.checks.studio.compile.CompilePins;
import com.citi.put.checks.studio.compile.IntentRevisionVerifier;
import com.citi.put.checks.studio.dispatch.ExecutionReadiness;
import com.citi.put.checks.studio.dto.LegacyStudioAdapter;
import com.citi.put.checks.studio.entity.UITest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The readiness gate (Story 10.8, AC-22 to AC-27; architecture &sect;4.6).
 *
 * <h2>{@code compile_status} is not a term of this predicate</h2>
 *
 * <p>This is the decision the story exists to make, and it is load-bearing rather than stylistic.
 * 10.4's {@code beginCompile} is deliberately unconditional on current status, so an
 * <em>optional</em> recompile of a confirmed, unedited draft drives it {@code READY → COMPILING →
 * STALE} when the gateway is down. A gate that read {@code compile_status = 'READY'} would let a
 * gateway outage revoke an approval nobody withdrew — which is exactly what Epic 10 &sect;10.8's
 * own acceptance bullet forbids: "Gateway outage leaves saved draft retryable and <b>unchanged
 * confirmed tests runnable</b>."
 *
 * <p>So {@code compile_status} is the authoring UI's state and never a term here. Readiness
 * describes the <em>confirmed revision's</em> relationship to the draft's revisions; {@code STALE}
 * describes the <em>draft's</em> relationship to its last compile. They are different questions and
 * a confirmed, unedited test sits at {@code STALE} after a failed optional recompile and is fully
 * runnable. {@link #READINESS_QUERY} is the whole read the predicate performs, and it does not
 * select that column — that absence is asserted directly by {@code ExecutionReadinessTest} and
 * proved behaviourally across all five states by {@code DeReadyCarryForwardTest}.
 *
 * <h2>The seven terms</h2>
 *
 * <ol>
 *   <li>{@code deleted_at IS NULL} and {@code quarantined_at IS NULL}
 *   <li>{@code confirmed_revision_id} resolves to a revision of <em>this</em> test and CSI
 *   <li>that revision carries a {@code confirmed_by} and a {@code confirmed_at}
 *   <li>its {@code source_revision} and {@code configuration_revision} equal the draft's
 *   <li>its {@code source_hash} equals the canonical hash of the draft's current ordered {@code
 *       originalText}, and its {@code artifact_hash} equals the canonical hash of its artifact
 *   <li>its {@code artifact_schema_version} equals the pin
 *   <li>its recorded provenance is runtime-compatible on the exact-match terms
 * </ol>
 *
 * <p>Term 5 is deliberate belt-and-braces and must not be dropped as an optimisation. The revision
 * counters are the primary guard, but they are counters: a bug that failed to advance one would
 * otherwise let edited text run under an approved hash, and re-hashing is the only term that
 * survives that bug.
 *
 * <h2>Unconditional</h2>
 *
 * <p>There is no auto-confirm fallback, no {@code permitAll}-style property, no profile and no
 * feature flag that skips this gate, and no client-supplied "already confirmed" hint it will read.
 * The only configuration this class binds is {@link RuntimePinProperties}, whose fields are version
 * strings — none of them can make a test ready.
 *
 * <h2>The one implementation of {@link ExecutionReadiness}</h2>
 *
 * <p>Story 10.7a declared the seam and shipped a provisional implementation against it so that the
 * acceptance transaction could be written and proved before this predicate existed. This class is
 * the implementation that replaces it, and 10.7a's is deleted rather than left beside it: two beans
 * of one interface is how an acceptance path silently keeps consulting the weaker gate. The
 * acceptance path is wired to the interface and never to a concrete class, so nothing there changed
 * when the implementation did.
 */
@Service
public class ExecutionReadinessService implements ExecutionReadiness {

  /**
   * The entire read the predicate performs.
   *
   * <p>One statement, so the draft and its confirmed revision are read consistently — two reads
   * could straddle a confirmation and produce a verdict that was never true of any single state of
   * the database.
   *
   * <p>The column list is itself an assertion: {@code compile_status}, {@code compile_request_id},
   * {@code compile_error}, {@code compile_diagnostics} and {@code current_candidate_revision_id}
   * are absent, so no future edit can make readiness depend on them without changing this constant
   * and failing the test that reads it.
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
          + "       r.artifact_schema_version, r.publication_kind, r.provenance::text AS"
          + " revision_provenance,\n"
          + "       r.source::text AS revision_source_document,\n"
          + "       r.authoring::text AS revision_authoring,\n"
          + "       r.authoring_revision_inputs::text AS revision_authoring_inputs,\n"
          + "       r.reference_policy::text AS revision_reference_policy,\n"
          + "       r.intent_derivation_version,\n"
          + "       t.authoring::text AS draft_authoring,\n"
          + "       jsonb_build_object('browser',CASE t.browser WHEN 'chrome' THEN 'chromium' ELSE"
          + " t.browser END,\n"
          + "        "
          + " 'viewport',jsonb_build_object('width',t.viewport_width,'height',t.viewport_height),\n"
          + "         'timeoutSeconds',t.timeout_seconds,'waitStrategy',t.wait_strategy,\n"
          + "         'environment',t.environment)::text AS draft_configuration\n"
          + "  FROM ui_tests t\n"
          + "  LEFT JOIN ui_test_revisions r ON r.id = t.confirmed_revision_id\n"
          + " WHERE t.id = ?\n";

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private final JdbcTemplate jdbc;
  private final RuntimePinProperties pin;
  private com.citi.put.checks.studio.guided.publication.ObservedRevisionVerifier observed;

  @org.springframework.beans.factory.annotation.Autowired(required = false)
  public void installObservedVerifier(
      com.citi.put.checks.studio.guided.publication.ObservedRevisionVerifier verifier) {
    this.observed = verifier;
  }

  public ExecutionReadinessService(JdbcTemplate jdbc, RuntimePinProperties pin) {
    this.jdbc = jdbc;
    this.pin = pin;
  }

  /**
   * Evaluates readiness. Reads only; changes nothing.
   *
   * @param testId the test the caller wants to execute
   * @return the verdict, with a message that says what needs confirmation
   */
  @Transactional(readOnly = true)
  public ReadinessVerdict evaluate(UUID testId) {
    List<Map<String, Object>> rows = jdbc.queryForList(READINESS_QUERY, testId);
    if (rows.isEmpty()) {
      throw new IllegalArgumentException("UI Test not found: " + testId);
    }
    Map<String, Object> row = rows.get(0);

    // Term 1 — lifecycle. Refused by their own existing codes, not by COMPILE_REQUIRED.
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
    if (confirmedRevisionId == null) {
      return ReadinessVerdict.refused(
          ReadinessVerdict.COMPILE_REQUIRED, neverConfirmedMessage(testId));
    }
    if (row.get("revision_id") == null) {
      return ReadinessVerdict.refused(
          ReadinessVerdict.COMPILE_REQUIRED,
          "This test points at confirmed revision "
              + confirmedRevisionId
              + ", which no longer exists. Compile and confirm the current steps before running"
              + " it.");
    }
    if (!testId.equals(row.get("revision_test_id"))
        || !String.valueOf(row.get("csi_id")).equals(String.valueOf(row.get("revision_csi_id")))) {
      return ReadinessVerdict.refused(
          ReadinessVerdict.COMPILE_REQUIRED,
          "The confirmed revision of this test belongs to a different test or CSI. Compile and"
              + " confirm the current steps before running it.");
    }

    // Term 3 — write-once confirmation identity.
    if (row.get("confirmed_by") == null || row.get("confirmed_at") == null) {
      return ReadinessVerdict.refused(
          ReadinessVerdict.COMPILE_REQUIRED,
          "Revision "
              + confirmedRevisionId
              + " was never confirmed by anyone. Review the compiled steps and confirm them before"
              + " running this test.");
    }

    // ADR-SC-003 — every authoring-v2 revision must carry the reference policy re-derived from its
    // own immutable authoring under the current derivation version.
    // This is deliberately before every dispatch-side effect: acceptance consults this verdict
    // before creating or claiming a ledger row, resolving values or contacting the runner.
    boolean observedFamily =
        asInt(row.get("artifact_schema_version")) == 2
            && "GUIDED_RUN".equals(row.get("publication_kind"));
    if (!observedFamily
        && row.get("revision_authoring") != null
        && !IntentRevisionVerifier.verify(
            string(row.get("revision_source_document")),
            string(row.get("revision_authoring")),
            string(row.get("revision_authoring_inputs")),
            string(row.get("revision_reference_policy")),
            string(row.get("intent_derivation_version")),
            string(row.get("revision_provenance")))) {
      return ReadinessVerdict.refused(
          ReadinessVerdict.COMPILE_REQUIRED,
          "The confirmed authoring-v2 revision has no valid reference policy. Recompile"
              + " and confirm the current steps before running it.");
    }

    // Term 4 — the revision pair.
    long draftSource = asLong(row.get("source_revision"));
    long draftConfiguration = asLong(row.get("configuration_revision"));
    long revisionSource = asLong(row.get("revision_source_revision"));
    long revisionConfiguration = asLong(row.get("revision_configuration_revision"));
    if (revisionSource != draftSource) {
      return ReadinessVerdict.refused(
          ReadinessVerdict.COMPILE_REQUIRED,
          "The steps of this test were edited after it was confirmed (confirmed at source revision "
              + revisionSource
              + ", now at "
              + draftSource
              + "). Compile and confirm the current steps before running it.");
    }
    if (revisionConfiguration != draftConfiguration) {
      return ReadinessVerdict.refused(
          ReadinessVerdict.COMPILE_REQUIRED,
          "The execution configuration of this test — environment, variables, viewport, timeout,"
              + " browser or wait strategy — was changed after it was confirmed (confirmed at"
              + " configuration revision "
              + revisionConfiguration
              + ", now at "
              + draftConfiguration
              + "). Compile and confirm it again before running it.");
    }

    // Term 5 — the hashes. Belt-and-braces over the counters above; see the class javadoc.
    List<String> draftSourceLines =
        LegacyStudioAdapter.parseSteps(String.valueOf(row.get("draft_source")));
    String draftSourceHash = ArtifactCanonicalizer.sourceHash(draftSourceLines);
    if (!draftSourceHash.equals(String.valueOf(row.get("source_hash")))) {
      return ReadinessVerdict.refused(
          ReadinessVerdict.COMPILE_REQUIRED,
          "The steps of this test no longer match the text that was confirmed, even though the"
              + " revision counter did not move. Compile and confirm the current steps before"
              + " running it.");
    }
    String recordedArtifactHash = String.valueOf(row.get("artifact_hash"));
    String recomputedArtifactHash =
        ArtifactCanonicalizer.hash(String.valueOf(row.get("revision_artifact")));
    if (!recomputedArtifactHash.equals(recordedArtifactHash)) {
      return ReadinessVerdict.refused(
          ReadinessVerdict.COMPILE_REQUIRED,
          "The compiled artifact confirmed for this test does not match its recorded hash."
              + " Compile and confirm the current steps before running it.");
    }

    if (observedFamily) {
      try {
        if (observed == null) {
          return ReadinessVerdict.refused(
              ReadinessVerdict.RUNTIME_INCOMPATIBLE, "Observed replay is unavailable");
        }
        JsonNode verified = observed.verify(confirmedRevisionId);
        JsonNode currentAuthoring = MAPPER.readTree(String.valueOf(row.get("draft_authoring")));
        var orderedAuthoring = MAPPER.createArrayNode();
        for (JsonNode step : currentAuthoring.path("steps")) {
          int ordinal = orderedAuthoring.size();
          orderedAuthoring
              .addObject()
              .put("stepId", step.path("id").asText())
              .put("ordinal", ordinal)
              .put("source", step.path("text").asText());
        }
        if (!com.citi.put.checks.studio.guided.session.GuidedContracts.hash(orderedAuthoring)
                .equals(verified.path("artifact").path("authoringHash").asText())
            || !com.citi.put.checks.studio.guided.session.GuidedContracts.hash(
                    MAPPER.readTree(String.valueOf(row.get("draft_configuration"))))
                .equals(verified.path("artifact").path("configurationHash").asText())) {
          return ReadinessVerdict.refused(
              ReadinessVerdict.COMPILE_REQUIRED,
              "Observed source or configuration changed; deliberately relearn");
        }
        return ReadinessVerdict.ready(confirmedRevisionId);
      } catch (com.citi.put.checks.studio.guided.session.GuidedSessionException
          | com.fasterxml.jackson.core.JsonProcessingException refusal) {
        return ReadinessVerdict.refused(
            ReadinessVerdict.RUNTIME_INCOMPATIBLE,
            "Observed replay requires supported immutable publication evidence");
      }
    }

    // Term 6 — the artifact envelope version this deployment can execute.
    int artifactSchemaVersion = asInt(row.get("artifact_schema_version"));
    if (artifactSchemaVersion != CompilePins.SUPPORTED_ARTIFACT_VERSION) {
      return ReadinessVerdict.refused(
          ReadinessVerdict.RUNTIME_INCOMPATIBLE,
          "The confirmed revision of this test was compiled as artifact schema version "
              + artifactSchemaVersion
              + "; this runtime executes version "
              + CompilePins.SUPPORTED_ARTIFACT_VERSION
              + " only. The revision is preserved; recompile and confirm to run it.");
    }

    // Term 7 — the exact-match runtime terms. The ranged Playwright/executor comparison stays with
    // the runner's own isCompatible, which revalidates before any browser launch (§4.5).
    List<String> mismatches = runtimeMismatches(String.valueOf(row.get("revision_provenance")));
    if (!mismatches.isEmpty()) {
      return ReadinessVerdict.refused(
          ReadinessVerdict.RUNTIME_INCOMPATIBLE,
          "The confirmed revision of this test was validated under a different runtime ("
              + String.join("; ", mismatches)
              + "). The revision is preserved rather than reinterpreted; recompile and confirm to"
              + " run it.");
    }

    return ReadinessVerdict.ready(confirmedRevisionId);
  }

  /**
   * The {@link ExecutionReadiness} seam the acceptance transaction consults (Story 10.7a AC-8a).
   *
   * <p>A thin adaptor over {@link #evaluate(UUID)} and deliberately nothing more: the predicate has
   * one expression, and a second one reachable through the interface would be a second gate. The
   * draft is re-read by id rather than trusted from the passed entity, because {@link
   * #READINESS_QUERY} must read the draft and its confirmed revision in one statement — reading
   * half the terms from a detached entity and half from the database is how a verdict that was
   * never true of any single state of the database gets produced.
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

  /**
   * The exact-match runtime terms that disagree with the configured pin.
   *
   * @param provenanceJson the revision's recorded provenance
   * @return one entry per differing field, naming the field and both values
   */
  private List<String> runtimeMismatches(String provenanceJson) {
    List<String> mismatches = new ArrayList<>();
    JsonNode provenance;
    try {
      provenance = MAPPER.readTree(provenanceJson);
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      return List.of("provenance is unreadable");
    }
    compare(
        mismatches,
        "validatorSchemaVersion",
        provenance.path("validatorSchemaVersion").asText(null),
        pin.validatorSchemaVersion());
    compare(
        mismatches,
        "syntaxReferenceVersion",
        provenance.path("syntaxReferenceVersion").asText(null),
        pin.syntaxReferenceVersion());
    return mismatches;
  }

  private static String string(Object value) {
    return value == null ? null : String.valueOf(value);
  }

  private static void compare(
      List<String> mismatches, String field, String recorded, String running) {
    if (!Objects.equals(recorded, running)) {
      mismatches.add(field + " recorded " + recorded + ", this runtime runs " + running);
    }
  }

  /**
   * The "never confirmed" message, enriched only on the negative path.
   *
   * <p>The enrichment is a <em>second</em> query on purpose. Telling an author "a candidate is
   * waiting for you" rather than "compile this test" needs {@code current_candidate_revision_id},
   * and reading that column inside {@link #READINESS_QUERY} would put a compile-state column one
   * careless edit away from becoming a term of the predicate. Keeping it out here makes that
   * structurally impossible: this method runs only after the verdict is already decided.
   */
  private String neverConfirmedMessage(UUID testId) {
    UUID candidate =
        jdbc.queryForObject(
            "SELECT current_candidate_revision_id FROM ui_tests WHERE id = ?", UUID.class, testId);
    if (candidate != null) {
      return "This test has a compiled candidate ("
          + candidate
          + ") that nobody has confirmed yet. Review the compiled steps and confirm them before"
          + " running it.";
    }
    return "This test has never been confirmed. Compile it, review the compiled steps and confirm"
        + " them before running it.";
  }

  private static long asLong(Object value) {
    return value == null ? -1L : ((Number) value).longValue();
  }

  private static int asInt(Object value) {
    return value == null ? -1 : ((Number) value).intValue();
  }
}
