package com.citi.put.checks.studio.readiness;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Seeding for the readiness tests: a draft and a guided learning session for it.
 *
 * <p>Since ADR-SC-005 the only revision family is an observed ({@code GUIDED_RUN}) publication,
 * which only a guided run produces; tests that need one publish it through {@code
 * ObservedPublicationFixture}. A revision of any other family cannot be stored (V15).
 */
final class ReadinessFixtures {

  static final String OWNER = "readiness-owner@citi.com";
  static final String CSI_ID = "60402";

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private ReadinessFixtures() {}

  /** A draft that has never been learned. */
  static UUID seedDraft(JdbcTemplate jdbc, List<String> steps) {
    UUID id = UUID.randomUUID();
    ArrayNode stepsJson = MAPPER.createArrayNode();
    steps.forEach(stepsJson::add);
    jdbc.update(
        "INSERT INTO ui_tests (id, name, csi_id, environment, browser, steps, variables,"
            + " created_by, created_at, updated_at) VALUES (?, 'Readiness draft', ?,"
            + " 'Production', 'chromium', CAST(? AS jsonb), CAST('[]' AS jsonb), ?, ?, ?)",
        id,
        CSI_ID,
        stepsJson.toString(),
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    return id;
  }

  /** A guided learning session for the draft in the given state, expiring in ten minutes. */
  static String learningSession(JdbcTemplate jdbc, UUID testId, String state) {
    String sessionId = "readiness-" + UUID.randomUUID();
    String scopeHash = "b".repeat(64);
    ObjectNode document = MAPPER.createObjectNode();
    document.put("sessionId", sessionId).put("scopeHash", scopeHash).put("state", state);
    document.putObject("scope").put("principalId", OWNER);
    jdbc.update(
        "INSERT INTO studio_guided_sessions (session_id, test_id, principal_id, scope_hash, state,"
            + " expires_at, document) VALUES (?, ?, ?, ?, ?, now() + interval '10 minutes',"
            + " CAST(? AS jsonb))",
        sessionId,
        testId.toString(),
        OWNER,
        scopeHash,
        state,
        document.toString());
    return sessionId;
  }

  static void seedUser(JdbcTemplate jdbc, String email) {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'Readiness Owner', ?, ?, true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + email,
        email,
        Timestamp.from(Instant.now()));
  }

  static void seedCsi(JdbcTemplate jdbc, String id) {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, 'Readiness CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        id,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}
