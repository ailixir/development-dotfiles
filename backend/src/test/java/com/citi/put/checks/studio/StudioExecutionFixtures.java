package com.citi.put.checks.studio;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEntry;
import com.citi.put.checks.security.UserIdentity;
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
   */
  public UUID confirmRevision(UUID testId, String csiId, List<String> steps, String references) {
    UUID revisionId = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO ui_test_revisions (id, test_id, csi_id, source_revision,"
            + " configuration_revision, source, source_hash, artifact, artifact_hash,"
            + " artifact_schema_version, configuration, \"references\", provenance, created_by,"
            + " created_at, confirmed_by, confirmed_at)"
            + " VALUES (?, ?, ?, 1, 1, CAST(? AS jsonb), 'source-hash',"
            + " CAST('{\"steps\":[]}' AS jsonb), 'artifact-hash-' || ?, 1,"
            + " CAST('{}' AS jsonb), CAST(? AS jsonb), CAST('{}' AS jsonb), 'compiler', ?,"
            + " 'confirmer', ?)",
        revisionId,
        testId,
        csiId,
        stepsJson(steps),
        revisionId.toString().substring(0, 8),
        references == null ? "[]" : references,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    jdbc.update("UPDATE ui_tests SET confirmed_revision_id = ? WHERE id = ?", revisionId, testId);
    return revisionId;
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
