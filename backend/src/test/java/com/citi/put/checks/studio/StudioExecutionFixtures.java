package com.citi.put.checks.studio;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEntry;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.compile.ArtifactCanonicalizer;
import com.citi.put.checks.studio.compile.CompilePins;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;

/**
 * Seeding shared by the story 10.7 integration tests.
 *
 * <p>Acceptance now runs the readiness gate, so an executable draft needs a <em>confirmed
 * revision</em> rather than just a row in {@code ui_tests}. That is the point of AC-8a and it is
 * why these helpers exist: every test that executes something has to say out loud that the draft
 * was compiled and confirmed, which is exactly what the product requires of a user.
 */
public final class StudioExecutionFixtures {

  private final JdbcTemplate jdbc;

  public StudioExecutionFixtures(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  /** An identity with the given role on one CSI, and no administrator escape hatch. */
  public static Authentication identity(String email, String csiId, String role) {
    return new BffAuthenticationToken(
        new UserIdentity(
            "uid-" + email,
            email,
            email,
            "Ops",
            List.of(),
            List.of(new CsiOwnershipEntry(csiId, role))));
  }

  /** A platform administrator: readable and executable everywhere. */
  public static Authentication admin(String email) {
    return new BffAuthenticationToken(
        new UserIdentity("uid-" + email, email, email, "Ops", List.of("checks-admin"), List.of()));
  }

  public void seedUser(String email) {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'Studio User', ?, ?, true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + email,
        email,
        Timestamp.from(Instant.now()));
  }

