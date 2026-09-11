package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.StudioConflictException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.yaml.snakeyaml.Yaml;

/**
 * Story 10.8 AC-1b — <b>the divergence between the frozen {@code compileTest} operation and 10.4's
 * lifecycle guard, recorded rather than papered over.</b>
 *
 * <p>The facts are verified below, not asserted on trust:
 *
 * <ol>
 *   <li>{@code CompileStateService.requireCompilable} throws {@code StudioConflictException} with
 *       {@code TEST_DELETED} and {@code TEST_QUARANTINED}, which surface as {@code 409}.
 *   <li>The frozen {@code compileTest} operation declares only {@code 202}, {@code 401} and {@code
 *       403}.
 *   <li>AC-3 forbids any path that bypasses the service.
 * </ol>
 *
 * <p>Together those mean <b>no implementation of the route can both honour the guard and satisfy
 * the document as written</b>. Under ADR-002 §12 a status code on a public operation is Class C —
 *
 * @architect, always — so this story escalates and leaves the case unimplemented with its test
 *     {@link #compilingADeletedTestAnswersTheDeclaredStatusCode() disabled and named}, rather than
 *     inventing a response.
 *     <p>Three non-options, named here so they cannot be quietly taken later:
 *     <ul>
 *       <li><b>{@code 403}</b> — a deleted test is not an authorization failure, and saying so is a
 *           lie the frontend then has to un-learn.
 *       <li><b>{@code 202} then failing asynchronously</b> — that begins a compile on a draft
 *           nobody may compile and spends a gateway call to say so.
 *       <li><b>Widening {@code requireCompilable}</b> — loosening a guard to stop a test telling
 *           the truth, which §12 names as the one manoeuvre whose only effect is to silence a
 *           failure.
 *     </ul>
 *     <p>Candidate amendment for @architect: add {@code '409': {$ref:
 *     '#/components/responses/Conflict'}} to {@code compileTest}, with {@code TEST_DELETED} and
 *     {@code TEST_QUARANTINED} as the codes — matching {@code confirmCompile} and {@code
 *     executeTest}, which already carry it. Fallback owner if no ruling lands before wave 3 closes:
 *     story 10.9.
 */
@SpringBootTest
@ActiveProfiles("local")
class CompileRouteContractDivergenceTest {

  private static final Path CONTRACT = Path.of("..", "docs", "specs", "studio", "openapi.yaml");
  private static final String OWNER = "divergence-owner@citi.com";
  private static final String CSI_ID = "60406";

  private static Map<String, Object> contract;

  @Autowired private CompileStateService states;
  @Autowired private JdbcTemplate jdbc;

  private UUID testId;

  @BeforeAll
  @SuppressWarnings("unchecked")
  static void loadContract() throws IOException {
    contract =
        (Map<String, Object>) new Yaml().load(Files.readString(CONTRACT, StandardCharsets.UTF_8));
  }

  @BeforeEach
  void setUp() {
    seedUser();
    seedCsi();
    testId = seedTest();
  }

  @Test
  void theFrozenCompileOperationDeclaresNoConflictResponse() {
    assertThat(declaredResponses("/tests/{id}/compile"))
        .as("the premise of AC-1b: the document leaves no code for a refused compile")
        .containsExactlyInAnyOrder("202", "401", "403");
  }

  @Test
  void theTwoOperationsThatAlreadyCarryTheSameConflictShowHowSmallTheAmendmentIs() {
    assertThat(declaredResponses("/tests/{id}/confirm-compile")).contains("409");
    assertThat(declaredResponses("/tests/{id}/execute")).contains("409");
  }

  @Test
  void theServiceGuardReallyDoesThrowAConflictForADeletedOrQuarantinedTest() {
    jdbc.update("UPDATE ui_tests SET deleted_at = NOW() WHERE id = ?", testId);
    assertThat(conflictCodeFrom(testId)).isEqualTo("TEST_DELETED");

    jdbc.update(
        "UPDATE ui_tests SET deleted_at = NULL, quarantined_at = NOW() WHERE id = ?", testId);
    assertThat(conflictCodeFrom(testId)).isEqualTo("TEST_QUARANTINED");
  }

  @Test
  void theOperationIsStillMarkedAsNotYetImplemented() {
    assertThat(operationFlag("/tests/{id}/compile", "x-not-yet-implemented"))
        .as(
            "the route itself lands with T-10.8.1, which FOC-03 serializes behind story 10.7a."
                + " When it lands, this marker is removed for this operation only")
        .isEqualTo(Boolean.TRUE);
    assertThat(operationFlag("/tests/{id}/compile", "x-implemented-by")).isEqualTo("10.8");
  }

  /**
   * AC-1b, left <b>red</b> and named. Enable this when @architect rules on the amendment; do not
   * make it pass by changing what the route returns.
   */
  @Test
  @Disabled(
      "AC-1b — escalated to @architect as ADR-002 §12 Class C: compiling a soft-deleted or"
          + " quarantined test needs a 409 the frozen compileTest operation does not declare."
          + " Left failing deliberately; not implemented, not worked around.")
  void compilingADeletedTestAnswersTheDeclaredStatusCode() {
    throw new AssertionError(
        "No conforming implementation exists: requireCompilable throws TEST_DELETED (409) and"
            + " compileTest declares only 202/401/403. Awaiting the contract amendment.");
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private String conflictCodeFrom(UUID id) {
    try {
      states.beginCompile(id);
      throw new AssertionError("requireCompilable did not refuse " + id);
    } catch (StudioConflictException e) {
      return e.getCode();
    }
  }

  @SuppressWarnings("unchecked")
  private static List<String> declaredResponses(String path) {
    Map<String, Object> paths = (Map<String, Object>) contract.get("paths");
    Map<String, Object> item = (Map<String, Object>) paths.get(path);
    assertThat(item).as("the contract declares %s", path).isNotNull();
    Map<String, Object> post = (Map<String, Object>) item.get("post");
    Map<String, Object> responses = (Map<String, Object>) post.get("responses");
    return responses.keySet().stream().map(String::valueOf).toList();
  }

  @SuppressWarnings("unchecked")
  private static Object operationFlag(String path, String key) {
    Map<String, Object> paths = (Map<String, Object>) contract.get("paths");
    Map<String, Object> item = (Map<String, Object>) paths.get(path);
    Map<String, Object> post = (Map<String, Object>) item.get("post");
    return post.get(key);
  }

  private UUID seedTest() {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO ui_tests (id, name, csi_id, environment, browser, steps, variables,"
            + " created_by, created_at, updated_at) VALUES (?, 'Divergence draft', ?,"
            + " 'Production', 'chromium', CAST('[\"Go home\"]' AS jsonb), CAST('[]' AS jsonb),"
            + " ?, ?, ?)",
        id,
        CSI_ID,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    return id;
  }

  private void seedUser() {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'Divergence Owner', ?, ?, true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + OWNER,
        OWNER,
        Timestamp.from(Instant.now()));
  }

  private void seedCsi() {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, 'Divergence CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        CSI_ID,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}