  public void seedCsi(String csiId, String ownerEmail) {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, 'Studio CSI ' || ?, 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        csiId,
        csiId,
        ownerEmail,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  /** A draft with the given steps, at source/configuration revision 1/1 and {@code STALE}. */
  public UUID seedTest(String name, String csiId, String createdBy, List<String> steps) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO ui_tests (id, name, csi_id, environment, browser, steps, variables,"
            + " timeout_seconds, wait_strategy, created_by, created_at, updated_at)"
            + " VALUES (?, ?, ?, 'Production', 'chromium', CAST(? AS jsonb), CAST('[]' AS jsonb),"
            + " 30, 'networkidle', ?, ?, ?)",
        id,
        name,
        csiId,
        stepsJson(steps),
        createdBy,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    return id;
  }

  /**
   * Compiles and confirms the draft, which is what makes it runnable (AC-8a).
   *
   * <p>{@code compile_status} is deliberately left wherever the caller put it: readiness keys on
   * the confirmed revision matching both of the draft's revisions, not on {@code compile_status},
   * because a failed <em>optional</em> recompile drives a confirmed unedited draft to {@code STALE}
   * and must not un-run it (story 10.4 ISSUE-003).
   *
   * <h2>Why the hashes and the provenance stopped being placeholders</h2>
   *
   * <p>Story 10.7a wrote {@code 'source-hash'}, {@code 'artifact-hash-xxxx'} and an empty
   * provenance here, because the gate it shipped against was its own provisional implementation and
   * checked neither. Story 10.8's {@code ExecutionReadinessService} checks both: term 5 re-hashes
   * the draft's ordered {@code originalText} and the revision's artifact, and term 7 compares the
   * recorded validator and syntax-reference versions against the configured pin.
   *
   * <p>So every value below is now derived rather than invented — by {@link ArtifactCanonicalizer},
   * the same helper the gate re-derives them with, and from {@link CompilePins}, the same constants
   * it compares against. This is a fixture catching up with a real gate, not a gate being relaxed
   * to a fixture: a placeholder hash <em>should</em> be refused, and the day these literals were
   * accepted by the provisional implementation is the day the fixtures stopped describing anything
   * a user could produce.
   */
  /** What {@code CompileInputs.referencesJson()} writes when nothing is declared (§8.3). */
  public static final String NO_REFERENCES = "{\"variables\":[],\"secrets\":[]}";

  /** A declaration document in the one shape the typed reader recognises (AC-1). */
  public static String references(List<String> variables, List<String> secrets) {
    return "{\"variables\":["
        + variables.stream()
            .map(name -> '"' + name + '"')
            .collect(java.util.stream.Collectors.joining(","))
        + "],\"secrets\":["
        + secrets.stream()
            .map(name -> '"' + name + '"')
            .collect(java.util.stream.Collectors.joining(","))
        + "]}";
  }

  /** A nonsecret configuration in the shape the contract's {@code TestConfiguration} declares. */
  public static final String DEFAULT_CONFIGURATION =
      "{\"browser\":\"chromium\",\"viewport\":{\"width\":1280,\"height\":720},"
          + "\"timeoutSeconds\":30,\"waitStrategy\":\"load\"}";

  public UUID confirmRevision(UUID testId, String csiId, List<String> steps, String references) {
    // The shapes the real producers write. Story 10.17 makes the readers fail closed, so a fixture
    // that wrote a shape CompileInputs never produces would be testing a path production cannot
    // reach — and would have kept passing while the dispatch body diverged from the contract.
    return confirmRevision(testId, csiId, steps, references, DEFAULT_CONFIGURATION);
  }

  /**
   * As {@link #confirmRevision(UUID, String, List, String)}, with the stored configuration chosen.
   *
   * <p>The revision row is write-once and the database enforces it, so a configuration a test needs
   * to be unusual has to be written at INSERT. Used by the {@code DISPATCH_FAILED} branch, which
   * exists because story 10.17 derives the runtime budget from this document (QA LOW-4).
   */
  public UUID confirmRevision(
      UUID testId, String csiId, List<String> steps, String references, String configuration) {
    UUID revisionId = UUID.randomUUID();
    String artifact = "{\"steps\":[]}";
    jdbc.update(
        "INSERT INTO ui_test_revisions (id, test_id, csi_id, source_revision,"
            + " configuration_revision, source, source_hash, artifact, artifact_hash,"
            + " artifact_schema_version, configuration, \"references\", provenance, created_by,"
            + " created_at, confirmed_by, confirmed_at)"
            + " VALUES (?, ?, ?, 1, 1, CAST(? AS jsonb), ?,"
            + " CAST(? AS jsonb), ?, ?,"
            + " CAST(? AS jsonb), CAST(? AS jsonb), CAST(? AS jsonb), 'compiler', ?,"
            + " 'confirmer', ?)",
        revisionId,
        testId,
        csiId,
        stepsJson(steps),
        ArtifactCanonicalizer.sourceHash(steps),
        artifact,
        ArtifactCanonicalizer.hash(artifact),
        CompilePins.SUPPORTED_ARTIFACT_VERSION,
        configuration,
        references == null ? NO_REFERENCES : references,
        pinnedProvenance(),
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    jdbc.update("UPDATE ui_tests SET confirmed_revision_id = ? WHERE id = ?", revisionId, testId);
    return revisionId;
  }

  /**
   * Provenance recorded under the versions this deployment pins, so the revision is runtime
   * compatible on the exact-match terms the backend gate owns (story 10.8 AC-25).
   *
   * <p>The ranged Playwright/executor terms are recorded and deliberately not compared here — that
   * rule lives in the runner's own {@code isCompatible}, which revalidates before any browser
   * launch. One rule, one owner.
   *
   * @return the provenance document
   */
  private static String pinnedProvenance() {
    return "{\"model\":\"fixture-model@1\",\"promptVersion\":\""
        + CompilePins.PROMPT_VERSION
        + "\",\"syntaxReferenceVersion\":\""
        + CompilePins.SYNTAX_REFERENCE_VERSION
        + "\",\"validatorSchemaVersion\":\"2.0.0\","
        + "\"languagePolicyVersion\":\"2.0.0\",\"executorVersion\":\"2.0.0\","
        + "\"playwrightVersion\":\"1.63.0\",\"artifactSchemaVersion\":"
        + CompilePins.SUPPORTED_ARTIFACT_VERSION
        + "}";
  }

  /** A draft that is compiled, confirmed and immediately runnable. */
  public RunnableTest seedRunnableTest(
      String name, String csiId, String createdBy, List<String> steps) {
    UUID testId = seedTest(name, csiId, createdBy, steps);
    UUID revisionId = confirmRevision(testId, csiId, steps, null);
    return new RunnableTest(testId, revisionId);
  }

  /** A runnable draft and its confirmed revision. */
  public record RunnableTest(UUID testId, UUID revisionId) {}

  public void setCompileStatus(UUID testId, String status) {
    jdbc.update("UPDATE ui_tests SET compile_status = ? WHERE id = ?", status, testId);
  }

  private static String stepsJson(List<String> steps) {
    StringBuilder json = new StringBuilder("[");
    for (int index = 0; index < steps.size(); index++) {
      if (index > 0) {
        json.append(',');
      }
      json.append('"').append(steps.get(index).replace("\"", "\\\"")).append('"');
    }
    return json.append(']').toString();
  }
}
